export interface PaperCandidate {
  title: string;
  journal: string;
  author: string;
  year?: number;
  url: string;
  /** 論文が何を調べ、何が分かったのかを初学者向けに説明する。 */
  summary?: string;
  doi?: string;
  sourceLabel?: string;
  openAccess?: boolean;
  reason: string;
  is_recommended?: boolean;
  /** 実在論文を推測せず、信頼できる文献データベースの検索入口を示す場合に使う。 */
  kind?: "paper" | "search";
}

export interface RQCandidate {
  type_name: string;
  rq_title: string;
  public_rq: string;
  academic_rq: string;
  what_we_learn: string;
  methods: string;
  expected_output: string;
  difficulty: string;
  is_recommended: boolean;
  recommendation_reason?: string;
  components?: {
    target: string;
    focus: string;
    relationship: string;
    context: string;
    evidence: string;
  };
  quality_score?: number;
}

export interface ResearchMapPosition {
  vertical_axis: string;
  horizontal_axis: string;
  domain_name: string;
  reason: string;
  is_recommended?: boolean;
}

export interface DomainShift {
  vertical_axis: string;
  horizontal_axis: string;
  new_domain: string;
  shifted_rq: string;
  reason: string;
  is_recommended?: boolean;
}

export interface Step1Response {
  source_synthesis?: {
    core_interest: string;
    material_connections: string[];
    adopted_focus: string;
    assumptions: string[];
    missing_information: string[];
  };
  decomposition: {
    target: string;
    phenomenon: string;
    context: string;
    tension: string;
    question: string;
    utility: string;
    motivation: string;
  };
  research_map_position: ResearchMapPosition;
  domain_shifts: DomainShift[];
  output_type_proposals: RQCandidate[];
  generatedBy?: "ai" | "template" | "quality_fallback";
  qualityReport?: {
    validCount: number;
    repairedCount: number;
    warnings: string[];
  };
}

export interface MatchedAcademicResource {
  name: string;
  type: string;
  url: string;
  url_type: "公式" | "検索(要確認)";
  reason: string;
  description?: string;
  scope?: string;
  is_recommended?: boolean;
  matchedResourceId?: string;
  matchConfidence?: number;
  verificationLabel?: "DB一致" | "DB近似" | "AI候補・DB未確認";
}

export interface ProjectNextAction {
  id: string;
  text: string;
  dueDate?: string;
  completed: boolean;
}

export interface ResearchOutline {
  title_public: string;
  title_academic: string;
  mim: string;
  background: string;
  problem: string;
  purpose: string;
  main_rq: string;
  sub_rqs: string[];
  related_work_diff: string;
  conceptual_model: string[];
  research_design: string;
  target_population: string;
  data_collection: string;
  analysis_method: string;
  evaluation_method: string;
  ethical_considerations: string;
  significance: { academic: string; practical: string; social: string };
  limitations: string;
  next_steps: string[];
  interesting_points: string;
  difficult_points: string[];
  consultation_questions: string[];
  comments: string[];
  next_actions: ProjectNextAction[];
}

export interface Step2Response {
  literature_review: {
    knowns: string[];
    unknowns: string[];
    controversies: string[];
    target_gap_deep: string;
  };
  search_queries: string[];
  paper_ideas: {
    reference: PaperCandidate[];
    competitor: PaperCandidate[];
    adjacent: PaperCandidate[];
  };
  research_outline: ResearchOutline;
  academic_mapping: {
    target_domain: string;
    matched_field_ids?: string[];
    matched_lab_ids?: string[];
    recommended_fields?: MatchedAcademicResource[];
    recommended_societies: MatchedAcademicResource[];
    recommended_journals: MatchedAcademicResource[];
  };
  reporting_guideline: { name: string; reason: string };
  one_sentence_summary: string;
  generatedBy?: "ai" | "template";
}

export type ProjectStatus = "draft" | "consultation" | "on_hold";
export type ProjectSourceMode = "free_input" | "saved_items";

export interface QuestionFreeInput {
  recentInterest: string;
  discomfort: string;
  graduateTopic: string;
  reason: string;
  referenceInfo: string;
  notes: string;
}

export type MaterialSourceType =
  | "lab" | "field" | "society" | "journal" | "marking" | "memo" | "quote"
  | "external_url" | "book" | "article" | "news" | "paper_url" | "post_url" | "event";

export interface NormalizedResearchMaterial {
  sourceType: MaterialSourceType;
  sourceId: string;
  title: string;
  officialDescription?: string;
  officialQuestions?: string[];
  sourceKeywords?: string[];
  approvedTags?: string[];
  pendingTags?: string[];
  executionMode?: string;
  userReaction?: string;
  userReasonMemo?: string;
  excerpt?: string;
  url?: string;
  verificationStatus?: string;
  createdAt?: string;
}

export type VersionCreationType = "initial" | "manual_duplicate" | "ai_regeneration" | "consultation_revision";

export interface ResearchProjectVersion {
  versionId: string;
  versionNumber: number;
  versionName: string;
  parentVersionId?: string;
  createdAt: string;
  changeReason: string;
  creationType: VersionCreationType;
  sourceMemoIds: string[];
  step2Response: Step2Response;
}

