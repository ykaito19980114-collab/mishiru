// データストア層（ADR-002：ローカルJSON既定・Supabaseは段階導入・失敗時JSONへ自動フォールバック）
// 学生の可変データは data/runtime/*.json にデバウンス書き込み。マスタは data/ から読み込み。
import fs from "fs";
import path from "path";
import type {
  Lab, ThemeCard, CardAction, CardActionRecord, LabActionRecord, InterestProfile,
  Claim, Lead, Report, Article, AppEvent,
  ResearchField, ResearchSociety, ResearchJournal, ResearchGraphEdge,
  DiscoveryActionRecord, QuestionProject, DiscoveryKind, ResearchResourceLegend,
} from "../shared/types";
import { cleanDisplayLabel, uniqueCleanLabels } from "../shared/text";
import { getSessionSection, hasRemoteSessionState, setSessionSection } from "./session-state";
import { serverSupabase } from "./supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const RUNTIME_DIR = path.join(DATA_DIR, "runtime");
const NORMALIZED_DIR = path.join(DATA_DIR, "normalized");
const SAMPLE_DATA_DIR = path.join(DATA_DIR, "mishiru-sample-normalized");
const USE_SAMPLE_DATASET = process.env.MISHIRU_DATASET === "sample";
const MASTER_LABS_FILE = USE_SAMPLE_DATASET ? path.join(SAMPLE_DATA_DIR, "labs.json") : path.join(DATA_DIR, "labs.json");
const MASTER_RESOURCES_DIR = USE_SAMPLE_DATASET ? SAMPLE_DATA_DIR : NORMALIZED_DIR;

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// --- マスタ（起動時ロード・不変） ---
const labs: Lab[] = readJson<Lab[]>(MASTER_LABS_FILE, []);
const cards: ThemeCard[] = readJson<ThemeCard[]>(path.join(DATA_DIR, "cards.json"), []);
const researchFields: ResearchField[] = readJson<ResearchField[]>(path.join(MASTER_RESOURCES_DIR, "fields.json"), []);
const researchSocieties: ResearchSociety[] = readJson<ResearchSociety[]>(path.join(MASTER_RESOURCES_DIR, "societies.json"), []);
const researchJournals: ResearchJournal[] = readJson<ResearchJournal[]>(path.join(MASTER_RESOURCES_DIR, "journals.json"), []);
const researchResourceLegends: ResearchResourceLegend[] = readJson<ResearchResourceLegend[]>(path.join(NORMALIZED_DIR, "resource-legends.json"), []);
const researchGraph = readJson<{ edges: ResearchGraphEdge[] }>(path.join(NORMALIZED_DIR, "research-graph.json"), { edges: [] });
for (const lab of labs) {
  lab.keywords = uniqueCleanLabels(lab.keywords || []);
  lab.department = cleanDisplayLabel(lab.department || "");
  lab.graduate_school = cleanDisplayLabel(lab.graduate_school || "");
  lab.major = cleanDisplayLabel(lab.major || "");
}
for (const card of cards) {
  card.keywords = uniqueCleanLabels(card.keywords || []);
}

// --- デモ用「公認研究室」ページ（FR-LAB-01の全項目が埋まった表示例）を1件注入 ---
// 実データは公開情報のみ（sectionsはnull=未確認）だが、教授営業の見本として完成形を1つ用意する。
import { DEMO_LAB } from "./demo-lab";
if (!labs.find((l) => l.id === DEMO_LAB.id)) labs.unshift(DEMO_LAB);

const labById = new Map(labs.map((l) => [l.id, l]));
const cardById = new Map(cards.map((c) => [c.id, c]));
const fieldById = new Map(researchFields.map((f) => [f.id, f]));
const societyById = new Map(researchSocieties.map((s) => [s.id, s]));
const journalById = new Map(researchJournals.map((j) => [j.id, j]));

