// 研究室ページの充実：AI学生ガイド（Gemini・keywords由来）＋公開論文（OpenAlex・in-app埋め込み）。
// 信頼設計：AI生成は「公開情報からの推定・研究室未確認」と明示。論文は「同姓同名を含む可能性」を明示。
import fs from "fs";
import path from "path";
import { callAIJson, aiEnabled } from "./ai";
import { fieldLabel } from "../shared/fields";
import type { Lab } from "../shared/types";

const CONTACT = process.env.CONTACT_EMAIL || "ops@openlab.example";
const CACHE_FILE = path.join(process.cwd(), "data", "runtime", "enrich-cache.json");
const CACHE_VERSION = 3; // ロジック変更時に上げると再生成される（v3: キーワード関連論文フォールバック追加）
// 7日TTL（コスト設計：生成は「閲覧された研究室 × 週1回」に制限。期限切れは stale-while-revalidate）
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AiGuide {
  overview: string;
  questions: string[];
  methods: string[];
  fit: string;
  careers: string;
  appeal: string;
  generatedBy?: "ai" | "template";
}
export interface Paper {
  title: string;
  year: number | null;
  venue: string | null;
  citations: number;
  url: string | null;
  authors: string[];
}
export interface Enrichment {
  aiGuide: AiGuide | null;
  papers: Paper[];
  // matched/name_only=教員本人の論文（著者一致） / related=キーワード関連論文（業績一覧ではない） / none=非表示
  papersConfidence: "matched" | "name_only" | "related" | "none";
  generatedAt: string;
  version: number;
}

// --- キャッシュ（デバウンス書き込み） ---
let cache: Record<string, Enrichment> = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); } catch { cache = {}; }
let writeTimer: NodeJS.Timeout | null = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); }
    catch (e) { console.error("[enrich] persist失敗:", (e as Error).message); }
  }, 600);
}

// --- AI学生ガイド（Gemini） ---
async function generateGuide(lab: Lab): Promise<AiGuide | null> {
  if (!aiEnabled()) {
    const keywords = lab.keywords.slice(0, 4); const theme = keywords.join("・") || fieldLabel(lab.field_major);
    return { overview: `${theme}に関する公開キーワードを、学生が確認しやすい形に整理した開発用の案です。研究内容の詳細は公式情報をご確認ください。`, questions: keywords.slice(0,3).map((keyword)=>`${keyword}について、この研究室はどの対象や現象を扱っているか？`), methods: ["公式サイトで研究テーマを確認する","公開論文から研究方法を確認する","相談時に対象と方法を質問する"], fit: `${theme}を自分の問いと結び付けて確かめたい学生向けの確認材料です。`, careers: "公開情報だけでは進路を断定できないため、研究室へ確認してください。", appeal: `${theme}をどの対象・方法で扱うかを比較できる点です。`, generatedBy:"template" };
  }
  const kw = lab.keywords.length ? lab.keywords.join("、") : fieldLabel(lab.field_major);
  const prompt = `あなたは大学研究室を高校生・学部生にやさしく紹介する編集者です。
以下の研究室について、公開されている分野キーワードだけから推定できる範囲で学生向けの紹介をJSONで作成してください。
制約：
- 断定を避け「〜と考えられます」「〜のようです」調にする（研究室確認前の推定のため）。
- 専門用語は避け、身近な言葉で。中高生にも伝わるように。
- 特定の実績・受賞・人物像の断定は書かない（キーワードから一般的に言える範囲に留める）。
研究室名: ${lab.name}
大学/専攻: ${lab.university.name} ${lab.department}
分野: ${fieldLabel(lab.field_major)}
分野キーワード: ${kw}
出力JSON（キーは英語、値は日本語）: {"overview":"120字程度のやさしい研究概要","questions":["公開情報から読み取れる、この研究室が扱いそうな問いを学生目線で3つ"],"methods":["使いそうな研究方法を3つ（各30字程度）"],"fit":"どんな学生に向いていそうか（60字程度）","careers":"想定される進路の方向性（60字程度）","appeal":"この研究室のテーマのおもしろさ（80字程度）"}`;
  const g = await callAIJson<AiGuide>(prompt, { temperature: 0.4 });
  if (!g || !g.overview) return null;
  // 配列の健全化
  g.questions = (g.questions || []).slice(0, 3);
  g.methods = (g.methods || []).slice(0, 3);
  return { ...g, generatedBy: "ai" };
}

