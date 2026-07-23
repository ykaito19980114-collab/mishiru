// APIクライアント（docs/03 §6）。オフライン時はキャッシュ/キューで体感を壊さない（FR-ERR-01/02）。
import { getSessionId, newActionId, enqueueAction } from "./session";
import { authHeaders } from "./auth";
import type {
  ThemeCard, Lab, InterestProfile, CardAction,
  DiscoveryCard, ResearchField, ResearchSociety, ResearchJournal, QuestionProject,
  ResearchResourceLegend,
} from "../../shared/types";
import type {
  ConsultationAsset, ConsultationDocumentDraft, ConsultationDocumentOptions, ConsultationMemo, InterestAnalysis,
  NormalizedResearchMaterial, QuestionFreeInput, ResearchProject, ResearchProjectCover, RQCandidate, Step1Response, Step2Response,
} from "../../shared/research-project";

export class ApiError extends Error { constructor(message: string, public code = "HTTP_ERROR", public status = 0) { super(message); } }
async function headers(json = false, actionId?: string) { return { ...(json ? { "Content-Type": "application/json" } : {}), ...(await authHeaders()), ...(actionId ? { "x-mishiru-action-id": actionId } : {}) }; }
async function ensure(res: Response) {
  const body = !res.ok ? await res.json().catch(() => ({})) : null;
  if (res.status === 403 && body?.error?.code === "ACCOUNT_REQUIRED") window.dispatchEvent(new CustomEvent("mishiru:account-required", { detail: body.access }));
  window.dispatchEvent(new CustomEvent("mishiru:access-updated"));
  if (!res.ok) throw new ApiError(body?.error?.message || `HTTP ${res.status}`, body?.error?.code, res.status);
}
async function get<T>(url: string, valueAction = false): Promise<T> {
  const res = await fetch(url, { headers: await headers(false, valueAction ? newActionId() : undefined) });
  await ensure(res);
  return res.json();
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const actionId = (body as { actionId?: string } | null)?.actionId || newActionId();
  const res = await fetch(url, { method: "POST", headers: await headers(true, actionId), body: JSON.stringify(body) });
  await ensure(res);
  return res.json();
}
async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: await headers(true), body: JSON.stringify(body) });
  await ensure(res);
  return res.json();
}
async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE", headers: await headers() });
  await ensure(res);
  return res.json();
}

export interface LabWithReasons extends Lab { matchReasons?: string[] }
export interface Candidate { lab: Lab; reasons: string[]; matchedCardIds: string[] }

// プロフィール拡充（SCR-03 v2）
export interface ProfileExtras {
  stats: { evaluated: number; liked: number; saved: number; deep: number };
  likedLabs: Lab[];
  savedLabs: Lab[];
  deepLabs: Lab[];
  questions: { text: string; labId: string; labName: string }[];
  areaBreakdown: { area: string; label: string; share: number; labCount: number }[];
}

export interface AiGuide { overview: string; questions: string[]; methods: string[]; fit: string; careers: string; appeal: string; generatedBy?: "ai" | "template" }
export interface Paper { title: string; year: number | null; venue: string | null; citations: number; url: string | null; authors: string[] }
export interface Enrichment { aiGuide: AiGuide | null; papers: Paper[]; papersConfidence: "matched" | "name_only" | "related" | "none"; generatedAt: string; version: number }

// 研究室カードデッキのレスポンス（モード別）
export interface LabCardDeckResponse {
  cards: LabCardDeckItem[];
  threshold: number;
  evaluatedCount: number;
  mode: "default" | "search" | "profile";
  // search
  interpreted?: { fields: string[]; fieldLabels: string[]; areas: string[]; areaLabels: string[]; keywords: string[] };
  by?: "llm" | "keyword";
  totalMatched?: number;
  // profile
  profileReady?: boolean;
  needed?: number;
  profileTop?: string[];
  profileQuery?: string;
}