// --- 検索インデックス（起動時に一度だけ小文字化。20k件でも毎リクエストのlowerを避ける NFR-PF-01）---
const searchText = new Map<string, string>();
for (const l of labs) {
  searchText.set(l.id, `${l.name} ${l.pi.name} ${l.department} ${l.university.name} ${l.keywords.join(" ")} ${(l.sourceKeywords || []).join(" ")} ${(l.researchQuestions || []).join(" ")} ${l.sections?.research_summary || ""}`.toLowerCase());
}
// 公開・非デモの研究室（一覧/検索の母集団。起動時に確定）
const publicLabsList = labs.filter((l) => (l.status === "published" || l.status === "claimed") && !l.is_demo);
const resourceText = new Map<string, string>();
for (const f of researchFields) {
  resourceText.set(f.id, `${f.nameJa} ${f.nameEn} ${f.fullPath} ${f.definition} ${f.beginnerDescription || ""} ${f.researchPurpose || ""} ${(f.researchObjects || []).join(" ")} ${(f.representativeThemes || []).join(" ")} ${f.coordinate} ${(f.questions || []).join(" ")} ${f.disciplines.join(" ")} ${f.domesticSocieties.join(" ")} ${f.internationalSocieties.join(" ")} ${f.domesticJournals.join(" ")} ${f.internationalJournals.join(" ")} ${(f.sourceKeywords || []).join(" ")}`.toLowerCase());
}
for (const s of researchSocieties) {
  resourceText.set(s.id, `${s.name} ${s.nameEn || ""} ${s.kind} ${s.description} ${s.beginnerDescription || ""} ${(s.questions || []).join(" ")} ${s.disciplines.join(" ")} ${s.relatedFields.join(" ")} ${s.kingdom} ${s.division} ${s.memberCountEstimate} ${s.memberCountNote} ${s.activityLevel} ${s.fieldPosition} ${s.accessibility} ${s.meetingInfo || ""} ${(s.sourceKeywords || []).join(" ")}`.toLowerCase());
}
for (const j of researchJournals) {
  resourceText.set(j.id, `${j.name} ${j.nameEn || ""} ${j.kind} ${j.description} ${j.beginnerDescription || ""} ${(j.questions || []).join(" ")} ${j.disciplines.join(" ")} ${j.relatedFields.join(" ")} ${j.kingdom} ${j.division} ${j.publisher} ${j.foundedYear} ${j.frequency} ${j.activityLevel} ${j.peerReview} ${j.articleTypes} ${j.languages} ${j.openAccess} ${j.beginnerReadability} ${j.publicationPosition} ${j.submissionAccessibility} ${(j.sourceKeywords || []).join(" ")}`.toLowerCase());
}

// 研究室規模の判定（member_count → 1/2-3/4+）
const sizeBucket = (n: number): "1" | "2-3" | "4+" => (n <= 1 ? "1" : n <= 3 ? "2-3" : "4+");
const splitValues = (value?: string) => (value || "").split(",").map((v) => v.trim()).filter(Boolean);
const matchesAny = (selected: string | undefined, actual: string | null | undefined) => {
  const values = splitValues(selected);
  return values.length === 0 || (!!actual && values.includes(actual));
};
const includesQuery = (id: string, q: string) => (resourceText.get(id) || "").includes(q.toLowerCase());
const matchesResourceFilter = (actual: string, selected?: string) => {
  const values=splitValues(selected); if(!values.length)return true;
  const actualValues=splitValues(actual); return values.some((value)=>actual===value||actualValues.includes(value)||actual.includes(value));
};
const uniqueOptions = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));

