import type {
  MatchedAcademicResource,
  NormalizedResearchMaterial,
  PaperCandidate,
  QuestionFreeInput,
  RQCandidate,
  Step1Response,
  Step2Response,
} from "../shared/research-project";
import { callAI, callAIJson } from "./ai";
import { store } from "./store";

const RQ_TYPES = [
  ["R1", "実態記述研究"], ["R2", "分類・類型化研究"], ["R3", "関係・要因研究"],
  ["R4", "因果・効果検証研究"], ["R5", "プロセス研究"], ["R6", "意味・解釈研究"],
  ["R7", "理論・概念研究"], ["R8", "モデル構築研究"], ["R9", "尺度・指標開発研究"],
  ["R10", "方法・手法開発研究"], ["R11", "デザイン・人工物研究"], ["R12", "統合・レビュー研究"],
] as const;

const RESEARCH_BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: {
    source_synthesis: {
      type: "OBJECT",
      properties: {
        core_interest: { type: "STRING" },
        material_connections: { type: "ARRAY", items: { type: "STRING" } },
        adopted_focus: { type: "STRING" },
        assumptions: { type: "ARRAY", items: { type: "STRING" } },
        missing_information: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["core_interest", "material_connections", "adopted_focus", "assumptions", "missing_information"],
    },
    decomposition: {
      type: "OBJECT",
      properties: Object.fromEntries(["target", "phenomenon", "context", "tension", "question", "utility", "motivation"].map((key) => [key, { type: "STRING" }])),
      required: ["target", "phenomenon", "context", "tension", "question", "utility", "motivation"],
    },
    research_map_position: {
      type: "OBJECT",
      properties: Object.fromEntries(["vertical_axis", "horizontal_axis", "domain_name", "reason"].map((key) => [key, { type: "STRING" }])),
      required: ["vertical_axis", "horizontal_axis", "domain_name", "reason"],
    },
    domain_shifts: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: {
        vertical_axis: { type: "STRING" }, horizontal_axis: { type: "STRING" }, new_domain: { type: "STRING" },
        shifted_rq: { type: "STRING" }, reason: { type: "STRING" }, is_recommended: { type: "BOOLEAN" },
      }, required: ["vertical_axis", "horizontal_axis", "new_domain", "shifted_rq", "reason", "is_recommended"] },
    },
  },
  required: ["source_synthesis", "decomposition", "research_map_position", "domain_shifts"],
};

const RQ_CANDIDATES_SCHEMA = {
  type: "OBJECT",
  properties: {
    output_type_proposals: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: {
        type_name: { type: "STRING" }, rq_title: { type: "STRING" }, public_rq: { type: "STRING" }, academic_rq: { type: "STRING" },
        what_we_learn: { type: "STRING" }, methods: { type: "STRING" }, expected_output: { type: "STRING" }, difficulty: { type: "STRING" },
        is_recommended: { type: "BOOLEAN" }, recommendation_reason: { type: "STRING" },
        components: { type: "OBJECT", properties: {
          target: { type: "STRING" }, focus: { type: "STRING" }, relationship: { type: "STRING" }, context: { type: "STRING" }, evidence: { type: "STRING" },
        }, required: ["target", "focus", "relationship", "context", "evidence"] },
        quality_score: { type: "NUMBER" },
      }, required: ["type_name", "rq_title", "public_rq", "academic_rq", "what_we_learn", "methods", "expected_output", "difficulty", "is_recommended", "recommendation_reason", "components", "quality_score"] },
    },
  },
  required: ["output_type_proposals"],
};

const PUBLIC_RQ_SCHEMA = {
  type: "OBJECT",
  properties: {
    public_questions: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: {
        type_name: { type: "STRING" }, rq_title: { type: "STRING" }, public_rq: { type: "STRING" },
      }, required: ["type_name", "rq_title", "public_rq"] },
    },
  },
  required: ["public_questions"],
};

const VERIFIED_LITERATURE_SCHEMA = {
  type: "OBJECT",
  properties: {
    literature_review: {
      type: "OBJECT",
      properties: {
        target_gap_deep: { type: "STRING" },
        knowns: { type: "ARRAY", items: { type: "STRING" } },
        unknowns: { type: "ARRAY", items: { type: "STRING" } },
        controversies: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["target_gap_deep", "knowns", "unknowns", "controversies"],
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "NUMBER" }, summary: { type: "STRING" }, reason: { type: "STRING" } },
        required: ["id", "summary", "reason"],
      },
    },
  },
  required: ["literature_review", "items"],
};

const cleanArray = (values?: string[], maxItems = 16, maxLength = 300) => Array.from(new Set((Array.isArray(values) ? values : [])
  .map((value) => String(value || "").trim().slice(0, maxLength))
  .filter(Boolean))).slice(0, maxItems);
const materialText = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const MATERIAL_SOURCE_TYPES = new Set(["lab", "field", "society", "journal", "marking", "memo", "quote", "external_url", "book", "article", "news", "paper_url", "post_url", "event"]);

export function normalizeResearchMaterials(materials: NormalizedResearchMaterial[]) {
  return (Array.isArray(materials) ? materials : []).filter((material) => material && typeof material === "object" && MATERIAL_SOURCE_TYPES.has(String(material.sourceType))).slice(0, 30).map((material) => {
    const normalized: NormalizedResearchMaterial = {
      sourceType: material.sourceType,
      sourceId: materialText(material.sourceId, 180),
      title: materialText(material.title, 300) || "タイトル未設定",
    };
    const officialDescription = materialText(material.officialDescription, 4000); if (officialDescription) normalized.officialDescription = officialDescription;
    if (cleanArray(material.officialQuestions, 12, 500).length) normalized.officialQuestions = cleanArray(material.officialQuestions, 12, 500);
    if (cleanArray(material.sourceKeywords, 30, 100).length) normalized.sourceKeywords = cleanArray(material.sourceKeywords, 30, 100);
    if (cleanArray(material.approvedTags, 30, 100).length) normalized.approvedTags = cleanArray(material.approvedTags, 30, 100);
    if (cleanArray(material.pendingTags, 30, 100).length) normalized.pendingTags = cleanArray(material.pendingTags, 30, 100);
    const executionMode = materialText(material.executionMode, 80); if (executionMode) normalized.executionMode = executionMode;
    const reaction = materialText(material.userReaction, 80); if (reaction) normalized.userReaction = reaction;
    const memo = materialText(material.userReasonMemo, 2000); if (memo) normalized.userReasonMemo = memo;
    const excerpt = materialText(material.excerpt, 4000); if (excerpt) normalized.excerpt = excerpt;
    const url = materialText(material.url, 1000); if (url) normalized.url = url;
    const verification = materialText(material.verificationStatus, 80); if (verification) normalized.verificationStatus = verification;
    if (material.createdAt) normalized.createdAt = material.createdAt;
    return normalized;
  });
}

export function hasQuestionCraftEvidence(mode: "free_input" | "saved_items", input: QuestionFreeInput, materials: NormalizedResearchMaterial[]) {
  if (mode === "free_input") return Object.values(input).join(" ").trim().length >= 12;
  return materials.some((item) => Boolean(item.officialDescription || item.officialQuestions?.length || item.excerpt || item.userReasonMemo));
}

function materialPrompt(materials: NormalizedResearchMaterial[]) {
  return materials.map((item) => ({
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    officialInformation: {
      description: item.officialDescription,
      questions: item.officialQuestions,
      sourceKeywords: item.sourceKeywords,
      approvedTags: item.approvedTags,
      pendingTags_unverified: item.pendingTags,
      executionMode: item.executionMode,
      verificationStatus: item.verificationStatus,
    },
    userInformation: { reaction: item.userReaction, reasonMemo: item.userReasonMemo, excerpt: item.excerpt },
    url: item.url,
  }));
}