export interface CoverTextBlock {
  fontFamily: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
}

export interface CoverCustomTextBox {
  id: string;
  text: string;
  block: CoverTextBlock;
}

export interface CoverMotif {
  id: string;
  name?: string;
  dataUrl: string;
  storagePath?: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  shadow: number;
}

export interface CoverStroke {
  id: string;
  color: string;
  width: number;
  opacity: number;
  points: { x: number; y: number }[];
}

export interface ResearchProjectCover {
  presetId?: string;
  backgroundType: "solid" | "gradient" | "image";
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  readabilityOverlay?: {
    color: string;
    opacity: number;
  };
  title: CoverTextBlock;
  subtitle: CoverTextBlock;
  metadata: CoverTextBlock;
  metadataText?: string;
  textBoxes?: CoverCustomTextBox[];
  autoTextContrast?: boolean;
  motifs?: CoverMotif[];
  strokes?: CoverStroke[];
  image?: {
    dataUrl: string;
    storagePath?: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
    scale: number;
    x: number;
    y: number;
    brightness: number;
    overlayColor: string;
    overlayOpacity: number;
    fit?: "cover" | "contain";
  };
  motif?: {
    dataUrl: string;
    storagePath?: string;
    mimeType?: "image/png" | "image/jpeg" | "image/webp";
    scale: number;
    x: number;
    y: number;
    rotation: number;
    opacity: number;
    shadow: number;
  };
}

export interface ConsultationMemo {
  id: string;
  projectId: string;
  sessionId: string;
  versionId?: string;
  consultationDate: string;
  person: string;
  affiliation: string;
  comments: string;
  critiques: string;
  references: string;
  rqRevision: string;
  targetRevision: string;
  methodRevision: string;
  nextActions: string;
  reflection: string;
  referenceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchProject {
  id: string;
  sessionId: string;
  dataset: "default" | "mishiru-sample";
  interestAnalysisId?: string;
  displayTitle: string;
  subtitle: string;
  status: ProjectStatus;
  sourceMode: ProjectSourceMode;
  freeInput: QuestionFreeInput;
  relatedMaterialIds: string[];
  sourceMaterials: NormalizedResearchMaterial[];
  step1Response: Step1Response;
  rqCandidates: RQCandidate[];
  selectedRq: RQCandidate;
  step2Response: Step2Response;
  currentVersionId: string;
  versions: ResearchProjectVersion[];
  cover: ResearchProjectCover;
  consultationAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ConsultationAssetFormat = "pdf" | "pptx_1" | "pptx_2" | "pptx_3";
export type ConsultationAssetStatus = "generating" | "ready" | "outdated" | "error";

export interface ConsultationDocumentOptions {
  includeCover: boolean;
  includeComments: boolean;
  includeNextActions: boolean;
  includeMaterials: boolean;
  showEmpty: boolean;
}

export interface ConsultationDocumentDraft {
  title: string;
  subtitle: string;
  sections: Record<string, string[]>;
  options: ConsultationDocumentOptions;
}

export interface ConsultationAsset {
  id: string;
  projectId: string;
  versionId: string;
  sessionId: string;
  dataset: ResearchProject["dataset"];
  format: ConsultationAssetFormat;
  pageCount: number;
  status: ConsultationAssetStatus;
  filePath: string;
  downloadPath: string;
  generatedAt: string;
  generatedFromUpdatedAt: string;
  templateVersion: string;
  includedSections: string[];
  fontName: string;
  draft: ConsultationDocumentDraft;
  error: string;
}

export interface InterestAnalysisResult {
  current: {
    strongThemes: string[]; objects: string[]; phenomena: string[]; contexts: string[];
    questionStyles: string[]; positiveInterests: string[]; negativeReactions: string[];
    undecided: string[]; changes: string[];
  };
  connections: {
    fields: { id: string; name: string }[]; labs: { id: string; name: string }[];
    societies: { id: string; name: string }[]; journals: { id: string; name: string }[];
    searchTerms: string[]; nextTargets: string[];
  };
  directions: {
    interestDirections: string[]; narrowingDirections: string[]; separateIssues: string[];
    broadAreas: string[]; confirmations: string[]; nextMaterials: string[];
  };
  evidence: { summary: string; sourceIds: string[]; reactionCounts: Record<string, number> };
  analysisMode: "ai" | "gemini" | "deterministic_fallback";
}

export interface InterestAnalysis {
  id: string;
  sessionId: string;
  dataset: ResearchProject["dataset"];
  sourceSnapshot: NormalizedResearchMaterial[];
  excludedSourceIds: string[];
  result: InterestAnalysisResult;
  lastAnalyzedAt: string;
  analysisVersion: string;
  dailyAnalysisCount: number;
  planLimit: number | null;
  model: string;
  promptVersion: string;
  status: "ready" | "analyzing" | "error";
  error: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionCraftDraft {
  sourceMode: ProjectSourceMode;
  freeInput: QuestionFreeInput;
  selectedMaterialIds: string[];
  materials: NormalizedResearchMaterial[];
  step1Response: Step1Response | null;
  selectedRq: RQCandidate | null;
  step2Response: Step2Response | null;
  updatedAt: string;
}
