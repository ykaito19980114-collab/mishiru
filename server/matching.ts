// 興味プロファイル生成 & 研究室マッチング（docs/03 §付録A 重み・FR-PROF-01/FR-MATCH-01）
import { store } from "./store";
import { areaLabel, RESEARCH_AREAS } from "../shared/taxonomy";
import type { CardAction, InterestProfile, MatchReason, ThemeCard, Lab } from "../shared/types";

// 付録A：評価の重み
const WEIGHT: Record<CardAction, number> = { save: 3, deep: 2, like: 2, important: 4, unclear: 1, skip: -1, not_fit: -2 };
export const PROFILE_THRESHOLD = 10;

const ORIENTATION_LABEL = (o: number) =>
  o <= -0.33 ? "基礎・原理の探究に関心が向く傾向" :
  o >= 0.33 ? "社会や応用への展開に関心が向く傾向" :
  "基礎と応用のバランスを重視する傾向";

interface Signals {
  areaScore: Record<string, number>;
  methodScore: Record<string, number>;
  orientationSum: number;
  orientationWeight: number;
  positiveCards: ThemeCard[]; // like/deep/save のカード
  savedCards: ThemeCard[];
  positiveLabs: Lab[];        // like/deep/save した研究室（ADR-005）
  skippedLabIds: Set<string>; // 「違うかも」した研究室（候補から除外）
  positiveLabKeywords: string[];
  evaluatedCount: number;     // テーマ＋研究室の合計
}

function collectSignals(sessionId: string): Signals {
  const actions = store.actionsBySession(sessionId);
  const labActions = store.labActionsBySession(sessionId);
  const s: Signals = {
    areaScore: {}, methodScore: {}, orientationSum: 0, orientationWeight: 0,
    positiveCards: [], savedCards: [], positiveLabs: [], skippedLabIds: new Set(),
    positiveLabKeywords: [], evaluatedCount: actions.length + labActions.length,
  };
  for (const a of actions) {
    const card = store.cardById(a.cardId);
    if (!card) continue;
    const w = WEIGHT[a.action];
    for (const area of card.area_tags) s.areaScore[area] = (s.areaScore[area] || 0) + w;
    for (const m of card.methods) s.methodScore[m] = (s.methodScore[m] || 0) + w;
    if (w > 0) {
      s.orientationSum += card.orientation * w;
      s.orientationWeight += w;
      s.positiveCards.push(card);
      if (a.action === "save") s.savedCards.push(card);
    }
  }
  // 研究室カードの評価も同じ重みでシグナル化（方法/基礎応用は研究室データに無いため分野・キーワードのみ）
  for (const a of labActions) {
    const lab = store.labById(a.labId);
    if (!lab) continue;
    const w = WEIGHT[a.action];
    for (const area of lab.area_tags) s.areaScore[area] = (s.areaScore[area] || 0) + w;
    if (w > 0) {
      s.positiveLabs.push(lab);
      s.positiveLabKeywords.push(...lab.keywords.slice(0, 4));
    }
    if (a.action === "skip" || a.action === "not_fit") s.skippedLabIds.add(lab.id);
  }
  return s;
}

