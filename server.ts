// MISHIRU server
// 学生系は匿名（sessionId）、管理系は x-admin-token。外部依存ゼロでも全AC成立（ADR-002）。
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { store } from "./server/store";
import { buildProfile, matchLabs, labsForCard, nearbyCards, collectProfileExtras, PROFILE_THRESHOLD } from "./server/matching";
import { nextCards } from "./server/cards-service";
import { generateReport } from "./server/report";
import { smartSearch } from "./server/smart-search";
import { enrichLab, cachedEnrichment } from "./server/enrich";
import { getDeckCards, buildCardsFor, labCardCacheStats, DECK_BATCH } from "./server/lab-cards";
import type { LabActionRecord } from "./shared/types";
import { HOOK_GENRES, RESEARCH_AREAS } from "./shared/taxonomy";
import { fieldLabel } from "./shared/fields";
import type { ConsultationAssetFormat, ConsultationDocumentDraft, NormalizedResearchMaterial, QuestionFreeInput, ResearchProject, RQCandidate, Step1Response } from "./shared/research-project";
import { adjustResearchText, generateStep1, generateStep2, hasQuestionCraftEvidence, normalizeResearchMaterials } from "./server/question-craft";
import { ACTIVE_DATASET, ConsultationMemoRepository, ResearchProjectRepository, ResearchProjectVersionRepository } from "./server/research-project-repository";
import { ResearchProjectService } from "./server/research-project-service";
import { buildConsultationDraft, ConsultationAssetRepository, ConsultationExportService, DEFAULT_DOCUMENT_OPTIONS } from "./server/consultation-export";
import { InterestAnalysisRepository, InterestAnalysisService } from "./server/interest-analysis";
import { AI_MODELS, aiEnabled, aiProviderStatus, currentAiModel, currentAiProvider } from "./server/ai";
import { stsmpMaterialMeta } from "./server/stsmp";
import { accessContextMiddleware, forgetLocalUser, guestUsage, GUEST_ACTION_LIMIT, requireValueAction } from "./server/access";
import { discardSessionState, sessionStateMiddleware } from "./server/session-state";
import { deleteMishiruIdentity } from "./server/supabase";
import { apiErrorHandler, rateLimit, rejectOversizedJson, requestContextMiddleware } from "./server/request-security";
import { readProjectCover, saveProjectCover } from "./server/project-cover-storage";
import { consultationFileName, readConsultationFile, removeConsultationFile } from "./server/consultation-file-storage";
import type {
  CardActionRecord, Claim, Lead, Report, Article, AppEvent, ClaimType,
  CardAction, DiscoveryActionRecord, DiscoveryCard, ResearchField, ResearchSociety, ResearchJournal, QuestionProject,
} from "./shared/types";

dotenv.config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const MAIL_ENABLED = !!process.env.RESEND_API_KEY;

let idCounter = 0;
const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
const nowIso = () => new Date().toISOString();
const ACTIONS: CardAction[] = ["like", "skip", "deep", "save", "important", "unclear", "not_fit"];
const projectRepository = new ResearchProjectRepository();
const projectVersionRepository = new ResearchProjectVersionRepository();
const consultationMemoRepository = new ConsultationMemoRepository();
const researchProjectService = new ResearchProjectService(projectRepository, projectVersionRepository);
const consultationAssetRepository = new ConsultationAssetRepository();
const consultationExportService = new ConsultationExportService(consultationAssetRepository);
const interestAnalysisRepository = new InterestAnalysisRepository();
const interestAnalysisService = new InterestAnalysisService(interestAnalysisRepository);

function isValidEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
const boundedText = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
function normalizedFreeInput(value: unknown): QuestionFreeInput {
  const input = value && typeof value === "object" ? value as Partial<QuestionFreeInput> : {};
  return {
    recentInterest: boundedText(input.recentInterest, 1200),
    discomfort: boundedText(input.discomfort, 1200),
    graduateTopic: boundedText(input.graduateTopic, 1200),
    reason: boundedText(input.reason, 1200),
    referenceInfo: boundedText(input.referenceInfo, 2000),
    notes: boundedText(input.notes, 2000),
  };
}

function collectResearchMaterials(sessionId: string, allReactions = false): NormalizedResearchMaterial[] {
  const allowed = (action: CardAction) => allReactions || action === "like" || action === "save" || action === "important" || action === "deep";
  const materials: NormalizedResearchMaterial[] = [];
  for (const action of store.actionsBySession(sessionId).filter((item) => allowed(item.action))) {
    const card = store.cardById(action.cardId); if (!card) continue;
    materials.push({ sourceType: "article", sourceId: card.id, title: card.title, officialDescription: card.plain_summary, officialQuestions: [card.title], sourceKeywords: card.area_tags, userReaction: action.action, verificationStatus: "editorial", createdAt: action.createdAt });
  }
  for (const action of store.labActionsBySession(sessionId).filter((item) => allowed(item.action))) {
    const lab = store.labById(action.labId); if (!lab) continue;
    materials.push({ sourceType: "lab", sourceId: lab.id, title: lab.name, officialDescription: lab.sections.research_summary || undefined, sourceKeywords: lab.keywords, ...stsmpMaterialMeta("lab",lab.id), executionMode: stsmpMaterialMeta("lab",lab.id).executionMode || "public_info", userReaction: action.action, url: `/labs/${lab.id}`, verificationStatus: lab.verified ? "verified" : "public_info", createdAt: action.createdAt });
  }
  for (const action of store.discoveryActionsBySession(sessionId).filter((item) => allowed(item.action))) {
    const resource = store.resourceByKind(action.itemKind, action.itemId); if (!resource || !("id" in resource)) continue;
    const sourceType = action.itemKind === "field" ? "field" : action.itemKind === "society" ? "society" : action.itemKind === "journal" ? "journal" : null; if (!sourceType) continue;
    const title = "nameJa" in resource ? resource.nameJa : resource.name; const description = "definition" in resource ? resource.definition : resource.description;
    const sts=stsmpMaterialMeta(sourceType,resource.id); materials.push({ sourceType, sourceId: resource.id, title, officialDescription: description || undefined, officialQuestions: resource.questions, sourceKeywords: "sourceKeywords" in resource ? resource.sourceKeywords : "disciplines" in resource ? resource.disciplines : [], ...sts, executionMode: sts.executionMode || "excel_normalized", userReaction: action.action, url: "url" in resource ? resource.url : `/search?ai=${encodeURIComponent(title)}`, verificationStatus: "connectionStatus" in resource ? resource.connectionStatus : "editorial", createdAt: action.createdAt });
  }
  return normalizeResearchMaterials(materials);
}

// Claim通知（メール or ログ）。通知失敗でも受付は成立（AC-03）。
async function notifyClaim(claim: Claim) {
  const to = process.env.CLAIM_NOTIFY_EMAIL || "support@mishiru-lab.com";
  if (MAIL_ENABLED) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "MISHIRU <noreply@mishiru-lab.com>", to,
          subject: `[Claim] ${claim.type} - ${claim.labName || claim.labId || "対象不明"}`,
          text: `受付ID: ${claim.id}\n種別: ${claim.type}\n研究室: ${claim.labName}\n申請者: ${claim.name} (${claim.affiliation})\nメール: ${claim.email}\n内容: ${claim.message}\n確認資料: ${claim.evidenceUrl || "なし"}`,
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
      return;
    } catch (e) {
      console.error("[claim] メール通知失敗（受付は継続）:", (e as Error).message);
    }
  }
  // 個人情報をログへ残さず、受付IDだけで追跡する。
  console.log(`[claim] 対応待ち登録 id=${claim.id} type=${claim.type} lab=${claim.labName || claim.labId || "対象不明"}`);
}

