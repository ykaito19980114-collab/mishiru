import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import type {
  ConsultationAsset, ConsultationAssetFormat, ConsultationDocumentDraft, ConsultationDocumentOptions,
  ResearchOutline, ResearchProject,
} from "../shared/research-project";
import { ACTIVE_DATASET } from "./research-project-repository";

const TEMPLATE_VERSION = "mishiru-consultation-v1";
const RUNTIME_DIR = path.join(process.cwd(), "data", "runtime");
const DB_FILE = path.join(RUNTIME_DIR, ACTIVE_DATASET === "mishiru-sample" ? "consultation-exports.sample.json" : "consultation-exports.json");
const OUTPUT_DIR = path.join(RUNTIME_DIR, "exports", ACTIVE_DATASET);
const makeId = () => `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const DEFAULT_DOCUMENT_OPTIONS: ConsultationDocumentOptions = {
  includeCover: true, includeComments: true, includeNextActions: true, includeMaterials: false, showEmpty: false,
};

function clean(values: Array<string | undefined | null>) { return values.map((value) => String(value || "").trim()).filter(Boolean); }
function lines(value: string | string[]) { return clean(Array.isArray(value) ? value : [value]); }
function shorten(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(1, max - 1))}…`;
}
function section(sections: Record<string, string[]>, label: string, value: string | string[], showEmpty: boolean) {
  const values = lines(value);
  if (values.length || showEmpty) sections[label] = values.length ? values : ["未記入"];
}

export function buildConsultationDraft(project: ResearchProject, format: ConsultationAssetFormat, options: Partial<ConsultationDocumentOptions> = {}): ConsultationDocumentDraft {
  const opts = { ...DEFAULT_DOCUMENT_OPTIONS, ...options };
  const o = project.step2Response.research_outline;
  const sections: Record<string, string[]> = {};
  if (format === "pptx_1") {
    section(sections, "背景・違和感", shorten(`${o.background} ${o.problem}`, 180), opts.showEmpty);
    section(sections, "目的", shorten(o.purpose, 120), opts.showEmpty);
    section(sections, "メインRQ", shorten(o.main_rq, 120), opts.showEmpty);
    section(sections, "対象", shorten(o.target_population, 90), opts.showEmpty);
    section(sections, "方法", shorten(`${o.research_design} ${o.data_collection} ${o.analysis_method}`, 150), opts.showEmpty);
    section(sections, "研究として面白そうな点", shorten(o.interesting_points, 120), opts.showEmpty);
    section(sections, "難しそうな点", o.difficult_points.map((v) => shorten(v, 70)), opts.showEmpty);
    section(sections, "相談したいこと", o.consultation_questions.map((v) => shorten(v, 75)), opts.showEmpty);
  } else if (format === "pptx_2") {
    section(sections, "1｜背景", shorten(o.background, 200), opts.showEmpty); section(sections, "1｜問題", shorten(o.problem, 170), opts.showEmpty);
    section(sections, "1｜目的", shorten(o.purpose, 150), opts.showEmpty); section(sections, "1｜メインRQ", shorten(o.main_rq, 130), opts.showEmpty);
    section(sections, "1｜サブRQ", o.sub_rqs.map((v) => shorten(v, 80)), opts.showEmpty);
    section(sections, "2｜対象", shorten(o.target_population, 120), opts.showEmpty); section(sections, "2｜研究デザイン", shorten(o.research_design, 120), opts.showEmpty);
    section(sections, "2｜データ収集", shorten(o.data_collection, 120), opts.showEmpty); section(sections, "2｜分析方法", shorten(o.analysis_method, 140), opts.showEmpty);
    section(sections, "2｜面白そうな点", shorten(o.interesting_points, 120), opts.showEmpty); section(sections, "2｜難しそうな点", o.difficult_points.map((v) => shorten(v, 75)), opts.showEmpty);
    section(sections, "2｜相談したいこと", o.consultation_questions.map((v) => shorten(v, 80)), opts.showEmpty);
  } else if (format === "pptx_3") {
    section(sections, "1｜背景", shorten(o.background, 230), opts.showEmpty); section(sections, "1｜違和感・問題", shorten(o.problem, 200), opts.showEmpty); section(sections, "1｜目的", shorten(o.purpose, 170), opts.showEmpty);
    section(sections, "2｜メインRQ", shorten(o.main_rq, 150), opts.showEmpty); section(sections, "2｜サブRQ", o.sub_rqs.map((v) => shorten(v, 90)), opts.showEmpty);
    section(sections, "2｜概念モデル", o.conceptual_model.map((v) => shorten(v, 55)), opts.showEmpty); section(sections, "2｜対象", shorten(o.target_population, 130), opts.showEmpty);
    section(sections, "2｜研究デザイン", shorten(o.research_design, 130), opts.showEmpty); section(sections, "2｜データ収集", shorten(o.data_collection, 130), opts.showEmpty); section(sections, "2｜分析方法", shorten(o.analysis_method, 150), opts.showEmpty);
    section(sections, "3｜学術的意義", shorten(o.significance.academic, 130), opts.showEmpty); section(sections, "3｜実務的意義", shorten(o.significance.practical, 130), opts.showEmpty); section(sections, "3｜社会的意義", shorten(o.significance.social, 130), opts.showEmpty);
    section(sections, "3｜面白そうな点", shorten(o.interesting_points, 130), opts.showEmpty); section(sections, "3｜難しそうな点", o.difficult_points.map((v) => shorten(v, 80)), opts.showEmpty);
    section(sections, "3｜相談したいこと", o.consultation_questions.map((v) => shorten(v, 85)), opts.showEmpty);
    if (opts.includeNextActions) section(sections, "3｜次にやること", o.next_actions.filter((v) => !v.completed).map((v) => shorten(v.text, 70)), opts.showEmpty);
  } else {
    addFullOutline(sections, o, opts);
    if (opts.includeMaterials) section(sections, "関連素材", project.sourceMaterials.map((item) => `${item.title}${item.url ? `｜${item.url}` : ""}`), opts.showEmpty);
  }
  return { title: project.displayTitle, subtitle: project.subtitle, sections, options: opts };
}