export function buildProfile(sessionId: string): InterestProfile | { evaluatedCount: number; needed: number } {
  const s = collectSignals(sessionId);
  if (s.evaluatedCount < PROFILE_THRESHOLD) {
    return { evaluatedCount: s.evaluatedCount, needed: PROFILE_THRESHOLD - s.evaluatedCount };
  }

  const topAreas = Object.entries(s.areaScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area, score]) => ({ area, label: areaLabel(area), score }));

  const methodPreference = Object.entries(s.methodScore)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([method, score]) => ({ method, score }));

  const orientation = s.orientationWeight ? s.orientationSum / s.orientationWeight : 0;
  const hasOrientation = s.orientationWeight > 0; // テーマカード評価がある場合のみ意味を持つ

  // 候補分野（キーワード粒度）：ポジティブなカード＋研究室のキーワード頻度上位
  const kwFreq: Record<string, number> = {};
  for (const c of s.positiveCards) for (const k of c.keywords) kwFreq[k] = (kwFreq[k] || 0) + 1;
  for (const k of s.positiveLabKeywords) kwFreq[k] = (kwFreq[k] || 0) + 1;
  const candidateFields = Object.entries(kwFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);

  // 傾向文（断定禁止 FR-PROF-02）。分野名の羅列ではなく、問いの形に変換する。
  const seedTerms = candidateFields.length
    ? candidateFields.slice(0, 3)
    : [...s.positiveLabs.flatMap((l) => l.keywords.slice(0, 2)), ...s.positiveCards.flatMap((c) => c.keywords.slice(0, 2))].slice(0, 3);
  const termText = seedTerms.length ? seedTerms.join("、") : "気になった現象やテーマ";
  const methodText = methodPreference[0]?.method
    ? ` 進め方としては、${methodPreference.map((m) => m.method).join("・")}のように「どう確かめるか」まで見たい反応が出ています。`
    : "";
  const orientationText = hasOrientation ? ` ${ORIENTATION_LABEL(orientation)}も少し見えます。` : "";
  const summary =
    `現時点では、「${termText}」を手がかりに、何が起きているのか、どう測れるのか、どんな場面に活かせるのかを確かめたい反応が集まっています。` +
    `${methodText}${orientationText}` +
    `これは決めつけではなく、次に比較する研究室を選ぶための仮説です。`;

  const profile: InterestProfile = {
    sessionId,
    generatedAt: new Date().toISOString(),
    evaluatedCount: s.evaluatedCount,
    topAreas,
    methodPreference,
    orientation,
    orientationLabel: hasOrientation ? ORIENTATION_LABEL(orientation) : "",
    candidateFields,
    summary,
  };
  return profile;
}

// 研究室マッチング：接続理由つき（AC-09）。保存/ポジティブカードとの分野・キーワード対応。
export function matchLabs(sessionId: string, limit = 5): { lab: Lab; reason: MatchReason }[] {
  const s = collectSignals(sessionId);
  const positive = s.positiveCards;
  if (positive.length === 0 && s.positiveLabs.length === 0) return [];

  // 関心分野の重み
  const areaWeight: Record<string, number> = {};
  for (const [area, v] of Object.entries(s.areaScore)) if (v > 0) areaWeight[area] = v;
  const interestAreas = Object.keys(areaWeight);
  if (interestAreas.length === 0) return [];

  // 評価済み研究室（違うかも・保存とも）は候補から除外し、新しい出会いを提示する
  const evaluatedLabs = store.evaluatedLabIds(sessionId);
  const positiveLabKwLower = s.positiveLabKeywords.map((k) => k.toLowerCase());

  const candidates = store.labsByArea(interestAreas).filter((l) => !evaluatedLabs.has(l.id));
  const scored = candidates.map((lab) => {
    let score = 0;
    const reasons: string[] = [];
    const matchedCardIds = new Set<string>();

    // 分野一致
    const sharedAreas = lab.area_tags.filter((t) => areaWeight[t]);
    for (const area of sharedAreas) score += areaWeight[area];

    // 保存カードを優先して接続理由を作る（docs/03 §8.5 書式）
    const sourceCards = (s.savedCards.length ? s.savedCards : positive);
    const relatedByArea = sourceCards.filter((c) => c.area_tags.some((t) => lab.area_tags.includes(t)));
    for (const c of relatedByArea) matchedCardIds.add(c.id);

    // キーワード一致（+ボーナス）
    const labKw = lab.keywords.map((k) => k.toLowerCase());
    const kwHits = new Set<string>();
    for (const c of sourceCards) {
      for (const ck of c.keywords) {
        if (labKw.some((lk) => lk.includes(ck.toLowerCase()) || ck.toLowerCase().includes(lk))) {
          kwHits.add(ck);
          matchedCardIds.add(c.id);
        }
      }
    }
    score += kwHits.size * 1.5;

    if (relatedByArea.length > 0) {
      const rep = relatedByArea[0];
      const areaName = areaLabel(sharedAreas[0] || rep.area_tags[0]);
      const verb = s.savedCards.includes(rep) ? "保存した" : "気になると答えた";
      let text = `${verb}「${rep.title}」と同じ〈${areaName}〉の研究テーマを扱っています`;
      const others = relatedByArea.length - 1;
      if (others > 0) text += `（ほか${others}枚のカードとも関連）`;
      reasons.push(text);
    }
    // 評価した研究室由来の接続理由（分野・キーワードの近さ。ADR-005）
    if (reasons.length === 0 && s.positiveLabs.length > 0) {
      const relatedLab = s.positiveLabs.find((pl) => pl.area_tags.some((t) => lab.area_tags.includes(t)));
      if (relatedLab && sharedAreas.length > 0) {
        reasons.push(`気になると答えた「${relatedLab.name}」と近い〈${areaLabel(sharedAreas[0])}〉の研究室です`);
      }
    }
    // 研究室キーワード同士の一致ボーナス
    const labKwSelf = lab.keywords.map((k) => k.toLowerCase());
    const labKwShared = positiveLabKwLower.filter((k) => labKwSelf.some((lk) => lk.includes(k) || k.includes(lk)));
    if (labKwShared.length > 0) score += Math.min(labKwShared.length, 3) * 1.5;

    if (kwHits.size > 0) {
      reasons.push(`キーワード「${Array.from(kwHits).slice(0, 3).join("・")}」が一致しています`);
    } else if (labKwShared.length > 0 && reasons.length > 0) {
      reasons.push(`関心キーワード「${labKwShared.slice(0, 2).join("・")}」とも関連しています`);
    }

    return {
      lab,
      reason: { labId: lab.id, score, reasons, matchedCardIds: Array.from(matchedCardIds) } as MatchReason,
    };
  });

  return scored
    .filter((x) => x.reason.score > 0 && x.reason.reasons.length > 0)
    .sort((a, b) => b.reason.score - a.reason.score)
    .slice(0, limit);
}

