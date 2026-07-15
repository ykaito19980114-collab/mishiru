// 見え方診断レポート生成（FR-REPORT-01/02）。LLM（任意）→ テンプレートフォールバック。
import { store } from "./store";
import { callAI, aiEnabled } from "./ai";
import { areaLabel } from "../shared/taxonomy";
import type { Lab } from "../shared/types";

interface GenInput { labId?: string; labName?: string; researcher?: string; sourceUrl?: string; }

// 公開情報（sections）の充足状況から「不足情報」を洗い出す
function missingSections(lab: Lab | null): string[] {
  if (!lab) return ["研究内容の学生向け説明", "学生テーマ例", "研究方法", "日常", "指導体制", "進路", "向き不向き"];
  const s = lab.sections;
  const miss: string[] = [];
  if (!s.research_summary) miss.push("研究内容の学生向け説明");
  if (!s.student_themes?.length) miss.push("学生テーマ例（学生が実際に取り組む題材）");
  if (!s.methods?.length) miss.push("研究方法（理論/実験/計算など）");
  if (!s.daily_life) miss.push("研究室の日常（コアタイム・ゼミ頻度）");
  if (!s.mentoring) miss.push("指導体制");
  if (!s.careers) miss.push("修了後の進路");
  if (!s.fit) miss.push("向いている/向いていない学生像");
  if (!s.collaboration) miss.push("共同研究の相談領域");
  return miss;
}

export function templateReport(input: GenInput): string {
  const lab = input.labId ? store.labById(input.labId) : null;
  const name = lab?.name || input.labName || input.researcher || "対象研究室";
  const univ = lab ? `${lab.university.name} ${lab.department}` : "";
  const areas = lab?.area_tags.map(areaLabel).join("、") || "（分野情報なし）";
  const miss = missingSections(lab);
  const hasUrl = !!lab?.official_url;
  const relatedCards = lab
    ? store.allCards().filter((c) => c.area_tags.some((t) => lab.area_tags.includes(t))).slice(0, 3)
    : [];

  return `# 見え方診断レポート（下書き）

**対象**：${name}${univ ? `（${univ}）` : ""}
**主な分野**：${areas}
**生成方法**：テンプレート（このドラフトは運営が編集してから教授に提示します）

## 1. 学生からの見え方（現状）
- 公式サイト：${hasUrl ? "あり。ただし研究内容が専門的で、学部生には難易度が高い可能性があります。" : "確認できません。学生が研究室にたどり着く導線が弱い状態です。"}
- 学生が進路判断に必要な「入った後の毎日」の情報（日常・指導体制・進路・向き不向き）が公開情報からは読み取りにくい状態です。

## 2. 不足している情報（学生の意思決定に必要な項目）
${miss.map((m) => `- ${m}`).join("\n") || "- 主要項目は概ね揃っています。"}

## 3. 競合・比較の観点
- 研究室ポータルや大学公式一覧では、研究室ごとに情報粒度がばらつき、比較しづらい状態です。
- 「研究テーマの面白さ」を学生の言葉に翻訳できている研究室は多くありません。ここが差別化点になります。

## 4. 改善案（MISHIRUで整備する内容）
- 研究内容を学部生にも伝わる言葉で再構成（本文転載ではなく、確認済みの一次情報に基づく翻訳）。
- 学生テーマ例・研究方法・日常・進路・向き不向きを、確認できた範囲で明示。未確認項目は「未確認」と正直に表示。
- 出典・最終更新日・修正依頼導線を常設し、誤情報リスクを最小化。

## 5. 想定される「研究テーマカード」接続
学生は以下のような興味の入口から、この研究室にたどり着くことが見込まれます：
${relatedCards.length ? relatedCards.map((c) => `- 「${c.title}」（${c.everyday_hook}）`).join("\n") : "- （分野に合致するカードを追加検討）"}

## 6. ご提案
- 見え方診断の共有 → ヒアリング（30分）→ 研究室ページ制作 → 公開後の継続更新。
- 制作は公開情報＋教授確認の二段構えで進め、掲載前に必ず内容をご確認いただきます。

---
*本レポートは公開情報に基づく下書きです。事実確認と表現の最終調整は運営が行います。*`;
}

export async function generateReport(input: GenInput): Promise<{ content: string; generatedBy: "llm" | "template" }> {
  const template = templateReport(input);
  if (!aiEnabled()) return { content: template, generatedBy: "template" };
  const lab = input.labId ? store.labById(input.labId) : null;
  const prompt = `あなたは研究室広報の専門家です。以下の研究室について「見え方診断レポート」の下書きをMarkdownで作成してください。
断定を避け、公開情報に基づく推定であることを明記し、営業的すぎない誠実なトーンで。章立ては: 学生からの見え方 / 不足情報 / 競合比較 / 改善案 / 想定カード接続 / 提案。
研究室名: ${lab?.name || input.labName || input.researcher}
分野: ${lab?.area_tags.map(areaLabel).join("、") || "不明"}
キーワード: ${lab?.keywords.join("、") || "不明"}
公式サイト: ${lab?.official_url || "なし"}`;
  const text = await callAI(prompt, { temperature: 0.5 });
  if (text && text.trim().length > 50) return { content: text, generatedBy: "llm" };
  return { content: template, generatedBy: "template" };
}
