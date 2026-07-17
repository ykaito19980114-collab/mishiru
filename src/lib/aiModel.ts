export const AI_MODELS = [
  { id: "gpt-5.6-sol", provider: "OpenAI", label: "GPT · Sol", description: "最も丁寧" },
  { id: "gpt-5.6-terra", provider: "OpenAI", label: "GPT · Terra", description: "バランス" },
  { id: "gpt-5.6-luna", provider: "OpenAI", label: "GPT · Luna", description: "すばやい" },
  { id: "gemini-3.1-pro-preview", provider: "Google", label: "Gemini · 3.1 Pro", description: "高度な推論" },
  { id: "gemini-3.5-flash", provider: "Google", label: "Gemini · 3.5 Flash", description: "高品質・高速" },
  { id: "gemini-3.1-flash-lite", provider: "Google", label: "Gemini · 3.1 Flash-Lite", description: "軽量" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];
export const AI_MODEL_STORAGE_KEY = "mishiru_ai_model";

// 2026-07 一旦、選択可能なモデルをTerraに固定（ユーザー指示）。解除する際はこの定数をnullに戻す。
export const LOCKED_AI_MODEL: AiModelId | null = "gpt-5.6-terra";

export function getAiModel(): AiModelId {
  if (LOCKED_AI_MODEL) return LOCKED_AI_MODEL;
  if (typeof window === "undefined") return "gpt-5.6-sol";
  const value = window.localStorage.getItem(AI_MODEL_STORAGE_KEY);
  return AI_MODELS.some((item) => item.id === value) ? value as AiModelId : "gpt-5.6-sol";
}

export function setAiModel(model: AiModelId): void {
  window.localStorage.setItem(AI_MODEL_STORAGE_KEY, model);
  window.dispatchEvent(new CustomEvent("mishiru:ai-model", { detail: model }));
}

export function aiRequestHeaders(contentType = false): HeadersInit {
  return {
    "X-MISHIRU-AI-MODEL": getAiModel(),
    ...(contentType ? { "Content-Type": "application/json" } : {}),
  };
}