// ============ プロフィール拡充データ（SCR-03 v2。既存キャッシュの再構成のみ＝追加生成コストゼロ） ============
import { cachedCardFor } from "./lab-cards";
import { cleanDisplayLabel } from "../shared/text";

const cleanQuestionKeyword = (value: string) => value
  .split(/[、,]/)
  .map(cleanDisplayLabel)
  .find(Boolean) || "";

function labQuestionsFromPublicInfo(lab: Lab): string[] {
  const primary = cleanQuestionKeyword(lab.keywords[0] || lab.name.replace(/[（(].*?[）)]/g, "") || areaLabel(lab.area_tags[0]));
  const secondary = cleanQuestionKeyword(lab.keywords.find((k) => cleanQuestionKeyword(k) !== primary) || lab.name.replace(/[（(].*?[）)]/g, ""));
  const first = labQuestionFor(primary, lab.field_major);
  const second = secondary && secondary !== primary
    ? labQuestionFor(secondary, lab.field_major)
    : `${lab.name.replace(/[（(].*?[）)]/g, "")}では、どんな現象を見える形にしようとしているのか？`;
  return [
    first,
    second,
  ];
}

function labQuestionFor(keyword: string, field: string) {
  const k = keyword || "研究テーマ";
  const lower = k.toLowerCase();
  if (/自然言語|言語|翻訳|nlp|テキスト/.test(k) || lower.includes("language")) {
    return `人の言葉に含まれる意味や文脈を、計算でどこまで扱えるのか？`;
  }
  if (/水中音響|海洋音響|水産音響|海中音響|魚群探知|エコーロケーション/.test(k)) {
    return `水中の音を手がかりに、海の生きものや環境をどう捉えるのか？`;
  }
  if (/空力音響|航空|流体音響|騒音|低騒音|静音/.test(k)) {
    return `流れや機械が生む騒音を、どう予測し、静かな設計へつなげるのか？`;
  }
  if (/建築音響|室内音響|空間音響|音場|サウンドスケープ/.test(k)) {
    return `建物や公共空間の音環境を、どう測り、聞きやすさへ設計するのか？`;
  }
  if (/音声|聴覚|心理音響|音響信号|音情報|音楽/.test(k)) {
    return `声や音に含まれる情報を、どう取り出し、人の理解につなげるのか？`;
  }
  if (/音響|音|振動|波動/.test(k)) {
    return `音や振動から何を読み取り、どう静かで安全な設計へつなげるのか？`;
  }
  if (/ai|人工知能|機械学習|データ|モデル|予測|シミュレーション/.test(lower + k)) {
    return `${k}は、複雑な現象や判断をどこまで説明できるのか？`;
  }
  if (/制御|ロボット|自律|メカトロ|運動/.test(k)) {
    return `${k}を使い、機械は変化する環境にどう合わせられるのか？`;
  }
  if (/半導体|レーザ|光|通信|電波|アンテナ|回路|センサ|導波路|衛星/.test(k)) {
    return `${k}で、情報やエネルギーをどこまで精密に届けられるのか？`;
  }
  if (/タンパク|蛋白|遺伝子|ゲノム|細胞|分子|酵素|生体/.test(k)) {
    return `${k}はどんな仕組みで形や働きを生み出しているのか？`;
  }
  if (/植物|生態|環境|食品|農|水|土壌/.test(k)) {
    return `${k}の変化は、生きものや環境のふるまいをどう変えるのか？`;
  }
  if (/材料|化学|触媒|プロセス|高分子|金属|結晶/.test(k)) {
    return `${k}の性質は、どんな条件で生まれ、どう使えるのか？`;
  }
  if (/医療|看護|薬|疾患|患者|健康|診断/.test(k) || field === "medical") {
    return `${k}を通じて、人のからだやケアの何をよくできるのか？`;
  }
  if (/都市|建築|地域|交通|空間|防災|まち/.test(k) || field === "arch-civil") {
    return `${k}は、人が暮らす場所の安全や使いやすさをどう変えるのか？`;
  }
  return `この研究室では、${k}のどの性質に注目し、どんな仕組みを説明しようとしているのか？`;
}

