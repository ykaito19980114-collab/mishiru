// 研究室カードデッキ（ADR-005）：実研究室(19,785件)からAIが学生向けカードを生成。
// コスト設計：8枚を1回のGemini呼び出しでバッチ生成 → 7日TTLでサーバーキャッシュ（全セッション共有）。
// Gemini不通・未生成時はテンプレートカード（コストゼロ）で即時フォールバック（AC-05）。
import fs from "fs";
import path from "path";
import { store } from "./store";
import { callAIJson, aiEnabled } from "./ai";
import { fieldLabel } from "../shared/fields";
import { RESEARCH_AREAS } from "../shared/taxonomy";
import type { Lab, LabCardContent } from "../shared/types";
import { cleanDisplayLabel } from "../shared/text";

const CACHE_FILE = path.join(process.cwd(), "data", "runtime", "labcards-cache.json");
const CACHE_VERSION = 9; // v9: 音響・振動系の問いを対象/設計起点に更新
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7日（docs/03 付録A）
export const DECK_BATCH = 8;

interface CacheShape { version: number; cards: Record<string, LabCardContent> }
let cache: CacheShape = { version: CACHE_VERSION, cards: {} };
try {
  const loaded = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as CacheShape;
  if (loaded.version === CACHE_VERSION) cache = loaded;
} catch { /* 初回 */ }

let writeTimer: NodeJS.Timeout | null = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); }
    catch (e) { console.error("[lab-cards] persist失敗:", (e as Error).message); }
  }, 600);
}

const isFresh = (c: LabCardContent) => Date.now() - new Date(c.generatedAt).getTime() < TTL_MS;

// --- テンプレートカード（Gemini不要・即時。AI生成が届くまでの代替） ---
const cleanKeyword = (value: string) => value
  .split(/[、,]/)
  .map(cleanDisplayLabel)
  .find(Boolean) || "";

function templateQuestions(lab: Lab, kw: string, kw2?: string) {
  const sourced = (lab.researchQuestions || []).map((q) => q.trim()).filter(Boolean);
  if (sourced.length) return sourced.slice(0, 2);
  const primary = cleanKeyword(kw);
  const secondary = kw2 ? cleanKeyword(kw2) : "";
  const first = researchQuestion(primary, lab.field_major);
  const second = secondary && secondary !== primary
    ? researchQuestion(secondary, lab.field_major, "secondary")
    : `${lab.name.replace(/[（(].*?[）)]/g, "")}では、まだうまく説明できていない現象をどう捉えようとしているのだろう？`;
  return [first, second];
}

