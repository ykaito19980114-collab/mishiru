// 匿名セッション管理（docs/03 §12：sessionIdはクライアント生成UUID・削除可能な個人関連情報）
const KEY = "openlab_session_id";
const QUEUE_KEY = "openlab_action_queue"; // オフライン再送キュー（FR-ERR-02）
export const PENDING_SESSION_KEY = "mishiru_pending_session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function resetSession() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(QUEUE_KEY);
}

export function clearLocalUserData() {
  [
    KEY,
    QUEUE_KEY,
    PENDING_SESSION_KEY,
    "openlab_stock_folders",
    "openlab_stock_item_notes",
    "openlab_question_craft_draft_v1",
    "openlab_annotations_v1",
    "openlab_annotations_v2",
    "openlab_interest_draft_v1",
    "mishiru_book_order",
    "mishiru_book_shelves",
  ].forEach((key) => localStorage.removeItem(key));
}

export function setSessionId(id: string) {
  if (id) localStorage.setItem(KEY, id);
}

export function newActionId(): string {
  return uuid();
}

// --- オフライン再送キュー（付録A：最大200件・TTL14日。テーマ/研究室の両カードに対応）---
interface QueuedAction {
  actionId: string; sessionId: string; action: string; ts: number;
  cardId?: string;  // テーマカード
  labId?: string;   // 研究室カード（ADR-005）
}
const TTL = 14 * 24 * 60 * 60 * 1000;
const MAX = 200;

export function enqueueAction(a: Omit<QueuedAction, "ts">) {
  const q = readQueue();
  q.push({ ...a, ts: Date.now() });
  while (q.length > MAX) q.shift();
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function readQueue(): QueuedAction[] {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueuedAction[];
    return q.filter((x) => Date.now() - x.ts < TTL);
  } catch {
    return [];
  }
}

export async function flushQueue() {
  const q = readQueue();
  if (!q.length) return;
  const remaining: QueuedAction[] = [];
  for (const a of q) {
    const endpoint = a.labId ? "/api/lab-card-actions" : "/api/card-actions";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      if (!res.ok) remaining.push(a);
    } catch {
      remaining.push(a);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}
