import type {
  QuestionFreeInput,
  ResearchProject,
  ResearchProjectCover,
  RQCandidate,
  Step1Response,
  Step2Response,
} from "../shared/research-project";
import { ACTIVE_DATASET, ResearchProjectRepository, ResearchProjectVersionRepository } from "./research-project-repository";

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const block = (overrides: Partial<ResearchProjectCover["title"]> = {}): ResearchProjectCover["title"] => ({
  fontFamily: "Hiragino Mincho ProN",
  color: "#ffffff",
  fontSize: 30,
  fontWeight: 900,
  lineHeight: 1.25,
  letterSpacing: 0,
  x: 9,
  y: 16,
  width: 82,
  align: "left",
  ...overrides,
});

export function defaultProjectCover(presetId = "electric") : ResearchProjectCover {
  const presets: Record<string, Pick<ResearchProjectCover, "backgroundType" | "solidColor" | "gradientStart" | "gradientEnd" | "gradientAngle">> = {
    electric: { backgroundType: "gradient", solidColor: "#003fbd", gradientStart: "#003fbd", gradientEnd: "#001f68", gradientAngle: 145 },
    lime: { backgroundType: "gradient", solidColor: "#dfff24", gradientStart: "#efff78", gradientEnd: "#dfff24", gradientAngle: 160 },
    silver: { backgroundType: "gradient", solidColor: "#eef1f5", gradientStart: "#ffffff", gradientEnd: "#bac6d8", gradientAngle: 135 },
    charcoal: { backgroundType: "solid", solidColor: "#161b22", gradientStart: "#161b22", gradientEnd: "#3f4650", gradientAngle: 135 },
  };
  const colors = presets[presetId] || presets.electric;
  const darkText = presetId === "lime" || presetId === "silver";
  return {
    presetId,
    ...colors,
    readabilityOverlay: { color: "#000000", opacity: presetId === "electric" || presetId === "charcoal" ? 0.16 : 0 },
    autoTextContrast: true,
    metadataText: "RESEARCH PROJECT\nMISHIRU",
    title: block({ color: darkText ? "#06111f" : "#ffffff", fontSize: 30, y: 18 }),
    subtitle: block({ color: darkText ? "#243447" : "#e4edff", fontSize: 15, fontWeight: 700, y: 56 }),
    metadata: block({ color: darkText ? "#243447" : "#dfff24", fontSize: 11, fontWeight: 800, y: 84 }),
  };
}

export class ResearchProjectService {
  constructor(
    private readonly projects = new ResearchProjectRepository(),
    private readonly versions = new ResearchProjectVersionRepository(),
  ) {}

  create(input: {
    sessionId: string;
    displayTitle: string;
    subtitle?: string;
    status?: ResearchProject["status"];
    sourceMode: ResearchProject["sourceMode"];
    freeInput: QuestionFreeInput;
    materials: ResearchProject["sourceMaterials"];
    step1Response: Step1Response;
    selectedRq: RQCandidate;
    step2Response: Step2Response;
    cover?: ResearchProjectCover;
  }) {
    const now = new Date().toISOString();
    const id = makeId("project");
    const versionId = makeId("version");
    const project: ResearchProject = {
      id,
      sessionId: input.sessionId,
      dataset: ACTIVE_DATASET,
      displayTitle: input.displayTitle.trim() || input.step2Response.research_outline.title_public,
      subtitle: input.subtitle?.trim() || input.step2Response.one_sentence_summary,
      status: input.status || "draft",
      sourceMode: input.sourceMode,
      freeInput: input.freeInput,
      relatedMaterialIds: input.materials.map((item) => item.sourceId),
      sourceMaterials: input.materials,
      step1Response: input.step1Response,
      rqCandidates: input.step1Response.output_type_proposals,
      selectedRq: input.selectedRq,
      step2Response: input.step2Response,
      currentVersionId: versionId,
      versions: [{
        versionId,
        versionNumber: 1,
        versionName: "v1 初回案",
        createdAt: now,
        changeReason: "問いにしてみるから初回保存",
        creationType: "initial",
        sourceMemoIds: [],
        step2Response: input.step2Response,
      }],
      cover: input.cover || defaultProjectCover(),
      consultationAssetIds: [],
      createdAt: now,
      updatedAt: now,
    };
    return this.projects.create(project);
  }

  update(sessionId: string, projectId: string, patch: Partial<ResearchProject>) {
    const current = this.projects.get(sessionId, projectId);
    if (!current) return null;
    const safePatch = { ...patch };
    if (safePatch.status && !["draft", "consultation", "on_hold"].includes(safePatch.status)) delete safePatch.status;
    if (safePatch.step2Response) {
      const versions = current.versions.map((version) => version.versionId === current.currentVersionId ? { ...version, step2Response: safePatch.step2Response! } : version);
      safePatch.versions = versions;
    }
    return this.projects.update(sessionId, projectId, safePatch);
  }

  createVersion(sessionId: string, projectId: string, input: Parameters<ResearchProjectVersionRepository["create"]>[2]) {
    return this.versions.create(sessionId, projectId, input);
  }

  switchVersion(sessionId: string, projectId: string, versionId: string) {
    return this.versions.switchCurrent(sessionId, projectId, versionId);
  }
}
