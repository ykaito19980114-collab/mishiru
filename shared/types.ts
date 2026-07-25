// 共有型定義（docs/03 §5 データ仕様と同期）
import type { HookGenre } from "./taxonomy";

export type LabStatus =
  | "draft" | "review_requested" | "published" | "claimed"
  | "update_requested" | "hidden" | "archived";

export interface LabSource {
  label: string; // 公開ページでは「研究室ホームページ」を一次出典にする
  url: string;
}

export interface LabMember {
  name: string;
  title: string; // 教授/准教授/講師/助教/特任教授 等
}

export interface LabQuality {
  publicationLevel: "sourced" | "basic" | "review" | "hidden";
  contentLevel: "verified" | "sourced" | "basic";
  score: number;
  reviewStatus: "automated" | "manually_researched" | "needs_review";
  sourceKind: "lab_homepage" | "none";
  checkedAt: string;
  missingFields: string[];
  duplicateOf?: string;
  notes?: string[];
}

// FR-LAB-01 必須10項目。null = 「未確認」表示（空欄・非表示にしない）
export interface LabSections {
  research_summary: string | null;      // 研究内容（自前要約。本文転載禁止）
  student_themes: string[] | null;      // 学生テーマ例
  methods: string[] | null;             // 研究方法
  key_papers: { title: string; note?: string; url?: string }[] | null; // 主要論文
  daily_life: string | null;            // 日常
  mentoring: string | null;             // 指導体制
  careers: string | null;               // 進路
  fit: { suited: string; not_suited: string } | null; // 向いている/向いていない学生
  collaboration: string | null;         // 共同研究相談領域
}

import type { UnivType } from "./universities";
import type { FieldMajor } from "./fields";

export interface Lab {
  id: string;
  sourceNo?: string;
  sourceSheet?: string;
  name: string;
  university: { name: string; prefecture: string; region: string };
  university_type: UnivType | null; // 国立/公立/私立（大学マスタ由来）
  department: string;      // 学部・研究科・専攻（原文）
  graduate_school: string; // 研究科（派生：スペース前半）
  major: string;           // 専攻（派生：スペース後半）
  members: LabMember[];
  pi: LabMember;            // 主宰者（membersの先頭）
  member_count: number;    // 教員数（規模）
  keywords: string[];
  sourceKeywords?: string[]; // STSMPタグ生成前のExcel由来キーワード
  tags?: string[];           // STSMPタグ。Phase 2では空配列
  tag_generation_status?: "pending_STSMP_protocol" | string;
  area_tags: string[];      // taxonomy.RESEARCH_AREAS の id（カード⇄研究室マッチング用の細分）
  field_major: FieldMajor;  // 12大分類（フィルタ用）
  official_url: string | null;
  has_url: boolean;         // URL有無（営業リスト用）
  sources: LabSource[];     // 出典（FR-LAB-02）
  researchQuestions?: string[]; // Excel「扱う問い」。AI補完せず、存在する時だけ優先表示
  questions?: string[];     // import validator互換。研究室ではresearchQuestionsと同値
  sections: LabSections;
  status: LabStatus;
  verified: boolean;        // claimed（公認）で true
  confidence: "public_info" | "verified"; // 確度表示
  last_updated: string;     // YYYY-MM-DD
  is_demo?: boolean;        // 公認ページの表示例（一覧・マッチング対象外）
  quality?: LabQuality;
  rawSource?: Record<string, string>;
}

export type CardAction = "like" | "skip" | "deep" | "save" | "important" | "unclear" | "not_fit";

export type DiscoveryKind = "question" | "field" | "lab" | "society" | "journal" | "paper";

export interface ResearchField {
  id: string;
  sourceNo?: string;
  sourceSheet?: string;
  nameJa: string;
  nameEn: string;
  kingdom: string;
  division: string;
  className: string;
  orderName: string;
  family: string;
  species?: string;
  level: string;
  definition: string;
  beginnerDescription?: string;
  researchObjects?: string[];
  methods?: string[];
  researchPurpose?: string;
  representativeThemes?: string[];
  adjacentDifference?: string;
  evidenceSources?: { url: string; type: string }[];
  surveyedAt?: string;
  confidenceLevel?: string;
  needsReviewFlag?: string;
  coordinate: string;
  disciplines: string[];
  domesticSocieties: string[];
  internationalSocieties: string[];
  domesticJournals: string[];
  internationalJournals: string[];
  fullPath: string;
  questions: string[];
  sourceKeywords?: string[];
  tags?: string[];
  tag_generation_status?: "pending_STSMP_protocol" | string;
}

