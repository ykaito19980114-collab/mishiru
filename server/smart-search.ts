// AI意味検索（自然文→研究室）。GEMINI設定時はLLMで意図抽出、未設定時は辞書ベースのフォールバック（AC-05思想）。
import { store } from "./store";
import { callAIJson, aiEnabled } from "./ai";
import { inferAreaTags, RESEARCH_AREAS, areaLabel } from "../shared/taxonomy";
import { FIELD_MAJORS, classifyField, fieldLabel, type FieldMajor } from "../shared/fields";
import type { Lab } from "../shared/types";

export interface SmartResult {
  interpreted: { fields: string[]; fieldLabels: string[]; areas: string[]; areaLabels: string[]; keywords: string[] };
  by: "name" | "llm" | "keyword";
  mode: "name" | "topic";
  labs: (Lab & { _score: number; _why: string[] })[];
  total: number;
}

const IDENTITY_LABELS = /(?:研究室|研究グループ|ラボ|lab|laboratory|先生|教授|准教授|講師|助教)$/gi;
const normalizeIdentity = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[・･,，、/／|｜()（）「」『』【】[\]{}]/g, " ").replace(/\s+/g, " ").trim();
const compactIdentity = (value: string) => normalizeIdentity(value).replace(/\s/g, "");
const identityTokens = (query: string) => normalizeIdentity(query)
  .split(" ")
  .map((token) => token.replace(IDENTITY_LABELS, "").trim())
  .filter((token) => token.length >= 2);

function scoreIdentity(lab: Lab, query: string) {
  const tokens = identityTokens(query);
  const compactQuery = compactIdentity(query);
  const university = compactIdentity(lab.university.name);
  const labName = compactIdentity(lab.name);
  const people = lab.members.map((member) => ({
    compact: compactIdentity(member.name),
    label: `${member.name}${member.title}`,
  })).filter((person) => person.compact.length >= 2);
  const identityParts = [university, labName, ...people.map((person) => person.compact)];

  let score = 0;
  const why: string[] = [];
  const universityMatched = compactQuery.includes(university)
    || tokens.some((token) => university.includes(compactIdentity(token)));
  if (universityMatched) {
    score += compactQuery === university ? 45 : 35;
    why.push(`${lab.university.name}に一致`);
  }

  const labToken = labName.replace(IDENTITY_LABELS, "");
  const labMatched = compactQuery === labName
    || compactQuery.includes(labName)
    || (labToken.length >= 2 && compactQuery.includes(labToken))
    || tokens.some((token) => labName.includes(compactIdentity(token)));
  if (labMatched) {
    score += compactQuery === labName ? 100 : 55;
    why.push(`${lab.name}に一致`);
  }

  const matchedPeople = people.filter((person) =>
    compactQuery.includes(person.compact)
    || tokens.some((token) => person.compact.includes(compactIdentity(token))));
  if (matchedPeople.length) {
    score += matchedPeople.some((person) => compactQuery === person.compact) ? 95 : 60;
    why.push(`${matchedPeople[0].label}に一致`);
  }

  // スペースなしの「兵庫県立大学古賀」にも対応する。
  if (universityMatched && compactQuery.includes(university)) {
    const remainder = compactQuery.replace(university, "").replace(IDENTITY_LABELS, "");
    if (remainder.length >= 2 && identityParts.slice(1).some((part) => part.includes(remainder))) {
      score += 40;
    }
  }

  // 複数語では、大学名・研究室名・教員名のどこかですべての語が一致した候補だけを残す。
  if (tokens.length > 1 && !tokens.every((token) =>
    identityParts.some((part) => part.includes(compactIdentity(token))))) {
    return { score: 0, why: [] as string[] };
  }
  return { score, why };
}

function searchByIdentity(query: string, limit: number) {
  const scored = store.publicNonDemo()
    .map((lab) => ({ lab, ...scoreIdentity(lab, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score
      || a.lab.university.name.localeCompare(b.lab.university.name, "ja")
      || a.lab.name.localeCompare(b.lab.name, "ja"));
  return {
    total: scored.length,
    labs: scored.slice(0, limit).map(({ lab, score, why }) => ({ ...lab, _score: score, _why: why })),
  };
}

function hasIdentityIntent(query: string, identityResultCount: number) {
  const tokens = identityTokens(query);
  const hasNamedUniversity = tokens.some((token) => token.length >= 4 && /大学(?:院)?$/.test(token));
  return identityResultCount > 0
    || hasNamedUniversity
    || /研究室|研究グループ|ラボ|lab|先生|教授|准教授|講師|助教/i.test(query);
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
  const identity = searchByIdentity(q, limit);
  if (hasIdentityIntent(q, identity.total)) {
    return {
      interpreted: { fields: [], fieldLabels: [], areas: [], areaLabels: [], keywords: [] },
      by: "name",
      mode: "name",
      labs: identity.labs,
      total: identity.total,
    };
  }

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
    by, mode: "topic", labs, total: scored.length,
  };
}