function researchQuestion(term: string, field: Lab["field_major"], role: "primary" | "secondary" = "primary") {
  const t = cleanKeyword(term);
  if (/自然言語|機械翻訳|言語|文章|対話|意味/.test(t)) return `${t}は、人の言葉の意味や文脈をどこまで扱えるのだろう？`;
  if (/人工知能|機械学習|AI|データ|知能|情報処理/.test(t)) return `${t}で、複雑な現象や判断をどこまで説明できるのだろう？`;
  if (/水中音響|海洋音響|水産音響|海中音響|魚群探知|エコーロケーション/.test(t)) return `水中の音を手がかりに、海の生きものや環境をどう捉えるのだろう？`;
  if (/空力音響|航空|流体音響|騒音|低騒音|静音/.test(t)) return `流れや機械が生む騒音を、どう予測し、静かな設計へつなげるのだろう？`;
  if (/建築音響|室内音響|空間音響|音場|サウンドスケープ/.test(t)) return `建物や公共空間の音環境を、どう測り、聞きやすさへ設計するのだろう？`;
  if (/音声|聴覚|心理音響|音響信号|音情報|音楽/.test(t)) return `声や音に含まれる情報を、どう取り出し、人の理解につなげるのだろう？`;
  if (/音響|音|振動|波動/.test(t)) return `音や振動から何を読み取り、どう静かで安全な設計へつなげるのだろう？`;
  if (/ロボット|メカトロニクス|制御|機械力学|機械/.test(t)) return `${t}は、予測しにくい環境でどう安定して動けるのだろう？`;
  if (/熱|伝熱|燃焼|温度|エネルギー/.test(t)) return `${t}は、どんな条件で移動し、どう効率よく使えるのだろう？`;
  if (/流体|水流|気流|乱流|空力|流れ/.test(t)) return `${t}は、複雑な流れの中でどんな力や変化を生むのだろう？`;
  if (/構造|強度|破壊|疲労|耐震|安全/.test(t)) return `${t}は、どの条件で壊れにくさや安全性が決まるのだろう？`;
  if (/衛星|通信|ネットワーク|光導波路|レーザー|半導体|電子|回路/.test(t)) return `${t}で、情報やエネルギーをどこまで精密に運べるのだろう？`;
  if (/タンパク|蛋白|分子|細胞|遺伝子|ゲノム|生体|生命/.test(t)) return `${t}は、どんな仕組みで形や働きが生まれるのだろう？`;
  if (/植物|生態|環境|気候|農|食|食品/.test(t)) return `${t}は、環境や生きものの変化とどう関わっているのだろう？`;
  if (/材料|化学|触媒|プロセス|ウェーハ|高分子|金属/.test(t)) return `${t}は、どんな条件で性質や反応が変わるのだろう？`;
  if (/医療|福祉|看護|疾患|薬|臨床|画像/.test(t)) return `${t}は、診断やケアのどの場面を変えようとしているのだろう？`;
  if (/都市|建築|土木|地域|デザイン|空間/.test(t)) return `${t}は、人の暮らしや地域の使われ方をどう変えるのだろう？`;
  if (/心理|教育|学習|感情|認知|行動/.test(t)) return `${t}は、人の学びや判断のどんな仕組みを探っているのだろう？`;
  if (field === "info-math") return role === "primary" ? `${t}で、見えにくいパターンをどう読み解くのだろう？` : `${t}は、どんな現象をモデルとして表そうとしているのだろう？`;
  if (field === "life-bio" || field === "medical") return `${t}は、生命やからだのどんな仕組みに関わっているのだろう？`;
  if (field === "eee-mech" || field === "material-chem") return `${t}では、どの条件が働き方を変え、どんな応用につながるのだろう？`;
  if (field === "arch-civil") return `${t}は、人やまちの体験をどう設計し直すのだろう？`;
  return `この研究室では、${t}のどの性質に注目し、どんな仕組みを説明しようとしているのだろう？`;
}

function templateCard(lab: Lab): LabCardContent {
  const kw = cleanKeyword(lab.keywords[0] || fieldLabel(lab.field_major));
  const kw2 = lab.keywords[1] ? cleanKeyword(lab.keywords[1]) : undefined;
  const kws = lab.keywords.slice(0, 3).map(cleanKeyword).filter(Boolean).join("、") || fieldLabel(lab.field_major);
  const questions = templateQuestions(lab, kw, kw2);
  return {
    labId: lab.id,
    title: questions[0],
    hook: fieldLabel(lab.field_major),
    summary: (lab.sections.research_summary || `${lab.university.name}で、${kws}を手がかりに、現象の理解や方法づくりに近づく研究室です。`).slice(0, 140),
    questions,
    why: `${kw}をどの対象で扱い、どの現象に近づくかに、この研究室らしさが表れます。`,
    generatedBy: "template",
    generatedAt: new Date().toISOString(),
  };
}