export interface ResearchSociety {
  id: string;
  sourceNo?: string;
  sourceSheet?: string;
  name: string;
  nameEn?: string;
  kind: string;
  kingdom: string;
  division: string;
  className: string;
  orderName: string;
  family: string;
  disciplines: string[];
  relatedFields: string[];
  url: string;
  urlType: string;
  connectionStatus: "official" | "editorial" | "candidate" | "unverified";
  description: string;
  beginnerDescription?: string;
  questions: string[];
  sourceUrl: string;
  memberCountEstimate: string;
  memberCountNote: string;
  memberCountAsOf: string;
  activityLevel: string;
  fieldPosition: string;
  accessibility: string;
  meetingInfo?: string;
  evidenceNote: string;
  verificationStatus: string;
  sourceKeywords?: string[];
  tags?: string[];
  tag_generation_status?: "pending_STSMP_protocol" | string;
}

export interface ResearchJournal {
  id: string;
  sourceNo?: string;
  sourceSheet?: string;
  name: string;
  nameEn?: string;
  kind: string;
  kingdom: string;
  division: string;
  className: string;
  orderName: string;
  family: string;
  disciplines: string[];
  relatedFields: string[];
  url: string;
  urlType: string;
  connectionStatus: "official" | "editorial" | "candidate" | "unverified";
  description: string;
  beginnerDescription?: string;
  questions: string[];
  sourceUrl: string;
  publisher: string;
  foundedYear: string;
  frequency: string;
  activityLevel: string;
  peerReview: string;
  articleTypes: string;
  languages: string;
  openAccess: string;
  beginnerReadability: string;
  publicationPosition: string;
  submissionAccessibility: string;
  indexing: string;
  authorGuidelinesUrl: string;
  evidenceNote: string;
  verificationStatus: string;
  sourceKeywords?: string[];
  tags?: string[];
  tag_generation_status?: "pending_STSMP_protocol" | string;
}

export interface ResearchResourceLegend {
  category: "society" | "journal";
  item: string;
  definition: string;
  criteria: string;
}

export interface ResearchGraphEdge {
  from: string;
  toName: string;
  toType: "field" | "society" | "journal";
  relation: string;
  status: "official" | "editorial" | "candidate" | "unverified";
  source: string;
}

export interface DiscoveryCard {
  id: string;
  kind: DiscoveryKind;
  title: string;
  label: string;
  summary: string;
  connection: string;
  nextStep: string;
  whyShown: string;
  tags: string[];
  sourceId?: string;
  lab?: Pick<Lab, "id" | "name" | "university" | "department" | "major" | "field_major" | "keywords" | "pi" | "member_count" | "has_url">;
  url?: string;
  connectionStatus?: "official" | "editorial" | "candidate" | "unverified";
}

export interface DiscoveryActionRecord {
  actionId: string;
  sessionId: string;
  itemId: string;
  itemKind: DiscoveryKind;
  action: CardAction;
  createdAt: string;
}

export interface QuestionRoute {
  id: string;
  title: string;
  reframedQuestion: string;
  fields: string[];
  methods: string[];
  posture: string;
  societies: string[];
  journals: string[];
  candidateLabIds: string[];
  carryIn: string;
  nextCheck: string;
}

export interface QuestionProject {
  id: string;
  sessionId: string;
  hypothesis: string;
  seeds: string[];
  requirements: string[];
  routes: QuestionRoute[];
  evidence: {
    likedLabs: string[];
    savedLabs: string[];
    discoveryItems: string[];
  };
  updatedAt: string;
}

