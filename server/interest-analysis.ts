import fs from "fs";
import path from "path";
import type { InterestAnalysis, InterestAnalysisResult, NormalizedResearchMaterial } from "../shared/research-project";
import { callAIJson, aiEnabled, currentAiModel } from "./ai";
import { store } from "./store";
import { ACTIVE_DATASET } from "./research-project-repository";
import { aiUsageConfig } from "./ai-usage-config";
import { getSessionSection, hasRemoteSessionState, setSessionSection } from "./session-state";

const FILE = path.join(process.cwd(), "data", "runtime", ACTIVE_DATASET === "mishiru-sample" ? "interest-analyses.sample.json" : "interest-analyses.json");
const active = new Set<string>();
const dateKey = (value = new Date()) => value.toISOString().slice(0, 10);
const makeId = () => `interest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const materialKey = (item: NormalizedResearchMaterial) => `${item.sourceType}:${item.sourceId}`;

export class InterestAnalysisRepository {
  read(): InterestAnalysis[] { if (hasRemoteSessionState()) return getSessionSection<InterestAnalysis[]>("interestAnalyses", []); if (!fs.existsSync(FILE)) return []; try { const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")); return Array.isArray(parsed) ? parsed : []; } catch (error) { throw new Error(`RUNTIME_JSON_CORRUPT:${FILE}:${error instanceof Error ? error.message : "parse error"}`); } }
  write(items: InterestAnalysis[]) { if (hasRemoteSessionState()) { setSessionSection("interestAnalyses", items); return; } fs.mkdirSync(path.dirname(FILE), { recursive: true }); const temp=`${FILE}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(items), "utf8"); fs.renameSync(temp,FILE); }
  list(sessionId: string) { return this.read().filter((item) => item.sessionId === sessionId && item.dataset === ACTIVE_DATASET); }
  latest(sessionId: string) { return this.list(sessionId).sort((a,b) => b.lastAnalyzedAt.localeCompare(a.lastAnalyzedAt))[0] || null; }
  create(item: InterestAnalysis) { const items = this.read(); items.unshift(item); this.write(items); return item; }
  countToday(sessionId: string) { const today = dateKey(); return this.list(sessionId).filter((item) => item.status === "ready" && item.lastAnalyzedAt.startsWith(today)).length; }
}

export class InterestAnalysisService {
  constructor(private readonly repository = new InterestAnalysisRepository()) {}
  usage(sessionId: string) { const limit = aiUsageConfig().interestAnalysisDailyLimit; const count = this.repository.countToday(sessionId); return { dailyAnalysisCount: count, planLimit: limit, canAnalyze: limit === null || count < limit }; }
  async analyze(sessionId: string, rawMaterials: NormalizedResearchMaterial[], excludedSourceIds: string[]) {
    const lock = `${ACTIVE_DATASET}:${sessionId}`; if (active.has(lock)) throw new Error("ANALYSIS_IN_PROGRESS");
    const usage = this.usage(sessionId); if (!usage.canAnalyze) throw new Error("DAILY_LIMIT_REACHED");
    const materials = rawMaterials.filter((item) => !excludedSourceIds.includes(materialKey(item)) && !excludedSourceIds.includes(item.sourceId));
    if (!materials.length) throw new Error("NO_ANALYSIS_MATERIALS");
    active.add(lock);
    try {
      const previous = this.repository.latest(sessionId);
      const aiResult = aiEnabled() ? await analyzeWithAI(materials) : null;
      const result = aiResult || deterministicAnalysis(materials, previous?.result);
      const now = new Date().toISOString(); const count = usage.dailyAnalysisCount + 1;
      const analysis: InterestAnalysis = { id: makeId(), sessionId, dataset: ACTIVE_DATASET, sourceSnapshot: materials, excludedSourceIds, result, lastAnalyzedAt: now, analysisVersion: "1.0", dailyAnalysisCount: count, planLimit: usage.planLimit, model: aiResult ? currentAiModel() : "deterministic-fallback", promptVersion: "interest-v1", status: "ready", error: "", createdAt: now, updatedAt: now };
      this.repository.create(analysis); return analysis;
    } finally { active.delete(lock); }
  }
}

function terms(materials: NormalizedResearchMaterial[]) {
  const counts = new Map<string, number>();
  const add = (value: string) => value.split(/[\s、。・/｜,;:()（）「」]+/).map((item) => item.trim()).filter((item) => item.length >= 2 && item.length <= 28).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  materials.forEach((item) => { (item.sourceKeywords || []).forEach(add); (item.officialQuestions || []).forEach(add); if (item.userReasonMemo) add(item.userReasonMemo); if (item.excerpt) add(item.excerpt); });
  return [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([term]) => term).slice(0, 16);
}

