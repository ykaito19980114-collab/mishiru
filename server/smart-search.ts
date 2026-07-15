// AI意味検索（自然文→研究室）。GEMINI設定時はLLMで意図抽出、未設定時は辞書ベースのフォールバック（AC-05思想）。
import { store } from "./store";
import { callAIJson, aiEnabled } from "./ai";
import { inferAreaTags, RESEARCH_AREAS, areaLabel } from "../shared/taxonomy";
import { FIELD_MAJORS, classifyField, fieldLabel, type FieldMajor } from "../shared/fields";
import type { Lab } from "../shared/types";

export interface SmartResult {
  interpreted: { fields: string[]; fieldLabels: string[]; areas: string[]; areaLabels: string[]; keywords: string[] };
  by: "llm" | "keyword";
  labs: (Lab & { _score: number; _why: string[] })[];
  total: number;
}

// 入力文から分野大分類を推定（fields.tsのRULES needlesが入力に含まれるか）
function inferFields(text: string): FieldMajor[] {
  const found = new Set<FieldMajor>();
  // classifyFieldは単一分野を返すため、ここでは各分野のneedle出現を直接見る
  const guess = classifyField(text, "", "");
  if (guess !== "other") found.add(guess);
  // 追加で明示ジャンル語
  const map: [string, FieldMajor][] = [
    ["宇宙", "physics-space"], ["ロボット", "eee-mech"], ["AI", "info-math"], ["人工知能", "info-math"],
    ["医療", "medical"], ["がん", "medical"], ["薬", "medical"], ["建築", "arch-civil"], ["まちづくり", "arch-civil"],
    ["環境", "agri-env"], ["食", "agri-env"], ["エネルギー", "eee-mech"], ["材料", "material-chem"], ["化学", "material-chem"],
    ["生き物", "life-bio"], ["生物", "life-bio"], ["脳", "life-bio"], ["経済", "social"], ["心理", "education-psych"],
  ];
  for (const [needle, f] of map) if (text.includes(needle)) found.add(f);
  return Array.from(found);
}

// 入力文からキーワード候補を抽出（研究室キーワード語彙との部分一致）
let vocabCache: string[] | null = null;
function vocabulary(): string[] {
  if (vocabCache) return vocabCache;
  const freq = new Map<string, number>();
  for (const l of store.publicNonDemo()) for (const k of l.keywords) freq.set(k, (freq.get(k) || 0) + 1);
  // 2回以上出現する語のみ（表記ゆれ・固有すぎる語を除く）を長い順に
  vocabCache = Array.from(freq.entries()).filter(([, n]) => n >= 2).map(([k]) => k).sort((a, b) => b.length - a.length);
  return vocabCache;
}
function extractKeywords(text: string): string[] {
  const hit: string[] = [];
  for (const term of vocabulary()) {
    if (term.length >= 2 && text.includes(term)) { hit.push(term); if (hit.length >= 8) break; }
  }
  return hit;
}

async function llmInterpret(query: string): Promise<{ fields: string[]; areas: string[]; keywords: string[] } | null> {
  if (!aiEnabled()) return null;
  const prompt = `ユーザーの「なんとなくの興味」から、大学研究室を探すための検索意図をJSONで抽出してください。
利用可能な分野(field): ${FIELD_MAJORS.map((f) => `${f.id}(${f.label})`).join(", ")}
利用可能な研究領域(area): ${RESEARCH_AREAS.map((a) => `${a.id}(${a.label})`).join(", ")}
出力は必ず次のJSONのみ: {"fields":["id",...],"areas":["id",...],"keywords":["日本語キーワード",...]}
キーワードは研究室検索に効く具体語（例:量子コンピュータ, ロボット, がん治療）を3〜6個。
ユーザー入力: 「${query}」`;
  const parsed = await callAIJson<{ fields: string[]; areas: string[]; keywords: string[] }>(prompt, { temperature: 0.2 });
  if (!parsed) return null;
  const validFields = new Set<string>(FIELD_MAJORS.map((f) => f.id));
  const validAreas = new Set<string>(RESEARCH_AREAS.map((a) => a.id));
  return {
    fields: (parsed.fields || []).filter((x: string) => validFields.has(x)),
    areas: (parsed.areas || []).filter((x: string) => validAreas.has(x)),
    keywords: (parsed.keywords || []).filter((x: unknown) => typeof x === "string").slice(0, 6),
  };
}

export async function smartSearch(query: string, limit = 40): Promise<SmartResult> {
  const q = query.trim();
  const llm = await llmInterpret(q);

  const fields = llm?.fields.length ? llm.fields : inferFields(q);
  const areas = llm?.areas.length ? llm.areas : inferAreaTags([q]);
  const keywords = (llm?.keywords.length ? llm.keywords : extractKeywords(q)).map((k) => k.toLowerCase());
  const by: "llm" | "keyword" = llm ? "llm" : "keyword";

  const fieldSet = new Set(fields);
  const areaSet = new Set(areas);

  const scored = store.publicNonDemo().map((lab) => {
    let score = 0;
    const why: string[] = [];
    const labKw = lab.keywords.map((k) => k.toLowerCase());
    const areaHits = lab.area_tags.filter((t) => areaSet.has(t));
    const kwHits = keywords.filter((k) => labKw.some((lk) => lk.includes(k) || k.includes(lk)));
    // 生入力そのものが研究室名・キーワードに含まれる直接一致
    const directHit = q.length >= 2 && (lab.name.includes(q) || labKw.some((lk) => lk.includes(q.toLowerCase())));
    // キーワード/領域/直接一致のいずれかが無ければ結果に含めない（分野一致だけでは広すぎる）
    const qualifies = areaHits.length > 0 || kwHits.length > 0 || directHit;
    if (!qualifies) return { lab, score: 0, why };

    if (kwHits.length) { score += kwHits.length * 3; why.push(`「${kwHits.slice(0, 2).join("・")}」に一致`); }
    if (areaHits.length) score += areaHits.length * 2;
    if (directHit) score += 3;
    if (fieldSet.has(lab.field_major)) score += 1.5; // 分野一致はブースターのみ
    return { lab, score, why };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const labs = scored.slice(0, limit).map((x) => ({ ...x.lab, _score: x.score, _why: x.why }));

  return {
    interpreted: {
      fields, fieldLabels: fields.map(fieldLabel),
      areas, areaLabels: areas.map(areaLabel), keywords,
    },
    by, labs, total: scored.length,
  };
}
