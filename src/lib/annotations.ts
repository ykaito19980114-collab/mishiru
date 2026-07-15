import type { Lab } from "../../shared/types";

export type MarkLabel = "good" | "unclear" | "not_fit" | "important";
export type SourceType = "lab_page" | "paper" | "external_url" | "research_theme_card";

export interface Annotation {
  id: string;
  sourceType: SourceType;
  sourceId?: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceName?: string;
  selectedText: string;
  label: MarkLabel;
  note: string;
  aiKeywords: string[];
  aiResearchFields: string[];
  aiMethods: string[];
  aiObjects: string[];
  aiConditions: string[];
  confidence: number;
  createdAt: string;

  // v1 compatibility
  keywords?: string[];
  methods?: string[];
  conditions?: string[];
}

export interface AnnotationInput {
  sourceType: SourceType;
  sourceId?: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceName?: string;
  selectedText: string;
  label: MarkLabel;
  note: string;
  seedKeywords?: string[];
}

export interface InterestDraft {
  summary: string;
  questions: string;
  requirements: string;
  reason: string;
}

const KEY = "openlab_annotations_v2";
const OLD_KEY = "openlab_annotations_v1";
const DRAFT_KEY = "openlab_interest_draft_v1";

const LABEL_TEXT: Record<MarkLabel, string> = {
  good: "いい",
  unclear: "わからない",
  not_fit: "違う",
  important: "大事",
};

const METHOD_WORDS = [
  "実験", "観察", "調査", "解析", "分析", "シミュレーション", "設計", "測定", "開発", "理論",
  "フィールド", "インタビュー", "プロトタイピング", "データ", "モデル", "評価", "制作",
];
const CONDITION_WORDS = [
  "指導", "共同研究", "学生", "進路", "日常", "チーム", "企業", "博士", "就職", "研究室",
  "社会実装", "サービス", "都市", "医療", "教育", "地域", "産業", "公共", "生活",
];

const FIELD_HINTS: { field: string; words: string[] }[] = [
  { field: "HCI・ユーザー体験", words: ["HCI", "UX", "ユーザー", "サービス", "体験", "インタラクション", "人間"] },
  { field: "認知科学・心理学", words: ["感情", "心理", "認知", "意思決定", "感覚", "行動", "知覚"] },
  { field: "データ分析・情報科学", words: ["データ", "AI", "機械学習", "自然言語", "言語", "モデル", "予測", "分析"] },
  { field: "設計・システム", words: ["設計", "システム", "制御", "ロボット", "装置", "開発", "プロセス"] },
  { field: "生命・分子", words: ["タンパク質", "蛋白質", "遺伝子", "ゲノム", "細胞", "生命", "分子", "生体"] },
  { field: "都市・社会実装", words: ["都市", "地域", "公共", "社会", "政策", "まち", "実装"] },
];

