import fs from "fs";
import path from "path";
import type {
  ConsultationMemo,
  ResearchProject,
  ResearchProjectVersion,
  VersionCreationType,
} from "../shared/research-project";
import { getSessionSection, hasRemoteSessionState, setSessionSection } from "./session-state";

interface ProjectRuntimeShape {
  projects: ResearchProject[];
  memos: ConsultationMemo[];
}

export const ACTIVE_DATASET: ResearchProject["dataset"] = process.env.MISHIRU_DATASET === "sample" ? "mishiru-sample" : "default";
const DEFAULT_FILE = path.join(process.cwd(), "data", "runtime", ACTIVE_DATASET === "mishiru-sample" ? "research-projects.sample.json" : "research-projects.json");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

class ProjectRuntimeDatabase {
  constructor(private readonly file = DEFAULT_FILE) {}

  read(): ProjectRuntimeShape {
    if (hasRemoteSessionState()) return getSessionSection<ProjectRuntimeShape>("researchProjects", { projects: [], memos: [] });
    if (!fs.existsSync(this.file)) return { projects: [], memos: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<ProjectRuntimeShape>;
      return {
        projects: (parsed.projects || []).map((project) => ({ ...project, dataset: project.dataset || ACTIVE_DATASET })),
        memos: parsed.memos || [],
      };
    } catch (error) { throw new Error(`RUNTIME_JSON_CORRUPT:${this.file}:${error instanceof Error ? error.message : "parse error"}`); }
  }

  write(data: ProjectRuntimeShape) {
    if (hasRemoteSessionState()) { setSessionSection("researchProjects", data); return; }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(data), "utf8"); fs.renameSync(temp, this.file);
  }
}

export class ResearchProjectRepository {
  private readonly db: ProjectRuntimeDatabase;
  constructor(file?: string) { this.db = new ProjectRuntimeDatabase(file); }

  list(sessionId: string) {
    return this.db.read().projects.filter((project) => project.sessionId === sessionId && project.dataset === ACTIVE_DATASET).map(clone);
  }