function scoreResourceText(id: string, terms: string[]) {
  const text = resourceText.get(id) || "";
  return terms.reduce((score, term) => score + (term && text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

export interface LabFilter {
  q?: string; univ?: string; field?: string; region?: string; prefecture?: string;
  type?: string; piTitle?: string; size?: string; major?: string; hasUrl?: string; tag?: string;
}

function applyFilters(list: Lab[], f: LabFilter): Lab[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((l) => {
    if (q && !(searchText.get(l.id) || "").includes(q)) return false;
    if (f.univ && l.university.name !== f.univ) return false;
    if (!matchesAny(f.field, l.field_major)) return false;
    if (f.tag && !l.keywords.includes(f.tag) && l.field_major !== f.tag) return false;
    if (!matchesAny(f.region, l.university.region)) return false;
    if (!matchesAny(f.prefecture, l.university.prefecture)) return false;
    if (!matchesAny(f.type, l.university_type)) return false;
    if (f.piTitle && l.pi.title !== f.piTitle) return false;
    if (f.major && !l.major.includes(f.major)) return false;
    if (!matchesAny(f.size, sizeBucket(l.member_count))) return false;
    if (f.hasUrl === "true" && !l.has_url) return false;
    if (f.hasUrl === "false" && l.has_url) return false;
    return true;
  });
}

// --- ランタイム（可変・デバウンス書き込み） ---
interface RuntimeShape {
  cardActions: CardActionRecord[];
  labActions: LabActionRecord[]; // 研究室カードの評価（ADR-005）
  discoveryActions: DiscoveryActionRecord[];
  questionProjects: Record<string, QuestionProject>;
  profiles: Record<string, InterestProfile>;
  claims: Claim[];
  leads: Lead[];
  reports: Report[];
  articles: Article[];
  events: AppEvent[];
}
const RUNTIME_FILE = path.join(RUNTIME_DIR, USE_SAMPLE_DATASET ? "store.sample.json" : "store.json");
const runtime: RuntimeShape = readJson<RuntimeShape>(RUNTIME_FILE, {
  cardActions: [], labActions: [], discoveryActions: [], questionProjects: {}, profiles: {}, claims: [], leads: [], reports: [], articles: [], events: [],
});
runtime.labActions ||= []; // 旧ランタイムファイルとの互換
runtime.discoveryActions ||= [];
runtime.questionProjects ||= {};

let writeTimer: NodeJS.Timeout | null = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime), "utf-8");
    } catch (e) {
      console.error("[store] persist failed:", e);
    }
  }, 400);
}

function mutableRuntime(sessionId?: string): RuntimeShape {
  if (!hasRemoteSessionState(sessionId)) return runtime;
  return getSessionSection<RuntimeShape>("runtime", {
    cardActions: [], labActions: [], discoveryActions: [], questionProjects: {}, profiles: {},
    claims: [], leads: [], reports: [], articles: [], events: [],
  });
}

function persistMutable(state: RuntimeShape) {
  if (hasRemoteSessionState()) setSessionSection("runtime", state);
  else persist();
}

