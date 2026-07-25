// AI生成物の永続キャッシュ（ADR-009）。
// 背景：enrich/lab-cardsは data/runtime/*.json に書いていたが、Vercelの /var/task は読み取り専用のため
// 本番では書き込みが常に失敗し、キャッシュがインスタンス内メモリだけになっていた（＝コールドスタートごとに全消失）。
// ここはL2（Supabase・全インスタンス共有・永続）を提供する。各呼び出し側の既存L1（プロセス内メモリ）と
// TTL/SWRの判断はそのまま残し、この層は「永続化」だけを足す。
// 保存先は既存の mishiru_api_cache（schema.sql・NFR-EXT-01で定義済みだが未使用だったテーブル）を再利用する。
// 新テーブルを増やさずに済み、RLS有効・公開ポリシー無し（service_roleのみ）という必要な性質をすでに満たしている。
// scopeとversionはcache_keyへ埋める（"enrich:v4:lab-123"）。versionを上げると自然にミスするため明示的な無効化が不要。
import { serverSupabase } from "./supabase";

const TABLE = "mishiru_api_cache";
const cacheKey = (scope: string, key: string, version: number) => `${scope}:v${version}:${key}`;

/** 同一キーの生成がプロセス内で並走しないようにする（人気研究室のスタンピード防止） */
const inFlight = new Map<string, Promise<unknown>>();

export function withSingleFlight<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = produce().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function readAiCache<T>(scope: string, key: string, version: number): Promise<T | null> {
  const supabase = serverSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE).select("payload,expires_at").eq("cache_key", cacheKey(scope, key, version)).maybeSingle();
    if (error || !data) return null;
    if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return null;
    return data.payload as T;
  } catch {
    // キャッシュ層の障害で機能を止めない（失敗時は生成にフォールバック）
    return null;
  }
}

/** 複数キーを1クエリでまとめて読む（カードデッキのように一度に多件を必要とする用途向け） */
export async function readAiCacheMany<T>(scope: string, keys: string[], version: number): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  const supabase = serverSupabase();
  if (!supabase || !keys.length) return found;
  try {
    const byCacheKey = new Map(keys.map((key) => [cacheKey(scope, key, version), key]));
    const { data, error } = await supabase
      .from(TABLE).select("cache_key,payload,expires_at").in("cache_key", Array.from(byCacheKey.keys()));
    if (error || !data) return found;
    for (const row of data) {
      if (row.expires_at && Date.parse(row.expires_at) < Date.now()) continue;
      const original = byCacheKey.get(row.cache_key);
      if (original) found.set(original, row.payload as T);
    }
  } catch { /* キャッシュ層の障害では生成にフォールバックする */ }
  return found;
}

/** 生成直後に呼ぶ。レスポンスを待たせないため意図的にfire-and-forget */
export function writeAiCache(scope: string, key: string, version: number, payload: unknown, ttlMs?: number): void {
  const supabase = serverSupabase();
  if (!supabase) return;
  void supabase
    .from(TABLE)
    .upsert({
      cache_key: cacheKey(scope, key, version),
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null,
    }, { onConflict: "cache_key" })
    .then(({ error }) => { if (error) console.error("[ai-cache] write failed:", error.message); });
}

// --- 1日あたりのLLM呼び出し上限（ブレーカー） ---
// クローラ等の暴走で青天井に生成が走るのを止める最後の砦。docs/03の「コスト上限」を実体化する。
// 厳密な分散カウンタではない（インスタンス毎に最大60秒ぶんの誤差）。上限は「桁を止める」目的なので許容する。
const DAILY_LIMIT = Number(process.env.MISHIRU_AI_DAILY_CALL_LIMIT || 0); // 0 = 無制限
const COUNTER_SCOPE = "budget";
const SYNC_INTERVAL_MS = 60 * 1000;

let localCount = 0;
let sharedCount = 0;
let lastSyncAt = 0;
let currentDay = "";

const today = () => new Date().toISOString().slice(0, 10);

/** LLMを呼んでよいか。上限超過時はfalse（呼び出し側は決定的フォールバックへ） */
export async function canSpendLlmCall(): Promise<boolean> {
  if (!DAILY_LIMIT) return true;
  const day = today();
  if (day !== currentDay) { currentDay = day; localCount = 0; sharedCount = 0; lastSyncAt = 0; }
  if (Date.now() - lastSyncAt > SYNC_INTERVAL_MS) {
    lastSyncAt = Date.now();
    const stored = await readAiCache<{ count: number }>(COUNTER_SCOPE, day, 1);
    sharedCount = stored?.count || 0;
    // 自インスタンス分を共有カウンタへ反映してから、ローカルはリセットする
    if (localCount > 0) {
      sharedCount += localCount;
      writeAiCache(COUNTER_SCOPE, day, 1, { count: sharedCount }, 3 * 24 * 60 * 60 * 1000);
      localCount = 0;
    }
  }
  return sharedCount + localCount < DAILY_LIMIT;
}

export function noteLlmCallSpent(): void {
  if (DAILY_LIMIT) localCount += 1;
}

export function aiBudgetSnapshot() {
  return { dailyLimit: DAILY_LIMIT || null, day: currentDay || today(), approxUsed: sharedCount + localCount };
}