// --- OpenAlex 論文取得（著者エンティティ×分野で最良候補を選定） ---
const FIELD_CONCEPTS: Record<string, string[]> = {
  "info-math": ["Computer science", "Artificial intelligence", "Mathematics", "World Wide Web", "Machine learning"],
  "eee-mech": ["Engineering", "Electrical engineering", "Mechanical engineering", "Control theory", "Robot"],
  "material-chem": ["Chemistry", "Materials science", "Polymer", "Catalysis"],
  "physics-space": ["Physics", "Astronomy", "Quantum mechanics", "Condensed matter physics"],
  "life-bio": ["Biology", "Genetics", "Cell biology", "Neuroscience"],
  "medical": ["Medicine", "Internal medicine", "Surgery", "Pharmacology"],
  "arch-civil": ["Engineering", "Civil engineering", "Architecture", "Structural engineering"],
  "agri-env": ["Environmental science", "Agronomy", "Biology", "Ecology"],
  "social": ["Economics", "Political science", "Sociology", "Business", "Law"],
  "humanities": ["Philosophy", "History", "Linguistics", "Art"],
  "education-psych": ["Psychology", "Pedagogy", "Cognitive science"],
  "art-sports": ["Art", "Visual arts", "Physical education"],
};

async function oa(url: string): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + `mailto=${encodeURIComponent(CONTACT)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchPapers(name: string, fieldMajor: string, universityName: string): Promise<{ papers: Paper[]; confidence: Enrichment["papersConfidence"] }> {
  if (!name || name.length < 2) return { papers: [], confidence: "none" };
  const authorsRes = await oa(`https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per-page=15`);
  const authors: any[] = authorsRes?.results || [];
  if (!authors.length) return { papers: [], confidence: "none" };

  const wantConcepts = new Set((FIELD_CONCEPTS[fieldMajor] || []).map((c) => c.toLowerCase()));
  // 大学名の英語一部（「大阪大学」→「Osaka」等）を作れないため、機関名の日本語/英語両方に部分一致を試みる緩い照合
  const univKey = universityName.replace(/大学$|大学院.*$/, "").toLowerCase();

  // 各候補にスコアを付け、十分に確からしいものだけ採用（誤情報＝致命リスクのため厳格に）
  const scored = authors.map((a) => {
    const concepts = (a.x_concepts || []) as any[];
    const top2 = concepts.slice(0, 2).map((c) => (c.display_name || "").toLowerCase());
    const conceptHitsTop2 = top2.filter((c) => wantConcepts.has(c)).length;
    const conceptHitsAny = concepts.filter((c) => wantConcepts.has((c.display_name || "").toLowerCase())).length;
    const insts = (a.last_known_institutions || a.affiliations?.map((x: any) => x.institution) || []) as any[];
    const instMatch = insts.some((i: any) => {
      const dn = (i?.display_name || "").toLowerCase();
      return univKey.length > 1 && (dn.includes(univKey) || (i?.country_code === "JP" && dn && false));
    });
    let score = 0;
    if (instMatch) score += 5;                    // 機関一致は強い証拠
    if (conceptHitsTop2 > 0) score += 3;          // 主分野が一致
    score += conceptHitsAny;                       // 追加の分野一致
    if ((a.works_count || 0) >= 3) score += 1;    // ある程度の業績量
    return { a, score, works: a.works_count || 0 };
  }).sort((x, y) => y.score - x.score || y.works - x.works);

  const best = scored[0];
  // 採用基準：機関一致 or （主分野一致 かつ 業績3件以上）。それ未満は誤同定リスクが高いため論文を出さない
  const strong = best && (best.score >= 5 || (best.score >= 4 && best.works >= 3));
  if (!best || !strong || best.works === 0) return { papers: [], confidence: "none" };
  const confidence: Enrichment["papersConfidence"] = best.score >= 5 ? "matched" : "name_only";
  const chosen = best.a;

  const aid = String(chosen.id).split("/").pop();
  const worksRes = await oa(`https://api.openalex.org/works?filter=author.id:${aid}&sort=cited_by_count:desc&per-page=6`);
  const works: any[] = worksRes?.results || [];
  const papers: Paper[] = works
    .filter((w) => w.title)
    .map((w) => ({
      title: String(w.title),
      year: w.publication_year ?? null,
      venue: w.primary_location?.source?.display_name || w.host_venue?.display_name || null,
      citations: w.cited_by_count ?? 0,
      url: w.doi ? String(w.doi) : (w.primary_location?.landing_page_url || w.id || null),
      authors: (w.authorships || []).slice(0, 4).map((a: any) => a.author?.display_name).filter(Boolean),
    }));
  return { papers, confidence: papers.length ? confidence : "none" };
}

