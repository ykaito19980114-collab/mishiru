import type { Lab } from "./types";

const GENERIC_KEYWORDS = new Set([
  "その他",
  "研究",
  "科学",
  "工学",
  "技術",
  "情報",
  "化学",
  "物理",
  "材料",
  "生物",
  "生命",
  "医学",
  "教育",
  "社会",
  "人文",
]);

const normalizeKeyword = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\s・･／/（）()[\]【】「」『』,，.。:：;；_-]+/g, "")
    .toLowerCase();

export interface LabEvidenceAssessment {
  hasHomepage: boolean;
  meaningfulKeywords: string[];
  hasTrustedTopics: boolean;
  hasDirectQuestions: boolean;
  canShowQuestions: boolean;
  canGenerateGuide: boolean;
  canMapResources: boolean;
  canSearchPapers: boolean;
}

/**
 * 研究室ページで扱う情報ごとに、必要な根拠を分けて判定する。
 *
 * - 問い・研究方法・関連分野は、確認済みの研究トピックが必要。
 * - 研究室自身が提供した問いは、AI推定を介さず表示できる。
 * - 論文検索は研究トピックとは切り離し、責任者名と所属大学を使う。
 *   実際の著者・所属一致はOpenAlex取得側で改めて確認する。
 */
export function assessLabEvidence(lab: Lab): LabEvidenceAssessment {
  const hasHomepage =
    lab.quality?.sourceKind === "lab_homepage"
    && Boolean(lab.official_url);
  const meaningfulKeywords = Array.from(new Set(
    (lab.keywords || [])
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .filter((keyword) => {
        const normalized = normalizeKeyword(keyword);
        return normalized.length >= 3 && !GENERIC_KEYWORDS.has(normalized);
      }),
  ));
  const topicsAreSourced =
    lab.verified
    || lab.quality?.contentLevel === "verified"
    || lab.quality?.contentLevel === "sourced";
  const hasTrustedTopics =
    hasHomepage
    && topicsAreSourced
    && meaningfulKeywords.length >= 2;
  const hasDirectQuestions =
    hasHomepage
    && Boolean(lab.researchQuestions?.some((question) => question.trim().length > 0));
  const canGenerateGuide = hasTrustedTopics;
  const canShowQuestions = hasDirectQuestions || canGenerateGuide;
  const canMapResources = hasTrustedTopics;
  const canSearchPapers =
    hasHomepage
    && lab.pi.name.replace(/\s/g, "").length >= 2
    && lab.university.name.trim().length >= 2;

  return {
    hasHomepage,
    meaningfulKeywords,
    hasTrustedTopics,
    hasDirectQuestions,
    canShowQuestions,
    canGenerateGuide,
    canMapResources,
    canSearchPapers,
  };
}
