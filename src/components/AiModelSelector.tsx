import { useEffect, useId, useState } from "react";
import { BrainCircuit } from "lucide-react";
import { AI_MODELS, getAiModel, setAiModel, type AiModelId } from "../lib/aiModel";

export function AiModelSelector({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [model, setModel] = useState<AiModelId>(() => getAiModel());

  useEffect(() => {
    const sync = (event: Event) => setModel((event as CustomEvent<AiModelId>).detail || getAiModel());
    window.addEventListener("mishiru:ai-model", sync);
    return () => window.removeEventListener("mishiru:ai-model", sync);
  }, []);

  return (
    <div className={`ai-model ${compact ? "ai-model--compact" : ""}`}>
      <label htmlFor={id}>
        <BrainCircuit aria-hidden="true" />
        <span><strong>AIモデル</strong>{!compact && <small>生成時に使用</small>}</span>
      </label>
      <select id={id} value={model} onChange={(event) => { const next = event.target.value as AiModelId; setModel(next); setAiModel(next); }}>
        <optgroup label="OpenAI">
          {AI_MODELS.filter((item) => item.provider === "OpenAI").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.description}</option>)}
        </optgroup>
        <optgroup label="Google Gemini">
          {AI_MODELS.filter((item) => item.provider === "Google").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.description}</option>)}
        </optgroup>
      </select>
    </div>
  );
}