function cleanTopic(value: string) {
  return value
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[（(](?:公開情報|キーワード|AI推定|本人未確認)[^）)]*[）)]/g, "")
    .replace(/[（(][^）)]*(?:学会誌|ジャーナル)[^）)]*[）)]/g, "")
    .replace(/を主なテーマとする研究室です.*$/g, "")
    .replace(/詳細は公式サイト.*$/g, "")
    .replace(/[。．]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactTopic(value: string, max = 44) {
  const cleaned = cleanTopic(value).split(/[。\n]/)[0] || "";
  if (cleaned.length <= max) return cleaned;
  const firstClause = cleaned.split(/[、，；;]/)[0]?.trim();
  if (firstClause && firstClause.length >= 8 && firstClause.length <= max) return firstClause;
  return cleaned.slice(0, max).replace(/[・／/とをがはのにへで]+$/g, "").trim();
}

function plainLanguage(value: string) {
  return cleanTopic(value)
    .replace(/[（(](?:例[:：]?|たとえば)[^）)]*[）)]/g, "")
    .replace(/異種材料/g, "異なる素材")
    .replace(/接合界面/g, "素材のつなぎ目")
    .replace(/接合した/g, "つなぎ合わせた")
    .replace(/接合する/g, "つなぎ合わせる")
    .replace(/接合された/g, "つなぎ合わされた")
    .replace(/接合/g, "つなぎ合わせ")
    .replace(/異なる素材をつなぎ合わせた複合部材/g, "異なる素材を組み合わせたもの")
    .replace(/異なる素材の素材のつなぎ目/g, "異なる素材のつなぎ目")
    .replace(/無機[‐‑–—―-]有機(?:複合)?界面(?:を含む)?(?:機能性)?材料/g, "異なる素材を組み合わせて作る材料")
    .replace(/無機[‐‑–—―-]有機(?:複合)?界面/g, "異なる素材の境目")
    .replace(/機能性材料/g, "特定の働きをもつ材料")
    .replace(/データ駆動(?:モデル|探索)/g, "データを使った予測")
    .replace(/予測モデル/g, "予測の仕組み")
    .replace(/論理制約|形式仕様/g, "守るべき条件")
    .replace(/時系列(?:観測|データ)/g, "時間とともに集めたデータ")
    .replace(/要件充足(?:率|可能性)?/g, "必要な条件を満たす割合")
    .replace(/要件違反(?:率)?/g, "必要な条件から外れる割合")
    .replace(/逐次探索/g, "順番に候補を試す探し方")
    .replace(/および|ならびに/g, "と")
    .replace(/における/g, "で")
    .replace(/どの程度/g, "どれくらい")
    .replace(/評価・監視プロセス/g, "調べる過程")
    .replace(/\s+/g, " ")
    .trim();
}

function plainTopic(value: string, max = 34) {
  const plain = plainLanguage(value).split(/[。\n、，；;]/)[0]?.trim() || "選んだテーマ";
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/[・／/とをがはのにへで]+$/g, "").trim();
}

function publicStyleQuestions(materials: NormalizedResearchMaterial[]) {
  const values: string[] = [];
  const normalizedTitle = (value: string) => value.replace(/[（(].*?[）)]/g, "").trim();
  for (const material of materials) {
    const title = normalizedTitle(material.title);
    const rows = material.sourceType === "field" ? store.allResearchFields()
      : material.sourceType === "society" ? store.allResearchSocieties()
        : material.sourceType === "journal" ? store.allResearchJournals() : [];
    const matched = rows.find((item: any) => normalizedTitle(item.nameJa || item.name || "") === title);
    if (matched?.questions?.length) values.push(...matched.questions);
  }
  values.push(
    "記号と基本ルールから、どのような結論を正しく導けるのか？",
    "異なる数学的対象を、同じ形式や構造として扱えるのはどのような場合か？",
    "対象の状態を正確に測り、望ましい方向へ動かすには何が必要か？",
    "少ない試行から、よりよい選択肢を見つけるにはどんな探し方が役立つのか？",
  );
  return Array.from(new Set(values)).slice(0, 8);
}

function materialTopics(input: QuestionFreeInput, materials: NormalizedResearchMaterial[]) {
  const userWords = [input.recentInterest, input.discomfort, input.graduateTopic, input.reason]
    .map((value) => compactTopic(value)).filter((value) => value.length >= 4);
  const materialWords = materials.flatMap((item) => {
    const labTheme = /研究室$/.test(item.title) ? item.officialDescription?.match(/^(.+?)を主なテーマ/)?.[1] : undefined;
    return [
      item.userReasonMemo,
      item.excerpt,
      ...(item.officialQuestions || []),
      ...(item.sourceKeywords || []),
      ...(item.approvedTags || []),
      labTheme,
      /研究室$/.test(item.title) ? undefined : item.title,
      /研究室$/.test(item.title) ? item.officialDescription : undefined,
    ];
  }).filter((value): value is string => Boolean(value)).map((value) => compactTopic(value, 36)).filter((value) => value.length >= 3);
  return Array.from(new Set([...userWords, ...materialWords])).slice(0, 6);
}

interface ResearchBrief extends Pick<Step1Response, "source_synthesis" | "decomposition" | "research_map_position" | "domain_shifts"> {}

function fallbackBrief(input: QuestionFreeInput, materials: NormalizedResearchMaterial[]): ResearchBrief {
  const topics = materialTopics(input, materials);
  const primary = topics[0] || "選んだ関心";
  const primaryMatch = primary.match(/^(.+?)による(.+?)の開発と評価$/);
  const target = primaryMatch?.[2] || primary;
  const primaryCondition = primaryMatch?.[1] || "対象固有の設計条件";
  const secondary = topics.filter((item) => item !== primary).slice(0, 3).map((item) => compactTopic(item, 18)).join("・") || "その成果を評価する方法";
  const userReasons = [input.reason, ...materials.map((item) => item.userReasonMemo)].filter(Boolean).map((item) => cleanTopic(String(item)));
  const focus = `${target}における、${primaryCondition}と${secondary}の接続条件`;
  const axes = ["形式", "物質", "生命", "心・認知", "社会", "意味"];
  return {
    source_synthesis: {
      core_interest: focus,
      material_connections: [`${target}を主対象とし、${primaryCondition}を材料側の条件、${secondary}を説明・制御・検証の視点として接続する。`],
      adopted_focus: `${focus}を、観察・比較・評価できる範囲へ絞る。`,
      assumptions: ["選択した素材には共通の関心があると仮定しています。"],
      missing_information: userReasons.length ? [] : ["各素材を気にした理由が未入力です。理由メモを加えると焦点をさらに絞れます。"],
    },
    decomposition: {
      target: input.recentInterest ? compactTopic(input.recentInterest) : target,
      phenomenon: input.discomfort ? compactTopic(input.discomfort) : `${primaryCondition}と${secondary}を統合した設計・評価`,
      context: input.graduateTopic ? compactTopic(input.graduateTopic) : `${target}の開発・評価プロセス`,
      tension: input.discomfort ? compactTopic(input.discomfort) : "素材間の接続の根拠と、成立する条件が明確でない",
      question: `${primaryCondition}と${secondary}は、${target}の性能へどのように関係するのか`,
      utility: input.referenceInfo ? compactTopic(input.referenceInfo) : "次に調べる対象・比較条件・評価方法を決める",
      motivation: userReasons.join("。") || "選択した素材を一つの研究可能な焦点へ整理したい",
    },
    research_map_position: { vertical_axis: "物質", horizontal_axis: "なぜ・どうなるか（説明・予測）", domain_name: "材料設計・システム制御", reason: `${target}を主対象とし、${primaryCondition}と${secondary}が性能へ与える関係を説明する問いとして整理したため。` },
    domain_shifts: axes.map((axis, index) => ({ vertical_axis: axis, horizontal_axis: index === 1 ? "どう作り変えるか（設計・介入）" : "なぜ・どうなるか（説明・予測）", new_domain: `${axis}に焦点を置く研究`, shifted_rq: `${target}の設計と評価は、${axis}の条件を導入するとどのように変化するか？`, reason: `${axis}を固定せずに問い直すことで、比較すべき対象と証拠が変わるため。`, is_recommended: index === 1 || index === 4 })),
  };
}

const FALLBACK_METHODS = ["資料・事例の記述分析", "比較事例分析・クラスタリング", "相関分析・比較研究", "対照実験・準実験", "プロセストレーシング", "半構造化インタビュー・解釈分析", "概念分析・理論比較", "構造方程式・システムモデリング", "尺度項目作成・妥当性検証", "手法設計・ベンチマーク評価", "プロトタイピング・ユーザー評価", "スコーピングレビュー"];
const FALLBACK_OUTPUTS = ["実態記述と論点一覧", "類型と判別基準", "関連要因モデル", "効果量と因果推論", "段階モデル", "意味づけの構造", "概念枠組み", "説明・予測モデル", "信頼性・妥当性を持つ尺度", "再現可能な調査・分析手順", "設計物と評価結果", "エビデンスマップ"];

