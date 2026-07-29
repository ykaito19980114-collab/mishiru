// AIトークン計測。providerの生usageを1か所で正規化し、①1行JSONログ（Vercelログで永続・grep可能）
// ②プロセス内ロールアップ（/api/admin/ai-usage）③日次集計テーブル mishiru_ai_usage_daily（ADR-010・
// 管理画面の今日/今月/累計表示の永続元）へ流す。③は各呼び出し完了時にSupabase RPCで
// 原子的に加算し、サーバーレスのレスポンス後停止や複数インスタンス競合で取りこぼさない。
import { serverSupabase } from "./supabase";
import type { AiProvider } from "./ai";

export interface AiUsage {
  inputTokens: number;
  cachedInputTokens: number;  // プロンプトキャッシュのヒット分（課金割引対象）。0ならキャッシュが効いていない
  outputTokens: number;       // 推論トークンを含む課金上の出力
  reasoningTokens: number;    // outputTokensの内訳。UIに出ないのに課金される分
}

export interface AiCallRecord extends AiUsage {
  feature: string;
  provider: AiProvider;
  model: string;
  durationMs: number;
  ok: boolean;
}

const EMPTY: AiUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// OpenAI Responses API: usage.{input_tokens,output_tokens,input_tokens_details.cached_tokens,output_tokens_details.reasoning_tokens}
export function usageFromOpenAI(data: any): AiUsage {
  const usage = data?.usage;
  if (!usage) return { ...EMPTY };
  return {
    inputTokens: num(usage.input_tokens),
    cachedInputTokens: num(usage.input_tokens_details?.cached_tokens),
    outputTokens: num(usage.output_tokens),
    reasoningTokens: num(usage.output_tokens_details?.reasoning_tokens),
  };
}

// Gemini generateContent: usageMetadata.{promptTokenCount,candidatesTokenCount,cachedContentTokenCount,thoughtsTokenCount}
export function usageFromGemini(data: any): AiUsage {
  const usage = data?.usageMetadata;
  if (!usage) return { ...EMPTY };
  const thoughts = num(usage.thoughtsTokenCount);
  return {
    inputTokens: num(usage.promptTokenCount),
    cachedInputTokens: num(usage.cachedContentTokenCount),
    // Geminiのcandidatesは思考分を含まないため、課金上の出力へ揃えて合算する
    outputTokens: num(usage.candidatesTokenCount) + thoughts,
    reasoningTokens: thoughts,
  };
}

// --- プロセス内ロールアップ（サーバーレスはインスタンス単位。永続はログ側が担う） ---
export interface FeatureRollup extends AiUsage {
  calls: number;
  failures: number;
  totalDurationMs: number;
}
// featureは "qc:brief" のようにコロンを含むため、キーの区切りは文字列に現れないNUL(\u0000)を使う
const KEY_SEP = "\u0000";
const rollup = new Map<string, FeatureRollup>();
let since = new Date().toISOString();

export async function recordAiCall(record: AiCallRecord): Promise<void> {
  const key = `${record.feature}${KEY_SEP}${record.model}`;
  const current = rollup.get(key) || { ...EMPTY, calls: 0, failures: 0, totalDurationMs: 0 };
  current.calls += 1;
  if (!record.ok) current.failures += 1;
  current.inputTokens += record.inputTokens;
  current.cachedInputTokens += record.cachedInputTokens;
  current.outputTokens += record.outputTokens;
  current.reasoningTokens += record.reasoningTokens;
  current.totalDurationMs += record.durationMs;
  rollup.set(key, current);

  // 1行JSON。Vercelログで `ai_usage` を検索すれば実測が追える
  console.log(JSON.stringify({
    tag: "ai_usage",
    feature: record.feature,
    provider: record.provider,
    model: record.model,
    in: record.inputTokens,
    cached: record.cachedInputTokens,
    out: record.outputTokens,
    reasoning: record.reasoningTokens,
    ms: record.durationMs,
    ok: record.ok,
  }));

  await persistDailyUsage(record);
}

// --- 日次永続化（mishiru_ai_usage_daily・ADR-010） ---
let dailyTableAvailable = true; // テーブル未作成の環境では1回のエラーで諦める（AC-05の劣化動作）
const jstDay = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

