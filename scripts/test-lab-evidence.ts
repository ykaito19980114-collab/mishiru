import assert from "node:assert/strict";
import fs from "node:fs";
import type { Lab } from "../shared/types";
import { assessLabEvidence } from "../shared/lab-evidence";
import { applyLabHomepageOverrides, type LabHomepageOverride } from "../server/lab-publication";

const baseLabs = JSON.parse(fs.readFileSync("data/labs.json", "utf-8")) as Lab[];
const overrides = JSON.parse(fs.readFileSync("data/lab-homepage-overrides.json", "utf-8")) as LabHomepageOverride[];
const labs = applyLabHomepageOverrides(baseLabs, overrides);
const koizumiLab = labs.find((lab) => lab.id === "lab-19162");
assert.ok(koizumiLab, "小泉研究室が見つからない");

const koizumiEvidence = assessLabEvidence(koizumiLab);
assert.equal(koizumiLab.quality?.contentLevel, "sourced", "公式ページの研究情報を根拠ありとして扱っていない");
assert.equal(koizumiEvidence.canShowQuestions, true, "公式情報に基づく問いを表示できない");
assert.equal(koizumiEvidence.canGenerateGuide, true, "確認済みキーワードから研究ガイドを生成できない");
assert.equal(koizumiEvidence.canMapResources, true, "確認済みキーワードから関連分野を探せない");
assert.equal(koizumiEvidence.canSearchPapers, true, "責任者名と所属大学から論文を確認できない");

const basicLab: Lab = {
  ...koizumiLab,
  researchQuestions: undefined,
  questions: undefined,
  quality: {
    ...koizumiLab.quality!,
    contentLevel: "basic",
    reviewStatus: "automated",
  },
};
const basicEvidence = assessLabEvidence(basicLab);
assert.equal(basicEvidence.canShowQuestions, false, "根拠未確認のキーワードから問いを生成している");
assert.equal(basicEvidence.canGenerateGuide, false, "根拠未確認のキーワードから研究ガイドを生成している");
assert.equal(basicEvidence.canMapResources, false, "根拠未確認のキーワードから学術情報を関連付けている");
assert.equal(basicEvidence.canSearchPapers, true, "安全な所属一致の論文検索まで一括停止している");

const directQuestionEvidence = assessLabEvidence({
  ...basicLab,
  researchQuestions: ["公式情報に記載された問い"],
});
assert.equal(directQuestionEvidence.canShowQuestions, true, "出典付きの問いまで非表示にしている");
assert.equal(directQuestionEvidence.canGenerateGuide, false, "出典付きの問いだけで別の推測を生成している");

const pendingEvidence = assessLabEvidence({
  ...basicLab,
  official_url: null,
  has_url: false,
  sources: [],
  quality: {
    ...basicLab.quality!,
    sourceKind: "none",
  },
});
assert.equal(pendingEvidence.canShowQuestions, false);
assert.equal(pendingEvidence.canGenerateGuide, false);
assert.equal(pendingEvidence.canMapResources, false);
assert.equal(pendingEvidence.canSearchPapers, false);

console.log("lab evidence checks passed");
