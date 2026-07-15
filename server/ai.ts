import { AsyncLocalStorage } from "node:async_hooks";
import JSON5 from "json5";

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

const modelContext = new AsyncLocalStorage<AiModelId>();
const providerCooldownUntil = new Map<AiProvider, number>();
const PROVIDER_COOLDOWN_MS = 2 * 60 * 1000;

function modelForProvider(provider: AiProvider): AiModelId {
  const configured = provider === "openai" ? process.env.OPENAI_MODEL : process.env.GEMINI_MODEL;
  const match = AI_MODELS.find((item) => item.id === configured && item.provider === provider);
  if (match) return match.id;
  return provider === "openai" ? "gpt-5.6-sol" : "gemini-3.5-flash";
}

function providerInCooldown(provider: AiProvider): boolean {
  return (providerCooldownUntil.get(provider) || 0) > Date.now();
}

function recordProviderResult(provider: AiProvider, succeeded: boolean) {
  if (succeeded) providerCooldownUntil.delete(provider);
  else providerCooldownUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}
function defaultAiModel(): AiModelId {
  const configured = process.env.AI_MODEL || process.env.OPENAI_MODEL;
  return AI_MODELS.some((item) => item.id === configured) ? configured as AiModelId : "gpt-5.6-sol";
}

export function resolveAiModel(value?: string | null): AiModelId {
  return AI_MODELS.some((item) => item.id === value) ? value as AiModelId : defaultAiModel();
}

export function currentAiModel(): AiModelId {
  return modelContext.getStore() || defaultAiModel();
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
}

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

async function callOpenAI(prompt: string, opts: GenOpts, model: AiModelId): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
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
    return null;
  }
  const data: any = await response.json();
  if (data?.status && data.status !== "completed") console.error(`[openai] response_status=${data.status} reason=${data?.incomplete_details?.reason || "unknown"}`);
  return openAiResponseText(data);
}

async function callGeminiProvider(prompt: string, opts: GenOpts, model: AiModelId): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
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
    return null;
  }
  const data: any = await response.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    console.error(`[gemini] empty candidate prompt_feedback=${data?.promptFeedback?.blockReason || "none"}`);
    return null;
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") console.error(`[gemini] finish_reason=${candidate.finishReason}`);
  return candidate?.content?.parts?.map((part: any) => part?.text || "").join("") || null;
}

export async function callAI(prompt: string, opts: GenOpts = {}): Promise<string | null> {
  if (!aiEnabled()) return null;
  const providers = aiProviderStatus();
  const primary = currentAiProvider();
  const fallback: AiProvider = primary === "openai" ? "gemini" : "openai";
  const invoke = async (provider: AiProvider, model: AiModelId) => {
    try {
      const text = provider === "gemini"
        ? await callGeminiProvider(prompt, opts, model)
        : await callOpenAI(prompt, opts, model);
      recordProviderResult(provider, Boolean(text));
      return text;
    } catch (error) {
      recordProviderResult(provider, false);
      console.error(`[ai] provider=${provider} error=${error instanceof Error ? error.name : "unknown"}`);
      return null;
    }
  };

  try {
    if (providers[primary] && !providerInCooldown(primary)) {
      const text = await invoke(primary, currentAiModel());
      if (text) return text;
    }
    if (providers[fallback] && !providerInCooldown(fallback)) {
      console.warn(`[ai] switching to ${fallback} because ${primary} is temporarily unavailable`);
      return invoke(fallback, modelForProvider(fallback));
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