// --- バッチAI生成（最大8研究室を1回の呼び出しで） ---
async function generateBatch(labs: Lab[]): Promise<void> {
  if (!aiEnabled() || labs.length === 0) return;
  const list = labs.map((l, i) =>
    `${i + 1}. labId=${l.id} 研究室=${l.name} 大学=${l.university.name} 専攻=${l.major || l.department} 分野=${fieldLabel(l.field_major)} キーワード=${l.keywords.slice(0, 6).map(cleanKeyword).filter(Boolean).join("、") || "なし"}`
  ).join("\n");
  const prompt = `あなたは大学研究室を高校生・学部生に紹介する編集者です。
以下の${labs.length}件の研究室それぞれについて、スワイプ型カードの文面をJSON配列で作成してください。
制約：
- 断定を避け「〜と考えられます」「〜のようです」「〜だろう？」調（公開キーワードからの推定のため）。
- 専門用語を避け、身近な言葉で好奇心を引く。誇張・実績の断定・人物評は禁止。
- title は**その研究室が追う問いそのもの**（20〜42字）。「研究室名は何を確かめる？」のような汎用タイトルは禁止。対象・現象・仕組み・応用先のいずれかを必ず含める。
- title/questions では「音響工学」「キラル磁性」「情報工学」などの分野名・テーマ名を擬人化した主語にしない。必要なら「この研究室では」「音や振動を」「物質中の磁気の向きを」のように、研究室・対象・現象を主語にする。
- hook は日常との接点フレーズ（12字以内）。summary は60〜90字のやさしい説明。
- questions は「この研究室が扱う問い」を学生目線で3つ（各25〜50字・疑問文・titleと重複しない・公開情報のキーワードから離れすぎない）。「公開キーワード」という語は使わない。
- why は「この研究室のテーマのおもしろさ」を50〜80字で。大学名とキーワードを並べるだけは禁止。何を見ようとしているから面白いのかを書く。
研究室リスト:
${list}
出力（JSON配列のみ）: [{"labId":"lab-1","title":"...","hook":"...","summary":"...","questions":["...","...","..."],"why":"..."}]`;

  const arr = await callAIJson<{ labId: string; title: string; hook: string; summary: string; questions: string[]; why: string }[]>(prompt, { temperature: 0.5, timeoutMs: 30000 });
  if (!Array.isArray(arr)) return;
  const validIds = new Set(labs.map((l) => l.id));
  const now = new Date().toISOString();
  for (const item of arr) {
    if (!item?.labId || !validIds.has(item.labId) || !item.title || !item.summary) continue;
    cache.cards[item.labId] = {
      labId: item.labId,
      title: String(item.title).slice(0, 40),
      hook: String(item.hook || "").slice(0, 20),
      summary: String(item.summary).slice(0, 140),
      questions: (Array.isArray(item.questions) ? item.questions : [])
        .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0)
        .slice(0, 3)
        .map((q: string) => q.slice(0, 60)),
      why: String(item.why || "").slice(0, 110),
      generatedBy: "llm",
      generatedAt: now,
    };
  }
  persist();
}

// --- デッキ選定：未評価・キーワードあり・ジャンル/興味を反映しつつ多様性を確保 ---
function seededOrder<T>(arr: T[], seedStr: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  return arr.map((v, i) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return { v, k: seed ^ (i * 2654435761) }; })
    .sort((a, b) => a.k - b.k).map((x) => x.v);
}

// 週次共有ウィンドウ：全セッションが同じ週内候補プール（ジャンル別・先頭WINDOW件）を歩く。
// → 生成は最大 WINDOW件/ジャンル/週 に上限され、2人目以降はキャッシュ配信になる（FR-CACHE-01のコスト上限）。
const WINDOW = 240;