function deterministicAnalysis(materials: NormalizedResearchMaterial[], previous?: InterestAnalysisResult): InterestAnalysisResult {
  const top = terms(materials); const positive = materials.filter((item) => ["like","気になる","important","大事"].includes(item.userReaction || ""));
  const saved = materials.filter((item) => ["save","保存する"].includes(item.userReaction || ""));
  const negative = materials.filter((item) => ["not_fit","違う","skip"].includes(item.userReaction || ""));
  const undecided = materials.filter((item) => ["unclear","わからない"].includes(item.userReaction || ""));
  const explicitQuestions = materials.flatMap((item) => item.officialQuestions || []).filter(Boolean).slice(0, 8);
  const query = top.slice(0, 5).join(" "); const resources = store.searchResearchResources(query, 5); const labs = store.searchLabs({ q: query }).slice(0, 5);
  const reactionCounts = materials.reduce<Record<string,number>>((map,item) => { const key=item.userReaction || "反応なし"; map[key]=(map[key]||0)+1; return map; },{});
  const prior = previous?.current.strongThemes || []; const changed = top.filter((item) => !prior.includes(item)).slice(0,4);
  return {
    current: {
      strongThemes: top.slice(0,6), objects: top.slice(0,5), phenomena: explicitQuestions.slice(0,4), contexts: materials.map((item) => item.title).slice(0,5),
      questionStyles: explicitQuestions.length ? ["保存された問い文を手がかりにしています"] : ["明示的な問い文はまだ少ない状態です"],
      positiveInterests: positive.map((item) => item.title).slice(0,6), negativeReactions: negative.map((item) => item.title).slice(0,6),
      undecided: undecided.map((item) => item.title).slice(0,6), changes: previous ? (changed.length ? changed.map((item) => `前回後に「${item}」が増えました`) : ["明確な頻度変化はありません"]) : ["今回が最初の分析です"],
    },
    connections: {
      fields: resources.fields.slice(0,5).map((item) => ({ id:item.id,name:item.nameJa })), labs: labs.map((item) => ({ id:item.id,name:item.name })),
      societies: resources.societies.slice(0,5).map((item) => ({ id:item.id,name:item.name })), journals: resources.journals.slice(0,5).map((item) => ({ id:item.id,name:item.name })),
      searchTerms: top.slice(0,8), nextTargets: [...resources.fields.slice(0,3).map((item) => item.nameJa), ...labs.slice(0,2).map((item) => item.name)],
    },
    directions: {
      interestDirections: explicitQuestions.slice(0,4).length ? explicitQuestions.slice(0,4) : top.slice(0,4).map((item) => `${item}について、どの対象・場面が気になるかを整理する`),
      narrowingDirections: top.slice(0,3).map((item) => `「${item}」を扱う対象・期間・場所を一つ選ぶ`), separateIssues: top.slice(3,6).map((item) => `「${item}」は別の論点として比較する`),
      broadAreas: top.length > 5 ? [`上位語が${top.length}件あり、複数の関心領域が混在しています`] : ["素材を増やすと、広すぎる部分を判定しやすくなります"],
      confirmations: ["対象者・場所・期間のどれを優先するか", "知りたいことと、実際に測れることを分けられるか"], nextMaterials: ["気になった理由を添えたメモ", "研究室が公開している具体的な問い", "方法が分かる論文や記事"],
    },
    evidence: { summary: `保存した${materials.length}件を、反応・よく出る言葉・種類ごとに整理しました。AIによる意味の推測は行っていません。`, sourceIds: materials.map(materialKey), reactionCounts }, analysisMode: "deterministic_fallback",
  };
}

async function analyzeWithAI(materials: NormalizedResearchMaterial[]): Promise<InterestAnalysisResult | null> {
  const prompt = `MISHIRUで、研究初心者の関心を整理します。完成した研究の問いは作らず、入力された公式情報とユーザーの反応を分けてください。「違う」「わからない」「気になる」「保存」は別の反応として扱います。研究領域・研究室・学会・ジャーナルは候補名だけを出してください。ユーザーに見える文章は、結論から始め、一文では一つだけ伝えてください。専門語や分析用語を避け、普通の日本語で書いてください。JSONのみ。\n${JSON.stringify(materials)}`;
  const result = await callAIJson<InterestAnalysisResult>(prompt, { temperature:.2, timeoutMs:30000 });
  if (!result?.current || !result?.connections || !result?.directions) return null;
  return { ...result, analysisMode: "ai" };
}