function fallbackCandidates(brief: ResearchBrief): RQCandidate[] {
  const primary = compactTopic(brief.decomposition.target, 56);
  const phenomenon = compactTopic(brief.decomposition.phenomenon, 64);
  const context = compactTopic(brief.decomposition.context, 52);
  const academicQuestions = [
    `${context}において、${phenomenon}は、どの条件でどのような特徴を示すか？`,
    `${primary}の設計事例は、${phenomenon}の違いによってどのような類型に整理できるか？`,
    `${context}において、${phenomenon}の導入度と${primary}の性能指標はどのように関連するか？`,
    `${phenomenon}は、従来手法と比べて${primary}の性能をどの程度変化させるか？`,
    `${phenomenon}が設計判断へ組み込まれ、${primary}の評価に至る過程は、どのような段階と転換点から成るか？`,
    `${primary}の研究者は、${context}における${phenomenon}の役割をどのように意味づけているか？`,
    `${primary}と${phenomenon}の関係は、既存概念をどのように組み替えると一貫して説明できるか？`,
    `${phenomenon}から${primary}の性能に至る仕組みは、どの要因間の関係モデルによって説明・予測できるか？`,
    `${primary}の設計における${phenomenon}の活用度を、信頼性と妥当性を保ってどのように測定できるか？`,
    `${context}における${primary}と${phenomenon}の関係を、既存手法より正確かつ再現可能に捉える方法は何か？`,
    `${context}で${phenomenon}を支援するために、どのような設計支援システムを作り、${primary}のどの性能指標で有効性を評価できるか？`,
    `${primary}と${phenomenon}に関する既存研究では、何が一貫して示され、どの論点が未解決か？`,
  ];
  const publicTarget = plainTopic(brief.decomposition.target);
  const publicOutcome = /素材|材料|部材/.test(publicTarget) ? "強さや長持ちしやすさ" : "結果";
  const publicQuestions = [
    `${publicTarget}には、どのような特徴や違いがあるのか？`,
    `${publicTarget}は、どのような違いでいくつかの種類に分けられるのか？`,
    `作り方や条件の違いは、${publicTarget}の${publicOutcome}とどう関係するのか？`,
    `新しい方法を使うと、${publicTarget}の${publicOutcome}はこれまでよりよくなるのか？`,
    `${publicTarget}は、どのような段階をたどって変化するのか？`,
    `関わる人は、${publicTarget}のよさや問題をどのように捉えているのか？`,
    `${publicTarget}を理解するには、どの考え方を結びつけるとよいのか？`,
    `${publicTarget}の変化を、どのような仕組みで説明し予測できるのか？`,
    `${publicTarget}の状態を、分かりやすく確かめるには何を測ればよいのか？`,
    `${publicTarget}を、これまでより正確に調べるにはどんな方法が必要か？`,
    `${publicTarget}を選びやすくするには、どのような道具や仕組みが役立つのか？`,
    `${publicTarget}について、これまで何が分かり、何がまだ分からないのか？`,
  ];
  return RQ_TYPES.map(([code, name], index) => ({
    type_name: `${code}: ${name}`,
    rq_title: publicQuestions[index].replace(/[？?]$/, "").slice(0, 28),
    public_rq: publicQuestions[index],
    academic_rq: academicQuestions[index],
    what_we_learn: `${primary}と${phenomenon}について、${FALLBACK_OUTPUTS[index]}として確認できる範囲が分かります。`,
    methods: FALLBACK_METHODS[index],
    expected_output: FALLBACK_OUTPUTS[index],
    difficulty: [0, 1, 2, 5, 11].includes(index) ? "中" : "高",
    is_recommended: [0, 2, 5, 11].includes(index),
    recommendation_reason: [0, 2, 5, 11].includes(index) ? "現時点の素材から対象・比較条件・必要な証拠を定めやすいため。" : "実行には追加の対象設定または測定・介入条件が必要なため。",
    components: { target: primary, focus: phenomenon, relationship: name.replace("研究", "") + "として扱う関係", context, evidence: FALLBACK_METHODS[index] },
    quality_score: 82,
  }));
}

export function isResearchQuestion(value: string) {
  const text = value.trim();
  const forbidden = [/公開情報のキーワードに基/, /について、?.*の視点から何を明らかに/, /研究として捉える/, /どのように記述・説明・検証できるか/];
  return text.length >= 18 && text.length <= 360 && /[？?]$/.test(text) && !forbidden.some((pattern) => pattern.test(text));
}

const PUBLIC_JARGON = /無機[‐‑–—―-]有機|複合界面|官能基|シラン|界面層厚|硬化温度|要件充足|要件違反|逐次探索|ベイズ最適化|予測誤差|因果的効果|無作為割付|ブラインド測定|事前登録|外部検証|論理制約|データ駆動モデル|形式仕様|時系列観測|信頼性|妥当性/;

export function isPlainPublicQuestion(value: string) {
  const text = value.trim();
  const commas = (text.match(/[、，]/g) || []).length;
  const repeatedCoreWord = ["強さ", "性能", "割合", "方法", "仕組み"].some((word) => (text.match(new RegExp(word, "g")) || []).length > 1);
  return isResearchQuestion(text)
    && text.length >= 20
    && text.length <= 88
    && commas <= 2
    && !repeatedCoreWord
    && !PUBLIC_JARGON.test(text)
    && !/\b[A-Z]{2,}\b/.test(text)
    && !/\d{2,}/.test(text);
}

function normalizeQuestion(value: string) {
  const text = value.trim();
  if (/[？?]$/.test(text)) return text;
  if (/(どの|何|なぜ|いかに|どれ|どこ|誰|どの程度|か[。.]?$)/.test(text)) return text.replace(/[。.]$/, "") + "？";
  return text;
}

interface PublicQuestionRewrite { type_name: string; rq_title: string; public_rq: string }

async function rewritePublicQuestions(candidates: RQCandidate[], fallbacks: RQCandidate[], styleQuestions: string[]) {
  const source = candidates.map((item) => ({ type_name: item.type_name, academic_rq: item.academic_rq, core_components: item.components }));
  const prompt = `あなたは、研究者向けの問いを、研究に初めて触れる人にも一読で分かる問いへ翻訳する編集者です。
次の12件について rq_title と public_rq だけを書き直してください。academic_rq の研究上の中心関係は変えません。

このサービスの研究領域・学会・ジャーナルDBにある文体例:
${styleQuestions.map((item) => `- ${item}`).join("\n")}

一般向けRQの必須条件:
- 20〜88文字、疑問符で終わる一文。できれば45〜70文字。
- 初見の非研究者が、何について何を知りたいかを一読で説明できる。
- 一度に問う中心関係は一つ。読点は2個まで。
- 専門語、略語、材料名・測定指標・研究手法名・数値条件・三項以上の列挙は表面から外す。
- 専門語は日常語へ翻訳する。例:「無機―有機複合界面」→「異なる素材の境目」、「論理制約」→「守るべき条件」、「逐次探索」→「順番に候補を試す探し方」。
- 「配合」→「混ぜ方」、「表面処理」→「表面の加工」、「耐久性」→「長持ちしやすさ」のように、日常会話で説明できる語を優先する。
- 「強さと湿気に対する強さ」のように、同じ中心語を一文で繰り返さない。
- 類型名を言い換えただけの「〇〇の視点から何を明らかにできるか」は禁止。
- rq_title は内容が分かる18〜28文字程度。論文タイトルのようにしない。

変換例:
- 専門向け: シラン処理濃度や硬化条件は界面の化学結合を介して接着強度とどの程度関連するか？
  一般向け: 異なる素材を組み合わせるとき、作り方の違いは強さをどう変えるのか？
- 専門向け: 論理制約付き逐次探索はベイズ最適化より要件充足候補の発見率を改善するか？
  一般向け: 少ない実験からよい材料を見つけるには、どんな探し方が役立つのか？
- 専門向け: 制約付き材料探索研究ではどの未解決論点が残るか？
  一般向け: 新しい材料の探し方について、何がまだ分かっていないのか？

対象: ${JSON.stringify(source)}`;
  const generated = await callAIJson<{ public_questions: PublicQuestionRewrite[] }>(prompt, {
    temperature: 0.1, timeoutMs: 90000, maxOutputTokens: 12000, responseSchema: PUBLIC_RQ_SCHEMA, reasoningEffort: "low",
  });
  let repairedCount = 0;
  const rewritten = candidates.map((candidate, index) => {
    const code = RQ_TYPES[index][0];
    const found = generated?.public_questions?.find((item) => item.type_name?.match(new RegExp(`^${code}(?:\\b|[:：])`))) || generated?.public_questions?.[index];
    const publicRq = normalizeQuestion(found?.public_rq || "");
    if (!found || !isPlainPublicQuestion(publicRq)) {
      repairedCount++;
      return { ...candidate, rq_title: fallbacks[index].rq_title, public_rq: fallbacks[index].public_rq };
    }
    const title = plainLanguage(found.rq_title).replace(/[？?。.]$/g, "").trim();
    return { ...candidate, rq_title: title.length >= 8 && title.length <= 32 && !PUBLIC_JARGON.test(title) ? title : publicRq.replace(/[？?]$/, "").slice(0, 28), public_rq: publicRq };
  });
  console.info(`[question-craft] public_questions=${generated?.public_questions?.length || 0} repaired=${repairedCount}`);
  return { candidates: rewritten, repairedCount };
}

function repairCandidates(generated: RQCandidate[] | undefined, fallback: RQCandidate[]) {
  let repairedCount = 0;
  const candidates = RQ_TYPES.map(([code, name], index) => {
    const found = generated?.find((item) => item.type_name?.match(new RegExp(`^${code}(?:\\b|[:：])`))) || generated?.[index];
    const publicRq = normalizeQuestion(found?.public_rq || "");
    const academicRq = normalizeQuestion(found?.academic_rq || "");
    if (!found || !isResearchQuestion(publicRq) || !isResearchQuestion(academicRq)) { repairedCount++; return fallback[index]; }
    return {
      ...fallback[index],
      ...found,
      type_name: `${code}: ${name}`,
      public_rq: publicRq,
      academic_rq: academicRq,
      is_recommended: Boolean(found.is_recommended),
      quality_score: Math.max(0, Math.min(100, Number(found.quality_score) || 80)),
      components: { ...fallback[index].components!, ...(found.components || {}) },
    };
  });
  const recommended = candidates.filter((item) => item.is_recommended);
  if (recommended.length < 3 || recommended.length > 4) candidates.forEach((item, index) => { item.is_recommended = [0, 2, 5, 11].includes(index); });
  return { candidates, repairedCount };
}