interface ClaimRow {
  id: string; type: string; lab_id: string | null; lab_name: string | null;
  name: string; affiliation: string | null; email: string; message: string | null;
  evidence_url: string | null; status: string; note: string | null;
  created_at: string; updated_at: string;
}
function claimToRow(c: Claim): ClaimRow {
  return {
    id: c.id, type: c.type, lab_id: c.labId, lab_name: c.labName,
    name: c.name, affiliation: c.affiliation || null, email: c.email, message: c.message || null,
    evidence_url: c.evidenceUrl ?? null, status: c.status, note: c.note ?? null,
    created_at: c.createdAt, updated_at: c.updatedAt,
  };
}
function rowToClaim(r: ClaimRow): Claim {
  return {
    id: r.id, type: r.type as Claim["type"], labId: r.lab_id, labName: r.lab_name,
    name: r.name, affiliation: r.affiliation || "", email: r.email, message: r.message || "",
    evidenceUrl: r.evidence_url ?? undefined, status: r.status as Claim["status"], note: r.note ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ============ マスタ参照 ============
export const store = {
  // labs
  allLabs: () => labs,
  publicLabs: () => labs.filter((l) => l.status === "published" || l.status === "claimed"),
  publicNonDemo: () => publicLabsList,
  labById: (id: string) => labById.get(id) || null,
  labsByArea: (areas: string[]) =>
    publicLabsList.filter((l) => l.area_tags.some((t) => areas.includes(t))),

  // フィルタ検索（20k件対応。docs/03 §6 /api/labs）
  searchLabs: (f: LabFilter) => applyFilters(publicLabsList, f),

  // ============ research resources（Excel由来。研究領域・学会・ジャーナル） ============
  allResearchFields: () => researchFields,
  allResearchSocieties: () => researchSocieties,
  allResearchJournals: () => researchJournals,
  researchResourceLegends: () => researchResourceLegends,
  researchGraph: () => researchGraph,
  researchResourceSummary() {
    return {
      dataset: USE_SAMPLE_DATASET ? "mishiru-sample" : "default",
      fields: researchFields.length,
      societies: researchSocieties.length,
      journals: researchJournals.length,
      graphEdges: researchGraph.edges.length,
    };
  },
  fieldById: (id: string) => fieldById.get(id) || null,
  societyById: (id: string) => societyById.get(id) || null,
  journalById: (id: string) => journalById.get(id) || null,
  researchResourceFacets() {
    return {
      societies: {
        activityLevels: uniqueOptions(researchSocieties.map((item) => item.activityLevel)),
        fieldPositions: uniqueOptions(researchSocieties.map((item) => item.fieldPosition)),
        accessibility: uniqueOptions(researchSocieties.map((item) => item.accessibility)),
      },
      journals: {
        publishers: uniqueOptions(researchJournals.map((item) => item.publisher)),
        activityLevels: uniqueOptions(researchJournals.map((item) => item.activityLevel)),
        peerReview: uniqueOptions(researchJournals.map((item) => item.peerReview)),
        articleTypes: uniqueOptions(researchJournals.map((item) => item.articleTypes)),
        languages: uniqueOptions(researchJournals.map((item) => item.languages)),
        openAccess: uniqueOptions(researchJournals.map((item) => item.openAccess)),
        readability: uniqueOptions(researchJournals.map((item) => item.beginnerReadability)),
        positions: uniqueOptions(researchJournals.map((item) => item.publicationPosition)),
        submission: uniqueOptions(researchJournals.map((item) => item.submissionAccessibility)),
      },
    };
  },
  searchResearchResources(q: string, limit = 12, filters: Record<string, string> = {}) {
    const query = q.trim().toLowerCase();
    const hasQuery = query.length > 0;
    const rank = (id: string, name: string) => (name.toLowerCase() === query ? 30 : name.toLowerCase().includes(query) ? 12 : 0) + (includesQuery(id, query) ? 1 : 0);
    const fields = researchFields
      .filter((f) => !hasQuery || includesQuery(f.id, query))
      .sort((a, b) => rank(b.id, b.nameJa) - rank(a.id, a.nameJa))
      .slice(0, limit);
    const societies = researchSocieties
      .filter((s) => (!hasQuery || includesQuery(s.id, query))
        && matchesResourceFilter(s.activityLevel, filters.societyActivity)
        && matchesResourceFilter(s.fieldPosition, filters.societyPosition)
        && matchesResourceFilter(s.accessibility, filters.societyAccessibility))
      .sort((a, b) => rank(b.id, b.name) - rank(a.id, a.name))
      .slice(0, limit);
    const journals = researchJournals
      .filter((j) => (!hasQuery || includesQuery(j.id, query))
        && matchesResourceFilter(j.publisher, filters.journalPublisher)
        && matchesResourceFilter(j.activityLevel, filters.journalActivity)
        && matchesResourceFilter(j.peerReview, filters.journalPeerReview)
        && matchesResourceFilter(j.articleTypes, filters.journalArticleType)
        && matchesResourceFilter(j.languages, filters.journalLanguage)
        && matchesResourceFilter(j.openAccess, filters.journalOpenAccess)
        && matchesResourceFilter(j.beginnerReadability, filters.journalReadability)
        && matchesResourceFilter(j.publicationPosition, filters.journalPosition)
        && matchesResourceFilter(j.submissionAccessibility, filters.journalSubmission))
      .sort((a, b) => rank(b.id, b.name) - rank(a.id, a.name))
      .slice(0, limit);
    return { fields, societies, journals };
  },
  relatedResearchResources(terms: string[], limit = 6) {
    const cleaned = terms.map((t) => t.trim()).filter(Boolean).slice(0, 12);
    const score = (id: string) => scoreResourceText(id, cleaned);
    const fields = researchFields.map((item) => ({ item, score: score(item.id) })).filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.item);
    const societies = researchSocieties.map((item) => ({ item, score: score(item.id) })).filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.item);
    const journals = researchJournals.map((item) => ({ item, score: score(item.id) })).filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.item);
    return { fields, societies, journals };
  },
  resourceByKind(kind: DiscoveryKind, id: string) {
    if (kind === "field") return fieldById.get(id) || null;
    if (kind === "society") return societyById.get(id) || null;
    if (kind === "journal") return journalById.get(id) || null;
    return null;
  },

  // ファセット（各フィルタ値の件数。全件から集計）
  facets() {
    const field: Record<string, number> = {}, region: Record<string, number> = {}, type: Record<string, number> = {};
    for (const l of publicLabsList) {
      field[l.field_major] = (field[l.field_major] || 0) + 1;
      if (l.university.region) region[l.university.region] = (region[l.university.region] || 0) + 1;
      if (l.university_type) type[l.university_type] = (type[l.university_type] || 0) + 1;
    }
    return { field, region, type };
  },

  // 大学一覧（マスタ。件数・地域・設置区分つき）
  universities() {
    const map = new Map<string, { name: string; prefecture: string; region: string; type: string | null; count: number }>();
    for (const l of publicLabsList) {
      const e = map.get(l.university.name) ||
        { name: l.university.name, prefecture: l.university.prefecture, region: l.university.region, type: l.university_type, count: 0 };
      e.count++;
      map.set(l.university.name, e);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  },

  // 都道府県一覧（地域→都道府県の2段フィルタ用）
  prefecturesByRegion(region: string) {
    const set = new Set<string>();
    for (const l of publicLabsList) if (l.university.region === region && l.university.prefecture) set.add(l.university.prefecture);
    return Array.from(set);
  },

  // cards
  allCards: () => cards,
  cardById: (id: string) => cardById.get(id) || null,

  // ============ card_actions（冪等 AC-10） ============
  addCardAction(rec: CardActionRecord): { created: boolean } {
    const state = mutableRuntime(rec.sessionId);
    if (state.cardActions.find((a) => a.actionId === rec.actionId)) return { created: false };
    // 同一 session×card は最新の action で上書き（保存の付け外し等）
    const idx = state.cardActions.findIndex((a) => a.sessionId === rec.sessionId && a.cardId === rec.cardId);
    if (idx >= 0) state.cardActions[idx] = rec;
    else state.cardActions.push(rec);
    persistMutable(state);
    return { created: true };
  },
  actionsBySession: (sessionId: string) => mutableRuntime(sessionId).cardActions.filter((a) => a.sessionId === sessionId),
  evaluatedCardIds: (sessionId: string) =>
    new Set(mutableRuntime(sessionId).cardActions.filter((a) => a.sessionId === sessionId).map((a) => a.cardId)),

  // ============ lab_actions（研究室カードの評価。冪等・ADR-005） ============
  addLabAction(rec: LabActionRecord): { created: boolean } {
    const state = mutableRuntime(rec.sessionId);
    if (state.labActions.find((a) => a.actionId === rec.actionId)) return { created: false };
    if (rec.action === "skip" || rec.action === "not_fit") {
      state.labActions = state.labActions.filter((a) => !(a.sessionId === rec.sessionId && a.labId === rec.labId));
      state.labActions.push(rec);
    } else {
      state.labActions = state.labActions.filter((a) => !(a.sessionId === rec.sessionId && a.labId === rec.labId && (a.action === "skip" || a.action === "not_fit")));
      const idx = state.labActions.findIndex((a) => a.sessionId === rec.sessionId && a.labId === rec.labId && a.action === rec.action);
      if (idx >= 0) state.labActions[idx] = rec;
      else state.labActions.push(rec);
    }
    persistMutable(state);
    return { created: true };
  },
  labActionsBySession: (sessionId: string) => mutableRuntime(sessionId).labActions.filter((a) => a.sessionId === sessionId),
  removeLabAction(sessionId: string, labId: string, action: CardAction): boolean {
    const state = mutableRuntime(sessionId); const before = state.labActions.length;
    state.labActions = state.labActions.filter((a) => !(a.sessionId === sessionId && a.labId === labId && a.action === action));
    if (state.labActions.length !== before) persistMutable(state);
    return state.labActions.length !== before;
  },
  evaluatedLabIds: (sessionId: string) =>
    new Set(mutableRuntime(sessionId).labActions.filter((a) => a.sessionId === sessionId).map((a) => a.labId)),
  savedLabs(sessionId: string): Lab[] {
    return mutableRuntime(sessionId).labActions
      .filter((a) => a.sessionId === sessionId && a.action === "save")
      .map((a) => labById.get(a.labId))
      .filter((l): l is Lab => !!l);
  },
  likedLabs(sessionId: string): Lab[] {
    return mutableRuntime(sessionId).labActions
      .filter((a) => a.sessionId === sessionId && a.action === "like")
      .map((a) => labById.get(a.labId))
      .filter((l): l is Lab => !!l);
  },
  // 評価総数（テーマ＋研究室。プロファイル閾値の分母）
  totalEvaluations: (sessionId: string) =>
    mutableRuntime(sessionId).cardActions.filter((a) => a.sessionId === sessionId).length +
    mutableRuntime(sessionId).labActions.filter((a) => a.sessionId === sessionId).length,
  // 興味分野スコア（デッキ選定用の共有シグナル。正の分のみ）
  interestAreaScore(sessionId: string): Record<string, number> {
    const W: Record<string, number> = { save: 3, important: 4, deep: 2, like: 2, unclear: 1, skip: -1, not_fit: -2 };
    const score: Record<string, number> = {};
    const state = mutableRuntime(sessionId);
    for (const a of state.cardActions.filter((x) => x.sessionId === sessionId)) {
      const card = cardById.get(a.cardId);
      if (!card) continue;
      const w = W[a.action] || 0;
      for (const t of card.area_tags) score[t] = (score[t] || 0) + w;
    }
    for (const a of state.labActions.filter((x) => x.sessionId === sessionId)) {
      const lab = labById.get(a.labId);
      if (!lab) continue;
      const w = W[a.action] || 0;
      for (const t of lab.area_tags) score[t] = (score[t] || 0) + w;
    }
    for (const k of Object.keys(score)) if (score[k] <= 0) delete score[k];
    return score;
  },

  // ============ discovery_actions（混合デッキの反応） ============
  addDiscoveryAction(rec: DiscoveryActionRecord): { created: boolean } {
    const state = mutableRuntime(rec.sessionId);
    if (state.discoveryActions.find((a) => a.actionId === rec.actionId)) return { created: false };
    const idx = state.discoveryActions.findIndex((a) => a.sessionId === rec.sessionId && a.itemId === rec.itemId && a.itemKind === rec.itemKind);
    if (idx >= 0) state.discoveryActions[idx] = rec;
    else state.discoveryActions.push(rec);
    persistMutable(state);
    return { created: true };
  },
  discoveryActionsBySession: (sessionId: string) => mutableRuntime(sessionId).discoveryActions.filter((a) => a.sessionId === sessionId),
  removeDiscoveryAction(sessionId: string, itemId: string, itemKind: string): boolean {
    const state = mutableRuntime(sessionId); const before = state.discoveryActions.length;
    state.discoveryActions = state.discoveryActions.filter((a) => !(a.sessionId === sessionId && a.itemId === itemId && a.itemKind === itemKind));
    if (state.discoveryActions.length !== before) persistMutable(state);
    return state.discoveryActions.length !== before;
  },

  // ============ question_projects（問い画面の作業台） ============
  saveQuestionProject(project: QuestionProject) {
    const state = mutableRuntime(project.sessionId); state.questionProjects[project.sessionId] = project;
    persistMutable(state);
    return project;
  },
  getQuestionProject: (sessionId: string) => mutableRuntime(sessionId).questionProjects[sessionId] || null,

  // ============ interest_profiles ============
  saveProfile(p: InterestProfile) { const state=mutableRuntime(p.sessionId); state.profiles[p.sessionId] = p; persistMutable(state); },
  getProfile: (sessionId: string) => mutableRuntime(sessionId).profiles[sessionId] || null,

  // ============ events（計測 FR-EVT-01） ============
  addEvents(evts: AppEvent[]) { runtime.events.push(...evts); persist(); },
  allEvents: () => runtime.events,

  // ============ claims（個人情報：Supabase設定時はmishiru_claims、未設定時のみローカルJSON。ADR-002） ============
  async addClaim(c: Claim) {
    const supabase = serverSupabase();
    if (supabase) {
      const { error } = await supabase.from("mishiru_claims").insert(claimToRow(c));
      if (error) throw new Error(`CLAIM_SAVE_FAILED:${error.message}`);
      return;
    }
    runtime.claims.unshift(c);
    persist();
  },
  async allClaims(): Promise<Claim[]> {
    const supabase = serverSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("mishiru_claims").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(`CLAIM_LIST_FAILED:${error.message}`);
      return (data || []).map(rowToClaim);
    }
    return runtime.claims;
  },
  async claimById(id: string): Promise<Claim | null> {
    const supabase = serverSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("mishiru_claims").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`CLAIM_GET_FAILED:${error.message}`);
      return data ? rowToClaim(data) : null;
    }
    return runtime.claims.find((c) => c.id === id) || null;
  },
  async updateClaim(id: string, patch: Partial<Claim>): Promise<Claim | null> {
    const supabase = serverSupabase();
    if (supabase) {
      const updatedAt = new Date().toISOString();
      const row: Record<string, unknown> = { updated_at: updatedAt };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.note !== undefined) row.note = patch.note;
      const { data, error } = await supabase.from("mishiru_claims").update(row).eq("id", id).select().maybeSingle();
      if (error) throw new Error(`CLAIM_UPDATE_FAILED:${error.message}`);
      return data ? rowToClaim(data) : null;
    }
    const c = runtime.claims.find((x) => x.id === id);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: new Date().toISOString() });
    persist();
    return c;
  },

  // ============ leads ============
  addLead(l: Lead) { runtime.leads.unshift(l); persist(); },
  allLeads: () => runtime.leads,
  updateLead(id: string, patch: Partial<Lead>) {
    const l = runtime.leads.find((x) => x.id === id);
    if (!l) return null;
    Object.assign(l, patch, { updatedAt: new Date().toISOString() });
    persist();
    return l;
  },

  // ============ reports ============
  addReport(r: Report) { runtime.reports.unshift(r); persist(); },
  allReports: () => runtime.reports,
  reportById: (id: string) => runtime.reports.find((r) => r.id === id) || null,
  updateReport(id: string, patch: Partial<Report>) {
    const r = runtime.reports.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    persist();
    return r;
  },

  // ============ articles ============
  addArticle(a: Article) { runtime.articles.unshift(a); persist(); },
  allArticles: () => runtime.articles,
  updateArticle(id: string, patch: Partial<Article>) {
    const a = runtime.articles.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, patch, { updatedAt: new Date().toISOString() });
    persist();
    return a;
  },

  // ============ セッションデータ削除（AC-06 / FR-PRIV-01） ============
  deleteSession(sessionId: string): { actions: number; labActions: number; discoveryActions: number; profile: boolean; events: number } {
    const before = runtime.cardActions.length;
    runtime.cardActions = runtime.cardActions.filter((a) => a.sessionId !== sessionId);
    const labBefore = runtime.labActions.length;
    runtime.labActions = runtime.labActions.filter((a) => a.sessionId !== sessionId);
    const profile = !!runtime.profiles[sessionId];
    delete runtime.profiles[sessionId];
    const discoveryBefore = runtime.discoveryActions.length;
    runtime.discoveryActions = runtime.discoveryActions.filter((a) => a.sessionId !== sessionId);
    delete runtime.questionProjects[sessionId];
    const evBefore = runtime.events.length;
    runtime.events = runtime.events.filter((e) => e.sessionId !== sessionId);
    persist();
    return {
      actions: before - runtime.cardActions.length,
      labActions: labBefore - runtime.labActions.length,
      profile,
      discoveryActions: discoveryBefore - runtime.discoveryActions.length,
      events: evBefore - runtime.events.length,
    };
  },
};
