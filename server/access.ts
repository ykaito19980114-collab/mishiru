import type { NextFunction, Request, Response } from "express";
import { mergeSessionState } from "./session-state";
import { serverSupabase, userFromBearer } from "./supabase";

export const GUEST_ACTION_LIMIT = Math.max(1, Number(process.env.MISHIRU_GUEST_ACTION_LIMIT || 5));
const localUsage = new Map<string, Set<string>>();
const localUsers = new Map<string, string>();
const uuid = () => `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function suppliedSessionId(req: Request) {
  return String(req.body?.sessionId || req.query?.sessionId || req.get("x-mishiru-session-id") || "").trim();
}

async function canonicalSessionId(userId: string, candidate: string) {
  const supabase = serverSupabase();
  if (!supabase) {
    const current = localUsers.get(userId);
    if (current) return current;
    const next = candidate || uuid(); localUsers.set(userId, next); return next;
  }
  const { data, error } = await supabase.from("mishiru_user_sessions").select("session_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`USER_SESSION_LOAD_FAILED:${error.message}`);
  if (data?.session_id) {
    if (candidate && candidate !== data.session_id) await mergeSessionState(candidate, data.session_id, userId);
    return data.session_id as string;
  }
  const sessionId = candidate || uuid();
  const { error: createError } = await supabase.from("mishiru_user_sessions").upsert({ user_id: userId, session_id: sessionId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (createError) throw new Error(`USER_SESSION_CREATE_FAILED:${createError.message}`);
  return sessionId;
}

export async function accessContextMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  try {
    let user = await userFromBearer(req.get("authorization"));
    if (!user && process.env.NODE_ENV !== "production") {
      const devUser = req.get("x-mishiru-dev-user");
      if (devUser) user = { id: devUser } as typeof user;
    }
    const supplied = suppliedSessionId(req);
    const sessionId = user ? await canonicalSessionId(user.id, supplied) : supplied;
    res.locals.mishiruUser = user;
    res.locals.mishiruSessionId = sessionId;
    if (sessionId) {
      if (req.body && typeof req.body === "object" && "sessionId" in req.body) req.body.sessionId = sessionId;
      if (req.query && "sessionId" in req.query) (req.query as Record<string, unknown>).sessionId = sessionId;
    }
    next();
  } catch (error) {
    console.error("[access]", error instanceof Error ? error.message : error);
    res.status(503).json({ error: { code: "AUTH_UNAVAILABLE", message: "アカウント情報を確認できません。少し待ってからもう一度お試しください。" } });
  }
}

export async function guestUsage(sessionId: string) {
  const supabase = serverSupabase();
  if (!supabase) {
    const used = localUsage.get(sessionId)?.size || 0;
    return { used, remaining: Math.max(0, GUEST_ACTION_LIMIT - used), limit: GUEST_ACTION_LIMIT };
  }
  const { data, error } = await supabase.from("mishiru_guest_usage").select("action_count").eq("session_id", sessionId).maybeSingle();
  if (error) throw new Error(`GUEST_USAGE_LOAD_FAILED:${error.message}`);
  const used = Number(data?.action_count || 0);
  return { used, remaining: Math.max(0, GUEST_ACTION_LIMIT - used), limit: GUEST_ACTION_LIMIT };
}

async function consume(sessionId: string, actionId: string) {
  const supabase = serverSupabase();
  if (!supabase) {
    const actions = localUsage.get(sessionId) || new Set<string>();
    if (!actions.has(actionId) && actions.size < GUEST_ACTION_LIMIT) actions.add(actionId);
    localUsage.set(sessionId, actions);
    const used = actions.size;
    return { allowed: actions.has(actionId), used, remaining: Math.max(0, GUEST_ACTION_LIMIT - used), limit: GUEST_ACTION_LIMIT };
  }
  const { data, error } = await supabase.rpc("mishiru_consume_guest_action", {
    p_session_id: sessionId,
    p_action_id: actionId,
    p_limit: GUEST_ACTION_LIMIT,
  });
  if (error) throw new Error(`GUEST_USAGE_CONSUME_FAILED:${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  return { allowed: Boolean(result?.allowed), used: Number(result?.used || 0), remaining: Number(result?.remaining || 0), limit: GUEST_ACTION_LIMIT };
}

export function requireValueAction(kind: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.mishiruUser) return next();
    const sessionId = String(res.locals.mishiruSessionId || suppliedSessionId(req));
    if (!sessionId) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "sessionId が必要です" } });
    const actionId = String(req.body?.actionId || req.get("x-mishiru-action-id") || `${kind}:${Date.now()}:${Math.random()}`);
    try {
      const access = await consume(sessionId, actionId);
      res.setHeader("X-Mishiru-Guest-Used", String(access.used));
      res.setHeader("X-Mishiru-Guest-Remaining", String(access.remaining));
      if (!access.allowed) {
        return res.status(403).json({
          error: { code: "ACCOUNT_REQUIRED", message: "無料アカウントを作ると、これまでの内容を引き継いで続けられます。" },
          access,
        });
      }
      next();
    } catch (error) {
      console.error("[guest-access]", error instanceof Error ? error.message : error);
      res.status(503).json({ error: { code: "ACCESS_UNAVAILABLE", message: "利用回数を確認できません。少し待ってからもう一度お試しください。" } });
    }
  };
}