export function buildQualityFallbackStep1(input: QuestionFreeInput, materialsInput: NormalizedResearchMaterial[]): Step1Response {
  const materials = normalizeResearchMaterials(materialsInput);
  const brief = fallbackBrief(input, materials);
  return { ...brief, output_type_proposals: fallbackCandidates(brief), generatedBy: "quality_fallback", qualityReport: { validCount: 12, repairedCount: 12, warnings: ["AIを利用できなかったため、入力内容から作った問いの下書きを表示しています。"] } };
}

function validBrief(value: ResearchBrief | null): value is ResearchBrief {
  return Boolean(value?.decomposition?.target && value?.source_synthesis?.core_interest && value?.domain_shifts?.length >= 6);
}

function normalizeBrief(value: ResearchBrief, fallback: Step1Response): ResearchBrief {
  const axes = ["形式", "物質", "生命", "心・認知", "社会", "意味"];
  const shifts = axes.map((axis, index) => value.domain_shifts.find((item) => item.vertical_axis === axis)
    || value.domain_shifts.find((item) => axis === "心・認知" && /心|認知/.test(item.vertical_axis))
    || fallback.domain_shifts[index]);
  return { ...value, domain_shifts: shifts };
}

export async function generateStep1(input: QuestionFreeInput, materialsInput: NormalizedResearchMaterial[]) {
  const materials = normalizeResearchMaterials(materialsInput);
  const fallback = buildQualityFallbackStep1(input, materials);
  const source = { freeInput: input, savedMaterials: materialPrompt(materials) };
  const briefPrompt = `あなたは研究デザインとリサーチクエスチョン設計の専門家です。素材を研究可能な焦点へ統合してください。
優先順位は 1)ユーザー自身の言葉・理由 2)本人のメモ/抜粋 3)公式の問い・キーワード 4)公式説明 5)タイトル です。
公式説明の免責文、URL、研究室名を研究テーマとして転載しないでください。無関係に見える複数素材は単純連結せず、採用する接続仮説と不足情報を明示してください。
対象・現象・文脈・緊張・知りたいことを、後続で変数・比較・機序・測定・設計へ変換できる具体性で整理してください。
研究マップの領域シフトは「形式 / 物質 / 生命 / 心・認知 / 社会 / 意味」の6方向を各1件、すべて実質の異なる疑問文で出してください。
ユーザーに見える文章は、研究初心者が一読で分かる日本語にしてください。一文では一つだけ伝え、専門語には短い言い換えを添えてください。書き手側の処理名や評価用語は出さないでください。
素材: ${JSON.stringify(source)}`;
  const generatedBrief = await callAIJson<ResearchBrief>(briefPrompt, { temperature: 0.15, timeoutMs: 90000, maxOutputTokens: 8000, responseSchema: RESEARCH_BRIEF_SCHEMA, reasoningEffort: "low" });
  console.info(`[question-craft] brief=${validBrief(generatedBrief) ? "valid" : "fallback"} shifts=${generatedBrief?.domain_shifts?.length || 0}`);
  const brief = validBrief(generatedBrief) ? normalizeBrief(generatedBrief, fallback) : fallback;
  const briefFallbackCandidates = fallbackCandidates(brief);
  const rqPrompt = `あなたは大学院レベルのRQを設計・査読する研究方法論者です。次の研究ブリーフから、12研究成果物類型を各1件、順番どおりに生成してください。
${RQ_TYPES.map(([code, name]) => `${code} ${name}`).join(" / ")}

合格条件:
- public_rq と academic_rq は必ず「？」で終わる一つの疑問文で、意味内容を一致させる。
- 対象、着目する現象・変数・概念、関係/比較/変化/測定/設計、文脈、収集可能な証拠を具体化する。
- R1=特徴と条件、R2=類型と分類基準、R3=変数間関連、R4=介入と比較対象と効果、R5=段階と転換点、R6=当事者の意味づけ、R7=概念間関係、R8=要因モデル、R9=信頼性・妥当性を持つ測定、R10=既存手法との性能比較、R11=設計物と評価指標、R12=文献範囲と未解決論点を問う。
- 「素材文＋〇〇の視点から何を明らかにできるか」「〇〇研究として捉える」「対象・現象・文脈を記述・説明・検証できるか」は不合格。
- 実行可能性の高い3〜4件だけ is_recommended=true。quality_scoreは上記条件への適合度0〜100。

研究ブリーフ: ${JSON.stringify(brief)}`;
  const generatedRqs = await callAIJson<{ output_type_proposals: RQCandidate[] }>(rqPrompt, { temperature: 0.15, timeoutMs: 120000, maxOutputTokens: 20000, responseSchema: RQ_CANDIDATES_SCHEMA, reasoningEffort: "medium" });
  console.info(`[question-craft] candidates=${generatedRqs?.output_type_proposals?.length || 0}`);
  if (!generatedRqs?.output_type_proposals?.length) return {
    ...brief,
    output_type_proposals: briefFallbackCandidates,
    generatedBy: "quality_fallback" as const,
    qualityReport: { validCount: 12, repairedCount: 12, warnings: ["AIで問いを作れなかったため、入力内容から作った下書きを表示しています。"] },
  };
  const repaired = repairCandidates(generatedRqs.output_type_proposals, briefFallbackCandidates);
  const publicRewrite = await rewritePublicQuestions(repaired.candidates, briefFallbackCandidates, publicStyleQuestions(materials));
  const warnings: string[] = [];
  if (repaired.repairedCount) warnings.push(`専門向けの問い${repaired.repairedCount}件を、内容が伝わる下書きへ置き換えました。`);
  if (publicRewrite.repairedCount) warnings.push(`一般向けの問い${publicRewrite.repairedCount}件を、初めて読む人にも分かる表現へ直しました。`);
  return {
    ...brief,
    output_type_proposals: publicRewrite.candidates,
    generatedBy: "ai" as const,
    qualityReport: { validCount: 12, repairedCount: repaired.repairedCount + publicRewrite.repairedCount, warnings },
  };
}

function compactResearchPhrase(value: string | undefined, fallback: string, maxLength = 72) {
  const firstSentence = (value || fallback).replace(/[「」『』]/g, "").split(/[。\n]/)[0].trim();
  const cleaned = firstSentence.replace(/(?:です|ます|とします|を想定します)$/u, "").trim();
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength);
  const boundary = Math.max(clipped.lastIndexOf("、"), clipped.lastIndexOf(" "));
  return (boundary >= Math.floor(maxLength * 0.55) ? clipped.slice(0, boundary) : clipped).trim();
}

