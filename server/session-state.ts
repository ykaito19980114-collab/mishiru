import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { serverSupabase } from "./supabase";

type SessionPayload = Record<string, unknown>;
interface SessionStateContext {
  sessionId: string;
  userId: string | null;
  payload: SessionPayload;
  dirty: boolean;
  remote: boolean;
  flushing: boolean;
}

const storage = new AsyncLocalStorage<SessionStateContext>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function currentSessionId(): string | null {
  return storage.getStore()?.sessionId || null;
}

export function hasRemoteSessionState(sessionId?: string): boolean {
  const context = storage.getStore();
  return Boolean(context?.remote && (!sessionId || context.sessionId === sessionId));
}

export function getSessionSection<T>(key: string, fallback: T): T {
  const context = storage.getStore();
  if (!context?.remote) return fallback;
  if (!(key in context.payload)) context.payload[key] = clone(fallback);
  return context.payload[key] as T;
}

export function setSessionSection<T>(key: string, value: T): void {
  const context = storage.getStore();
  if (!context?.remote) return;
  context.payload[key] = value as unknown;
  context.dirty = true;
}

async function load(sessionId: string, userId: string | null): Promise<SessionStateContext> {
  const supabase = serverSupabase();
  if (!supabase) return { sessionId, userId, payload: {}, dirty: false, remote: false, flushing: false };
  const { data, error } = await supabase
    .from("mishiru_session_state")
    .select("payload,user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`SESSION_STATE_LOAD_FAILED:${error.message}`);
  return {
    sessionId,
    userId: userId || data?.user_id || null,
    payload: data?.payload && typeof data.payload === "object" ? data.payload as SessionPayload : {},
    dirty: Boolean(userId && data?.user_id !== userId),
    remote: true,
    flushing: false,
  };
}

async function flush(context: SessionStateContext) {
  if (!context.remote || !context.dirty) return;
  const supabase = serverSupabase();
  if (!supabase) return;
  context.dirty = false;
  const { error } = await supabase.from("mishiru_session_state").upsert({
    session_id: context.sessionId,
    user_id: context.userId,
    payload: context.payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: "session_id" });
  if (error) {
    context.dirty = true;
    throw new Error(`SESSION_STATE_SAVE_FAILED:${error.message}`);
  }
}

export async function sessionStateMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = String(res.locals.mishiruSessionId || "");
  if (!sessionId || !req.path.startsWith("/api")) return next();
  try {
    const context = await load(sessionId, res.locals.mishiruUser?.id || null);
    storage.run(context, () => {
      const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
      res.end = ((...args: unknown[]) => {
        if (!context.remote || !context.dirty || context.flushing) return originalEnd(...args);
        context.flushing = true;
        void flush(context)
          .catch((error) => console.error("[session-state]", error instanceof Error ? error.message : error))
          .finally(() => originalEnd(...args));
        return res;
      }) as typeof res.end;
      next();
    });
  } catch (error) {
    console.error("[session-state] load", error instanceof Error ? error.message : error);
    res.status(503).json({ error: { code: "PERSISTENCE_UNAVAILABLE", message: "保存領域へ接続できません。少し待ってからもう一度お試しください。" } });
  }
}

function mergeArrays(target: unknown[], source: unknown[]) {
  const result = [...target];
  for (const item of source) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
    const identity = record && (record.id || record.actionId || record.versionId || record.projectId);
    if (identity && result.some((candidate) => candidate && typeof candidate === "object" && Object.values(candidate as Record<string, unknown>).includes(identity))) continue;
    if (!identity && result.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item))) continue;
    result.push(item);
  }
  return result;
}

function mergeValues(target: unknown, source: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(source)) return mergeArrays(target, source);
  if (target && source && typeof target === "object" && typeof source === "object") {
    const output = { ...(source as Record<string, unknown>), ...(target as Record<string, unknown>) };
    for (const key of Object.keys(output)) {
      if (key in (target as Record<string, unknown>) && key in (source as Record<string, unknown>)) {
        output[key] = mergeValues((target as Record<string, unknown>)[key], (source as Record<string, unknown>)[key]);
      }
    }
    return output;
  }
  return target ?? source;
}

export async function mergeSessionState(sourceSessionId: string, targetSessionId: string, userId: string) {
  if (!sourceSessionId || sourceSessionId === targetSessionId) return;
  const supabase = serverSupabase();
  if (!supabase) return;
  const { data, error } = await supabase
    .from("mishiru_session_state")
    .select("session_id,payload")
    .in("session_id", [sourceSessionId, targetSessionId]);
  if (error) throw new Error(`SESSION_MERGE_LOAD_FAILED:${error.message}`);
  const source = data?.find((item) => item.session_id === sourceSessionId)?.payload || {};
  const target = data?.find((item) => item.session_id === targetSessionId)?.payload || {};
  const payload = mergeValues(target, source) as SessionPayload;
  const { error: saveError } = await supabase.from("mishiru_session_state").upsert({
    session_id: targetSessionId, user_id: userId, payload, updated_at: new Date().toISOString(),
  }, { onConflict: "session_id" });
  if (saveError) throw new Error(`SESSION_MERGE_SAVE_FAILED:${saveError.message}`);
  await supabase.from("mishiru_session_state").delete().eq("session_id", sourceSessionId);
}