export interface ThemeCard {
  id: string;
  title: string;            // 学生向けの問い（論文タイトル転記禁止）
  everyday_hook: string;    // 日常の関心入口（1フレーズ）
  hook_genre: HookGenre;    // SCR-00 ジャンル
  plain_summary: string;    // やさしい説明（専門用語なし1〜2文）
  why_interesting: string;  // 何が面白いか（1〜2文）
  area_tags: string[];
  keywords: string[];
  methods: string[];        // 理論/実験/シミュレーション/データ解析/装置開発/フィールド調査
  orientation: number;      // -1(基礎) .. +1(応用)
  difficulty: 1 | 2 | 3;    // とっつきやすさ（1=よみもの感覚, 3=歯ごたえあり）
  suited_for: string;       // 向いている人（1文）
}

export interface CardActionRecord {
  actionId: string;   // クライアント生成UUID（冪等キー AC-10）
  sessionId: string;
  cardId: string;
  action: CardAction;
  createdAt: string;
}

// 研究室カード（見つけるデッキ用。実研究室からAIが生成・7日キャッシュ。ADR-005）
export interface LabCardContent {
  labId: string;
  title: string;        // 学生向けの問いかけ（30字以内）
  hook: string;         // 身近な入口フレーズ（15字以内）
  summary: string;      // やさしい説明（60〜90字）
  questions: string[];  // この研究室が扱う問い（最大3・研究室ページのAIガイドと同名セクション）
  why: string;          // この研究室のテーマのおもしろさ（50〜80字）
  generatedBy: "llm" | "template";
  generatedAt: string;
}

export interface LabActionRecord {
  actionId: string;   // 冪等キー
  sessionId: string;
  labId: string;
  action: CardAction; // like/skip/deep/save（テーマカードと同語彙）
  createdAt: string;
}

export interface InterestProfile {
  sessionId: string;
  generatedAt: string;
  evaluatedCount: number;
  topAreas: { area: string; label: string; score: number }[];
  methodPreference: { method: string; score: number }[];
  orientation: number; // -1..1（基礎/応用の傾向）
  orientationLabel: string;
  candidateFields: string[]; // 候補分野（キーワード粒度）
  summary: string; // 傾向文（断定禁止 FR-PROF-02）
}

export type ClaimType = "fix" | "takedown" | "claim" | "other";
export type ClaimStatus = "pending" | "in_review" | "resolved" | "rejected";

export interface Claim {
  id: string;
  type: ClaimType;
  labId: string | null;
  labName: string | null;
  name: string;
  affiliation: string;
  email: string;
  message: string;
  evidenceUrl?: string;
  status: ClaimStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "new" | "diagnosed" | "contacted" | "meeting" | "proposal" | "won" | "lost" | "nurture";

export interface Lead {
  id: string;
  university: string;
  department: string;
  labName: string;
  labId?: string | null;
  hasUrl: boolean;
  urlStale: boolean;     // 更新停止
  hasKaken: boolean;
  status: LeadStatus;
  nextAction: string;     // 次アクション内容
  nextActionDate: string; // 必須（STATE-03）
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportStatus = "draft" | "edited" | "sent" | "negotiating" | "won" | "lost";

export interface Report {
  id: string;
  labId: string | null;
  labName: string;
  researcher?: string;
  sourceUrl?: string;
  content: string;       // Markdown下書き（LLM/テンプレ生成→人間編集）
  generatedBy: "llm" | "template";
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export type ArticleStatus =
  | "idea" | "assigned" | "draft" | "editing" | "professor_review"
  | "approved" | "published" | "rejected" | "archived";

export interface Article {
  id: string;
  labId: string | null;
  labName: string;
  title: string;
  writer: string;        // 学生ライター名（PII）
  status: ArticleStatus;
  returnReason?: string; // 差戻し理由（professor_review→editing時に必須）
  updatedAt: string;
  createdAt: string;
}

export interface AppEvent {
  type: "card_action" | "profile_generated" | "lab_view" | "outbound_click" | "session_start";
  sessionId: string;
  payload?: Record<string, string | number | boolean>;
  at: string;
}

export interface MatchReason {
  labId: string;
  score: number;
  reasons: string[];        // 表示用文字列（docs/03 §8.5 書式）
  matchedCardIds: string[];
}