function fallbackStep2(input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response): Step2Response {
  const nowId = () => `action-${Math.random().toString(36).slice(2, 8)}`;
  const terms = referenceTerms(input, selectedRq, step1);
  const target = compactResearchPhrase(step1.decomposition.target, selectedRq.rq_title);
  const phenomenon = compactResearchPhrase(step1.decomposition.phenomenon, selectedRq.what_we_learn);
  const context = compactResearchPhrase(step1.decomposition.context, "入力された具体的な場面");
  const isEffectStudy = /R4|因果|効果検証/.test(selectedRq.type_name);
  const isMeasurementStudy = /R8|R9|R10|モデル構築|尺度|指標|方法|手法/.test(selectedRq.type_name);
  const isInterpretiveStudy = /R6|意味|解釈/.test(selectedRq.type_name);
  const literatureReview = isEffectStudy ? {
    knowns: [
      `${target}に近い対象では、介入や条件の違いが${phenomenon}にどう関係するかを比較する研究が蓄積されています。`,
      "効果を判断するには、介入前の状態、比較対象、実施期間、評価指標をそろえる必要があります。",
      "同じ介入でも、対象者・組織・場所などの文脈によって結果が変わる可能性があります。",
      "結果の大きさだけでなく、どの過程を通じて変化が生じたかを確認することで、効果の仕組みを検討できます。",
    ],
    unknowns: [
      `${context}において、検討する介入が比較対象より${phenomenon}をどの程度変えるかは、条件をそろえた検証が必要です。`,
      `${target}で得られる効果が、対象や実施条件を変えても維持されるかは十分に整理されていません。`,
      "短期的な変化が長期的にも続くのか、望ましくない副作用がないかは追加の確認が必要です。",
    ],
    controversies: [
      "観察された変化を介入の効果とみなせるかは、比較方法と交絡要因の扱いによって解釈が分かれます。",
      "限定された対象で得た結果を別の状況へどこまで広げられるかは、対象範囲と実施条件によって変わります。",
    ],
    target_gap_deep: `先行研究では、${target}に近い対象に対する介入や条件の効果が個別に検討されています。一方、${context}に条件を絞り、適切な比較対象を置いて、${phenomenon}がどの程度・どの過程を通じて変化するかを確かめた知見は十分に整理されていません。本研究では、対象、介入内容、比較条件、実施期間、評価指標を明示し、介入前後または条件間の差を検討します。これにより、効果の有無だけでなく、どの条件で効果が現れ、維持されるのか、別の状況へ応用できる範囲はどこまでかを明らかにします。`,
  } : isMeasurementStudy ? {
    knowns: [
      `${target}に近い対象では、複数の要因や測定値を用いて${phenomenon}を説明・予測する研究が蓄積されています。`,
      "予測や測定の性能は、対象データの範囲、特徴量の選び方、学習・検証データの分け方によって変わります。",
      "既存手法との比較には、精度だけでなく再現性、頑健性、測定負担、適用範囲をそろえて評価する必要があります。",
      "外部データや別条件での検証は、構築したモデル・指標・手法の一般化可能性を判断する手がかりになります。",
    ],
    unknowns: [
      `${context}で、どの要因の組合せが${phenomenon}を最も安定して説明できるかは十分に整理されていません。`,
      "対象や条件が変わったときに性能がどの程度保たれるかは、独立した検証が必要です。",
      "精度向上と、利用者が結果を解釈できることの両立条件は明らかではありません。",
    ],
    controversies: [
      "複雑なモデルによる性能向上を、説明可能性や運用負担の増加より優先すべきかには議論があります。",
      "単一の評価指標で優劣を決められるかは、想定する利用場面と失敗時の影響によって変わります。",
    ],
    target_gap_deep: `先行研究では、${target}に近い対象を説明・予測・測定する複数の手法が提案されていますが、${context}という利用条件で、${phenomenon}に関わる要因を同じデータと評価基準で比較した知見は十分ではありません。本研究では、入力条件、比較対象、評価指標、検証データを明示し、性能だけでなく再現性、頑健性、解釈可能性、運用負担をあわせて評価します。これにより、どの条件で既存手法を上回るのか、性能が低下する境界はどこか、実際の判断に利用できる範囲はどこまでかを明らかにします。`,
  } : {
    knowns: [
      `${target}に近い対象については、実態・経験・行動を記述する研究が蓄積されています。`,
      `${phenomenon}は、個人の属性だけでなく、場の状況や周囲との関係から影響を受ける可能性があります。`,
      isInterpretiveStudy ? "人が出来事をどう意味づけるかは、その後の態度や他者との関わり方を理解する手がかりになります。" : "対象の特徴と文脈を分けて整理することで、共通点と条件による違いを比較できます。",
      "複数の資料・事例・方法を組み合わせることで、一つのデータだけでは捉えにくい現象を異なる角度から確認できます。",
    ],
    unknowns: [
      `${context}に限定したとき、どの条件が特に重要なのかは十分に整理されていません。`,
      `${target}と${phenomenon}が、どのような順序や条件で結び付くのかは明らかではありません。`,
      "対象や場面の違いによって結果がどう変わるかは、追加の検討が必要です。",
    ],
    controversies: [
      "異なる方法で得た証拠を、同じ現象の説明として統合できるかには議論が残ります。",
      "特定の条件で得た知見を、別の状況へどこまで広げられるかは、対象範囲と研究方法によって変わります。",
    ],
    target_gap_deep: `先行研究は${target}に近い対象や${phenomenon}を個別には扱っていますが、${context}という具体的な場面で、両者がどの条件で結び付くかは十分に説明されていません。本研究では、対象、現象、文脈、比較条件を分けて整理し、複数の資料・事例・方法を照合します。これにより、何が共通し、どの条件で違いが生まれるのか、既存研究の知見をこの問いへ適用できる範囲はどこまでかを明らかにします。`,
  };
  const searchQueries = isEffectStudy ? [
    `${terms.slice(0, 4).join(" ")} 先行研究`, `${target} ${phenomenon} 介入 効果`, `${target} 比較研究`,
    `${phenomenon} 効果測定`, `${context} 介入研究`, `${target} ${phenomenon} メカニズム`,
  ] : isMeasurementStudy ? [
    `${terms.slice(0, 4).join(" ")} 先行研究`, `${target} ${phenomenon} モデル`, `${target} 予測 精度`, `${target} 検証データ`,
    `${phenomenon} 再現性 頑健性`, `${phenomenon} 既存手法 比較`, `${target} interpretability validation`, `${phenomenon} benchmark evaluation`,
  ] : [
    terms.slice(0, 3).join(" "), `${terms[0] || target} ${terms[3] || phenomenon} 先行研究`,
    `${target} ${isInterpretiveStudy ? "意味づけ" : "特徴 条件"}`, `${phenomenon} ${isInterpretiveStudy ? "インタビュー" : "比較研究"}`, `${context} 事例研究`,
    `${target} ${phenomenon}`, `${terms[0] || target} 関連要因`, `${terms[1] || phenomenon} 文脈`,
  ];
  return {
    literature_review: literatureReview,
    search_queries: unique(searchQueries).filter(Boolean),
    paper_ideas: { reference: [], competitor: [], adjacent: [] },
    research_outline: {
      title_public: selectedRq.rq_title,
      title_academic: selectedRq.academic_rq.replace(/[。？?]$/, ""),
      mim: "身近な違和感を、対象・現象・文脈の関係として検証可能にする。",
      background: input.recentInterest || "日常や仕事の中で生じた関心を研究テーマとして整理する必要がある。",
      problem: input.discomfort || "対象となる現象の構造と条件が十分に整理されていない。",
      purpose: selectedRq.what_we_learn,
      main_rq: selectedRq.public_rq,
      sub_rqs: ["どのような場面で現象が起きるか？", "関係する要因は何か？", "どの方法なら確かめられるか？"],
      related_work_diff: "既存研究を特定の文脈へ持ち込み、ユーザーが気にしている違和感を中心に比較する。",
      conceptual_model: ["対象", "現象", "文脈", "結果"],
      research_design: selectedRq.type_name,
      target_population: "問いに関係する対象者・事例・データ",
      data_collection: selectedRq.methods,
      analysis_method: "収集したデータを比較し、共通点・差異・関係を整理する。",
      evaluation_method: "複数の資料・観点・事例を照合して妥当性を確認する。",
      ethical_considerations: "個人情報、同意、匿名化、データ管理、対象者への負担を事前に確認する。",
      significance: { academic: "既存研究を具体的な問いへ接続する。", practical: "現場での判断や設計に使える観点を示す。", social: "当事者や社会にとっての選択肢を増やす。" },
      limitations: "利用できるデータ、対象範囲、実施期間によって一般化可能性が限られる。",
      next_steps: ["関連論文を5本読む", "対象と期間を絞る", "指導候補者へ相談する"],
      interesting_points: "本人の違和感を、既存研究にない文脈へ接続できる点。",
      difficult_points: ["対象の絞り込み", "データ取得", "方法と期間の整合"],
      consultation_questions: ["この問いは研究室の方法で扱えるか？", "対象範囲は広すぎないか？"],
      comments: [],
      next_actions: ["関連論文を5本読む", "対象と期間を絞る", "相談相手を決める"].map((text) => ({ id: nowId(), text, completed: false })),
    },
    academic_mapping: { target_domain: "学際的研究", recommended_societies: [], recommended_journals: [] },
    reporting_guideline: { name: "研究デザイン確定後に選定", reason: "研究方法に応じて適切なガイドラインが異なるため。" },
    one_sentence_summary: selectedRq.public_rq,
    generatedBy: "template",
  };
}

type TopicProfile = {
  pattern: RegExp;
  terms: string[];
  fields: string[];
  societies?: string[];
  journals?: string[];
  englishQueries: string[];
};

/**
 * 入力に明示された概念だけを学術語へ橋渡しする。曖昧な一語（「強さ」「経験」など）で
 * 分野を決めると別テーマが混入するため、複数語のまとまりまたは固有概念に限定する。
 */
const TOPIC_PROFILES: TopicProfile[] = [
  {
    pattern: /共同創業|共同経営|創業者|起業家|スタートアップ|co-?founder|entrepreneur/i,
    terms: ["共同創業者", "創業チーム", "ビジョン共有", "価値観の一致", "チーム内対立", "アントレプレナーシップ", "組織行動"],
    fields: ["アントレプレナーシップ・国際経営", "人的資源管理・組織行動", "産業・組織心理学", "社会心理学"],
    societies: ["組織学会", "日本経営学会", "経営行動科学学会", "Academy of Management (AOM)", "Strategic Management Society (SMS)"],
    journals: ["Organization Science", "Academy of Management Journal", "Academy of Management Review", "Strategic Entrepreneurship Journal", "Strategic Management Journal"],
    englishQueries: [
      "entrepreneurial team conflict",
      "shared vision entrepreneurial team",
      "founder identity conflict",
      "entrepreneurial team conflict intervention",
    ],
  },
  {
    pattern: /生成AI|人工知能|human.?ai|co-?creat|創造性.*AI|AI.*創造性/i,
    terms: ["生成AI", "人間とAIの協働", "創造性", "認知プロセス", "HCI"],
    fields: ["ヒューマンコンピュータインタラクション", "認知科学", "人工知能", "デザイン学"],
    englishQueries: ["human AI co-creation creativity cognitive process", "generative AI creativity cognitive mechanisms", "human AI collaboration creative task process"],
  },
  {
    pattern: /銭湯|入浴|湯上がり|公衆浴場|温泉/,
    terms: ["入浴", "公衆浴場", "生活文化", "公共空間", "対人コミュニケーション", "意味づけ"],
    fields: ["社会心理学", "文化人類学", "社会学", "地域研究"],
    societies: ["日本社会心理学会", "日本グループ・ダイナミックス学会", "日本文化人類学会"],
    journals: ["社会心理学研究", "実験社会心理学研究", "文化人類学"],
    englishQueries: ["public bath social interaction communication", "bathing culture public space social interaction", "bathhouse interpersonal communication qualitative study"],
  },
  {
    pattern: /異種材料|複合材料|CFRP|金属.*樹脂|樹脂.*金属|接合界面|レーザー.*表面|表面.*レーザー/,
    terms: ["異種材料", "接合界面", "複合材料", "表面処理", "接合強度", "疲労寿命"],
    fields: ["高分子材料・複合材料", "材料加工・材料物性", "金属材料・無機セラミックス"],
    englishQueries: ["dissimilar material joining interface surface treatment", "metal polymer joint fatigue strength", "laser surface texturing dissimilar material joint"],
  },
];