function addFullOutline(sections: Record<string, string[]>, o: ResearchOutline, opts: ConsultationDocumentOptions) {
  section(sections, "一般向けタイトル", o.title_public, opts.showEmpty); section(sections, "学術向けタイトル", o.title_academic, opts.showEmpty);
  section(sections, "研究の中心的な意味・仕組み", o.mim, opts.showEmpty); section(sections, "背景", o.background, opts.showEmpty);
  section(sections, "問題", o.problem, opts.showEmpty); section(sections, "目的", o.purpose, opts.showEmpty); section(sections, "メインRQ", o.main_rq, opts.showEmpty);
  section(sections, "サブRQ", o.sub_rqs, opts.showEmpty); section(sections, "先行研究との差分", o.related_work_diff, opts.showEmpty);
  section(sections, "概念モデル", o.conceptual_model, opts.showEmpty); section(sections, "研究デザイン", o.research_design, opts.showEmpty);
  section(sections, "対象", o.target_population, opts.showEmpty); section(sections, "データ収集", o.data_collection, opts.showEmpty);
  section(sections, "分析方法", o.analysis_method, opts.showEmpty); section(sections, "評価方法", o.evaluation_method, opts.showEmpty);
  section(sections, "倫理的配慮", o.ethical_considerations, opts.showEmpty); section(sections, "学術的意義", o.significance.academic, opts.showEmpty);
  section(sections, "実務的意義", o.significance.practical, opts.showEmpty); section(sections, "社会的意義", o.significance.social, opts.showEmpty);
  section(sections, "限界", o.limitations, opts.showEmpty); section(sections, "次のステップ", o.next_steps, opts.showEmpty);
  section(sections, "研究として面白そうな点", o.interesting_points, opts.showEmpty); section(sections, "難しそうな点", o.difficult_points, opts.showEmpty);
  section(sections, "相談したいこと", o.consultation_questions, opts.showEmpty);
  if (opts.includeComments) section(sections, "コメント", o.comments, opts.showEmpty);
  if (opts.includeNextActions) section(sections, "次にやること", o.next_actions.map((item) => `${item.completed ? "完了" : "未完了"}｜${item.text}${item.dueDate ? `｜期限 ${item.dueDate}` : ""}`), opts.showEmpty);
}