function nowId() {
  return `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function extractTerms(text: string) {
  const raw: string[] = Array.from(text.match(/[一-龥ァ-ヶーA-Za-z0-9]{2,}/g) || []);
  const stop = new Set(["研究室", "について", "ところ", "ためる", "保存", "気になる", "わからない", "できる", "している", "という"]);
  return uniq(raw.filter((w) => !stop.has(w) && w.length <= 28)).slice(0, 12);
}

function containsAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function analyzeText(text: string, seedKeywords: string[] = []) {
  const terms = uniq([...seedKeywords, ...extractTerms(text)]).slice(0, 12);
  const aiMethods = METHOD_WORDS.filter((w) => text.includes(w));
  const aiConditions = CONDITION_WORDS.filter((w) => text.includes(w));
  const aiResearchFields = FIELD_HINTS.filter((h) => containsAny(text, h.words)).map((h) => h.field);
  const aiObjects = terms.filter((term) => !METHOD_WORDS.includes(term) && !CONDITION_WORDS.includes(term)).slice(0, 8);
  return {
    aiKeywords: terms,
    aiResearchFields: uniq(aiResearchFields).slice(0, 6),
    aiMethods: uniq(aiMethods).slice(0, 6),
    aiObjects: uniq(aiObjects).slice(0, 8),
    aiConditions: uniq(aiConditions).slice(0, 6),
    confidence: Math.min(0.92, 0.38 + terms.length * 0.045 + aiMethods.length * 0.05 + aiResearchFields.length * 0.06),
  };
}

function migrateAnnotation(raw: any): Annotation | null {
  if (!raw || !raw.selectedText || !raw.label) return null;
  const text = `${raw.selectedText || ""} ${raw.note || ""} ${(raw.keywords || []).join(" ")}`;
  const analysis = analyzeText(text, raw.keywords || []);
  return {
    id: raw.id || nowId(),
    sourceType: raw.sourceType || "lab_page",
    sourceId: raw.sourceId,
    sourceTitle: raw.sourceTitle || "未設定のソース",
    sourceUrl: raw.sourceUrl || "",
    sourceName: raw.sourceName || raw.sourceTitle || "",
    selectedText: String(raw.selectedText).slice(0, 500),
    label: raw.label,
    note: String(raw.note || "").slice(0, 500),
    ...analysis,
    createdAt: raw.createdAt || new Date().toISOString(),
    keywords: raw.keywords,
    methods: raw.methods,
    conditions: raw.conditions,
  };
}

export function readAnnotations(): Annotation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(migrateAnnotation).filter((a): a is Annotation => !!a);
  } catch { /* noop */ }
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "[]");
    if (!Array.isArray(old)) return [];
    const migrated = old.map(migrateAnnotation).filter((a): a is Annotation => !!a);
    if (migrated.length > 0) localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

export function saveAnnotation(annotation: Annotation) {
  localStorage.setItem(KEY, JSON.stringify([annotation, ...readAnnotations()].slice(0, 240)));
}

export function makeAnnotation(input: AnnotationInput): Annotation {
  const selectedText = input.selectedText.trim().slice(0, 500);
  const note = input.note.trim().slice(0, 500);
  const analysis = analyzeText(`${input.sourceTitle} ${selectedText} ${note}`, input.seedKeywords || []);
  return {
    id: nowId(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceTitle: input.sourceTitle.trim().slice(0, 120) || "未設定のソース",
    sourceUrl: input.sourceUrl.trim().slice(0, 500),
    sourceName: input.sourceName?.trim().slice(0, 120),
    selectedText,
    label: input.label,
    note,
    ...analysis,
    createdAt: new Date().toISOString(),
  };
}

export function makeLabAnnotation(lab: Lab, selectedText: string, label: MarkLabel, note: string, sourceUrl?: string): Annotation {
  const url = sourceUrl || `/labs/${lab.id}`;
  return makeAnnotation({
    sourceType: url.startsWith("http") ? "external_url" : "lab_page",
    sourceId: lab.id,
    sourceTitle: lab.name,
    sourceUrl: url,
    sourceName: `${lab.university.name} ${lab.pi.name} ${lab.pi.title}`,
    selectedText,
    label,
    note,
    seedKeywords: lab.keywords,
  });
}

export function labelText(label: MarkLabel) {
  return LABEL_TEXT[label];
}

function freq(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((v) => map.set(v, (map.get(v) || 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function questionForTerm(term: string) {
  if (/感情|心理|認知|感覚|意思決定|行動/.test(term)) return "人の感情や判断は、どんな行動データや体験から測れるのか？";
  if (/サービス|UX|ユーザー|体験|HCI|インタラクション/.test(term)) return "人がサービスを使う体験は、どう観察し、よりよい設計へ戻せるのか？";
  if (/都市|地域|公共|まち/.test(term)) return "都市や地域で起きる体験を、どんなデータや観察で捉え直せるのか？";
  if (/自然言語|言語|機械翻訳|文章|意味/.test(term)) return "人の言葉の意味や文脈を、機械はどこまで扱えるのか？";
  if (/制御|ロボット|機械|装置|システム/.test(term)) return "複雑な装置やシステムを、環境に合わせてどう安定して動かすのか？";
  if (/タンパク質|蛋白質|分子|細胞|遺伝子|ゲノム|生命/.test(term)) return `${term}は、どんな仕組みで形や働きが生まれているのか？`;
  if (/データ|AI|機械学習|モデル|分析/.test(term)) return "データ分析を使って、現象の何を説明し、どこまで意思決定に戻せるのか？";
  return `${term}を入口に、何を測り、どんな場面へ持ち込めるのか？`;
}

function requirementSentences(themes: string[], methods: string[], conditions: string[], unclear: string[], avoid: string[]) {
  const s: string[] = [];
  if (containsAny(themes.join(" "), ["感情", "心理", "認知", "行動", "感覚"])) s.push("人の感情・判断・行動を、言葉だけでなく観察やデータから捉えたい。");
  if (containsAny(themes.join(" "), ["サービス", "体験", "都市", "地域", "公共"])) s.push("心理や情報だけで閉じず、サービス設計・都市体験・社会実装にもつなげたい。");
  if (containsAny(methods.join(" ") + themes.join(" "), ["データ", "分析", "AI", "機械学習", "モデル"])) s.push("データ分析は使いたいが、純粋なモデル精度競争だけに寄りたいわけではない。");
  if (containsAny(conditions.join(" "), ["社会実装", "サービス", "都市", "地域", "企業", "公共"])) s.push("研究室に入るだけでなく、自分の問いを近い研究環境へ持ち込みたい。");
  if (unclear.length > 0) s.push(`まだ言葉にしきれていないが、「${unclear.slice(0, 2).join("・")}」は次に確かめたい。`);
  if (avoid.length > 0) s.push(`一方で、「${avoid.slice(0, 2).join("・")}」だけに閉じる方向は少し違う可能性がある。`);
  if (s.length === 0 && themes.length > 0) s.push(`「${themes.slice(0, 3).join("・")}」に反応しており、対象そのものよりも何を測り、どう応用できるかを知りたい。`);
  return s.slice(0, 5);
}

function craftingRoutes(fields: string[], themes: string[], methods: string[], conditions: string[]) {
  const joined = `${fields.join(" ")} ${themes.join(" ")} ${methods.join(" ")} ${conditions.join(" ")}`;
  if (containsAny(joined, ["感情", "心理", "認知", "サービス", "体験", "都市", "HCI"])) {
    return [
      "HCI・UX系研究室に入り、サービス体験や人間行動の観点で研究テーマを作る",
      "認知科学・心理学系研究室に入り、測定や実験の方法を学ぶ",
      "デザイン・システム系研究室に入り、社会実装寄りの問いとして組み立てる",
    ];
  }
  if (containsAny(joined, ["自然言語", "言語", "機械翻訳", "AI", "データ"])) {
    return [
      "自然言語処理・情報検索系研究室に入り、言葉や意味を扱う問いに寄せる",
      "HCI・教育工学系研究室に入り、AIを使う人の体験や学習支援として組み立てる",
      "データ分析系研究室に入り、モデル精度だけでなく利用場面の評価まで含める",
    ];
  }
  if (containsAny(joined, ["タンパク質", "蛋白質", "細胞", "遺伝子", "ゲノム", "生命"])) {
    return [
      "生命科学・分子生物学系研究室に入り、構造や機能の仕組みを扱う",
      "情報生命・バイオインフォマティクス系研究室に入り、データ解析から生命現象に近づく",
      "医工学・創薬寄りの研究室に入り、測定や応用先から問いを組み立てる",
    ];
  }
  if (containsAny(joined, ["制御", "ロボット", "装置", "設計", "システム"])) {
    return [
      "制御・ロボティクス系研究室に入り、動かす対象を自分の関心に寄せる",
      "システム設計系研究室に入り、測定・評価・改善の流れとして問いを作る",
      "応用先が近い研究室を選び、装置開発だけでなく利用場面まで広げる",
    ];
  }
  return [
    "近いキーワードを持つ研究室で、対象や応用先を自分の関心に寄せる",
    "研究方法が近い研究室で、測り方・作り方を学びながらテーマ化する",
    "少し違う分野の研究室を比較し、合わない条件も判断材料にする",
  ];
}

function fieldToNaturalTerm(field: string) {
  if (field.includes("HCI") || field.includes("ユーザー")) return "サービス体験";
  if (field.includes("認知科学") || field.includes("心理学")) return "感情";
  if (field.includes("データ") || field.includes("情報")) return "データ分析";
  if (field.includes("設計") || field.includes("システム")) return "システム設計";
  if (field.includes("生命") || field.includes("分子")) return "生命現象";
  if (field.includes("都市")) return "都市体験";
  return field;
}

export function readInterestDraft(): InterestDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      questions: typeof parsed.questions === "string" ? parsed.questions : "",
      requirements: typeof parsed.requirements === "string" ? parsed.requirements : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return { summary: "", questions: "", requirements: "", reason: "" };
  }
}

export function writeInterestDraft(draft: InterestDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function summarizeAnnotations(items: Annotation[], draft: InterestDraft = readInterestDraft()) {
  const positives = items.filter((a) => a.label === "good" || a.label === "important");
  const unclear = items.filter((a) => a.label === "unclear");
  const notFit = items.filter((a) => a.label === "not_fit");
  const themes = freq(positives.flatMap((a) => [...(a.aiObjects || []), ...(a.aiKeywords || a.keywords || [])])).slice(0, 8);
  const methods = freq(positives.flatMap((a) => a.aiMethods || a.methods || [])).slice(0, 6);
  const conditions = freq(items.flatMap((a) => a.aiConditions || a.conditions || [])).slice(0, 6);
  const fields = freq(positives.flatMap((a) => a.aiResearchFields || [])).slice(0, 6);
  const unclearThemes = freq(unclear.flatMap((a) => [...(a.aiObjects || []), ...(a.aiKeywords || a.keywords || [])])).slice(0, 5);
  const avoidThemes = freq(notFit.flatMap((a) => [...(a.aiObjects || []), ...(a.aiKeywords || a.keywords || [])])).slice(0, 5);
  const draftTerms = extractTerms(`${draft.summary} ${draft.questions} ${draft.requirements} ${draft.reason}`);
  const inferredTerms = fields.map(fieldToNaturalTerm);
  const positiveTerms = uniq([...draftTerms, ...inferredTerms, ...themes]);
  const questionTerms = positiveTerms.filter((term) => !avoidThemes.some((avoid) => term.includes(avoid) || avoid.includes(term)));
  const allThemes = uniq([...questionTerms, ...themes.filter((term) => !avoidThemes.includes(term))]).slice(0, 10);
  const questions = draft.questions.trim()
    ? draft.questions.split(/\n+/).map((q) => q.trim()).filter(Boolean).slice(0, 4)
    : uniq((questionTerms.length ? questionTerms : allThemes).slice(0, 4).map(questionForTerm)).slice(0, 4);
  const requirements = draft.requirements.trim()
    ? draft.requirements.split(/\n+/).map((q) => q.trim()).filter(Boolean).slice(0, 6)
    : requirementSentences(allThemes, methods, conditions, unclearThemes, avoidThemes);
  const summary = draft.summary.trim() || (requirements.length
    ? `現時点では、${requirements[0]} ${requirements[1] || ""}`.trim()
    : "現時点では、反応した文章をもとに関心条件を整理している途中です。");
  const academicTerms = uniq([...fields, ...allThemes]).slice(0, 8);
  const searchTerms = uniq([...allThemes.slice(0, 5), ...methods.slice(0, 3), ...fields.slice(0, 3)]).slice(0, 10);
  return {
    count: items.length,
    themes: allThemes,
    methods,
    conditions,
    fields,
    unclearThemes,
    avoidThemes,
    requirements,
    questions,
    topQuestion: questions[0] || "",
    summary,
    searchTerms,
    academicTerms,
    profileQuery: searchTerms.slice(0, 6).join(" "),
    craftingRoutes: craftingRoutes(fields, allThemes, methods, conditions),
    labelText,
  };
}