export interface ProfileExtras {
  stats: { evaluated: number; liked: number; saved: number; deep: number };
  likedLabs: Lab[];   // 「気になる」した研究室（新しい順）
  savedLabs: Lab[];   // 保存した研究室
  deepLabs: Lab[];    // ページを見た研究室
  // あなたが興味を持ちそうな問い（評価済み研究室のAI生成問いを再利用。タップで研究室へ）
  questions: { text: string; labId: string; labName: string }[];
  // 関心分野の内訳（バー表示用：スコア比率＋ポジティブ研究室数）
  areaBreakdown: { area: string; label: string; share: number; labCount: number }[];
}

export function collectProfileExtras(sessionId: string): ProfileExtras {
  const labActions = store.labActionsBySession(sessionId).slice().reverse(); // 新しい順
  const themeActions = store.actionsBySession(sessionId);

  const byAction = (act: string) =>
    labActions.filter((a) => a.action === act)
      .map((a) => store.labById(a.labId))
      .filter((l): l is Lab => !!l && !l.is_demo);

  const savedLabs = byAction("save");
  const likedLabs = byAction("like");
  const deepLabs = byAction("deep");

  const stats = {
    evaluated: labActions.length + themeActions.length,
    liked: likedLabs.length + themeActions.filter((a) => a.action === "like").length,
    saved: savedLabs.length + themeActions.filter((a) => a.action === "save").length,
    deep: deepLabs.length + themeActions.filter((a) => a.action === "deep").length,
  };

  // 問い：保存＞気になる＞見た の優先で、各研究室から最大2問・全体6問・重複除去
  const questions: ProfileExtras["questions"] = [];
  const seenText = new Set<string>();
  for (const lab of [...savedLabs, ...likedLabs, ...deepLabs]) {
    if (questions.length >= 6) break;
    const card = cachedCardFor(lab.id);
    const sourceQuestions = card?.questions?.length ? card.questions : labQuestionsFromPublicInfo(lab);
    let taken = 0;
    for (const q of sourceQuestions) {
      if (questions.length >= 6 || taken >= 2) break;
      const t = q.trim();
      if (!t || seenText.has(t)) continue;
      seenText.add(t);
      questions.push({ text: t, labId: lab.id, labName: lab.name });
      taken++;
    }
  }
  // フォールバック：テーマカードの問いタイトル（リンク先はカード詳細でなく研究室未確定のためlabIdなし→呼び出し側で非表示可）
  if (questions.length < 3) {
    for (const a of themeActions.filter((x) => x.action === "save" || x.action === "like")) {
      if (questions.length >= 6) break;
      const card = store.cardById(a.cardId);
      if (!card || seenText.has(card.title)) continue;
      seenText.add(card.title);
      questions.push({ text: card.title, labId: "", labName: "" });
    }
  }

  // 分野内訳：ポジティブ評価（研究室＋テーマ）の分野スコア → 上位5・比率・研究室数
  const W: Record<string, number> = { save: 3, important: 4, like: 2, deep: 2, unclear: 1 };
  const areaScore: Record<string, number> = {};
  const areaLabCount: Record<string, number> = {};
  for (const lab of [...savedLabs, ...likedLabs, ...deepLabs]) {
    for (const t of lab.area_tags) areaLabCount[t] = (areaLabCount[t] || 0) + 1;
  }
  for (const a of labActions) {
    const w = W[a.action];
    if (!w) continue;
    const lab = store.labById(a.labId);
    if (!lab) continue;
    for (const t of lab.area_tags) areaScore[t] = (areaScore[t] || 0) + w;
  }
  for (const a of themeActions) {
    const w = W[a.action];
    if (!w) continue;
    const card = store.cardById(a.cardId);
    if (!card) continue;
    for (const t of card.area_tags) areaScore[t] = (areaScore[t] || 0) + w;
  }
  const totalScore = Object.values(areaScore).reduce((s, v) => s + v, 0) || 1;
  const areaBreakdown = Object.entries(areaScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, score]) => ({
      area, label: areaLabel(area),
      share: Math.round((score / totalScore) * 100),
      labCount: areaLabCount[area] || 0,
    }));

  return {
    stats,
    likedLabs: likedLabs.slice(0, 30),
    savedLabs: savedLabs.slice(0, 30),
    deepLabs: deepLabs.slice(0, 30),
    questions,
    areaBreakdown,
  };
}