  get(sessionId: string, id: string) {
    const project = this.db.read().projects.find((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === id);
    return project ? clone(project) : null;
  }

  create(project: ResearchProject) {
    const data = this.db.read();
    if (data.projects.some((item) => item.dataset === ACTIVE_DATASET && item.id === project.id)) throw new Error("PROJECT_ID_CONFLICT");
    data.projects.unshift(clone(project));
    this.db.write(data);
    return clone(project);
  }

  update(sessionId: string, id: string, patch: Partial<ResearchProject>) {
    const data = this.db.read();
    const index = data.projects.findIndex((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === id);
    if (index < 0) return null;
    const current = data.projects[index];
    const next: ResearchProject = {
      ...current,
      ...clone(patch),
      id: current.id,
      sessionId: current.sessionId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.projects[index] = next;
    this.db.write(data);
    return clone(next);
  }

  delete(sessionId: string, id: string) {
    const data = this.db.read();
    const before = data.projects.length;
    data.projects = data.projects.filter((item) => !(item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === id));
    if (data.projects.length === before) return false;
    data.memos = data.memos.filter((memo) => !(memo.sessionId === sessionId && memo.projectId === id));
    this.db.write(data);
    return true;
  }

  duplicate(sessionId: string, id: string, options: { includeMaterials?: boolean; includeMemos?: boolean; includeNextActions?: boolean; includeAssets?: boolean } = {}) {
    const data = this.db.read();
    const source = data.projects.find((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const projectId = makeId("project");
    const versionId = makeId("version");
    const step2Response = clone(source.step2Response);
    if (!options.includeNextActions) step2Response.research_outline.next_actions = [];
    const version: ResearchProjectVersion = {
      ...clone(source.versions.find((item) => item.versionId === source.currentVersionId) || source.versions[0]),
      versionId,
      versionNumber: 1,
      versionName: "v1 複製案",
      parentVersionId: undefined,
      createdAt: now,
      changeReason: "別の研究プロジェクトとして複製",
      creationType: "manual_duplicate",
      sourceMemoIds: [],
      step2Response,
    };
    const duplicated: ResearchProject = {
      ...clone(source),
      id: projectId,
      displayTitle: `${source.displayTitle}（複製）`,
      relatedMaterialIds: options.includeMaterials === false ? [] : clone(source.relatedMaterialIds),
      sourceMaterials: options.includeMaterials === false ? [] : clone(source.sourceMaterials),
      consultationAssetIds: options.includeAssets === false ? [] : clone(source.consultationAssetIds),
      step2Response,
      currentVersionId: versionId,
      versions: [version],
      createdAt: now,
      updatedAt: now,
    };
    data.projects.unshift(duplicated);
    if (options.includeMemos) {
      const copied = data.memos.filter((memo) => memo.sessionId === sessionId && memo.projectId === id).map((memo) => ({
        ...clone(memo), id: makeId("memo"), projectId, versionId, createdAt: now, updatedAt: now,
      }));
      data.memos.unshift(...copied);
    }
    this.db.write(data);
    return clone(duplicated);
  }
}

export class ResearchProjectVersionRepository {
  private readonly db: ProjectRuntimeDatabase;
  constructor(file?: string) { this.db = new ProjectRuntimeDatabase(file); }

  create(sessionId: string, projectId: string, input: {
    versionName?: string;
    changeReason?: string;
    creationType?: VersionCreationType;
    sourceMemoIds?: string[];
    step2Response?: ResearchProject["step2Response"];
    carryMemos?: boolean;
  }) {
    const data = this.db.read();
    const project = data.projects.find((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === projectId);
    if (!project) return null;
    const source = project.versions.find((item) => item.versionId === project.currentVersionId) || project.versions[project.versions.length - 1];
    const now = new Date().toISOString();
    const versionId = makeId("version");
    const version: ResearchProjectVersion = {
      versionId,
      versionNumber: Math.max(0, ...project.versions.map((item) => item.versionNumber)) + 1,
      versionName: input.versionName || `v${project.versions.length + 1}`,
      parentVersionId: source?.versionId,
      createdAt: now,
      changeReason: input.changeReason || "現在の骨子から複製",
      creationType: input.creationType || "manual_duplicate",
      sourceMemoIds: input.sourceMemoIds || (input.carryMemos === false ? [] : data.memos.filter((memo) => memo.sessionId === sessionId && memo.projectId === projectId).map((memo) => memo.id)),
      step2Response: clone(input.step2Response || source?.step2Response || project.step2Response),
    };
    project.versions.push(version);
    project.currentVersionId = versionId;
    project.step2Response = clone(version.step2Response);
    project.updatedAt = now;
    this.db.write(data);
    return clone(version);
  }

  update(sessionId: string, projectId: string, versionId: string, patch: Partial<ResearchProjectVersion>) {
    const data = this.db.read();
    const project = data.projects.find((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === projectId);
    const version = project?.versions.find((item) => item.versionId === versionId);
    if (!project || !version) return null;
    Object.assign(version, clone(patch), { versionId: version.versionId, versionNumber: version.versionNumber, createdAt: version.createdAt });
    if (project.currentVersionId === versionId) project.step2Response = clone(version.step2Response);
    project.updatedAt = new Date().toISOString();
    this.db.write(data);
    return clone(version);
  }

  switchCurrent(sessionId: string, projectId: string, versionId: string) {
    const data = this.db.read();
    const project = data.projects.find((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET && item.id === projectId);
    const version = project?.versions.find((item) => item.versionId === versionId);
    if (!project || !version) return null;
    project.currentVersionId = versionId;
    project.step2Response = clone(version.step2Response);
    project.updatedAt = new Date().toISOString();
    this.db.write(data);
    return clone(project);
  }
}

export class ConsultationMemoRepository {
  private readonly db: ProjectRuntimeDatabase;
  constructor(file?: string) { this.db = new ProjectRuntimeDatabase(file); }

  list(sessionId: string, projectId: string) {
    return this.db.read().memos.filter((memo) => memo.sessionId === sessionId && memo.projectId === projectId).map(clone);
  }

  create(sessionId: string, projectId: string, input: Omit<ConsultationMemo, "id" | "sessionId" | "projectId" | "createdAt" | "updatedAt">) {
    const data = this.db.read();
    if (!data.projects.some((project) => project.sessionId === sessionId && project.dataset === ACTIVE_DATASET && project.id === projectId)) return null;
    const now = new Date().toISOString();
    const memo: ConsultationMemo = { ...clone(input), id: makeId("memo"), sessionId, projectId, createdAt: now, updatedAt: now };
    data.memos.unshift(memo);
    this.db.write(data);
    return clone(memo);
  }

  update(sessionId: string, projectId: string, memoId: string, patch: Partial<ConsultationMemo>) {
    const data = this.db.read();
    const memo = data.memos.find((item) => item.sessionId === sessionId && item.projectId === projectId && item.id === memoId);
    if (!memo) return null;
    Object.assign(memo, clone(patch), { id: memo.id, sessionId: memo.sessionId, projectId: memo.projectId, createdAt: memo.createdAt, updatedAt: new Date().toISOString() });
    this.db.write(data);
    return clone(memo);
  }

  delete(sessionId: string, projectId: string, memoId: string) {
    const data = this.db.read(); const before = data.memos.length;
    data.memos = data.memos.filter((item) => !(item.sessionId === sessionId && item.projectId === projectId && item.id === memoId));
    if (before === data.memos.length) return false; this.db.write(data); return true;
  }
}
