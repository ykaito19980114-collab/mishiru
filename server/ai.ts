import { AsyncLocalStorage } from "node:async_hooks";
import JSON5 from "json5";
import { recordAiCall, usageFromGemini, usageFromOpenAI, type AiUsage } from "./ai-telemetry";
import { canSpendLlmCall, noteLlmCallSpent } from "./ai-cache";

export const AI_MODELS = [
  { id: "gpt-5.6-sol", provider: "openai", label: "GPT · Sol", description: "最も丁寧" },
  { id: "gpt-5.6-terra", provider: "openai", label: "GPT · Terra", description: "バランス" },
  { id: "gpt-5.6-luna", provider: "openai", label: "GPT · Luna", description: "すばやい" },
  { id: "gemini-3.1-pro-preview", provider: "gemini", label: "Gemini · 3.1 Pro", description: "高度な推論" },
  { id: "gemini-3.5-flash", provider: "gemini", label: "Gemini · 3.5 Flash", description: "高品質・高速" },
  { id: "gemini-3.1-flash-lite", provider: "gemini", label: "Gemini · 3.1 Flash-Lite", description: "軽量" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];
export type AiProvider = (typeof AI_MODELS)[number]["provider"];

// ============ 機能別モデル割当（ADR-009追記・2026-07-29） ============
// 2026-07-29のOpenAI値下げ（Luna -80% / Terra -20%、Solは対象外）を受けた振り分け。
// 判定基準は「件数が多く・出力が定型で・失敗しても決定的フォールバックが効く」処理をLUNAへ、
// 中核価値そのものか誤情報が致命になる処理をTERRAへ。実測(ADR-009)に基づく。
//
// 重要: 以前は LOCKED_AI_MODEL + withAiModel ミドルウェアでTerraへ固定していたが、
// 公開ハードニングでモデル選択UIとミドルウェアが撤去され、固定が外れて
// defaultAiModel()（= env AI_MODEL = 既定 gpt-5.6-sol）へ落ちていた。
// 実測で全機能がSol（最上位・今回の値下げ対象外）で動いていたことを確認したため、
// env依存をやめ、この表を唯一の決定点にする。
const LIGHT_MODEL: AiModelId = "gpt-5.6-luna";
const CORE_MODEL: AiModelId = "gpt-5.6-terra";

// 軽量側。出力が定型・件数が多い・失敗時は決定的フォールバックへ落ちるもの
const LIGHT_FEATURES = new Set([
  "smart-search",     // 自然文→分類コード+キーワード。実測 out 57-94tok。辞書フォールバックあり
  "enrich:guide",     // 研究室ガイド。実測 out 427tok・定型JSON。全研究室ページで最多件数。テンプレフォールバックあり
  "lab-cards",        // デッキ8枚のバッチ。定型JSON。テンプレカードあり
  "qc:adjust-text",   // 一段落の書き換え。失敗時は原文をそのまま返す
  "report",           // 管理者向け診断下書き。低頻度・テンプレフォールバックあり
]);
// 上記以外（qc:brief / qc:rq-candidates / qc:public-rq / qc:literature / interest-analysis）はCORE_MODEL。
// 理由: 中核価値（問いの設計）、平易化の品質要件（FR-QUESTION-05）、実在文献の要約（誤情報が致命）。

export function modelForFeature(feature?: string): AiModelId {
  return feature && LIGHT_FEATURES.has(feature) ? LIGHT_MODEL : CORE_MODEL;
}

// providerフォールバック時も同じ重み付けを保つ（軽い処理は軽いGeminiへ）
function geminiPeer(model: AiModelId): AiModelId {
  return model === LIGHT_MODEL ? "gemini-3.1-flash-lite" : "gemini-3.5-flash";
}

const modelContext = new AsyncLocalStorage<AiModelId>();
const providerCooldownUntil = new Map<AiProvider, number>();
const PROVIDER_COOLDOWN_MS = 2 * 60 * 1000;

function providerInCooldown(provider: AiProvider): boolean {
  return (providerCooldownUntil.get(provider) || 0) > Date.now();
}

function recordProviderResult(provider: AiProvider, succeeded: boolean) {
  if (succeeded) providerCooldownUntil.delete(provider);
  else providerCooldownUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}
// envのAI_MODELは既定値の上書きにのみ使う（未設定・不正値ならCORE_MODEL）。
// 以前はここが gpt-5.6-sol にフォールバックしており、意図せず最上位モデルを使っていた。
function defaultAiModel(): AiModelId {
  const configured = process.env.AI_MODEL || process.env.OPENAI_MODEL;
  return AI_MODELS.some((item) => item.id === configured) ? configured as AiModelId : CORE_MODEL;
}

export function resolveAiModel(value?: string | null): AiModelId {
  return AI_MODELS.some((item) => item.id === value) ? value as AiModelId : defaultAiModel();
}

/** 表示・記録用の代表モデル（中核生成に使うもの）。実際の呼び出しはmodelForFeatureが決める */
export function currentAiModel(): AiModelId {
  return modelContext.getStore() || CORE_MODEL;
}

export function currentAiProvider(): AiProvider {
  return AI_MODELS.find((item) => item.id === currentAiModel())?.provider || "openai";
}

export function withAiModel(model: string | null | undefined, next: () => void): void {
  modelContext.run(resolveAiModel(model), next);
}

export function aiProviderStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith("YOUR_")),
    gemini: Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("YOUR_")),
  };
}