const unique = <T,>(items: T[]) => Array.from(new Set(items));

function referenceTerms(input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response) {
  const source = [
    input.recentInterest, input.discomfort, input.graduateTopic, input.reason, input.referenceInfo,
    selectedRq.rq_title, selectedRq.public_rq, step1.decomposition.target, step1.decomposition.phenomenon, step1.decomposition.context,
  ].filter(Boolean).join(" ");
  const profiles = TOPIC_PROFILES.filter((profile) => profile.pattern.test(source));
  // ひらがなは助詞・活用語尾を含み単語境界がないため抽出対象から除外する（「るんだろう」等の文法的な断片が
  // 検索語として使われ、OpenAlex検索が0件になり論文フォールバックへ落ちる不具合の原因だった）。
  const phrases = source.match(/[ァ-ン一-龠々ー]{3,18}/g) || [];
  const stop = /^(について|における|どのような|明らかに|それは|これは|研究|方法|対象|現象|入力された|できる|される|という)$/;
  const explicitEnglish = source.match(/[A-Za-z][A-Za-z-]+(?:\s+[A-Za-z][A-Za-z-]+){0,4}/g) || [];
  return unique([
    ...profiles.flatMap((profile) => profile.terms),
    ...explicitEnglish,
    ...phrases.filter((value) => value.length <= 14 && !stop.test(value)),
  ]).slice(0, 18);
}

function topicProfiles(input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response) {
  const source = [
    input.recentInterest, input.discomfort, input.graduateTopic, input.reason, input.referenceInfo, input.notes,
    selectedRq.rq_title, selectedRq.public_rq, selectedRq.academic_rq,
    step1.decomposition.target, step1.decomposition.phenomenon, step1.decomposition.context, step1.decomposition.tension,
  ].filter(Boolean).join(" ");
  return TOPIC_PROFILES.filter((profile) => profile.pattern.test(source));
}

function resourceReason(item: { description: string; relatedFields?: string[] }, terms: string[]) {
  const matched = terms.find((term) => `${item.description} ${(item.relatedFields || []).join(" ")}`.includes(term));
  return matched ? `この研究の「${matched}」という焦点と接続し、発表先・投稿先を検討する手がかりになるため候補にしました。` : "研究テーマに近い領域の議論や方法を確認できるため候補にしました。";
}

function resourceSearchUrl(name: string, kind: "society" | "journal") {
  const query = encodeURIComponent(name);
  return kind === "journal"
    ? `https://scholar.google.com/scholar?q=${query}`
    : `https://www.google.com/search?q=${query}`;
}

function canonicalResourceUrl(
  item: ReturnType<typeof store.allResearchSocieties>[number] | ReturnType<typeof store.allResearchJournals>[number],
  kind: "society" | "journal",
) {
  const isDirect = (value?: string) => Boolean(value && /^https?:\/\//i.test(value)
    && !/(?:google\.com\/(?:search|scholar)|jstage\.jst\.go\.jp\/result\/global)/i.test(value));
  const sourceUrl = item.sourceUrl?.trim();
  if (isDirect(sourceUrl)) {
    return { url: sourceUrl, urlType: "公式" as const };
  }
  const url = item.url?.trim();
  if (isDirect(url) && item.urlType === "公式") {
    return { url, urlType: "公式" as const };
  }
  return { url: resourceSearchUrl(item.name, kind), urlType: "検索(要確認)" as const };
}

function asAcademicResource(item: ReturnType<typeof store.allResearchSocieties>[number] | ReturnType<typeof store.allResearchJournals>[number], type: "学会" | "ジャーナル", terms: string): MatchedAcademicResource {
  const destination = canonicalResourceUrl(item, type === "学会" ? "society" : "journal");
  return {
    name: item.name,
    type,
    url: destination.url,
    url_type: destination.urlType,
    reason: resourceReason(item, terms.split("\u0000").filter(Boolean)),
    description: item.beginnerDescription || item.description,
    scope: /[ぁ-んァ-ン一-龠]/.test(item.name) ? item.kind : "国際",
    matchedResourceId: item.id,
    matchConfidence: 1,
    verificationLabel: "DB一致",
    is_recommended: true,
  };
}

function asFieldResource(item: ReturnType<typeof store.allResearchFields>[number], terms: string[]): MatchedAcademicResource {
  return {
    name: item.nameJa,
    type: "研究領域",
    url: `/search?ai=${encodeURIComponent(item.nameJa)}`,
    url_type: "公式",
    reason: resourceReason({ description: item.beginnerDescription || item.definition, relatedFields: item.disciplines }, terms),
    description: item.beginnerDescription || item.definition,
    scope: item.level,
    matchedResourceId: item.id,
    matchConfidence: 1,
    verificationLabel: "DB一致",
    is_recommended: true,
  };
}

function normalizeResourceName(value: string) {
  return value.toLowerCase()
    .replace(/[（(][A-Z][A-Z&.-]{1,12}[）)]/g, "")
    .replace(/[（(](?:日本[^)]*|[^)]*学会)[）)]/g, "")
    .replace(/[^a-z0-9ぁ-んァ-ン一-龠々ー]+/g, "")
    .trim();
}

function findDeclaredResource(name: string, kind: "society" | "journal") {
  const rows = kind === "society" ? store.allResearchSocieties() : store.allResearchJournals();
  const normalized = normalizeResourceName(name);
  if (!normalized) return null;
  return rows.find((item) => normalizeResourceName(item.name) === normalized) || null;
}

function strictFieldMatches(terms: string[], profiles: TopicProfile[]) {
  const declared = unique(profiles.flatMap((profile) => profile.fields));
  const scored = store.allResearchFields().map((field) => {
    const declaredIndex = declared.indexOf(field.nameJa);
    if (declaredIndex >= 0) return { field, score: 100 - declaredIndex };
    const name = `${field.nameJa} ${field.nameEn}`.toLowerCase();
    const definition = `${field.definition} ${field.beginnerDescription || ""} ${(field.representativeThemes || []).join(" ")}`.toLowerCase();
    const score = terms.reduce((total, term) => {
      const needle = term.toLowerCase();
      if (needle.length < 3) return total;
      return total + (name.includes(needle) ? 8 : 0) + (definition.includes(needle) ? 2 : 0);
    }, 0);
    return { field, score };
  });
  return scored.filter(({ score }) => score >= 6).sort((a, b) => b.score - a.score).slice(0, 5).map(({ field }) => field);
}

function verifiedCommunityResources(
  kind: "society" | "journal",
  fields: ReturnType<typeof store.allResearchFields>,
  profiles: TopicProfile[],
  terms: string[],
) {
  const preferred = profiles.flatMap((profile) => kind === "society" ? profile.societies || [] : profile.journals || []);
  const declared = fields.flatMap((field) => kind === "society"
    ? [...field.domesticSocieties, ...field.internationalSocieties]
    : [...field.domesticJournals, ...field.internationalJournals]);
  const resolved = unique([...preferred, ...declared]).map((name) => findDeclaredResource(name, kind)).filter(Boolean);
  return unique(resolved.map((item) => item!.id)).map((id) => resolved.find((item) => item!.id === id)!).slice(0, 5)
    .map((item) => asAcademicResource(item, kind === "society" ? "学会" : "ジャーナル", terms.join("\u0000")));
}

function searchCandidate(query: string, source: "J-STAGE" | "CiNii Research", reason: string): PaperCandidate {
  const url = source === "J-STAGE"
    ? `https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey=${encodeURIComponent(query)}`
    : `https://cir.nii.ac.jp/all?q=${encodeURIComponent(query)}`;
  return {
    title: `「${query}」の関連論文を探す`,
    journal: source,
    author: "検索候補",
    url,
    reason,
    is_recommended: true,
    kind: "search",
  };
}