// 研究室カード（見つけるデッキ）
export interface LabCardDeckItem {
  labId: string; title: string; hook: string; summary: string;
  questions: string[]; // この研究室が扱う問い（最大3）
  why: string;          // この研究室のテーマのおもしろさ
  generatedBy: "llm" | "template";
  lab: {
    id: string; name: string; university: { name: string; prefecture: string; region: string };
    major: string; department: string; field_major: string; keywords: string[];
    pi: { name: string; title: string }; member_count: number; has_url: boolean;
  };
}

export interface DiscoveryDeckResponse {
  cards: DiscoveryCard[];
  mode: "today" | "search";
  summary: { fields: number; societies: number; journals: number; graphEdges: number };
}

export interface ResearchResourceResponse {
  query: string;
  summary: { fields: number; societies: number; journals: number; graphEdges: number };
  fields: ResearchField[];
  societies: ResearchSociety[];
  journals: ResearchJournal[];
  labCandidates?: Record<string, Lab[]>;
  legends?: ResearchResourceLegend[];
  facets?: {
    societies: { activityLevels: string[]; fieldPositions: string[]; accessibility: string[] };
    journals: { publishers: string[]; activityLevels: string[]; peerReview: string[]; articleTypes: string[]; languages: string[]; openAccess: string[]; readability: string[]; positions: string[]; submission: string[] };
  };
}

export interface QuestionProjectResponse {
  project: QuestionProject;
  related: { fields: ResearchField[]; societies: ResearchSociety[]; journals: ResearchJournal[] };
  candidates: Candidate[];
}