export function aiEnabled(): boolean {
  const providers = aiProviderStatus();
  return providers.openai || providers.gemini;
}

interface GenOpts {
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
  responseSchema?: Record<string, unknown>;
  googleSearch?: boolean;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  /** 計測用の呼び出し元ラベル。省略時は"unknown"（どの機能が何トークン使ったか追えなくなるため必ず付ける） */
  feature?: string;
}

/** providerからの生成結果。usageは課金トークンの実測（取得できない場合は0） */
interface ProviderResult {
  text: string | null;
  usage: AiUsage;
}
const NO_USAGE: AiUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

function openAiResponseText(data: any): string | null {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = Array.isArray(data?.output)
    ? data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    : [];
  return parts.find((item: any) => item?.type === "output_text" && typeof item?.text === "string")?.text ?? null;
}

function normalizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJsonSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (key === "type" && typeof item === "string") return [key, item.toLowerCase()];
    return [key, normalizeJsonSchema(item)];
  }));
}

async function callOpenAI(prompt: string, opts: GenOpts, model: AiModelId): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { text: null, usage: { ...NO_USAGE } };
  const format = opts.responseSchema
    ? { type: "json_schema", name: "mishiru_response", strict: false, schema: normalizeJsonSchema(opts.responseSchema) }
    : opts.json ? { type: "json_object" } : undefined;
  const body = {
    model,
    instructions: "あなたはMISHIRUの研究探索支援AIです。根拠のない事実を作らず、断定を避け、学生が理解できる日本語で回答してください。",
    input: prompt,
    store: false,
    ...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {}),
    max_output_tokens: opts.maxOutputTokens ?? Number(process.env.AI_MAX_OUTPUT_TOKENS || process.env.OPENAI_MAX_OUTPUT_TOKENS || 8000),
    ...(format ? { text: { format } } : {}),
    ...(opts.googleSearch ? { tools: [{ type: "web_search" }] } : {}),
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  if (!response.ok) {
    console.error(`[openai] request failed status=${response.status} request_id=${response.headers.get("x-request-id") || "unknown"}`);
    return { text: null, usage: { ...NO_USAGE } };
  }
  const data: any = await response.json();
  // incomplete は max_output_tokens 切れが主因。実測を残さないと上限調整の判断ができない
  if (data?.status && data.status !== "completed") console.error(`[openai] response_status=${data.status} reason=${data?.incomplete_details?.reason || "unknown"}`);
  return { text: openAiResponseText(data), usage: usageFromOpenAI(data) };
}

