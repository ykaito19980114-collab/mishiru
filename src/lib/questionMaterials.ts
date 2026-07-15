import type { NormalizedResearchMaterial, QuestionCraftDraft } from "../../shared/research-project";
import { api } from "./api";
import { labelText, readAnnotations } from "./annotations";

const NOTE_KEY = "openlab_stock_item_notes";
const DRAFT_KEY = "openlab_question_craft_draft_v1";

function readNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || "{}"); } catch { return {}; }
}

export async function loadQuestionMaterials(): Promise<NormalizedResearchMaterial[]> {
  const { materials } = await api.getQuestionMaterials();
  const notes = readNotes();
  const saved = materials.map((item) => ({
    ...item,
    userReasonMemo: notes[item.sourceType === "lab" ? `lab:${item.sourceId}` : `${item.sourceType}:${item.sourceId}`] || item.userReasonMemo,
  }));
  const markings: NormalizedResearchMaterial[] = readAnnotations().map((item) => ({
    sourceType: item.sourceType === "paper" ? "paper_url" : item.sourceType === "external_url" ? "quote" : "marking",
    sourceId: item.id,
    title: item.sourceTitle,
    sourceKeywords: item.aiKeywords,
    userReaction: labelText(item.label),
    userReasonMemo: item.note || undefined,
    excerpt: item.selectedText,
    url: item.sourceUrl || undefined,
    verificationStatus: "ユーザー保存情報",
    createdAt: item.createdAt,
  }));
  return [...markings, ...saved].filter((item, index, all) =>
    all.findIndex((other) => `${other.sourceType}:${other.sourceId}` === `${item.sourceType}:${item.sourceId}`) === index,
  );
}

export function readQuestionDraft(): QuestionCraftDraft | null {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}

export function writeQuestionDraft(draft: QuestionCraftDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearQuestionDraft() { localStorage.removeItem(DRAFT_KEY); }

export const materialTypeLabel: Record<string, string> = {
  lab: "研究室", field: "研究領域", society: "学会", journal: "ジャーナル", marking: "マーキング",
  memo: "メモ", quote: "引用", external_url: "外部URL", book: "本", article: "記事", news: "ニュース",
  paper_url: "論文URL", post_url: "投稿URL", event: "イベント情報",
};