export const api = {
  meta: () => get<{ genres: { id: string; label: string }[]; areas: { id: string; label: string }[]; profileThreshold: number }>("/api/meta"),
  health: () => get<any>("/api/health"),

  getCards: (genre: string | null, batch = 10) =>
    get<{ cards: ThemeCard[]; threshold: number }>(`/api/cards?sessionId=${getSessionId()}&batch=${batch}${genre ? `&genre=${genre}` : ""}`),

  getCard: (id: string) =>
    get<{ card: ThemeCard; relatedLabs: { lab: Lab; reasons: string[] }[]; nearbyCards: ThemeCard[] }>(`/api/cards/${id}?sessionId=${getSessionId()}`),

  // カード評価（楽観的更新前提。失敗時はキューへ FR-ERR-02）
  async act(cardId: string, action: CardAction): Promise<{ evaluatedCount: number; readyForProfile: boolean } | null> {
    const payload = { actionId: newActionId(), sessionId: getSessionId(), cardId, action };
    try {
      return await post("/api/card-actions", payload);
    } catch (error) {
      if (error instanceof ApiError && error.code === "ACCOUNT_REQUIRED") throw error;
      enqueueAction(payload);
      return null;
    }
  },

  getActions: () => get<{ actions: { cardId: string; action: CardAction }[] }>(`/api/card-actions?sessionId=${getSessionId()}`),

  // 研究室カードデッキ（見つけるタブ。ADR-005。AI生成・7日サーバーキャッシュ）
  // opts.q=AI意味検索で絞込 / opts.mode="profile"=興味の傾向に沿う
  getLabCards: (genre: string | null, batch = 8, opts: { q?: string; mode?: "profile" } = {}) => {
    const p = new URLSearchParams({ sessionId: getSessionId(), batch: String(batch) });
    if (opts.q) p.set("q", opts.q);
    else if (opts.mode) p.set("mode", opts.mode);
    else if (genre) p.set("genre", genre);
    return get<LabCardDeckResponse>(`/api/lab-cards?${p.toString()}`);
  },

  getDiscoveryCards: (batch = 16, q = "") => {
    const p = new URLSearchParams({ sessionId: getSessionId(), batch: String(batch) });
    if (q.trim()) p.set("q", q.trim());
    return get<DiscoveryDeckResponse>(`/api/discovery-cards?${p.toString()}`);
  },

  actOnDiscoveryItem: (item: DiscoveryCard, action: CardAction) => {
    const payload = { actionId: newActionId(), sessionId: getSessionId(), itemId: item.sourceId || item.id, itemKind: item.kind, action };
    return post<{ ok: boolean; duplicate: boolean; evaluatedCount: number }>("/api/discovery-actions", payload);
  },
  undoDiscoveryItemAction: (item: DiscoveryCard) => {
    const p = new URLSearchParams({ sessionId: getSessionId(), itemId: item.sourceId || item.id, itemKind: item.kind });
    return del<{ ok: boolean; removed: boolean; evaluatedCount: number }>(`/api/discovery-actions?${p.toString()}`);
  },

  getResearchResources: (q = "", limit = 12, filters: Record<string, string> = {}, terms: string[] = []) => {
    const p = new URLSearchParams({ q, limit: String(limit), ...filters });
    if (terms.length) p.set("terms", terms.filter((term) => term.trim().length >= 2).slice(0, 12).join("|"));
    return get<ResearchResourceResponse>(`/api/research-resources?${p.toString()}`);
  },

  getQuestionProject: () => get<QuestionProjectResponse>(`/api/question-project?sessionId=${getSessionId()}`),

  getQuestionMaterials: () => get<{ materials: NormalizedResearchMaterial[] }>(`/api/question-materials?sessionId=${getSessionId()}`),
  generateQuestionStep1: (payload: { sourceMode: "free_input" | "saved_items"; freeInput: QuestionFreeInput; materials: NormalizedResearchMaterial[] }) => post<{ step1: Step1Response; normalizedMaterials: NormalizedResearchMaterial[]; aiEnabled: boolean }>("/api/question-craft/step1", { ...payload, sessionId: getSessionId() }),
  generateQuestionStep2: (payload: { freeInput: QuestionFreeInput; selectedRq: RQCandidate; step1: Step1Response }) => post<{ step2: Step2Response; aiEnabled: boolean }>("/api/question-craft/step2", { ...payload, sessionId: getSessionId() }),
  adjustResearchText: (value: string, instruction: string, context = "") => post<{ value: string; aiEnabled: boolean }>("/api/question-craft/adjust", { sessionId: getSessionId(), value, instruction, context }),

  getProjects: () => get<{ projects: (ResearchProject & { memoCount?: number; assetCount?: number })[] }>(`/api/projects?sessionId=${getSessionId()}`),
  getProject: (id: string) => get<{ project: ResearchProject; memoCount: number }>(`/api/projects/${id}?sessionId=${getSessionId()}`),
  createProject: (payload: { displayTitle: string; subtitle?: string; status?: ResearchProject["status"]; sourceMode: ResearchProject["sourceMode"]; freeInput: QuestionFreeInput; materials: NormalizedResearchMaterial[]; step1Response: Step1Response; selectedRq: RQCandidate; step2Response: Step2Response; cover?: ResearchProjectCover; interestAnalysisId?: string }) => post<{ project: ResearchProject }>("/api/projects", { ...payload, sessionId: getSessionId() }),
  createQuickProject: (payload: { displayTitle: string; subtitle?: string; cover: ResearchProjectCover }) => post<{ project: ResearchProject }>("/api/projects/quick", { ...payload, sessionId: getSessionId() }),
  updateProject: (id: string, payload: Partial<ResearchProject>) => patch<{ project: ResearchProject }>(`/api/projects/${id}`, { ...payload, sessionId: getSessionId() }),
  deleteProject: (id: string) => del<{ ok: boolean }>(`/api/projects/${id}?sessionId=${getSessionId()}`),
  duplicateProject: (id: string, options: { includeMaterials?: boolean; includeMemos?: boolean; includeNextActions?: boolean; includeAssets?: boolean }) => post<{ project: ResearchProject }>(`/api/projects/${id}/duplicate`, { sessionId: getSessionId(), options }),
  createProjectVersion: (id: string, payload: Record<string, unknown>) => post<{ project: ResearchProject }>(`/api/projects/${id}/versions`, { ...payload, sessionId: getSessionId() }),
  updateProjectVersion: (id: string, versionId: string, payload: Record<string, unknown>) => patch<{ version: ResearchProject["versions"][number] }>(`/api/projects/${id}/versions/${versionId}`, { ...payload, sessionId: getSessionId() }),
  selectProjectVersion: (id: string, versionId: string) => post<{ project: ResearchProject }>(`/api/projects/${id}/versions/${versionId}/select`, { sessionId: getSessionId() }),
  regenerateProject: (id: string, payload: { versionName?: string; changeReason?: string; carryMemos?: boolean }) => post<{ project: ResearchProject }>(`/api/projects/${id}/regenerate`, { ...payload, sessionId: getSessionId() }),
  getProjectMemos: (id: string) => get<{ memos: ConsultationMemo[] }>(`/api/projects/${id}/memos?sessionId=${getSessionId()}`),
  createProjectMemo: (id: string, payload: Omit<ConsultationMemo, "id" | "sessionId" | "projectId" | "createdAt" | "updatedAt">) => post<{ memo: ConsultationMemo }>(`/api/projects/${id}/memos`, { ...payload, sessionId: getSessionId() }),
  updateProjectMemo: (id: string, memoId: string, payload: Partial<ConsultationMemo>) => patch<{ memo: ConsultationMemo }>(`/api/projects/${id}/memos/${memoId}`, { ...payload, sessionId: getSessionId() }),
  deleteProjectMemo: (id: string, memoId: string) => del<{ ok: boolean }>(`/api/projects/${id}/memos/${memoId}?sessionId=${getSessionId()}`),
  uploadProjectCoverImage: (id: string, payload: { dataUrl: string; fileName: string; kind?: "background"|"motif" }) => post<{ image: NonNullable<ResearchProjectCover["image"]> }>(`/api/projects/${id}/cover-image`, { ...payload, sessionId: getSessionId() }),

  getConsultationAssets: (id: string) => get<{ assets: ConsultationAsset[] }>(`/api/projects/${id}/assets?sessionId=${getSessionId()}`),
  previewConsultationAsset: (id: string, format: ConsultationAsset["format"], options: Partial<ConsultationDocumentOptions>) => post<{ draft: ConsultationDocumentDraft }>(`/api/projects/${id}/assets/preview`, { sessionId: getSessionId(), format, options }),
  generateConsultationAsset: (id: string, format: ConsultationAsset["format"], draft: ConsultationDocumentDraft) => post<{ asset: ConsultationAsset; project: ResearchProject }>(`/api/projects/${id}/assets`, { sessionId: getSessionId(), format, draft }),
  deleteConsultationAsset: (id: string, assetId: string) => del<{ ok: boolean }>(`/api/projects/${id}/assets/${assetId}?sessionId=${getSessionId()}`),
  consultationAssetDownloadUrl: (id: string, assetId: string) => `/api/projects/${id}/assets/${assetId}/download?sessionId=${encodeURIComponent(getSessionId())}`,

  getInterestAnalysis: () => get<{ analysis: InterestAnalysis | null; usage: { dailyAnalysisCount: number; planLimit: number | null; canAnalyze: boolean }; aiEnabled: boolean; serverMaterialCount: number; dataset: string }>(`/api/interest-analysis?sessionId=${getSessionId()}`),
  updateInterestAnalysis: (materials: NormalizedResearchMaterial[], excludedSourceIds: string[]) => post<{ analysis: InterestAnalysis; usage: { dailyAnalysisCount: number; planLimit: number | null; canAnalyze: boolean }; aiEnabled: boolean }>("/api/interest-analysis", { sessionId: getSessionId(), materials, excludedSourceIds }),

  async actOnLab(labId: string, action: CardAction): Promise<{ evaluatedCount: number; readyForProfile: boolean } | null> {
    const payload = { actionId: newActionId(), sessionId: getSessionId(), labId, action };
    try {
      return await post("/api/lab-card-actions", payload);
    } catch (error) {
      if (error instanceof ApiError && error.code === "ACCOUNT_REQUIRED") throw error;
      enqueueAction(payload);
      return null;
    }
  },
  undoLabAction: (labId: string, action: CardAction) => {
    const p = new URLSearchParams({ sessionId: getSessionId(), labId, action });
    return del<{ ok: boolean; removed: boolean; evaluatedCount: number }>(`/api/lab-card-actions?${p.toString()}`);
  },

  getProfile: () =>
    get<
      | { ready: false; evaluatedCount: number; needed: number; threshold: number; extras: ProfileExtras }
      | { ready: true; profile: InterestProfile; candidates: Candidate[]; extras: ProfileExtras; profileQuery: string }
    >(`/api/profile?sessionId=${getSessionId()}`),

  getSaved: () => get<{ saved: ThemeCard[]; deepDived: ThemeCard[]; likedLabs: Lab[]; savedLabs: Lab[]; discoveryItems?: { action: CardAction; kind: string; item: ResearchField | ResearchSociety | ResearchJournal; createdAt: string }[] }>(`/api/saved?sessionId=${getSessionId()}`),

  getLabs: (params: Record<string, string>) => {
    const qs = new URLSearchParams({ sessionId: getSessionId(), ...params }).toString();
    return get<{ data: LabWithReasons[]; total: number }>(`/api/labs?${qs}`);
  },
  getLab: (id: string) => get<{ lab: Lab; connectionReasons: string[] }>(`/api/labs/${id}?sessionId=${getSessionId()}`),
  getEnrichment: (id: string) => get<Enrichment>(`/api/labs/${id}/enrich`),

  smartSearch: (q: string, page = 1) =>
    get<{ interpreted: { fields: string[]; fieldLabels: string[]; areas: string[]; areaLabels: string[]; keywords: string[] }; by: "name" | "llm" | "keyword"; mode: "name" | "topic"; total: number; data: LabWithReasons[] }>(`/api/labs/smart?q=${encodeURIComponent(q)}&page=${page}&limit=24&sessionId=${encodeURIComponent(getSessionId())}`, true),

  getFilters: () => get<{ facets: { field: Record<string, number>; region: Record<string, number>; type: Record<string, number> }; universities: string[] }>("/api/filters"),
  getPrefectures: (region: string) => get<{ prefectures: string[] }>(`/api/prefectures?region=${encodeURIComponent(region)}`),

  getUniversities: () => get<{ universities: { name: string; prefecture: string; region: string; type: string | null; count: number }[] }>("/api/universities"),
  getUniversity: (name: string) => get<{ university: { name: string; prefecture: string; region: string; type: string | null; count: number }; labs: Lab[]; departments: { name: string; count: number }[] }>(`/api/universities/${encodeURIComponent(name)}`),

  getDepartments: (univ?: string) => get<{ departments: { key: string; university: string; department: string; count: number }[]; total: number }>(`/api/departments${univ ? `?univ=${encodeURIComponent(univ)}` : ""}`),
  getDepartment: (key: string) => get<{ university: string; department: string; labs: Lab[] }>(`/api/departments/${encodeURIComponent(key)}`),

  submitClaim: (body: Record<string, unknown>) => post<{ ok: boolean; id: string }>("/api/claims", body),

  deleteMe: async () => {
    const res = await fetch(`/api/me?sessionId=${encodeURIComponent(getSessionId())}`, { method: "DELETE", headers: await headers() });
    await ensure(res);
    return res.json() as Promise<{ ok: boolean }>;
  },

  logEvent: async (type: string, payload: Record<string, string | number | boolean> = {}) => {
    const sessionId = getSessionId();
    return fetch("/api/events", {
      method: "POST", headers: await headers(true),
      body: JSON.stringify({ sessionId, events: [{ type, payload }] }),
    }).catch(() => undefined);
  },
};