export function selectDeck(sessionId: string, genre: string | null, batch = DECK_BATCH): Lab[] {
  const evaluated = store.evaluatedLabIds(sessionId);
  const pool = store.publicNonDemo().filter((l) => l.keywords.length > 0);

  // ジャンル選択（SCR-00）→ area_tags のジャンル対応で優先
  const genreAreas = genre ? new Set(RESEARCH_AREAS.filter((a) => a.genre === genre).map((a) => a.id)) : null;

  // 週バケットで固定シード（セッションに依らず同一 → キャッシュ共有。週替わりで顔ぶれ更新=TTLと整合）
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  let base = seededOrder(pool, `${genre || "all"}:w${week}`);
  if (genreAreas) {
    const inG = base.filter((l) => l.area_tags.some((t) => genreAreas.has(t)));
    const outG = base.filter((l) => !l.area_tags.some((t) => genreAreas.has(t)));
    const merged: Lab[] = [];
    let gi = 0, oi = 0;
    while (gi < inG.length || oi < outG.length) {
      for (let k = 0; k < 3 && gi < inG.length; k++) merged.push(inG[gi++]); // ジャンル3:他1
      if (oi < outG.length) merged.push(outG[oi++]);
    }
    base = merged;
  }

  // 未評価のみ・共有ウィンドウ内から選ぶ（評価が進むとウィンドウを次のスライスへ拡張）
  const unevaluated = base.filter((l) => !evaluated.has(l.id));
  let windowSize = WINDOW;
  while (unevaluated.slice(0, windowSize).length < batch && windowSize < unevaluated.length) windowSize += WINDOW;
  const windowLabs = unevaluated.slice(0, windowSize);

  // 興味シグナル（テーマ＋研究室評価由来）はウィンドウ内の並べ替えのみに使う（プール自体は共有のまま）
  const interest = store.interestAreaScore(sessionId);
  const hasInterest = Object.keys(interest).length > 0;
  const scored = windowLabs.map((l, i) => {
    let s = 0;
    if (hasInterest) for (const t of l.area_tags) s += interest[t] || 0;
    return { l, s, i };
  }).sort((a, b) => b.s - a.s || a.i - b.i);

  // 多様性ガード：同一分野はバッチ内3件まで
  const picked: Lab[] = [];
  const perField: Record<string, number> = {};
  for (const { l } of scored) {
    if (picked.length >= batch) break;
    if ((perField[l.field_major] || 0) >= 3) continue;
    perField[l.field_major] = (perField[l.field_major] || 0) + 1;
    picked.push(l);
  }
  for (const { l } of scored) {
    if (picked.length >= batch) break;
    if (!picked.includes(l)) picked.push(l);
  }
  return picked;
}

// --- 共通：任意の研究室リストをカード化（不足分のみ1回のバッチ生成。AI検索/傾向モードでも使用） ---
export async function buildCardsFor(labs: Lab[]): Promise<(LabCardContent & { lab: Lab })[]> {
  const missing = labs.filter((l) => { const c = cache.cards[l.id]; return !(c && isFresh(c) && c.generatedBy === "llm"); });
  if (missing.length) await generateBatch(missing);
  return labs.map((lab) => {
    const c = cache.cards[lab.id];
    const content = c && isFresh(c) ? c : templateCard(lab); // 生成失敗時もテンプレで即時提供
    return { ...content, lab };
  });
}

// --- 取得：キャッシュ即時返却＋不足分は同期バッチ生成（初回のみ数秒）＋次バッチを裏でプリウォーム ---
let prewarming = false;

export async function getDeckCards(sessionId: string, genre: string | null, batch = DECK_BATCH): Promise<(LabCardContent & { lab: Lab })[]> {
  const labs = selectDeck(sessionId, genre, batch);
  const result = await buildCardsFor(labs);

  // 次バッチのプリウォーム（待たせない・二重起動防止。既定デッキのみ＝コスト上限を明確に）
  if (aiEnabled() && !prewarming) {
    const nextLabs = selectDeck(sessionId, genre, batch * 2).slice(batch)
      .filter((l) => { const c = cache.cards[l.id]; return !(c && isFresh(c) && c.generatedBy === "llm"); });
    if (nextLabs.length) {
      prewarming = true;
      void generateBatch(nextLabs).finally(() => { prewarming = false; });
    }
  }

  return result;
}

export function labCardCacheStats() {
  const all = Object.values(cache.cards);
  return { total: all.length, fresh: all.filter(isFresh).length };
}

// キャッシュ済みカード（プロフィールの「興味を持ちそうな問い」等で再利用。追加生成なし）
export function cachedCardFor(labId: string): LabCardContent | null {
  const c = cache.cards[labId];
  return c && isFresh(c) ? c : null;
}