async function persistDailyUsage(record: AiCallRecord) {
  const supabase = serverSupabase();
  if (!supabase || !dailyTableAvailable) return;
  try {
    const { error } = await supabase.rpc("mishiru_record_ai_usage", {
      p_day: jstDay(),
      p_input_tokens: record.inputTokens,
      p_output_tokens: record.outputTokens,
      p_reasoning_tokens: record.reasoningTokens,
      p_cached_tokens: record.cachedInputTokens,
      p_calls: 1,
      p_failures: record.ok ? 0 : 1,
    });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // migration未適用はこの環境では恒久なので、以後書き込みを止めてログ1回だけ
    if (/mishiru_(?:ai_usage_daily|record_ai_usage)|does not exist|schema cache/i.test(message)) {
      dailyTableAvailable = false;
      console.warn("[ai-telemetry] 日次テーブル未作成のため永続化を停止（supabase/migrations/20260728_ai_usage_daily.sql を適用してください）:", message);
    } else {
      // 一時障害は生成結果を失敗させない（会計ではなく監視のため再送しない）
      console.error("[ai-telemetry] daily persistence failed:", message);
    }
  }
}

export interface AiUsageTotals {
  persisted: boolean;
  today: { inputTokens: number; outputTokens: number; calls: number };
  thisMonth: { inputTokens: number; outputTokens: number; calls: number };
  cumulative: { inputTokens: number; outputTokens: number; calls: number; since: string | null };
}

/** 管理画面の「今日/今月/累計」。日次テーブルが無い環境ではプロセス内集計のみ（persisted:false） */
export async function aiUsageTotals(): Promise<AiUsageTotals> {
  const local = aiUsageSnapshot().totals;
  const fallback: AiUsageTotals = {
    persisted: false,
    today: { inputTokens: local.inputTokens, outputTokens: local.outputTokens, calls: local.calls },
    thisMonth: { inputTokens: local.inputTokens, outputTokens: local.outputTokens, calls: local.calls },
    cumulative: { inputTokens: local.inputTokens, outputTokens: local.outputTokens, calls: local.calls, since: null },
  };
  const supabase = serverSupabase();
  if (!supabase || !dailyTableAvailable) return fallback;
  try {
    const { data, error } = await supabase.from("mishiru_ai_usage_daily").select("day,input_tokens,output_tokens,calls").order("day");
    if (error) throw error;
    const rows = data || [];
    const today = jstDay();
    const month = today.slice(0, 7);
    const sum = (filtered: typeof rows) => filtered.reduce((acc, row) => ({
      inputTokens: acc.inputTokens + Number(row.input_tokens || 0),
      outputTokens: acc.outputTokens + Number(row.output_tokens || 0),
      calls: acc.calls + Number(row.calls || 0),
    }), { inputTokens: 0, outputTokens: 0, calls: 0 });
    return {
      persisted: true,
      today: sum(rows.filter((row) => row.day === today)),
      thisMonth: sum(rows.filter((row) => String(row.day).startsWith(month))),
      cumulative: { ...sum(rows), since: rows[0]?.day || null },
    };
  } catch (error) {
    console.error("[ai-telemetry] totals read failed:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export function aiUsageSnapshot() {
  const features = Array.from(rollup.entries())
    .map(([key, value]) => {
      const separator = key.lastIndexOf(KEY_SEP);
      const feature = key.slice(0, separator);
      const model = key.slice(separator + KEY_SEP.length);
      const billableTokens = value.inputTokens + value.outputTokens;
      return {
        feature, model,
        calls: value.calls,
        failures: value.failures,
        inputTokens: value.inputTokens,
        cachedInputTokens: value.cachedInputTokens,
        outputTokens: value.outputTokens,
        reasoningTokens: value.reasoningTokens,
        billableTokens,
        avgTokensPerCall: value.calls ? Math.round(billableTokens / value.calls) : 0,
        // 出力のうち画面に出ない推論の割合。高いほど reasoningEffort 引き下げの余地が大きい
        reasoningShare: value.outputTokens ? Number((value.reasoningTokens / value.outputTokens).toFixed(3)) : 0,
        // 入力のうちプロンプトキャッシュが効いた割合。0なら静的プレフィックスが再利用されていない
        cacheHitShare: value.inputTokens ? Number((value.cachedInputTokens / value.inputTokens).toFixed(3)) : 0,
        avgDurationMs: value.calls ? Math.round(value.totalDurationMs / value.calls) : 0,
      };
    })
    .sort((a, b) => b.billableTokens - a.billableTokens);

  return {
    since,
    note: "サーバーレスではインスタンス単位の集計。全体はVercelログの tag=ai_usage を集計すること。",
    totals: features.reduce((acc, item) => ({
      calls: acc.calls + item.calls,
      inputTokens: acc.inputTokens + item.inputTokens,
      outputTokens: acc.outputTokens + item.outputTokens,
      reasoningTokens: acc.reasoningTokens + item.reasoningTokens,
      billableTokens: acc.billableTokens + item.billableTokens,
    }), { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, billableTokens: 0 }),
    features,
  };
}

export function resetAiUsage() {
  rollup.clear();
  since = new Date().toISOString();
}