export async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  app.use(requestContextMiddleware);
  app.use(rejectOversizedJson);
  app.use(express.json({ limit: "8mb" }));
  app.use(accessContextMiddleware);
  app.use(sessionStateMiddleware);

  const aiRateLimit = rateLimit({ name: "ai", windowMs: 60_000, max: 12, message: "AIを使う操作が続いています。1分ほど待ってから、もう一度お試しください。" });
  const enrichmentRateLimit = rateLimit({ name: "enrichment", windowMs: 60_000, max: 30 });
  const exportRateLimit = rateLimit({ name: "export", windowMs: 60_000, max: 10, message: "資料の作成が続いています。1分ほど待ってから、もう一度お試しください。" });
  const eventRateLimit = rateLimit({ name: "event", windowMs: 60_000, max: 120 });
  const claimRateLimit = rateLimit({ name: "claim", windowMs: 60 * 60_000, max: 5, message: "ご依頼を続けて受け付けています。1時間ほど待ってから、もう一度お試しください。" });

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!ADMIN_TOKEN) {
      return res.status(503).json({ error: { code: "ADMIN_UNAVAILABLE", message: "管理機能は現在利用できません" } });
    }
    if (req.headers["x-admin-token"] === ADMIN_TOKEN) return next();
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "管理トークンが必要です" } });
  };
  const bad = (res: express.Response, message: string) =>
    res.status(400).json({ error: { code: "BAD_REQUEST", message } });

  // ============ ヘルス・メタ ============
  app.get("/api/health", (_req, res) => {
    const production = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    res.json({
      status: "ok",
      adminProtected: production || !!ADMIN_TOKEN,
    });
  });
  app.get("/api/access", async (_req, res) => {
    const sessionId = String(res.locals.mishiruSessionId || "");
    if (res.locals.mishiruUser) return res.json({ authenticated: true, sessionId, limit: null, used: 0, remaining: null });
    const usage = await guestUsage(sessionId);
    res.json({ authenticated: false, sessionId, limit: GUEST_ACTION_LIMIT, ...usage });
  });
  app.post("/api/auth/link-session", (req, res) => {
    if (!res.locals.mishiruUser) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "ログインが必要です" } });
    res.json({ authenticated: true, sessionId: String(res.locals.mishiruSessionId || req.body?.sessionId || "") });
  });
  app.get("/api/meta", (_req, res) => {
    res.json({ genres: HOOK_GENRES, areas: RESEARCH_AREAS, profileThreshold: PROFILE_THRESHOLD });
  });
  app.get("/api/ai/config", requireAdmin, (_req, res) => {
    res.json({ enabled: aiEnabled(), selectedModel: currentAiModel(), selectedProvider: currentAiProvider(), providers: aiProviderStatus(), models: AI_MODELS });
  });

  // ============ 問いにしてみる / ResearchProject ==========
  app.get("/api/question-materials", (req, res) => {
    const sessionId = String(req.query.sessionId || ""); if (!sessionId) return bad(res, "sessionId が必要です");
    res.json({ materials: collectResearchMaterials(sessionId) });
  });
  app.post("/api/question-craft/step1", aiRateLimit, requireValueAction("question_step1"), async (req, res) => {
    const sessionId = String(req.body?.sessionId || ""); const sourceMode = req.body?.sourceMode === "saved_items" ? "saved_items" : "free_input";
    const freeInput = normalizedFreeInput(req.body?.freeInput); const materials = normalizeResearchMaterials(Array.isArray(req.body?.materials) ? req.body.materials : []);
    if (!sessionId) return bad(res, "sessionId が必要です");
    if (!hasQuestionCraftEvidence(sourceMode, freeInput, materials)) return res.status(422).json({ error: { code: "INSUFFICIENT_MATERIAL", message: "この素材だけでは、研究の問いを作るための情報が不足しています。気になった理由や、扱いたい違和感を追加してください。" } });
    try { res.json({ step1: await generateStep1(freeInput, materials), normalizedMaterials: materials, aiEnabled: aiEnabled() }); }
    catch (error) { console.error("[question-craft step1]", error); res.status(500).json({ error: { code: "AI_FAILED", message: "問いの候補を生成できませんでした。入力内容は保存されています。" } }); }
  });
  app.post("/api/question-craft/step2", aiRateLimit, requireValueAction("question_step2"), async (req, res) => {
    const sessionId = String(req.body?.sessionId || ""); const freeInput = normalizedFreeInput(req.body?.freeInput); const selectedRq = req.body?.selectedRq as RQCandidate; const step1 = req.body?.step1 as Step1Response;
    if (!sessionId || !selectedRq || !step1) return bad(res, "sessionId, selectedRq, step1 が必要です");
    try { res.json({ step2: await generateStep2(freeInput, selectedRq, step1), aiEnabled: aiEnabled() }); }
    catch (error) { console.error("[question-craft step2]", error); res.status(500).json({ error: { code: "AI_FAILED", message: "研究骨子を生成できませんでした。Step 1は保持されています。" } }); }
  });
  app.post("/api/question-craft/adjust", aiRateLimit, requireValueAction("question_adjust"), async (req, res) => {
    const value = boundedText(req.body?.value, 8000); const instruction = boundedText(req.body?.instruction, 1000); const context = boundedText(req.body?.context, 4000);
    if (!value || !instruction) return bad(res, "調整する文章と指示を入力してください");
    try { res.json({ value: await adjustResearchText(value, instruction, context), aiEnabled: aiEnabled() }); }
    catch (error) { console.error("[question-craft adjust]", error); res.status(500).json({ error: { code: "AI_FAILED", message: "文章を調整できませんでした。元の文章はそのまま残っています。" } }); }
  });

  app.get("/api/projects", (req, res) => { const sessionId = String(req.query.sessionId || ""); if (!sessionId) return bad(res, "sessionId が必要です"); const projects = projectRepository.list(sessionId); res.json({ projects: projects.map((project) => ({ ...project, memoCount: consultationMemoRepository.list(sessionId, project.id).length, assetCount: consultationAssetRepository.list(project).length })) }); });
  app.post("/api/projects", (req, res) => { const sessionId = String(req.body?.sessionId || ""); if (!sessionId || !req.body?.step1Response || !req.body?.step2Response || !req.body?.selectedRq) return bad(res, "保存に必要な生成結果が不足しています"); try { const project = researchProjectService.create({ ...req.body, sessionId, materials: normalizeResearchMaterials(req.body.materials || []) }); if (req.body?.interestAnalysisId) projectRepository.update(sessionId, project.id, { interestAnalysisId: String(req.body.interestAnalysisId) }); res.status(201).json({ project: projectRepository.get(sessionId, project.id) }); } catch (error) { console.error("[project create]", error); res.status(500).json({ error: { code: "SAVE_FAILED", message: "研究プロジェクトを保存できませんでした" } }); } });
  app.post("/api/projects/quick", aiRateLimit, requireValueAction("quick_project"), async (req, res) => {
    const sessionId=String(req.body?.sessionId||""); const title=boundedText(req.body?.displayTitle,160);
    if(!sessionId||!title)return bad(res,"sessionId とタイトルが必要です");
    const freeInput:QuestionFreeInput={recentInterest:title,discomfort:"",graduateTopic:title,reason:"まず一冊を作り、あとから問いを育てる",referenceInfo:"",notes:""};
    try{const step1=await generateStep1(freeInput,[]);const selectedRq=step1.output_type_proposals[0];const step2=await generateStep2(freeInput,selectedRq,step1);const project=researchProjectService.create({sessionId,displayTitle:title,subtitle:String(req.body?.subtitle||"思いついたテーマから始める研究前夜"),status:"draft",sourceMode:"free_input",freeInput,materials:[],step1Response:step1,selectedRq,step2Response:step2,cover:req.body?.cover});res.status(201).json({project});}
    catch(error){console.error("[quick project create]",error);res.status(500).json({error:{code:"SAVE_FAILED",message:"最初の一冊を作成できませんでした"}});}
  });
  app.get("/api/projects/:id", (req, res) => { const sessionId = String(req.query.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.json({ project, memoCount: consultationMemoRepository.list(sessionId, project.id).length }); });
  app.patch("/api/projects/:id", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const project = researchProjectService.update(sessionId, req.params.id, req.body || {}); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.json({ project }); });
  app.post("/api/projects/:id/cover-image", async (req, res) => {
    const sessionId=String(req.body?.sessionId||""); const project=projectRepository.get(sessionId,req.params.id); if(!project)return res.status(404).json({error:{code:"NOT_FOUND",message:"研究プロジェクトが見つかりません"}});
    const dataUrl=String(req.body?.dataUrl||""); const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/); if(!match)return bad(res,"PNG・JPEG・WebP画像だけを使用できます");
    const buffer=Buffer.from(match[2],"base64"); if(buffer.length>5*1024*1024)return res.status(413).json({error:{code:"IMAGE_TOO_LARGE",message:"表紙画像は5MB以下にしてください"}});
    const kind=req.body?.kind==="motif"?"motif":"background"; const ext=match[1]==="image/png"?"png":match[1]==="image/webp"?"webp":"jpg";
    try {
      const storagePath = await saveProjectCover({ buffer, mimeType: match[1], extension: ext, dataset: ACTIVE_DATASET, sessionId, projectId: project.id, kind });
      const image={dataUrl:`/api/projects/${project.id}/cover-image?sessionId=${encodeURIComponent(sessionId)}&kind=${kind}&v=${Date.now()}`,storagePath,mimeType:match[1] as "image/png"|"image/jpeg"|"image/webp",scale:1,x:50,y:50,brightness:1,overlayColor:"#000000",overlayOpacity:.2}; res.status(201).json({image});
    } catch (error) { console.error("[cover upload]", error instanceof Error ? error.message : error); res.status(503).json({ error: { code: "UPLOAD_UNAVAILABLE", message: "画像を保存できませんでした。少し待ってから、もう一度お試しください。" } }); }
  });
  app.get("/api/projects/:id/cover-image",async(req,res)=>{const sessionId=String(req.query.sessionId||"");const project=projectRepository.get(sessionId,req.params.id);const storagePath=req.query.kind==="motif"?project?.cover.motif?.storagePath:project?.cover.image?.storagePath;if(!project||!storagePath)return res.status(404).end();try{const buffer=await readProjectCover(storagePath);if(!buffer)return res.status(404).end();const mimeType=req.query.kind==="motif"?project.cover.motif?.mimeType:project.cover.image?.mimeType;res.type(mimeType||"image/jpeg").setHeader("Cache-Control","private, max-age=3600").send(buffer);}catch(error){console.error("[cover download]",error instanceof Error?error.message:error);res.status(503).json({error:{code:"DOWNLOAD_UNAVAILABLE",message:"画像を読み込めませんでした。少し待ってから、もう一度お試しください。"}});}});
  app.delete("/api/projects/:id", (req, res) => { const sessionId = String(req.query.sessionId || ""); if (!projectRepository.delete(sessionId, req.params.id)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.json({ ok: true }); });
  app.post("/api/projects/:id/versions", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const version = researchProjectService.createVersion(sessionId, req.params.id, req.body || {}); if (!version) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.status(201).json({ version, project: projectRepository.get(sessionId, req.params.id) }); });
  app.patch("/api/projects/:id/versions/:versionId", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const version = projectVersionRepository.update(sessionId, req.params.id, req.params.versionId, req.body || {}); if (!version) return res.status(404).json({ error: { code: "NOT_FOUND", message: "バージョンが見つかりません" } }); res.json({ version }); });
  app.post("/api/projects/:id/versions/:versionId/select", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const project = researchProjectService.switchVersion(sessionId, req.params.id, req.params.versionId); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "バージョンが見つかりません" } }); res.json({ project }); });
  app.post("/api/projects/:id/duplicate", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const project = projectRepository.duplicate(sessionId, req.params.id, req.body?.options || {}); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.status(201).json({ project }); });
  app.post("/api/projects/:id/regenerate", aiRateLimit, requireValueAction("project_regenerate"), async (req, res) => {
    const sessionId = String(req.body?.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id);
    if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } });
    try {
      const step2Response = await generateStep2(project.freeInput, project.selectedRq, project.step1Response);
      const version = researchProjectService.createVersion(sessionId, project.id, { versionName: boundedText(req.body?.versionName, 100) || `v${project.versions.length + 1} AI再生成`, changeReason: boundedText(req.body?.changeReason, 500) || "全体をAIで再生成", creationType: "ai_regeneration", step2Response, carryMemos: req.body?.carryMemos !== false });
      res.status(201).json({ version, project: projectRepository.get(sessionId, project.id) });
    } catch (error) { console.error("[project regenerate]", error); res.status(500).json({ error: { code: "AI_FAILED", message: "再生成できませんでした。現在の内容はそのまま残っています。" } }); }
  });
  app.get("/api/projects/:id/memos", (req, res) => { const sessionId = String(req.query.sessionId || ""); res.json({ memos: consultationMemoRepository.list(sessionId, req.params.id) }); });
  app.post("/api/projects/:id/memos", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const memo = consultationMemoRepository.create(sessionId, req.params.id, req.body); if (!memo) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.status(201).json({ memo }); });
  app.patch("/api/projects/:id/memos/:memoId", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const memo = consultationMemoRepository.update(sessionId, req.params.id, req.params.memoId, req.body || {}); if (!memo) return res.status(404).json({ error: { code: "NOT_FOUND", message: "相談メモが見つかりません" } }); res.json({ memo }); });
  app.delete("/api/projects/:id/memos/:memoId", (req,res)=>{const sessionId=String(req.query.sessionId||"");if(!consultationMemoRepository.delete(sessionId,req.params.id,req.params.memoId))return res.status(404).json({error:{code:"NOT_FOUND",message:"相談メモが見つかりません"}});res.json({ok:true});});

  // ============ 相談資料 ==========
  app.get("/api/projects/:id/assets", (req, res) => { const sessionId = String(req.query.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); res.json({ assets: consultationAssetRepository.list(project) }); });
  app.post("/api/projects/:id/assets/preview", (req, res) => { const sessionId = String(req.body?.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); const format = req.body?.format as ConsultationAssetFormat; if (!["pdf","pptx_1","pptx_2","pptx_3"].includes(format)) return bad(res, "format が不正です"); res.json({ draft: buildConsultationDraft(project, format, req.body?.options || DEFAULT_DOCUMENT_OPTIONS) }); });
  app.post("/api/projects/:id/assets", exportRateLimit, async (req, res) => { const sessionId = String(req.body?.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); if (!project) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究プロジェクトが見つかりません" } }); const format = req.body?.format as ConsultationAssetFormat; if (!["pdf","pptx_1","pptx_2","pptx_3"].includes(format)) return bad(res, "format が不正です"); const draft = req.body?.draft as ConsultationDocumentDraft; try { const asset = await consultationExportService.generate(project, format, draft || buildConsultationDraft(project, format)); const next = projectRepository.update(sessionId, project.id, { consultationAssetIds: Array.from(new Set([...project.consultationAssetIds, asset.id])) }); res.status(201).json({ asset, project: next }); } catch (error) { console.error("[consultation export]", error); res.status(500).json({ error: { code: "EXPORT_FAILED", message: "相談資料を作成できませんでした。内容は保存されています。少し待ってから、もう一度お試しください。" } }); } });
  app.get("/api/projects/:id/assets/:assetId/download", async (req, res) => { const sessionId = String(req.query.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); const asset = consultationAssetRepository.get(req.params.assetId); if (!project || !asset || asset.projectId !== project.id || !asset.filePath) return res.status(404).json({ error: { code: "NOT_FOUND", message: "生成ファイルが見つかりません" } }); try { const buffer = await readConsultationFile(asset.filePath); if (!buffer) return res.status(404).json({ error: { code: "NOT_FOUND", message: "生成ファイルが見つかりません。資料をもう一度作成してください。" } }); res.attachment(consultationFileName(asset.filePath)).send(buffer); } catch (error) { console.error("[consultation download]", error instanceof Error ? error.message : error); res.status(503).json({ error: { code: "DOWNLOAD_UNAVAILABLE", message: "資料をダウンロードできませんでした。少し待ってから、もう一度お試しください。" } }); } });
  app.delete("/api/projects/:id/assets/:assetId", async (req, res) => { const sessionId = String(req.query.sessionId || ""); const project = projectRepository.get(sessionId, req.params.id); const asset = consultationAssetRepository.get(req.params.assetId); if (!project || !asset || asset.projectId !== project.id) return res.status(404).json({ error: { code: "NOT_FOUND", message: "相談資料が見つかりません" } }); consultationAssetRepository.delete(asset.id); await removeConsultationFile(asset.filePath); projectRepository.update(sessionId, project.id, { consultationAssetIds: project.consultationAssetIds.filter((id) => id !== asset.id) }); res.json({ ok:true }); });

  // ============ みつめる：手動分析 ==========
  app.get("/api/interest-analysis", (req, res) => { const sessionId = String(req.query.sessionId || ""); if (!sessionId) return bad(res, "sessionId が必要です"); res.json({ analysis: interestAnalysisRepository.latest(sessionId), usage: interestAnalysisService.usage(sessionId), aiEnabled: aiEnabled(), serverMaterialCount: collectResearchMaterials(sessionId, true).length, dataset: ACTIVE_DATASET }); });
  app.post("/api/interest-analysis", aiRateLimit, requireValueAction("interest_analysis"), async (req, res) => { const sessionId = String(req.body?.sessionId || ""); if (!sessionId) return bad(res, "sessionId が必要です"); const materials = normalizeResearchMaterials([...(Array.isArray(req.body?.materials) ? req.body.materials : []), ...collectResearchMaterials(sessionId, true)]).filter((item,index,all) => all.findIndex((other) => `${other.sourceType}:${other.sourceId}:${other.userReaction}` === `${item.sourceType}:${item.sourceId}:${item.userReaction}`) === index); try { const analysis = await interestAnalysisService.analyze(sessionId, materials, Array.isArray(req.body?.excludedSourceIds) ? req.body.excludedSourceIds : []); res.status(201).json({ analysis, usage: interestAnalysisService.usage(sessionId), aiEnabled: aiEnabled() }); } catch (error) { const code = error instanceof Error ? error.message : "ANALYSIS_FAILED"; const status = code === "DAILY_LIMIT_REACHED" ? 429 : code === "ANALYSIS_IN_PROGRESS" ? 409 : 400; res.status(status).json({ error: { code, message: code === "DAILY_LIMIT_REACHED" ? "本日の分析上限に達しました" : code === "ANALYSIS_IN_PROGRESS" ? "分析を処理中です" : "分析に使える素材がありません" } }); } });

  app.get("/api/research-resources/summary", (_req, res) => {
    res.json(store.researchResourceSummary());
  });

  app.get("/api/research-resources", (req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 12, 40);
    const suppliedTerms = String(req.query.terms || "").split("|").map((value) => value.trim()).filter((value) => value.length >= 2);
    // LLMs often use the academic form (e.g. "組織行動論"), while the catalogue
    // stores the more compact label ("組織行動"). Search both without widening
    // the query to generic area names.
    const terms = Array.from(new Set(suppliedTerms.flatMap((value) => [
      value,
      value.endsWith("論") ? value.slice(0, -1) : "",
    ]).filter((value) => value.length >= 2))).slice(0, 12);
    const filterKeys = ["societyActivity", "societyPosition", "societyAccessibility", "journalPublisher", "journalActivity", "journalPeerReview", "journalArticleType", "journalLanguage", "journalOpenAccess", "journalReadability", "journalPosition", "journalSubmission"];
    const filters = Object.fromEntries(filterKeys.map((key) => [key, String(req.query[key] || "")]).filter(([, value]) => value));
    const data = terms.length ? store.relatedResearchResources(terms, limit) : store.searchResearchResources(q, limit, filters);
    const labCandidates: Record<string, ReturnType<typeof publicLab>[]> = {};
    const labsForTerms = (id: string, terms: string[]) => {
      const scores = new Map<string, { lab: ReturnType<typeof store.publicLabs>[number]; score: number }>();
      for (const term of Array.from(new Set(terms.map((value) => value.trim()).filter((value) => value.length >= 2))).slice(0, 8)) {
        for (const lab of store.searchLabs({ q: term }).slice(0, 30)) {
          const current = scores.get(lab.id);
          scores.set(lab.id, { lab, score: (current?.score || 0) + 1 });
        }
      }
      labCandidates[id] = Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, 3).map(({ lab }) => publicLab(lab)).filter(Boolean);
    };
    data.fields.forEach((field) => labsForTerms(field.id, [field.nameJa, ...field.disciplines, field.division, field.className]));
    data.societies.forEach((society) => {
      const matchingFields = store.allResearchFields().filter((field) =>
        [...field.domesticSocieties, ...field.internationalSocieties].some((name) => name.includes(society.name) || society.name.includes(name))
      );
      labsForTerms(society.id, [
        ...matchingFields.map((field) => field.nameJa),
        ...society.relatedFields,
        ...society.disciplines,
      ]);
    });
    data.journals.forEach((journal) => {
      const matchingFields = store.allResearchFields().filter((field) =>
        [...field.domesticJournals, ...field.internationalJournals].some((name) => name.includes(journal.name) || journal.name.includes(name))
      );
      labsForTerms(journal.id, [
        ...matchingFields.map((field) => field.nameJa),
        ...journal.relatedFields,
        ...journal.disciplines,
      ]);
    });
    res.json({ query: q, summary: store.researchResourceSummary(), ...data, labCandidates, legends: store.researchResourceLegends(), facets: store.researchResourceFacets() });
  });

  // ============ カード（FR-CARD-01/03） ============
  app.get("/api/cards", (req, res) => {
    const sessionId = String(req.query.sessionId || "anon");
    const genre = req.query.genre ? String(req.query.genre) : null;
    const batch = Math.min(Number(req.query.batch) || 10, 30);
    res.json({ cards: nextCards(sessionId, genre, batch), threshold: PROFILE_THRESHOLD });
  });

  app.get("/api/cards/:id", (req, res) => {
    const card = store.cardById(req.params.id);
    if (!card) return res.status(404).json({ error: { code: "NOT_FOUND", message: "カードが見つかりません" } });
    const related = labsForCard(card.id, 3);
    const fallback = related.length === 0 ? nearbyCards(card.id, 3) : [];
    res.json({
      card,
      relatedLabs: related.map((r) => ({ lab: publicLab(r.lab), reasons: r.reason.reasons })),
      nearbyCards: fallback, // FR-MATCH-02
    });
  });

  // ============ カードアクション（冪等 AC-10 / FR-CARD-02） ============
  app.post("/api/card-actions", requireValueAction("card_action"), (req, res) => {
    const { actionId, sessionId, cardId, action } = req.body || {};
    if (!actionId || !sessionId || !cardId || !ACTIONS.includes(action))
      return bad(res, "actionId, sessionId, cardId, action が必要です");
    if (!store.cardById(cardId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "カードが存在しません" } });
    const rec: CardActionRecord = { actionId, sessionId, cardId, action, createdAt: nowIso() };
    const { created } = store.addCardAction(rec);
    if (created) store.addEvents([{ type: "card_action", sessionId, payload: { cardId, action }, at: nowIso() }]);
    const count = store.actionsBySession(sessionId).length;
    res.json({ ok: true, duplicate: !created, evaluatedCount: count, readyForProfile: count >= PROFILE_THRESHOLD });
  });

  // 再訪復元（AC-07）：セッションのアクション一覧
  app.get("/api/card-actions", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    if (!sessionId) return bad(res, "sessionId が必要です");
    res.json({ actions: store.actionsBySession(sessionId) });
  });

  // ============ 研究室カードデッキ（見つけるタブ。ADR-005 / FR-LABCARD-01/04） ============
  // AI生成カードは7日TTLでサーバーキャッシュ（全セッション共有）。不足分のみ1回のGemini呼び出しでバッチ生成。
  // モード：既定（週次共有ウィンドウ）／ q=AI意味検索で絞込 ／ mode=profile（興味の傾向に沿う）
  const toCardJson = (c: Awaited<ReturnType<typeof buildCardsFor>>[number]) => ({
    labId: c.labId, title: c.title, hook: c.hook, summary: c.summary,
    questions: c.questions || [], why: c.why,
    generatedBy: c.generatedBy,
    lab: {
      id: c.lab.id, name: c.lab.name, university: c.lab.university, major: c.lab.major,
      department: c.lab.department, field_major: c.lab.field_major, keywords: c.lab.keywords.slice(0, 4),
      pi: c.lab.pi, member_count: c.lab.member_count, has_url: c.lab.has_url,
    },
  });

  const fieldCard = (field: ResearchField, reason = "研究領域データベースから、今の探索に近い領域として出ています。"): DiscoveryCard => ({
    id: field.id,
    kind: "field",
    sourceId: field.id,
    title: field.questions?.[0] || `${field.nameJa}では、何を研究の問いにできるのか？`,
    label: "研究領域",
    summary: field.beginnerDescription || field.researchPurpose || field.definition || `${field.fullPath || field.nameJa}に位置づく研究領域です。`,
    connection: field.researchPurpose || (field.coordinate ? `対象と問いの座標: ${field.coordinate}` : reason),
    nextStep: "この領域に近い研究室・学会・ジャーナルを見比べます。",
    whyShown: reason,
    tags: [field.kingdom, field.division, ...(field.sourceKeywords || []), ...field.disciplines].filter(Boolean).slice(0, 5),
    connectionStatus: "candidate",
  });
  const societyCard = (society: ResearchSociety): DiscoveryCard => ({
    id: society.id,
    kind: "society",
    sourceId: society.id,
    title: society.questions?.[0] || `${society.name}では、どんな問いが議論されているのか？`,
    label: "学会",
    summary: society.description || `${society.kind || "学会"}として、${society.disciplines.slice(0, 3).join("・") || "関連領域"}の研究者が集まります。`,
    connection: society.relatedFields.length ? `関連領域: ${society.relatedFields.slice(0, 3).join("・")}` : "研究領域データベースからの接続です。",
    nextStep: "発表テーマや大会プログラムを見ると、研究の言葉が見つかります。",
    whyShown: "問いを研究コミュニティへ接続する入口として出しています。",
    tags: [society.kind, ...society.disciplines, ...society.relatedFields].filter(Boolean).slice(0, 5),
    url: society.url,
    connectionStatus: society.connectionStatus,
  });
  const journalCard = (journal: ResearchJournal): DiscoveryCard => ({
    id: journal.id,
    kind: "journal",
    sourceId: journal.id,
    title: journal.questions?.[0] || `${journal.name}には、どんな問いが論文として集まるのか？`,
    label: "ジャーナル",
    summary: journal.description || `${journal.kind || "ジャーナル"}として、${journal.disciplines.slice(0, 3).join("・") || "関連領域"}の論文を読む入口です。`,
    connection: journal.relatedFields.length ? `関連領域: ${journal.relatedFields.slice(0, 3).join("・")}` : "研究領域データベースからの接続です。",
    nextStep: "目次や最新号を見ると、問いの立て方や研究方法が見えます。",
    whyShown: "保存した問いを論文の読み方へつなげる候補として出しています。",
    tags: [journal.kind, ...journal.disciplines, ...journal.relatedFields].filter(Boolean).slice(0, 5),
    url: journal.url,
    connectionStatus: journal.connectionStatus,
  });
  const labDiscoveryCard = (c: ReturnType<typeof toCardJson>): DiscoveryCard => ({
    id: `lab-card:${c.labId}`,
    kind: "lab",
    sourceId: c.labId,
    title: c.title,
    label: "研究室",
    summary: c.summary,
    connection: c.questions?.[0] || "研究室が扱う問いから接続します。",
    nextStep: "研究室ページで研究内容・出典・マーキングを確認します。",
    whyShown: c.why || "公開情報とあなたの反応から候補として出ています。",
    tags: [c.hook, c.lab.university.name, fieldLabel(c.lab.field_major), ...c.lab.keywords].filter(Boolean).slice(0, 6),
    lab: c.lab,
    connectionStatus: "candidate",
  });
  function interleaveDiscoveryCards(cards: DiscoveryCard[], limit: number) {
    const result: DiscoveryCard[] = [];
    const queues = new Map<string, DiscoveryCard[]>();
    for (const card of cards) queues.set(card.kind, [...(queues.get(card.kind) || []), card]);
    const order = ["lab", "field", "society", "journal"];
    let cursor = 0;
    let guard = 0;
    while (result.length < limit && guard++ < 200) {
      const lastKinds = result.slice(-2).map((c) => c.kind);
      let nextKind = "";
      for (let i = 0; i < order.length; i++) {
        const kind = order[(cursor + i) % order.length];
        if ((queues.get(kind)?.length || 0) > 0 && !(lastKinds.length === 2 && lastKinds.every((k) => k === kind))) {
          nextKind = kind;
          cursor = (cursor + i + 1) % order.length;
          break;
        }
      }
      if (!nextKind) break;
      const next = queues.get(nextKind)!.shift();
      if (next) result.push(next);
    }
    return result;
  }

  app.get("/api/lab-cards", async (req, res) => {
    const sessionId = String(req.query.sessionId || "anon");
    const genre = req.query.genre ? String(req.query.genre) : null;
    const q = req.query.q ? String(req.query.q).trim() : "";
    const wantProfile = String(req.query.mode || "") === "profile";
    const batch = Math.min(Number(req.query.batch) || DECK_BATCH, 16);
    const base = { threshold: PROFILE_THRESHOLD, evaluatedCount: store.totalEvaluations(sessionId) };
    try {
      // --- AI検索モード（FR-LABCARD-04a）：さがすタブと同じ意味検索でデッキを絞る ---
      if (q.length >= 2) {
        const result = await smartSearch(q, 150);
        const evaluated = store.evaluatedLabIds(sessionId);
        const labs = result.labs.filter((l) => !evaluated.has(l.id) && l.keywords.length > 0).slice(0, batch);
        const cards = await buildCardsFor(labs);
        return res.json({
          ...base, mode: "search", cards: cards.map(toCardJson),
          interpreted: result.interpreted, by: result.by, totalMatched: result.total,
        });
      }
      // --- 傾向モード（FR-LABCARD-04b）：興味の傾向（プロファイル）に沿ったデッキ ---
      if (wantProfile) {
        const prof = buildProfile(sessionId);
        if ("needed" in prof) {
          // 傾向が未生成 → 既定デッキにフォールバック（UI側で案内）
          const cards = await getDeckCards(sessionId, genre, batch);
          return res.json({ ...base, mode: "default", profileReady: false, needed: prof.needed, cards: cards.map(toCardJson) });
        }
        const matched = matchLabs(sessionId, 80).map((m) => m.lab).filter((l) => l.keywords.length > 0);
        // 多様性ガード：同一分野はバッチ内3件まで
        const picked: typeof matched = [];
        const perField: Record<string, number> = {};
        for (const l of matched) {
          if (picked.length >= batch) break;
          if ((perField[l.field_major] || 0) >= 3) continue;
          perField[l.field_major] = (perField[l.field_major] || 0) + 1;
          picked.push(l);
        }
        for (const l of matched) { if (picked.length >= batch) break; if (!picked.includes(l)) picked.push(l); }
        const cards = await buildCardsFor(picked);
        return res.json({
          ...base, mode: "profile", profileReady: true, cards: cards.map(toCardJson),
          profileTop: prof.topAreas.map((a) => a.label),
          profileQuery: (prof.candidateFields.slice(0, 4).join(" ") || prof.topAreas.map((a) => a.label).join(" ")),
        });
      }
      // --- 既定デッキ（週次共有ウィンドウ） ---
      const cards = await getDeckCards(sessionId, genre, batch);
      res.json({ ...base, mode: "default", cards: cards.map(toCardJson) });
    } catch (e) {
      console.error("[lab-cards] error:", e);
      res.status(500).json({ error: { code: "INTERNAL", message: "カードの取得に失敗しました" } });
    }
  });

  app.get("/api/discovery-cards", async (req, res) => {
    const sessionId = String(req.query.sessionId || "anon");
    const q = String(req.query.q || "").trim();
    const batch = Math.min(Number(req.query.batch) || 16, 24);
    const terms = q ? q.split(/\s+/) : [
      ...store.actionsBySession(sessionId).flatMap((a) => store.cardById(a.cardId)?.keywords || []),
      ...store.labActionsBySession(sessionId).flatMap((a) => store.labById(a.labId)?.keywords || []),
      ...store.discoveryActionsBySession(sessionId).map((a) => a.itemId),
    ].slice(0, 12);

    try {
      const labs = q.length >= 2
        ? (await smartSearch(q, 80)).labs.slice(0, 6)
        : (await getDeckCards(sessionId, null, 6)).map((c) => c.lab);
      const labCards = await buildCardsFor(labs);
      const related = terms.length ? store.relatedResearchResources(terms, 6) : store.searchResearchResources("", 6);
      const cards: DiscoveryCard[] = [
        ...labCards.map((c) => labDiscoveryCard(toCardJson(c))),
        ...related.fields.slice(0, 5).map((f) => fieldCard(f)),
        ...related.societies.slice(0, 4).map(societyCard),
        ...related.journals.slice(0, 4).map(journalCard),
      ];
      res.json({
        cards: interleaveDiscoveryCards(cards, batch),
        mode: q ? "search" : "today",
        summary: store.researchResourceSummary(),
      });
    } catch (e) {
      console.error("[discovery-cards] error:", e);
      res.status(500).json({ error: { code: "INTERNAL", message: "であうカードの取得に失敗しました" } });
    }
  });

  // 研究室カードの評価（冪等 FR-LABCARD-02。テーマカードと同じ4アクション）
  app.post("/api/lab-card-actions", requireValueAction("lab_action"), (req, res) => {
    const { actionId, sessionId, labId, action } = req.body || {};
    if (!actionId || !sessionId || !labId || !ACTIONS.includes(action))
      return bad(res, "actionId, sessionId, labId, action が必要です");
    if (!store.labById(labId)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究室が存在しません" } });
    const rec: LabActionRecord = { actionId, sessionId, labId, action, createdAt: nowIso() };
    const { created } = store.addLabAction(rec);
    if (created) store.addEvents([{ type: "card_action", sessionId, payload: { labId, action, kind: "lab" }, at: nowIso() }]);
    const count = store.totalEvaluations(sessionId);
    res.json({ ok: true, duplicate: !created, evaluatedCount: count, readyForProfile: count >= PROFILE_THRESHOLD });
  });

  app.delete("/api/lab-card-actions", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const labId = String(req.query.labId || "");
    const action = String(req.query.action || "") as CardAction;
    if (!sessionId || !labId || !ACTIONS.includes(action)) return bad(res, "sessionId, labId, action が必要です");
    const removed = store.removeLabAction(sessionId, labId, action);
    res.json({ ok: true, removed, evaluatedCount: store.totalEvaluations(sessionId) + store.discoveryActionsBySession(sessionId).length });
  });

  app.post("/api/discovery-actions", requireValueAction("discovery_action"), (req, res) => {
    const { actionId, sessionId, itemId, itemKind, action } = req.body || {};
    if (!actionId || !sessionId || !itemId || !itemKind || !ACTIONS.includes(action))
      return bad(res, "actionId, sessionId, itemId, itemKind, action が必要です");
    const rec: DiscoveryActionRecord = { actionId, sessionId, itemId, itemKind, action, createdAt: nowIso() };
    const { created } = store.addDiscoveryAction(rec);
    if (created) store.addEvents([{ type: "card_action", sessionId, payload: { itemId, itemKind, action, kind: "discovery" }, at: nowIso() }]);
    res.json({ ok: true, duplicate: !created, evaluatedCount: store.totalEvaluations(sessionId) + store.discoveryActionsBySession(sessionId).length });
  });

  app.delete("/api/discovery-actions", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const itemId = String(req.query.itemId || "");
    const itemKind = String(req.query.itemKind || "");
    if (!sessionId || !itemId || !itemKind) return bad(res, "sessionId, itemId, itemKind が必要です");
    const removed = store.removeDiscoveryAction(sessionId, itemId, itemKind);
    res.json({ ok: true, removed, evaluatedCount: store.totalEvaluations(sessionId) + store.discoveryActionsBySession(sessionId).length });
  });

  app.get("/api/question-project", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    if (!sessionId) return bad(res, "sessionId が必要です");
    const existing = store.getQuestionProject(sessionId);
    const extras = collectProfileExtras(sessionId);
    const terms = [
      ...extras.questions.map((q) => q.text),
      ...extras.likedLabs.flatMap((l) => l.keywords.slice(0, 3)),
      ...extras.savedLabs.flatMap((l) => l.keywords.slice(0, 3)),
      ...store.discoveryActionsBySession(sessionId).map((a) => a.itemId),
    ].filter(Boolean).slice(0, 16);
    let related = terms.length ? store.relatedResearchResources(terms, 8) : store.searchResearchResources("言語", 8);
    if (!related.fields.length && !related.societies.length && !related.journals.length) {
      related = store.searchResearchResources("言語", 8);
    }
    let candidates = matchLabs(sessionId, 8);
    if (candidates.length === 0) {
      const fallbackQuery = terms.join(" ") || related.fields[0]?.nameJa || "言語";
      const fallbackLabs = store.searchLabs({ q: fallbackQuery }).slice(0, 8);
      const labs = fallbackLabs.length ? fallbackLabs : store.publicLabs().filter((l) => l.keywords.length > 0).slice(0, 8);
      candidates = labs.map((lab, i) => ({
        lab,
        reason: {
          labId: lab.id,
          score: 1 / (i + 1),
          reasons: ["初期候補として、問いに近い研究領域や公開キーワードから表示しています"],
          matchedCardIds: [],
        },
      }));
    }
    const hypothesis = extras.questions[0]?.text
      ? `今の問いの仮説：${extras.questions[0].text}`
      : "今の問いの仮説：気になった現象を、研究室・領域・方法へ接続しながら研究テーマに育てようとしている。";
    const routes = [
      {
        id: "route-field",
        title: "近い研究領域から入る",
        reframedQuestion: related.fields[0]?.nameJa ? `${related.fields[0].nameJa}の言葉で、問いを研究テーマに言い換える。` : "近い研究領域の言葉で、問いを研究テーマに言い換える。",
        fields: related.fields.slice(0, 3).map((f) => f.nameJa),
        methods: ["文献を読む", "概念を整理する", "近い研究室を比較する"],
        posture: "完全一致を探すより、近い入口から問いを育てる。",
        societies: related.societies.slice(0, 3).map((s) => s.name),
        journals: related.journals.slice(0, 3).map((j) => j.name),
        candidateLabIds: candidates.slice(0, 3).map((c) => c.lab.id),
        carryIn: "研究室の既存テーマに、自分が気になっている対象・現象を重ねて相談する。",
        nextCheck: "関連学会の発表タイトルを見て、問いの言い方を3つ拾う。",
      },
      {
        id: "route-method",
        title: "研究方法から入る",
        reframedQuestion: "何を知りたいかだけでなく、どう測る・作る・比較するかから研究室を探す。",
        fields: related.fields.slice(3, 6).map((f) => f.nameJa),
        methods: ["測定", "データ解析", "設計・評価"],
        posture: "対象が少し違っても、方法が近い研究室なら問いを持ち込みやすい。",
        societies: related.societies.slice(3, 6).map((s) => s.name),
        journals: related.journals.slice(3, 6).map((j) => j.name),
        candidateLabIds: candidates.slice(3, 6).map((c) => c.lab.id),
        carryIn: "自分の問いを、研究室が得意な方法で扱える形に翻訳する。",
        nextCheck: "候補研究室の研究方法欄を見て、使えそうな手法をメモする。",
      },
      {
        id: "route-lab",
        title: "近い研究室から入る",
        reframedQuestion: "近い研究室に入り、既存テーマの一部として自分の問いを組み立てる。",
        fields: related.fields.slice(0, 2).map((f) => f.nameJa),
        methods: ["先行研究の比較", "指導教員への相談メモ", "テーマのスコープ調整"],
        posture: "完全一致しなくても、近い入口を複数持つ。",
        societies: related.societies.slice(0, 2).map((s) => s.name),
        journals: related.journals.slice(0, 2).map((j) => j.name),
        candidateLabIds: candidates.slice(0, 5).map((c) => c.lab.id),
        carryIn: "この研究室のテーマの中で、自分の問いがどの対象・方法に近いかを言語化して持ち込む。",
        nextCheck: "研究室詳細やためるでメモを残し、いい/わからない/違う/大事を付ける。",
      },
    ];
    const project: QuestionProject = {
      id: existing?.id || `question-project-${sessionId}`,
      sessionId,
      hypothesis,
      seeds: terms.slice(0, 8),
      requirements: [
        "研究室を探すだけでなく、自分の問いを持ち込みたい。",
        "完全一致ではなく、近い入口を複数比較したい。",
      ],
      routes,
      evidence: {
        likedLabs: extras.likedLabs.map((l) => l.id),
        savedLabs: extras.savedLabs.map((l) => l.id),
        discoveryItems: store.discoveryActionsBySession(sessionId).map((a) => a.itemId),
      },
      updatedAt: nowIso(),
    };
    store.saveQuestionProject(project);
    res.json({ project, related, candidates: candidates.map((c) => ({ lab: publicLab(c.lab), reasons: c.reason.reasons })) });
  });

  // ============ プロファイル（FR-PROF-01） ============
  app.get("/api/profile", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    if (!sessionId) return bad(res, "sessionId が必要です");
    const result = buildProfile(sessionId);
    const extras = collectProfileExtras(sessionId); // 一覧・問い・分野内訳（未生成時も返す：気になる一覧等は先に使える）
    if ("needed" in result) {
      return res.json({ ready: false, evaluatedCount: result.evaluatedCount, needed: result.needed, threshold: PROFILE_THRESHOLD, extras });
    }
    store.saveProfile(result);
    store.addEvents([{ type: "profile_generated", sessionId, payload: { count: result.evaluatedCount }, at: nowIso() }]);
    const candidates = matchLabs(sessionId, 5);
    res.json({
      ready: true,
      profile: result,
      candidates: candidates.map((c) => ({ lab: publicLab(c.lab), reasons: c.reason.reasons, matchedCardIds: c.reason.matchedCardIds })),
      extras,
      profileQuery: result.candidateFields.slice(0, 4).join(" ") || result.topAreas.map((a) => a.label).join(" "),
    });
  });

  // 保存済み（SCR-03b：テーマカード＋研究室）
  app.get("/api/saved", (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    if (!sessionId) return bad(res, "sessionId が必要です");
    const saved = store.actionsBySession(sessionId).filter((a) => a.action === "save");
    const deep = store.actionsBySession(sessionId).filter((a) => a.action === "deep");
    const discoveryItems = store.discoveryActionsBySession(sessionId)
      .filter((a) => ["like", "save"].includes(a.action))
      .map((a) => ({ action: a.action, kind: a.itemKind, item: store.resourceByKind(a.itemKind, a.itemId), createdAt: a.createdAt }))
      .filter((x) => x.item);
    res.json({
      saved: saved.map((a) => store.cardById(a.cardId)).filter(Boolean),
      deepDived: deep.map((a) => store.cardById(a.cardId)).filter(Boolean),
      likedLabs: store.likedLabs(sessionId),
      savedLabs: store.savedLabs(sessionId), // 保存した研究室（ADR-005）
      discoveryItems,
    });
  });

  // ============ 研究室（FR-LAB-01/02, FR-MATCH-01） ============
  function publicLab(lab: ReturnType<typeof store.labById>) {
    if (!lab) return null;
    return lab; // sectionsのnullはフロントで「未確認」表示（FR-LAB-01）
  }

  app.get("/api/labs", (req, res) => {
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
    const s = (k: string) => (req.query[k] ? String(req.query[k]) : undefined);
    const hasFilter = !!(s("q") || s("univ") || s("field") || s("tag") || s("region") || s("prefecture") || s("type") || s("pi_title") || s("size") || s("major"));
    const sort = String(req.query.sort || (sessionId && !hasFilter ? "match" : "default"));
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 24, 100);

    let list = store.searchLabs({
      q: s("q"), univ: s("univ"), field: s("field"), region: s("region"), prefecture: s("prefecture"),
      type: s("type"), piTitle: s("pi_title"), size: s("size"), major: s("major"), hasUrl: s("has_url"), tag: s("tag"),
    });

    // 候補順（match）：セッションのマッチスコアで並べ、理由を添える（AC-09）
    const matchedReasons: Record<string, string[]> = {};
    if (sort === "match" && sessionId) {
      const matched = matchLabs(sessionId, 500);
      const rank = new Map(matched.map((m, i) => [m.lab.id, i]));
      matched.forEach((m) => { matchedReasons[m.lab.id] = m.reason.reasons; });
      list = [...list].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    } else if (sort === "univ") {
      list = [...list].sort((a, b) => a.university.name.localeCompare(b.university.name, "ja"));
    } else if (sort === "newest") {
      list = [...list].sort((a, b) => Number(b.id.replace("lab-", "")) - Number(a.id.replace("lab-", "")));
    }

    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit);
    res.json({ data: paged.map((l) => ({ ...l, matchReasons: matchedReasons[l.id] || [] })), total });
  });

  // AI意味検索（なんとなくの興味→研究室。FR-SEARCH-AI・追補）
  app.get("/api/labs/smart", aiRateLimit, requireValueAction("smart_search"), async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return bad(res, "2文字以上入力してください");
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 24, 60);
    try {
      const result = await smartSearch(q, 200);
      const paged = result.labs.slice((page - 1) * limit, page * limit);
      res.json({ interpreted: result.interpreted, by: result.by, total: result.total, data: paged });
    } catch (e) {
      console.error("[smart] error:", e);
      res.status(500).json({ error: { code: "INTERNAL", message: "検索に失敗しました" } });
    }
  });

  // ファセット（フィルタUIの選択肢＋件数バッジ）
  app.get("/api/filters", (_req, res) => {
    res.json({ facets: store.facets(), universities: store.universities().map((u) => u.name) });
  });

  // 都道府県（地域→都道府県の2段フィルタ）
  app.get("/api/prefectures", (req, res) => {
    const region = String(req.query.region || "");
    const regions = region.split(",").map((r) => r.trim()).filter(Boolean);
    const prefectures = Array.from(new Set(regions.flatMap((r) => store.prefecturesByRegion(r))));
    res.json({ prefectures });
  });

  app.get("/api/labs/:id", (req, res) => {
    const lab = store.labById(req.params.id);
    if (!lab)
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究室が見つかりません" } });
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
    store.addEvents([{ type: "lab_view", sessionId: sessionId || "anon", payload: { labId: lab.id }, at: nowIso() }]);
    // このセッションの保存カードから、この研究室への接続理由（AC-09）
    let reasons: string[] = [];
    if (sessionId) {
      const m = matchLabs(sessionId, 200).find((x) => x.lab.id === lab.id);
      if (m) reasons = m.reason.reasons;
    }
    res.json({ lab, connectionReasons: reasons });
  });

  // 研究室ページの充実（AI学生ガイド＋公開論文。lazy＋キャッシュ・FR-ENRICH）
  app.get("/api/labs/:id/enrich", enrichmentRateLimit, async (req, res) => {
    const lab = store.labById(req.params.id);
    if (!lab)
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究室が見つかりません" } });
    try {
      const enrichment = await enrichLab(lab);
      res.json(enrichment);
    } catch (e) {
      console.error("[enrich] error:", e);
      // 失敗時も画面を壊さない（AC-05）。空エンリッチメントを返す
      res.json({ aiGuide: null, papers: [], papersConfidence: "none", generatedAt: new Date().toISOString(), version: 0 });
    }
  });

  // 公式リンク離脱の計測（FR-EVT-01 outbound_click）
  app.post("/api/events", eventRateLimit, (req, res) => {
    const evts = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
    const allowedTypes = new Set(["session_start", "outbound_click"]);
    const sessionId = String(res.locals.mishiruSessionId || "anon");
    const clean: AppEvent[] = evts
      .filter((e: any) => e && typeof e.type === "string" && allowedTypes.has(e.type))
      .map((e: any) => {
        const rawPayload = e.payload && typeof e.payload === "object" && !Array.isArray(e.payload) ? e.payload : {};
        const payload = Object.fromEntries(Object.entries(rawPayload).slice(0, 20).map(([key, value]) => [boundedText(key, 80), typeof value === "boolean" || typeof value === "number" ? value : boundedText(value, 500)]));
        return { type: e.type, sessionId, payload, at: nowIso() } as AppEvent;
      });
    store.addEvents(clean);
    res.json({ ok: true, accepted: clean.length });
  });

  // ============ 大学（大学から探す） ============
  app.get("/api/universities", (_req, res) => {
    res.json({ universities: store.universities() });
  });
  app.get("/api/universities/:name", (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const labs = store.searchLabs({ univ: name });
    if (!labs.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "大学が見つかりません" } });
    const meta = store.universities().find((u) => u.name === name);
    // 専攻ごとにまとめる
    const byDept: Record<string, number> = {};
    for (const l of labs) byDept[l.department] = (byDept[l.department] || 0) + 1;
    res.json({ university: meta, labs, departments: Object.entries(byDept).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) });
  });

  // ============ 専攻（FR-DEP-01） ============
  app.get("/api/departments", (req, res) => {
    const univ = req.query.univ ? String(req.query.univ) : null;
    const map: Record<string, { key: string; university: string; department: string; count: number }> = {};
    for (const l of store.publicNonDemo()) {
      if (univ && l.university.name !== univ) continue;
      const key = `${l.university.name}|${l.department}`;
      (map[key] ||= { key, university: l.university.name, department: l.department, count: 0 }).count++;
    }
    // 20k件では専攻数が膨大なため件数上位を返す（UIは大学で絞ってから表示する想定）
    const departments = Object.values(map).sort((a, b) => b.count - a.count);
    res.json({ departments: univ ? departments : departments.slice(0, 60), total: departments.length });
  });
  app.get("/api/departments/:key", (req, res) => {
    const [university, department] = decodeURIComponent(req.params.key).split("|");
    const labs = store.searchLabs({ univ: university }).filter((l) => l.department === department);
    if (!labs.length) return res.status(404).json({ error: { code: "NOT_FOUND", message: "専攻が見つかりません" } });
    res.json({ university, department, labs });
  });

  // ============ Claim（FR-CLAIM-01/02, AC-03） ============
  app.post("/api/claims", claimRateLimit, async (req, res) => {
    const { type, labId, name, affiliation, email, message, evidenceUrl, website } = req.body || {};
    // 見えない項目を埋める自動投稿は、正常受付と同じ形で静かに破棄する。
    if (boundedText(website, 200)) return res.json({ ok: true, id: genId("claim") });
    const t: ClaimType = ["fix", "takedown", "claim", "other"].includes(type) ? type : "other";
    const normalizedName = String(name || "").trim().slice(0, 100);
    const normalizedAffiliation = String(affiliation || "").trim().slice(0, 200);
    const normalizedEmail = String(email || "").trim().toLowerCase().slice(0, 200);
    const normalizedMessage = String(message || "").trim().slice(0, 2000);
    const normalizedEvidenceUrl = String(evidenceUrl || "").trim().slice(0, 500);
    if (!normalizedName || !normalizedEmail || !normalizedMessage) return bad(res, "お名前・メール・内容は必須です");
    if (!isValidEmail(normalizedEmail)) return bad(res, "メールアドレスの形式が正しくありません");
    if (normalizedEvidenceUrl) {
      try {
        const parsed = new URL(normalizedEvidenceUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("invalid protocol");
      } catch {
        return bad(res, "確認資料のURLは、http:// または https:// から入力してください");
      }
    }
    const normalizedLabId = String(labId || "").trim();
    const lab = normalizedLabId ? store.labById(normalizedLabId) : null;
    const claim: Claim = {
      id: genId("claim"), type: t, labId: lab?.id || null, labName: lab?.name || null,
      name: normalizedName, affiliation: normalizedAffiliation, email: normalizedEmail, message: normalizedMessage,
      evidenceUrl: normalizedEvidenceUrl || undefined,
      status: "pending", createdAt: nowIso(), updatedAt: nowIso(),
    };
    try {
      await store.addClaim(claim);
    } catch (error) {
      console.error("[claim] 保存失敗:", error instanceof Error ? error.message : error);
      return res.status(503).json({ error: { code: "CLAIM_SAVE_UNAVAILABLE", message: "受け付けられませんでした。少し待ってからもう一度お試しください。" } });
    }
    await notifyClaim(claim);
    res.json({ ok: true, id: claim.id });
  });

  // ============ セッション削除（AC-06 / FR-PRIV-01） ============
  app.delete("/api/me", async (_req, res) => {
    const sessionId = String(res.locals.mishiruSessionId || "");
    if (!sessionId) return bad(res, "sessionId が必要です");
    const userId = res.locals.mishiruUser?.id || null;
    try {
      // レスポンス終了時の自動保存で、削除済みJSONBを再生成しないよう先に破棄する。
      discardSessionState();
      const result = store.deleteSession(sessionId);
      await deleteMishiruIdentity(userId, sessionId);
      if (userId) forgetLocalUser(userId);
      res.json({ ok: true, accountDeleted: Boolean(userId), deleted: result });
    } catch (error) {
      console.error("[account-delete]", error instanceof Error ? error.message : error);
      res.status(503).json({ error: { code: "DELETE_UNAVAILABLE", message: "データを削除できませんでした。少し待ってからもう一度お試しください。" } });
    }
  });

  // ============ 管理API（要admin, §7） ============
  app.get("/api/admin/kpi", requireAdmin, (_req, res) => {
    const events = store.allEvents();
    const sessions = new Set(events.map((e) => e.sessionId).filter((s) => s !== "anon"));
    const evalsAll = events.filter((e) => e.type === "card_action").length;
    const saves = events.filter((e) => e.type === "card_action" && e.payload?.action === "save").length;
    const profiles = events.filter((e) => e.type === "profile_generated").length;
    const labViews = events.filter((e) => e.type === "lab_view").length;
    const outbound = events.filter((e) => e.type === "outbound_click").length;

    // カード別成績
    const perCard: Record<string, { views: number; saves: number; skips: number }> = {};
    for (const e of events) {
      if (e.type !== "card_action") continue;
      const id = String(e.payload?.cardId);
      const rec = (perCard[id] ||= { views: 0, saves: 0, skips: 0 });
      rec.views++;
      if (e.payload?.action === "save") rec.saves++;
      if (e.payload?.action === "skip") rec.skips++;
    }
    res.json({
      sessions: sessions.size,
      evaluations: evalsAll,
      saveRate: evalsAll ? saves / evalsAll : 0,     // KPI-01
      profilesGenerated: profiles,
      completionRate: sessions.size ? profiles / sessions.size : 0, // KPI-02（生成/セッション近似）
      labTransitionRate: profiles ? labViews / profiles : 0,        // KPI-03近似
      outboundClicks: outbound,
      perCard,
    });
  });

  // 研究室データ・営業リスト（URL未登録＝整備ニーズが高い層。BR-06の営業初日リスト）
  app.get("/api/admin/labs", requireAdmin, (req, res) => {
    const s = (k: string) => (req.query[k] ? String(req.query[k]) : undefined);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const list = store.searchLabs({
      q: s("q"), univ: s("univ"), field: s("field"), region: s("region"), type: s("type"),
      hasUrl: s("has_url"), // has_url=false で営業対象を抽出
    });
    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit).map((l) => ({
      id: l.id, name: l.name, university: l.university.name, department: l.department,
      pi: `${l.pi.name} ${l.pi.title}`.trim(), memberCount: l.member_count, hasUrl: l.has_url,
      field: l.field_major, region: l.university.region,
    }));
    // 営業リスト用サマリー
    const all = store.publicNonDemo();
    res.json({ data: paged, total, summary: { totalLabs: all.length, noUrl: all.filter((l) => !l.has_url).length } });
  });

  // Claim管理
  app.get("/api/admin/claims", requireAdmin, async (_req, res) => {
    try {
      res.json({ claims: await store.allClaims() });
    } catch (error) {
      console.error("[claim] 一覧取得失敗:", error instanceof Error ? error.message : error);
      res.status(503).json({ error: { code: "CLAIM_LIST_UNAVAILABLE", message: "一覧を取得できませんでした。少し待ってからもう一度お試しください。" } });
    }
  });
  app.patch("/api/admin/claims/:id", requireAdmin, async (req, res) => {
    const { status, note } = req.body || {};
    if (status && !["pending", "in_review", "resolved", "rejected"].includes(status)) return bad(res, "不正なstatus");
    try {
      const c = await store.updateClaim(req.params.id, { ...(status && { status }), ...(note !== undefined && { note }) });
      if (!c) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Claimが見つかりません" } });
      res.json({ claim: c });
    } catch (error) {
      console.error("[claim] 更新失敗:", error instanceof Error ? error.message : error);
      res.status(503).json({ error: { code: "CLAIM_UPDATE_UNAVAILABLE", message: "更新できませんでした。少し待ってからもう一度お試しください。" } });
    }
  });
  // 一時非公開（FR-CLAIM-02）：本人確認前でも運営が即時hidden化
  app.post("/api/admin/labs/:id/status", requireAdmin, (req, res) => {
    const lab = store.allLabById(req.params.id);
    if (!lab) return res.status(404).json({ error: { code: "NOT_FOUND", message: "研究室が見つかりません" } });
    const next = String(req.body?.status || "");
    const allowed = ["draft", "review_requested", "published", "claimed", "update_requested", "hidden", "archived"];
    if (!allowed.includes(next)) return bad(res, "不正なstatus");
    (lab as any).status = next;
    res.json({ ok: true, lab });
  });

  // リード管理（FR-LEAD-01, AC-08）
  app.get("/api/admin/leads", requireAdmin, (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    let leads = store.allLeads();
    if (status) leads = leads.filter((l) => l.status === status);
    res.json({ leads });
  });
  app.post("/api/admin/leads", requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.labName || !b.university) return bad(res, "university, labName は必須です");
    if (!b.nextActionDate) return bad(res, "次アクション日（nextActionDate）は必須です"); // STATE-03
    const lead: Lead = {
      id: genId("lead"), university: b.university, department: b.department || "", labName: b.labName,
      labId: b.labId || null, hasUrl: !!b.hasUrl, urlStale: !!b.urlStale, hasKaken: !!b.hasKaken,
      status: b.status || "new", nextAction: b.nextAction || "", nextActionDate: b.nextActionDate,
      memo: b.memo || "", createdAt: nowIso(), updatedAt: nowIso(),
    };
    store.addLead(lead);
    res.json({ lead });
  });
  app.patch("/api/admin/leads/:id", requireAdmin, (req, res) => {
    const b = req.body || {};
    if (b.status === undefined && b.nextActionDate === undefined && b.nextAction === undefined && b.memo === undefined)
      return bad(res, "更新項目がありません");
    if (b.status && b.nextActionDate === "") return bad(res, "次アクション日は空にできません");
    const l = store.updateLead(req.params.id, b);
    if (!l) return res.status(404).json({ error: { code: "NOT_FOUND", message: "リードが見つかりません" } });
    res.json({ lead: l });
  });

  // 診断レポート（FR-REPORT-01/02, AC-04）
  app.post("/api/admin/reports/generate", requireAdmin, async (req, res) => {
    const { labId, labName, researcher, sourceUrl } = req.body || {};
    if (!labId && !labName && !researcher) return bad(res, "labId / labName / researcher のいずれかが必要です");
    const { content, generatedBy } = await generateReport({ labId, labName, researcher, sourceUrl });
    const lab = labId ? store.allLabById(labId) : null;
    const report: Report = {
      id: genId("report"), labId: labId || null, labName: lab?.name || labName || researcher || "対象研究室",
      researcher, sourceUrl, content, generatedBy, status: "draft", createdAt: nowIso(), updatedAt: nowIso(),
    };
    store.addReport(report);
    res.json({ report });
  });
  app.get("/api/admin/reports", requireAdmin, (_req, res) => res.json({ reports: store.allReports() }));
  app.patch("/api/admin/reports/:id", requireAdmin, (req, res) => {
    const b = req.body || {};
    if (b.status && !["draft", "edited", "sent", "negotiating", "won", "lost"].includes(b.status)) return bad(res, "不正なstatus");
    const r = store.updateReport(req.params.id, b);
    if (!r) return res.status(404).json({ error: { code: "NOT_FOUND", message: "レポートが見つかりません" } });
    res.json({ report: r });
  });

  // 記事ワークフロー（FR-ARTICLE-01, STATE-02）
  app.get("/api/admin/articles", requireAdmin, (_req, res) => res.json({ articles: store.allArticles() }));
  app.post("/api/admin/articles", requireAdmin, (req, res) => {
    const b = req.body || {};
    if (!b.labName || !b.title) return bad(res, "labName, title は必須です");
    const a: Article = {
      id: genId("article"), labId: b.labId || null, labName: b.labName, title: b.title,
      writer: b.writer || "", status: b.status || "idea", createdAt: nowIso(), updatedAt: nowIso(),
    };
    store.addArticle(a);
    res.json({ article: a });
  });
  app.patch("/api/admin/articles/:id", requireAdmin, (req, res) => {
    const b = req.body || {};
    const valid = ["idea", "assigned", "draft", "editing", "professor_review", "approved", "published", "rejected", "archived"];
    if (b.status && !valid.includes(b.status)) return bad(res, "不正なstatus");
    const current = store.allArticles().find((x) => x.id === req.params.id);
    if (!current) return res.status(404).json({ error: { code: "NOT_FOUND", message: "記事が見つかりません" } });
    // 差戻し（professor_review→editing のみ）は理由必須（STATE-02）
    if (b.status === "editing" && current.status === "professor_review" && !b.returnReason)
      return bad(res, "差戻しには理由（returnReason）が必要です");
    const a = store.updateArticle(req.params.id, b);
    res.json({ article: a });
  });

  app.get("/api/admin/cards", requireAdmin, (_req, res) => {
    const perCard: Record<string, { saves: number; likes: number; skips: number; deep: number }> = {};
    for (const e of store.allEvents()) {
      if (e.type !== "card_action") continue;
      const id = String(e.payload?.cardId);
      const rec = (perCard[id] ||= { saves: 0, likes: 0, skips: 0, deep: 0 });
      const act = String(e.payload?.action);
      if (act === "save") rec.saves++; else if (act === "like") rec.likes++;
      else if (act === "skip") rec.skips++; else if (act === "deep") rec.deep++;
    }
    res.json({ cards: store.allCards().map((c) => ({ id: c.id, title: c.title, stats: perCard[c.id] || { saves: 0, likes: 0, skips: 0, deep: 0 } })) });
  });

  // ============ Sitemap（published/claimedのみ。20k件はindex分割） ============
  let sitemapCache = "";
  app.get(["/sitemap.xml", "/api/sitemap.xml"], (_req, res) => {
    const base = process.env.APP_URL || "https://mishiru-lab.com";
    if (!sitemapCache) {
      const parts = ["/", "/search", "/discover", "/labs", "/universities", "/for-labs", "/policy", "/privacy"].map((p) => `<url><loc>${base}${p}</loc></url>`);
      for (const lab of store.publicNonDemo()) parts.push(`<url><loc>${base}/labs/${lab.id}</loc></url>`);
      sitemapCache = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>`;
    }
    res.header("Content-Type", "application/xml").send(sitemapCache);
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "この操作は利用できません。画面を再読み込みしてください。" } }));

  // ============ フロント配信 ============
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  // JSONの破損・容量超過・未処理例外を、内部情報を出さない一貫した応答へ変換する。
  app.use(apiErrorHandler);

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(PORT, HOST, () => {
    const providers = aiProviderStatus();
    console.log(`MISHIRU server http://localhost:${PORT}  [openai:${providers.openai} gemini:${providers.gemini} mail:${MAIL_ENABLED} admin:${!!ADMIN_TOKEN}]`);
  });
}

if (!process.env.VERCEL) void startServer();
