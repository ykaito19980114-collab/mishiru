import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

function requestIdentity(req: Request, res: Response) {
  const userId = String(res.locals.mishiruUser?.id || "");
  const sessionId = String(res.locals.mishiruSessionId || "");
  return userId ? `user:${userId}` : sessionId ? `session:${sessionId}` : `ip:${req.ip || "unknown"}`;
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  if (req.path.startsWith("/api/")) {
    // 認証状態・保存内容を含む可能性があるため、共有キャッシュにもブラウザ履歴にも残さない。
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}

export function rejectOversizedJson(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || !["POST", "PUT", "PATCH"].includes(req.method)) return next();
  const contentLength = Number(req.get("content-length") || 0);
  // 表紙画像は5MBまで許可するためbase64分の余裕を持たせる。その他は1MBで十分。
  const limit = req.path.endsWith("/cover-image") ? 8 * 1024 * 1024 : 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > limit) {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: req.path.endsWith("/cover-image")
          ? "画像が大きすぎます。5MB以下の画像を選んでください。"
          : "入力内容が大きすぎます。文章や添付内容を短くして、もう一度お試しください。",
      },
    });
  }
  next();
}

export function rateLimit(options: { name: string; windowMs: number; max: number; message?: string }): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > 5 * 60_000) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
      lastCleanup = now;
    }

    const key = `${options.name}:${requestIdentity(req, res)}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: options.message || "操作が集中しています。少し待ってから、もう一度お試しください。",
        },
      });
    }
    next();
  };
}

export const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const requestId = String(res.locals.requestId || "unknown");
  const code = (error as { type?: string; code?: string })?.type || (error as { code?: string })?.code || "";
  if (code === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "送信内容を読み取れませんでした。画面を再読み込みして、もう一度お試しください。" } });
  }
  if (code === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "入力内容が大きすぎます。内容を短くして、もう一度お試しください。" } });
  }
  console.error(`[api:${requestId}] ${req.method} ${req.path}`, error instanceof Error ? error.message : error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "処理を完了できませんでした。入力内容はそのままです。少し待ってから、もう一度お試しください。",
      requestId,
    },
  });
};