// 単一カードに対する関連研究室（SCR-02 カード詳細。0件時はFR-MATCH-02の呼び出し側で処理）
export function labsForCard(cardId: string, limit = 3): { lab: Lab; reason: MatchReason }[] {
  const card = store.cardById(cardId);
  if (!card) return [];
  const candidates = store.labsByArea(card.area_tags);
  const labKwMatch = (lab: Lab) => {
    const labKw = lab.keywords.map((k) => k.toLowerCase());
    return card.keywords.filter((ck) => labKw.some((lk) => lk.includes(ck.toLowerCase()) || ck.toLowerCase().includes(lk)));
  };
  return candidates
    .map((lab) => {
      const shared = lab.area_tags.filter((t) => card.area_tags.includes(t));
      const kw = labKwMatch(lab);
      const score = shared.length * 2 + kw.length * 1.5;
      const areaName = areaLabel(shared[0] || card.area_tags[0]);
      const reasons = [`このカードと同じ〈${areaName}〉の研究をしています`];
      if (kw.length) reasons.push(`「${kw.slice(0, 3).join("・")}」に取り組んでいます`);
      return { lab, reason: { labId: lab.id, score, reasons, matchedCardIds: [card.id] } as MatchReason };
    })
    .filter((x) => x.reason.score > 0)
    .sort((a, b) => b.reason.score - a.reason.score)
    .slice(0, limit);
}

// 近いテーマのカード（FR-MATCH-02：関連研究室0件時のフォールバック）
export function nearbyCards(cardId: string, limit = 3): ThemeCard[] {
  const card = store.cardById(cardId);
  if (!card) return [];
  return store.allCards()
    .filter((c) => c.id !== cardId && c.area_tags.some((t) => card.area_tags.includes(t)))
    .slice(0, limit);
}

export { RESEARCH_AREAS };