// --- キーワード関連論文（著者を特定できない研究室向けフォールバック。全ページ掲出のため） ---
// 「本研究室の業績」とは主張せず、研究キーワードでOpenAlexを検索した関連論文として明示表示する。
function mapWork(w: any): Paper {
  return {
    title: String(w.title),
    year: w.publication_year ?? null,
    venue: null, // OpenAlexのvenueは不正確な例が多いため非表示（ADR-004）
    citations: w.cited_by_count ?? 0,
    url: w.doi ? String(w.doi) : (w.primary_location?.landing_page_url || w.id || null),
    authors: (w.authorships || []).slice(0, 4).map((a: any) => a.author?.display_name).filter(Boolean),
  };
}

async function fetchRelatedPapers(keywords: string[]): Promise<Paper[]> {
  const kws = keywords.filter((k) => k.length >= 2).slice(0, 3);
  if (!kws.length) return [];
  const res = await oa(`https://api.openalex.org/works?search=${encodeURIComponent(kws.join(" "))}&per-page=25`);
  const works: any[] = res?.results || [];
  // ノイズ除去：タイトルにいずれかのキーワード（または先頭4文字）を含むものだけ採用
  const stems = kws.flatMap((k) => (k.length > 4 ? [k, k.slice(0, 4)] : [k]));
  return works
    .filter((w) => w.title && stems.some((s) => String(w.title).includes(s)))
    .slice(0, 6)
    .map(mapWork);
}

// --- 統合（7日TTLキャッシュ。期限内は再生成ゼロ、期限切れは古い内容を即返しつつ裏で更新=SWR） ---
const refreshing = new Set<string>(); // 二重再生成防止

async function generate(lab: Lab): Promise<Enrichment> {
  const [aiGuide, paperResult] = await Promise.all([
    generateGuide(lab),
    lab.pi.name ? fetchPapers(lab.pi.name, lab.field_major, lab.university.name) : Promise.resolve({ papers: [], confidence: "none" as const }),
  ]);

  // 著者を高確度で特定できない場合は、キーワード関連論文へフォールバック（全ページ掲出・FR-ENRICH-02改）
  let papers = paperResult.papers;
  let confidence: Enrichment["papersConfidence"] = paperResult.confidence;
  if (papers.length === 0) {
    const related = await fetchRelatedPapers(lab.keywords);
    if (related.length) { papers = related; confidence = "related"; }
  }

  return {
    aiGuide,
    papers,
    papersConfidence: confidence,
    generatedAt: new Date().toISOString(),
    version: CACHE_VERSION,
  };
}

const isFresh = (e: Enrichment) => Date.now() - new Date(e.generatedAt).getTime() < TTL_MS;

export async function enrichLab(lab: Lab, opts: { force?: boolean } = {}): Promise<Enrichment> {
  let cached = cache[lab.id];
  const valid = cached && cached.version === CACHE_VERSION;

  // Older cache entries may predate the deterministic guide fallback. Repair
  // them in place so AI-disabled environments still return a complete guide.
  if (valid && !cached.aiGuide && !aiEnabled()) {
    cached = { ...cached, aiGuide: await generateGuide(lab) };
    cache[lab.id] = cached;
    persist();
  }

  // 期限内キャッシュ → そのまま配信（生成コストゼロ）
  if (!opts.force && valid && isFresh(cached)) return cached;

  // 期限切れキャッシュ → 即座に古い内容を返し、裏で再生成（ユーザーを待たせない）
  if (!opts.force && valid && !isFresh(cached)) {
    if (!refreshing.has(lab.id)) {
      refreshing.add(lab.id);
      void generate(lab)
        .then((e) => { if (e.aiGuide || e.papers.length) { cache[lab.id] = e; persist(); } })
        .finally(() => refreshing.delete(lab.id));
    }
    return cached;
  }

  // キャッシュなし → 同期生成
  const enrichment = await generate(lab);
  // 有意な生成のみ永続化。全失敗時はキャッシュせず次回再試行（AC-05）
  if (enrichment.aiGuide || enrichment.papers.length) { cache[lab.id] = enrichment; persist(); }
  return enrichment;
}

export function cachedEnrichment(labId: string): Enrichment | null {
  const c = cache[labId];
  return c && c.version === CACHE_VERSION ? c : null;
}