function fallbackPaperIdeas(input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response) {
  const terms = referenceTerms(input, selectedRq, step1);
  const profiles = topicProfiles(input, selectedRq, step1);
  const explicit = profiles.flatMap((profile) => profile.terms);
  const topic = unique([...explicit, ...terms]).slice(0, 3).join(" ") || step1.decomposition.target;
  const focus = unique([...explicit.slice(2), ...terms.slice(2)]).slice(0, 3).join(" ") || step1.decomposition.phenomenon;
  const english = profiles.flatMap((profile) => profile.englishQueries);
  return {
    reference: [
      searchCandidate(topic, "J-STAGE", "テーマに直接近い先行研究を、国内学術誌から確認する入口です。"),
      searchCandidate(`${topic} ${focus}`, "CiNii Research", "対象と中心概念を同時に扱う研究を探す入口です。"),
      searchCandidate(english[0] || `${topic} 先行研究`, "J-STAGE", "海外文献も含めて、テーマに直接近い研究を探す入口です。"),
    ],
    competitor: [
      searchCandidate(`${topic} ${selectedRq.type_name.replace(/^R\d+:?\s*/, "")}`, "CiNii Research", "同じ対象を近い研究デザインで扱う研究を比較します。"),
      searchCandidate(english[1] || `${focus} 比較研究`, "J-STAGE", "同じ現象を別の理論や方法で扱う研究を比較します。"),
    ],
    adjacent: [
      searchCandidate(`${focus} ${step1.decomposition.context}`, "J-STAGE", "中心概念を別の場面から捉える隣接研究を探します。"),
      searchCandidate(english[2] || `${topic} ${focus} レビュー`, "CiNii Research", "理論や周辺領域を広げるための検索入口です。"),
    ],
  };
}

function ensurePaperLinks(items: PaperCandidate[], fallbacks: PaperCandidate[]) {
  const source = items.length ? items : fallbacks;
  return source.map((paper) => paper.url?.trim() ? paper : {
    ...paper,
    url: `https://cir.nii.ac.jp/all?q=${encodeURIComponent(paper.title)}`,
    kind: "search" as const,
  });
}

type OpenAlexWork = {
  id?: string;
  doi?: string;
  display_name?: string;
  publication_year?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string; source?: { display_name?: string } };
  best_oa_location?: { landing_page_url?: string };
  open_access?: { is_oa?: boolean };
  abstract_inverted_index?: Record<string, number[]>;
};

function restoreOpenAlexAbstract(index?: Record<string, number[]>) {
  if (!index) return "";
  const words: Array<[number, string]> = [];
  Object.entries(index).forEach(([word, positions]) => positions.forEach((position) => words.push([position, word])));
  return words.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(" ").slice(0, 1800);
}

function validPaperDestination(work: OpenAlexWork) {
  const doi = work.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  if (doi) return { url: `https://doi.org/${doi}`, doi };
  const landing = work.best_oa_location?.landing_page_url || work.primary_location?.landing_page_url;
  if (landing && /^https?:\/\//i.test(landing)) return { url: landing, doi: undefined };
  return null;
}

function scholarlyQueries(step2: Step2Response, selectedRq: RQCandidate, terms: string[]) {
  const aiQueries = (step2.search_queries || []).filter((query) => (query.match(/[A-Za-z][A-Za-z-]{2,}/g) || []).length >= 3);
  const compactAcademic = selectedRq.academic_rq.replace(/[？?。]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  if (aiQueries.length) return unique(aiQueries.map((query) => query.split(/\s+/).filter(Boolean).slice(0, 8).join(" ")))
    .filter((query) => query.length >= 8).slice(0, 4);
  return unique([compactAcademic, terms.slice(0, 5).join(" ")]).filter((query) => query.length >= 8).slice(0, 2);
}

async function fetchOpenAlexWorks(queries: string[]) {
  const byId = new Map<string, { work: OpenAlexWork; abstract: string }>();
  const seenTitles = new Set<string>();
  await Promise.all(queries.map(async (query) => {
    try {
      const url = `https://api.openalex.org/works?filter=title_and_abstract.search:${encodeURIComponent(query)},type:article&per-page=25&select=id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,open_access,abstract_inverted_index`;
      const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { "User-Agent": "MISHIRU/1.0 (literature discovery)" } });
      if (!response.ok) return;
      const data = await response.json() as { results?: OpenAlexWork[] };
      for (const work of data.results || []) {
        const destination = validPaperDestination(work);
        const title = work.display_name?.trim();
        const key = work.doi || work.id || title;
        const normalizedTitle = title?.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龠]+/g, "") || "";
        if (!key || !title || !destination || byId.has(key) || seenTitles.has(normalizedTitle)) continue;
        seenTitles.add(normalizedTitle);
        byId.set(key, { work, abstract: restoreOpenAlexAbstract(work.abstract_inverted_index) });
      }
    } catch {
      // 外部文献DBが一時的に利用できない場合は、AI候補または安全な検索入口へフォールバックする。
    }
  }));
  const ignored = new Set(["with", "from", "into", "using", "study", "research", "process", "transformation", "effect", "effects", "team", "conflict", "intervention"]);
  const keywords = unique(queries.join(" ").toLowerCase().match(/[a-z0-9-]{4,}/g) || []).filter((word) => !ignored.has(word));
  const queryText = queries.join(" ").toLowerCase();
  const matchesTopicAnchor = (text: string) => {
    if (/entrepreneur|cofounder|startup/.test(queryText)) return /entrepreneur|co-?founder|startup|new venture/.test(text);
    if (/human ai|generative ai|co-creation/.test(queryText)) return /(artificial intelligence|generative ai|human.?ai|co-creation)/.test(text);
    if (/public bath|bathhouse|bathing culture/.test(queryText)) return /bathhouse|public bath|bathing culture|communal bath/.test(text);
    if (/dissimilar material|metal polymer|surface texturing/.test(queryText)) return /dissimilar material|metal.?polymer|composite|surface textur|joint|bonding/.test(text);
    return true;
  };
  return [...byId.values()].map((item) => {
    const title = item.work.display_name?.toLowerCase() || "";
    const abstract = item.abstract.toLowerCase();
    const combined = `${title} ${abstract}`;
    const matchedKeywords = keywords.filter((word) => title.includes(word) || abstract.includes(word));
    const titleHits = matchedKeywords.filter((word) => title.includes(word)).length;
    const abstractHits = matchedKeywords.filter((word) => abstract.includes(word)).length;
    return { ...item, topicAnchorMatched: matchesTopicAnchor(combined), matchedKeywordCount: matchedKeywords.length, relevanceScore: titleHits * 4 + abstractHits };
  }).filter((item) => item.topicAnchorMatched && item.matchedKeywordCount >= 2 && item.relevanceScore >= 5)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || (b.work.publication_year || 0) - (a.work.publication_year || 0))
    .slice(0, 9)
    .map(({ relevanceScore: _score, matchedKeywordCount: _count, topicAnchorMatched: _anchor, ...item }) => item);
}

function paperMetadata(work: OpenAlexWork) {
  const destination = validPaperDestination(work)!;
  const authors = (work.authorships || []).map((item) => item.author?.display_name).filter(Boolean) as string[];
  return {
    title: work.display_name?.trim() || "タイトル未確認",
    author: authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : ""),
    journal: work.primary_location?.source?.display_name || "掲載誌を確認",
    year: work.publication_year,
    url: destination.url,
    doi: destination.doi,
    sourceLabel: "OpenAlexで書誌確認",
    openAccess: Boolean(work.open_access?.is_oa),
    kind: "paper" as const,
    is_recommended: true,
  };
}

function fallbackPaperSummary(work: OpenAlexWork, abstract: string) {
  if (!abstract) return "書誌情報は確認できましたが、文献データベースに抄録がないため、リンク先で研究目的・方法・結果をご確認ください。内容を確定する前に、本文または出版社ページの抄録を読む必要があります。";
  const text = `${work.display_name || ""} ${abstract}`.toLowerCase();
  const subjects: string[] = [];
  if (/entrepreneur|co-?founder|startup|new venture/.test(text)) subjects.push("共同創業者や起業チームの関係・意思決定");
  if (/shared vision|team vision|vision conflict/.test(text)) subjects.push("チーム内で共有される将来像");
  if (/identity|value congruence|shared mental model/.test(text)) subjects.push("価値観・アイデンティティ・認識の共有");
  if (/human.?ai|artificial intelligence|generative ai/.test(text)) subjects.push("人間とAIの協働");
  if (/creativ/.test(text)) subjects.push("創造性やアイデア生成");
  if (/laser/.test(text)) subjects.push("レーザーによる表面加工");
  if (/metal.?polymer|dissimilar material|composite|cfrp/.test(text)) subjects.push("異なる材料の接合");
  if (/adhes|join|bond/.test(text)) subjects.push("接合部の強さ");
  if (/fatigue|cyclic/.test(text)) subjects.push("繰り返し荷重に対する疲労寿命");
  if (/qualitative|interview|focus group/.test(text)) subjects.push("インタビューなどの質的研究");
  if (/systematic review|literature review/.test(text)) subjects.push("既存研究の整理");
  const methods: string[] = [];
  if (/tensile|shear/.test(text)) methods.push("引張・せん断試験");
  if (/fatigue|cyclic/.test(text)) methods.push("疲労試験");
  if (/fracture surface|fractography/.test(text)) methods.push("破断面の観察");
  if (/compar|experiment|test/.test(text)) methods.push("条件間の比較");
  if (/interview|focus group/.test(text)) methods.push("参加者への聞き取り");
  const subject = unique(subjects).slice(0, 3).join("、") || "選択した研究テーマに近い対象";
  const method = unique(methods).slice(0, 3).join("、");
  return `抄録から確認できる範囲では、${subject}を扱う論文です。${method ? `${method}を用いて、` : ""}対象や条件の違いが結果にどう表れるかを検討しています。具体的な数値、対象範囲、限界は元の論文で確認してください。`;
}