async function callGeminiProvider(prompt: string, opts: GenOpts, model: AiModelId): Promise<ProviderResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: null, usage: { ...NO_USAGE } };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "あなたはMISHIRUの研究探索支援AIです。根拠のない事実を作らず、断定を避け、学生が理解できる日本語で回答してください。" }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.35,
        maxOutputTokens: opts.maxOutputTokens ?? Number(process.env.AI_MAX_OUTPUT_TOKENS || 8000),
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
        ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
      },
      ...(opts.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  if (!response.ok) {
    console.error(`[gemini] request failed status=${response.status}`);
    return { text: null, usage: { ...NO_USAGE } };
  }
  const data: any = await response.json();
  const usage = usageFromGemini(data);
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    console.error(`[gemini] empty candidate prompt_feedback=${data?.promptFeedback?.blockReason || "none"}`);
    return { text: null, usage };
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") console.error(`[gemini] finish_reason=${candidate.finishReason}`);
  return { text: candidate?.content?.parts?.map((part: any) => part?.text || "").join("") || null, usage };
}

export async function callAI(prompt: string, opts: GenOpts = {}): Promise<string | null> {
  if (!aiEnabled()) return null;
  // 1日あたりの呼び出し上限（MISHIRU_AI_DAILY_CALL_LIMIT）。超過時はnullを返し、
  // 各呼び出し側の決定的フォールバックへ落とす＝画面は壊れずコストだけ止まる（AC-05の考え方）。
  if (!(await canSpendLlmCall())) {
    console.warn(`[ai] daily call limit reached — falling back without calling the model (feature=${opts.feature || "unknown"})`);
    return null;
  }
  noteLlmCallSpent();
  const providers = aiProviderStatus();
  const primary = currentAiProvider();
  const fallback: AiProvider = primary === "openai" ? "gemini" : "openai";
  const feature = opts.feature || "unknown";
  const primaryModel = modelForFeature(opts.feature);
  const invoke = async (provider: AiProvider, model: AiModelId) => {
    const startedAt = Date.now();
    try {
      const result = provider === "gemini"
        ? await callGeminiProvider(prompt, opts, model)
        : await callOpenAI(prompt, opts, model);
      recordProviderResult(provider, Boolean(result.text));
      // 失敗（text=null）でも入力トークンは課金されうるため、成否に関わらず記録する
      await recordAiCall({ feature, provider, model, durationMs: Date.now() - startedAt, ok: Boolean(result.text), ...result.usage });
      return result.text;
    } catch (error) {
      recordProviderResult(provider, false);
      await recordAiCall({ feature, provider, model, durationMs: Date.now() - startedAt, ok: false, ...NO_USAGE });
      console.error(`[ai] provider=${provider} error=${error instanceof Error ? error.name : "unknown"}`);
      return null;
    }
  };

  try {
    if (providers[primary] && !providerInCooldown(primary)) {
      const text = await invoke(primary, primary === "openai" ? primaryModel : geminiPeer(primaryModel));
      if (text) return text;
    }
    if (providers[fallback] && !providerInCooldown(fallback)) {
      console.warn(`[ai] switching to ${fallback} because ${primary} is temporarily unavailable`);
      return invoke(fallback, fallback === "gemini" ? geminiPeer(primaryModel) : primaryModel);
    }
    return null;
  } catch {
    return null;
  }
}

export async function callAIJson<T>(prompt: string, opts: GenOpts = {}): Promise<T | null> {
  const text = await callAI(prompt, { ...opts, json: true });
  if (!text) return null;
  try {
    const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try { return JSON5.parse(clean) as T; } catch { /* balanced extraction below */ }
    const start = clean.search(/[\[{]/);
    if (start < 0) throw new SyntaxError("No JSON object found");
    const opening = clean[start]; const closing = opening === "{" ? "}" : "]";
    let depth = 0, inString = false, escaped = false;
    for (let index = start; index < clean.length; index++) {
      const char = clean[index];
      if (inString) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') inString = false; continue; }
      if (char === '"') { inString = true; continue; }
      if (char === opening) depth++;
      if (char === closing && --depth === 0) return JSON5.parse(clean.slice(start, index + 1)) as T;
    }
    throw new SyntaxError("Incomplete JSON object");
  } catch (error) {
    console.error(`[ai] structured output parse failed provider=${currentAiProvider()} error=${error instanceof Error ? error.name : "unknown"}`);
    return null;
  }
}