export class ConsultationAssetRepository {
  read(): ConsultationAsset[] { if (!fs.existsSync(DB_FILE)) return []; try { const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); return Array.isArray(parsed) ? parsed : []; } catch (error) { throw new Error(`RUNTIME_JSON_CORRUPT:${DB_FILE}:${error instanceof Error ? error.message : "parse error"}`); } }
  write(items: ConsultationAsset[]) { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); const temp=`${DB_FILE}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(items), "utf8"); fs.renameSync(temp,DB_FILE); }
  list(project: ResearchProject) { return this.read().filter((item) => item.projectId === project.id && item.dataset === ACTIVE_DATASET).map((item) => item.status === "ready" && new Date(project.updatedAt) > new Date(item.generatedFromUpdatedAt) ? { ...item, status: "outdated" as const } : item); }
  create(item: ConsultationAsset) { const items = this.read(); items.unshift(clone(item)); this.write(items); return clone(item); }
  update(id: string, patch: Partial<ConsultationAsset>) { const items = this.read(); const index = items.findIndex((item) => item.id === id && item.dataset === ACTIVE_DATASET); if (index < 0) return null; items[index] = { ...items[index], ...clone(patch), id: items[index].id }; this.write(items); return clone(items[index]); }
  delete(id: string) { const items = this.read(); const item = items.find((candidate) => candidate.id === id && candidate.dataset === ACTIVE_DATASET); if (!item) return false; this.write(items.filter((candidate) => candidate !== item)); try { if (item.filePath && fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath); } catch { /* metadata deletion still succeeds */ } return true; }
  get(id: string) { return this.read().find((item) => item.id === id && item.dataset === ACTIVE_DATASET) || null; }
}

export class ConsultationExportService {
  constructor(private readonly assets = new ConsultationAssetRepository()) {}
  async generate(project: ResearchProject, format: ConsultationAssetFormat, draft: ConsultationDocumentDraft) {
    const version = project.versions.find((item) => item.versionId === project.currentVersionId);
    if (!version) throw new Error("CURRENT_VERSION_NOT_FOUND");
    const id = makeId(); const now = new Date().toISOString();
    const asset: ConsultationAsset = { id, projectId: project.id, versionId: version.versionId, sessionId: project.sessionId, dataset: ACTIVE_DATASET, format, pageCount: format === "pdf" ? 0 : Number(format.slice(-1)), status: "generating", filePath: "", downloadPath: `/api/projects/${project.id}/assets/${id}/download`, generatedAt: now, generatedFromUpdatedAt: project.updatedAt, templateVersion: TEMPLATE_VERSION, includedSections: Object.keys(draft.sections), fontName: format === "pdf" ? "OS Japanese font (runtime detected)" : "Hiragino Sans / compatible sans-serif", draft, error: "" };
    this.assets.create(asset);
    let outputPath = "";
    try {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const ext = format === "pdf" ? "pdf" : "pptx";
      const filename = uniqueFilename(project.displayTitle, version.versionNumber, format, ext);
      const filePath = path.join(OUTPUT_DIR, filename); outputPath = filePath;
      const fontInfo = format === "pdf" ? findJapaneseFont() : null;
      const pageCount = format === "pdf" ? await generatePdf(project, version.versionName, draft, filePath, fontInfo!) : await generatePptx(project, format, draft, filePath);
      return this.assets.update(id, { status: "ready", filePath, pageCount, fontName: fontInfo?.name || asset.fontName, generatedAt: new Date().toISOString() })!;
    } catch (error) {
      try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* do not mask original error */ }
      this.assets.update(id, { status: "error", error: error instanceof Error ? error.message : "生成に失敗しました" });
      throw error;
    }
  }
}

function safeName(value: string) { return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, "_").slice(0, 48) || "研究テーマ"; }
function uniqueFilename(title: string, version: number, format: ConsultationAssetFormat, ext: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", ""); const suffix = format === "pdf" ? "" : `_${format.slice(-1)}slides`;
  const base = `MISHIRU_${safeName(title)}_v${version}${suffix}_${date}`; let file = `${base}.${ext}`; let count = 2;
  while (fs.existsSync(path.join(OUTPUT_DIR, file))) file = `${base}_${count++}.${ext}`;
  return file;
}

function findJapaneseFont(): { path: string; name: string; collectionName: string } {
  const dirs = ["/System/Library/Fonts", "/Library/Fonts", "/usr/share/fonts/opentype/noto", "/usr/share/fonts/truetype/noto"];
  for (const dir of dirs) { try { const names = fs.readdirSync(dir); const hit = names.find((name) => /W3\.ttc$/.test(name)) || names.find((name) => /NotoSans(?:CJK|JP).*Regular.*\.(otf|ttc|ttf)$/.test(name)) || names.find((name) => /STHeiti Light\.ttc$/.test(name)); if (hit) return { path:path.join(dir,hit), name:hit, collectionName:/W3\.ttc$/.test(hit)?"HiraginoSans-W3":/STHeiti/.test(hit)?"STHeitiSC-Light":"" }; } catch { /* next */ } }
  throw new Error("日本語PDFフォントが見つかりません。OSへ日本語フォントを追加して再試行してください。");
}

async function generatePdf(project: ResearchProject, versionName: string, draft: ConsultationDocumentDraft, filePath: string, fontInfo: { path:string; name:string; collectionName:string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const fontPath = fontInfo.path; const doc = new PDFDocument({ size: "A4", margins: { top: 55, bottom: 54, left: 56, right: 56 }, bufferPages: true, info: { Title: project.displayTitle, Author: "MISHIRU" } });
    const stream = fs.createWriteStream(filePath); stream.on("error", reject); doc.on("error", reject); doc.pipe(stream);
    try { fontInfo.collectionName ? doc.font(fontPath, fontInfo.collectionName) : doc.font(fontPath); } catch (error) { reject(error); return; }
    if (draft.options.includeCover) drawPdfCover(doc, project, versionName);
    if (draft.options.includeCover) doc.addPage();
    doc.fillColor("#141619").fontSize(22).text(draft.title, { lineGap: 3 });
    if (draft.subtitle) doc.moveDown(.35).fillColor("#383d46").fontSize(11).text(draft.subtitle, { lineGap: 3 });
    doc.moveDown(.7).fontSize(8.5).fillColor("#6a707a").text(`状態：${statusLabel(project.status)}　Version：${versionName}　作成：${project.createdAt.slice(0,10)}　更新：${project.updatedAt.slice(0,10)}`);
    doc.moveDown(1);
    for (const [label, values] of Object.entries(draft.sections)) {
      if (doc.y > doc.page.height - 125) doc.addPage();
      doc.fillColor("#123ef5").fontSize(12).text(label, { lineGap: 2 }); doc.moveDown(.25);
      for (const value of values) { const wrapped = value.replace(/(https?:\/\/\S{42})/g, "$1\u200b"); doc.fillColor("#141619").fontSize(10).text(values.length > 1 ? `・${wrapped}` : wrapped, { lineGap: 4, paragraphGap: 3 }); }
      doc.moveDown(.65);
    }
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) { doc.switchToPage(index); doc.fillColor("#6a707a").fontSize(7).text(`${shorten(project.displayTitle, 38)} / ${versionName}`, 56, doc.page.height - 38, { width: doc.page.width - 112, height: 10, lineBreak: false, align: "left" }); doc.text(`${index + 1} / ${range.count}`, 56, doc.page.height - 38, { width: doc.page.width - 112, height: 10, lineBreak: false, align: "right" }); }
    doc.end(); stream.on("finish", () => resolve(range.count));
  });
}

function drawPdfCover(doc: PDFKit.PDFDocument, project: ResearchProject, versionName: string) {
  const cover = project.cover; const bg = cover.backgroundType === "gradient" ? cover.gradientStart : cover.solidColor;
  doc.save().rect(0, 0, doc.page.width, doc.page.height).fill(bg || "#123ef5");
  if (cover.backgroundType === "image" && cover.image) { try { const source = cover.image.storagePath && fs.existsSync(cover.image.storagePath) ? cover.image.storagePath : Buffer.from(cover.image.dataUrl.split(",")[1], "base64"); doc.image(source, 0, 0, { fit: [doc.page.width, doc.page.height], align: "center", valign: "center" }); doc.fillColor(cover.image.overlayColor).opacity(cover.image.overlayOpacity).rect(0, 0, doc.page.width, doc.page.height).fill().opacity(1); } catch { /* keep color cover */ } }
  doc.fillColor(cover.title.color || "#ffffff").fontSize(30).text(project.displayTitle, 58, 165, { width: doc.page.width - 116, lineGap: 5 });
  doc.moveDown(.8).fillColor(cover.subtitle.color || "#ffffff").fontSize(13).text(project.subtitle, { width: doc.page.width - 116, lineGap: 4 });
  doc.fillColor(cover.metadata.color || "#dce51b").fontSize(10).text(`MISHIRU RESEARCH PROJECT\n${versionName}`, 58, doc.page.height - 105, { width: doc.page.width - 116 }); doc.restore();
}

async function generatePptx(project: ResearchProject, format: ConsultationAssetFormat, draft: ConsultationDocumentDraft, filePath: string) {
  const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "MISHIRU"; pptx.subject = project.displayTitle; pptx.title = project.displayTitle;
  pptx.theme = { headFontFace: "Hiragino Sans", bodyFontFace: "Hiragino Sans" };
  const count = Number(format.slice(-1));
  const accent = (project.cover.gradientStart || project.cover.solidColor || "#123ef5").replace("#", "").toUpperCase();
  for (let page = 1; page <= count; page++) {
    const slide = pptx.addSlide(); slide.background = { color: "F7F7F5" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: .18, h: 7.5, line: { color: accent, transparency: 100 }, fill: { color: accent } });
    slide.addText(pageTitle(format, page), { x: .6, y: .35, w: 11.9, h: .45, fontFace: "Hiragino Sans", fontSize: 12, bold: true, color: "123EF5", margin: 0 });
    slide.addText(shorten(draft.title, 62), { x: .6, y: .85, w: 12.05, h: .72, fontFace: "Hiragino Sans", fontSize: 25, bold: true, color: "141619", margin: 0, breakLine: false });
    const entries = Object.entries(draft.sections).filter(([label]) => count === 1 || label.startsWith(`${page}｜`)).map(([label, values]) => [label.replace(/^\d｜/, ""), values] as const);
    const columns = count === 1 ? 3 : 2; const gap = .18; const width = (12.05 - gap * (columns - 1)) / columns; const rows = Math.ceil(entries.length / columns); const height = Math.min(2.25, (5.35 - gap * Math.max(0, rows - 1)) / Math.max(1, rows));
    entries.forEach(([label, values], index) => { const col = index % columns, row = Math.floor(index / columns), x = .6 + col * (width + gap), y = 1.75 + row * (height + gap); slide.addShape(pptx.ShapeType.roundRect, { x, y, w: width, h: height, rectRadius: .05, line: { color: "D7D9DE", width: 1 }, fill: { color: "FFFFFF" } }); slide.addText(label, { x: x + .16, y: y + .12, w: width - .32, h: .28, fontSize: 10, bold: true, color: "123EF5", margin: 0 }); slide.addText(values.map((value) => ({ text: values.length > 1 ? `・${value}\n` : value, options: { breakLine: false } })), { x: x + .16, y: y + .48, w: width - .32, h: height - .58, fontSize: count === 1 ? 9 : 11, color: "383D46", breakLine: false, margin: 0, valign: "top", fit: "shrink", paraSpaceAfter: 4 }); });
    slide.addText(`MISHIRU ｜ ${project.versions.find((v) => v.versionId === project.currentVersionId)?.versionName || "Version"} ｜ ${page}/${count}`, { x: .6, y: 7.15, w: 12, h: .18, fontSize: 6.5, color: "6A707A", margin: 0, align: "right" });
  }
  await pptx.writeFile({ fileName: filePath }); return count;
}

function pageTitle(format: ConsultationAssetFormat, page: number) { if (format === "pptx_1") return "研究案と相談事項"; if (format === "pptx_2") return page === 1 ? "なぜ・何を研究するか" : "どう調べ、何を相談するか"; return ["なぜ研究したいか", "何をどう調べるか", "何を相談したいか"][page - 1]; }
function statusLabel(status: ResearchProject["status"]) { return status === "draft" ? "作成中" : status === "consultation" ? "相談用" : "保留"; }