async function synthesizeVerifiedResearch(
  works: Array<{ work: OpenAlexWork; abstract: string }>,
  selectedRq: RQCandidate,
) {
  if (!works.length) return { papers: [] as PaperCandidate[], literatureReview: null as Step2Response["literature_review"] | null };
  const payload = works.map(({ work, abstract }, index) => ({
    id: index,
    title: work.display_name,
    journal: work.primary_location?.source?.display_name,
    year: work.publication_year,
    abstract: abstract || "抄録は文献DBに未収録",
  }));
  const prompt = `研究初心者向けの先行研究レビューと文献案内を作成してください。
研究の問い: ${selectedRq.academic_rq}
実在確認済み文献: ${JSON.stringify(payload)}
1. literature_review: target_gap_deepは350〜600字、knownsは5〜7件、unknownsは4〜6件、controversiesは2〜4件。一般論ではなく、文献群で扱われている対象・方法・結果と、研究の問いで追加検証すべき範囲を明確に分けてください。
2. items: 各文献のidを維持し、summary（何を対象に、どう調べ、何が分かった論文か。専門語を短く言い換えた日本語120〜220字）とreason（この研究のどこに役立つか、またはどこが競合・隣接するか。日本語80〜160字）を返してください。
文章は結論から書き、一文では一つだけ伝えてください。研究初心者が意味を推測しなくてよい普通の言葉を使い、英語の専門語だけで説明しないでください。
抄録にない結果は作らず、「抄録から確認できる範囲では」と明示してください。
JSON {"literature_review":{"target_gap_deep":"...","knowns":["..."],"unknowns":["..."],"controversies":["..."]},"items":[{"id":0,"summary":"...","reason":"..."}]} のみ。`;
  const generated = await callAIJson<{
    literature_review?: Step2Response["literature_review"];
    items?: Array<{ id: number; summary: string; reason: string }>;
  }>(prompt, {
    temperature: 0.15,
    timeoutMs: 60000,
    maxOutputTokens: 5000,
    responseSchema: VERIFIED_LITERATURE_SCHEMA,
    reasoningEffort: "low",
  });
  const byId = new Map((generated?.items || []).map((item) => [item.id, item]));
  const papers = works.map(({ work, abstract }, index) => {
    const metadata = paperMetadata(work);
    const explanation = byId.get(index);
    const summary = explanation?.summary?.trim() || fallbackPaperSummary(work, abstract);
    const reason = explanation?.reason?.trim() || `「${selectedRq.public_rq}」を考える際に、対象・方法・評価指標を具体化するための先行研究です。`;
    return { ...metadata, summary, reason } satisfies PaperCandidate;
  });
  const literature = generated?.literature_review;
  const validLiterature = literature?.target_gap_deep?.length >= 220
    && literature.knowns?.length >= 4 && literature.unknowns?.length >= 3
    ? literature : null;
  return { papers, literatureReview: validLiterature };
}

async function enrichVerifiedPapers(step2: Step2Response, selectedRq: RQCandidate, terms: string[]) {
  const works = await fetchOpenAlexWorks(scholarlyQueries(step2, selectedRq, terms));
  if (!works.length) return step2;
  const synthesis = await synthesizeVerifiedResearch(works, selectedRq);
  const papers = synthesis.papers;
  const fill = (verified: PaperCandidate[], fallback: PaperCandidate[], minimum: number) =>
    [...verified, ...fallback.filter((item) => !verified.some((paper) => paper.title === item.title))].slice(0, Math.max(minimum, verified.length));
  return {
    ...step2,
    ...(synthesis.literatureReview ? { literature_review: synthesis.literatureReview, generatedBy: "ai" as const } : {}),
    paper_ideas: {
      reference: fill(papers.slice(0, 3), step2.paper_ideas.reference, 3),
      competitor: fill(papers.slice(3, 6), step2.paper_ideas.competitor, 2),
      adjacent: fill(papers.slice(6, 9), step2.paper_ideas.adjacent, 2),
    },
  };
}

function enrichStep2References(step2: Step2Response, input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response) {
  const terms = referenceTerms(input, selectedRq, step1);
  const profiles = topicProfiles(input, selectedRq, step1);
  const fields = strictFieldMatches(terms, profiles);
  const societies = verifiedCommunityResources("society", fields, profiles, terms);
  const journals = verifiedCommunityResources("journal", fields, profiles, terms);
  const paperFallback = fallbackPaperIdeas(input, selectedRq, step1);
  const existingPapers = step2.paper_ideas || { reference: [], competitor: [], adjacent: [] };
  return {
    ...step2,
    search_queries: unique([
      ...profiles.flatMap((profile) => profile.englishQueries),
      ...(step2.search_queries || []),
    ]).filter((query) => query.trim().length >= 4).slice(0, 12),
    paper_ideas: {
      reference: ensurePaperLinks(existingPapers.reference || [], paperFallback.reference),
      competitor: ensurePaperLinks(existingPapers.competitor || [], paperFallback.competitor),
      adjacent: ensurePaperLinks(existingPapers.adjacent || [], paperFallback.adjacent),
    },
    academic_mapping: {
      ...step2.academic_mapping,
      target_domain: fields.slice(0, 3).map((field) => field.nameJa).join("・") || step2.academic_mapping.target_domain,
      matched_field_ids: fields.map((field) => field.id),
      recommended_fields: fields.map((item) => asFieldResource(item, terms)),
      recommended_societies: societies,
      recommended_journals: journals,
    },
  };
}

function matchResource(candidate: MatchedAcademicResource, kind: "society" | "journal") {
  const rows = kind === "society" ? store.allResearchSocieties() : store.allResearchJournals();
  const exact = rows.find((item) => item.name === candidate.name);
  const near = exact || rows.find((item) => item.name.includes(candidate.name) || candidate.name.includes(item.name));
  if (!near) return {
    ...candidate,
    url: resourceSearchUrl(candidate.name, kind),
    url_type: "検索(要確認)" as const,
    verificationLabel: "AI候補・DB未確認" as const,
    matchConfidence: 0,
  };
  const confidence = exact ? 1 : 0.72;
  const destination = canonicalResourceUrl(near, kind);
  return {
    ...candidate,
    name: near.name,
    url: destination.url,
    url_type: destination.urlType,
    description: candidate.description || near.beginnerDescription || near.description,
    scope: candidate.scope || near.kind,
    matchedResourceId: near.id,
    matchConfidence: confidence,
    verificationLabel: exact ? "DB一致" as const : "DB近似" as const,
  };
}

function enrichStep2Mapping(step2: Step2Response) {
  const related = store.searchResearchResources(step2.academic_mapping.target_domain, 5);
  const labs = store.searchLabs({ q: step2.academic_mapping.target_domain }).slice(0, 5);
  return {
    ...step2,
    academic_mapping: {
      ...step2.academic_mapping,
      matched_field_ids: step2.academic_mapping.matched_field_ids?.length ? step2.academic_mapping.matched_field_ids : related.fields.map((item) => item.id),
      matched_lab_ids: labs.map((item) => item.id),
      recommended_societies: (step2.academic_mapping.recommended_societies || []).map((item) => matchResource(item, "society")),
      recommended_journals: (step2.academic_mapping.recommended_journals || []).map((item) => matchResource(item, "journal")),
    },
  };
}

export async function generateStep2(input: QuestionFreeInput, selectedRq: RQCandidate, step1: Step1Response) {
  const result = fallbackStep2(input, selectedRq, step1);
  result.research_outline.interesting_points ||= "";
  result.research_outline.difficult_points ||= [];
  result.research_outline.consultation_questions ||= [];
  result.research_outline.comments ||= [];
  result.research_outline.next_actions ||= (result.research_outline.next_steps || []).map((value) => ({ id: `action-${Math.random().toString(36).slice(2, 8)}`, text: value, completed: false }));
  const referenced = enrichStep2Mapping(enrichStep2References(result, input, selectedRq, step1));
  return enrichVerifiedPapers(referenced, selectedRq, referenceTerms(input, selectedRq, step1));
}

export { enrichStep2References };

export async function adjustResearchText(value: string, instruction: string, context = "") {
  const prompt = `研究骨子の文章を調整してください。ユーザーが編集した他の文章は変更しません。
研究初心者が一読で分かる日本語にしてください。結論を先に置き、一文では一つだけ伝えます。専門語は必要なときだけ使い、短い説明を添えます。
調整指示: ${instruction}
対象文章: ${value}
周辺文脈: ${context}
調整後の文章だけを返してください。`;
  return (await callAI(prompt, { temperature: 0.25, timeoutMs: 20000 }))?.trim() || value;
}
