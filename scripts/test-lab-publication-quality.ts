import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Lab } from "../shared/types";
import { applyLabHomepageOverrides, type LabHomepageOverride } from "../server/lab-publication";
import { applyLabExternalProfileOverrides, type LabExternalProfileOverride } from "../server/lab-external-profiles";
import { assessLabEvidence } from "../shared/lab-evidence";
import { googleScholarUrlForLab, researchDatabaseLinks } from "../src/lib/labLinks";
import {
  looksLikeAggregateLabName,
  looksLikeAggregateLabPage,
  looksLikeResearcherProfile,
} from "../shared/lab-url-quality";

const root = process.cwd();
const baseLabs = JSON.parse(fs.readFileSync(path.join(root, "data", "labs.json"), "utf-8")) as Lab[];
const overrides = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-homepage-overrides.json"), "utf-8")) as LabHomepageOverride[];
const externalProfileOverrides = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-external-profile-overrides.json"), "utf-8")) as LabExternalProfileOverride[];
const labs = applyLabExternalProfileOverrides(applyLabHomepageOverrides(baseLabs, overrides), externalProfileOverrides);
const manuallyPublishedIds = new Set(overrides.filter((override) => override.applyAtRuntime && override.publish !== false).map((override) => override.labId));
const suppressions = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-suppressions.json"), "utf-8")) as {
  ids: string[];
  sourceNos: string[];
};
const suppressedIds = new Set(suppressions.ids);
const suppressedSourceNos = new Set(suppressions.sourceNos);
const baseEligibleLabs = baseLabs.filter((lab) => lab.status === "published" || lab.status === "claimed");
const baseQualityApprovedLabs = baseEligibleLabs.filter((lab) =>
  lab.quality?.sourceKind === "lab_homepage" && Boolean(lab.official_url));
const eligibleLabs = labs.filter((lab) => lab.status === "published" || lab.status === "claimed");
const qualityApprovedLabs = eligibleLabs.filter((lab) =>
  lab.quality?.sourceKind === "lab_homepage" && Boolean(lab.official_url));
const publicLabs = qualityApprovedLabs.filter((lab) =>
  !suppressedIds.has(lab.id) && !suppressedSourceNos.has(String(lab.sourceNo || "")));
const heldLabs = eligibleLabs.filter((lab) => !qualityApprovedLabs.includes(lab));
const legacyProfileUrl = /researchmap\.jp|k-ris\.keio\.ac\.jp|r-info\.tohoku\.ac\.jp|research-db\.|researchers?\.|ridb\.|yudb\.|hyokadb|profs\.|elsevierpure\.com|search\.adb\.|rdb\.|nrid\.nii\.ac\.jp|kaken\.nii\.ac\.jp|jglobal\.jst\.go\.jp|orcid\.org|scholar\.google\.|cir\.nii\.ac\.jp|\/(?:faculty|staff|teacher|researcher|profile|people|member)(?:\/|$)/i;
const coreLabName = (name: string) => name
  .replace(/[（(][^）)]*[）)]/g, " ")
  .replace(/研究室|研究所|研究グループ|グループ|ラボ|講座|分野|部門|領域|ユニット/g, " ")
  .replace(/[・／/\s]+/g, "")
  .trim();
const homepageKey = (value: string) => new URL(value).toString()
  .replace(/\/(?:index\.(?:html?|php))?$/i, "")
  .toLowerCase();

assert.ok(publicLabs.length > 0, "公開対象が0件になっている");
assert.ok(heldLabs.length > 0, "未確認研究室が公開対象から除外されていない");
const koizumiLab = publicLabs.find((lab) => lab.id === "lab-19162");
assert.ok(koizumiLab, "小泉研究室が公開対象に含まれていない");
assert.equal(
  koizumiLab.official_url,
  "https://www-mat.eng.osaka-u.ac.jp/msp3/aboutus",
  "小泉研究室のURLが研究室紹介ページと一致しない",
);
assert.equal(koizumiLab.quality?.contentLevel, "sourced", "小泉研究室の確認済み研究情報が表示対象になっていない");
const kogaLab = publicLabs.find((lab) => lab.id === "lab-1234");
assert.ok(kogaLab, "古賀研究室が公開対象に含まれていない");
assert.equal(kogaLab.official_url, "https://www.eng.u-hyogo.ac.jp/faculty/koga/");
assert.equal(kogaLab.quality?.contentLevel, "sourced");
assert.deepEqual(kogaLab.keywords.slice(0, 2), ["レーザー核融合", "ターゲットインジェクション"]);
assert.ok(!kogaLab.keywords.includes("高速液滴発生"), "研究内容と確認できない旧キーワードが残っている");
const suzukiLab = publicLabs.find((lab) => lab.id === "lab-7556");
assert.ok(suzukiLab, "広島大学流体工学研究室が公開対象に含まれていない");
assert.equal(suzukiLab.official_url, "https://ryutai.hiroshima-u.ac.jp/ja/");
assert.equal(suzukiLab.quality?.contentLevel, "sourced");
assert.deepEqual(suzukiLab.members.map((member) => member.name), ["鈴木康浩", "尾形陽一"]);
const taguchiOverride = overrides.find((override) => override.labId === "lab-17719");
assert.ok(taguchiOverride?.applyAtRuntime, "田口研究室のURL変更が恒久的な上書きとして登録されていない");
assert.equal(taguchiOverride.url, "https://taguchi.proteins.jp/");
const taguchiLab = publicLabs.find((lab) => lab.id === "lab-17719");
assert.ok(taguchiLab, "田口研究室が公開対象に含まれていない");
assert.equal(taguchiLab.official_url, "https://taguchi.proteins.jp/");
assert.equal(taguchiLab.sources[0]?.url, "https://taguchi.proteins.jp/");
const tamakiLab = publicLabs.find((lab) => lab.id === "lab-11748");
assert.ok(tamakiLab, "玉木研究室が公開対象に含まれていない");
assert.equal(
  googleScholarUrlForLab(tamakiLab),
  "https://scholar.google.co.jp/citations?user=AsO4n6gAAAAJ&hl=ja&oi=sra",
  "玉木先生本人から連絡されたGoogle Scholarプロフィールへリンクしていない",
);
assert.equal(tamakiLab.last_updated, "2026-07-27");
const kohnoLab = publicLabs.find((lab) => lab.id === "lab-10520");
assert.ok(kohnoLab, "河野晴彦研究室が公開対象に含まれていない");
assert.equal(kohnoLab.official_url, "https://www.iizuka.kyutech.ac.jp/ics/h-kohno");
assert.equal(kohnoLab.department, "大学院情報工学研究院 知的システム工学研究系");
assert.equal(kohnoLab.quality?.contentLevel, "sourced");
assert.ok(kohnoLab.keywords.includes("磁場核融合"));
assert.ok(kohnoLab.keywords.includes("核融合プラズマ"));
assert.ok(!kohnoLab.sections.research_summary.includes("宇宙"), "河野研究室に誤った宇宙研究の記述が残っている");
assert.equal(assessLabEvidence(kohnoLab).canGenerateGuide, false, "河野研究室でAI推測を再生成しない");
assert.equal(assessLabEvidence(kohnoLab).canSearchPapers, false, "河野先生と同姓同名の論文を自動取得しない");
assert.ok(!researchDatabaseLinks(kohnoLab).some((link) => link.id === "cinii"), "河野先生のページで別人を含むCiNii氏名検索へリンクしない");
const yoshimuraLab = publicLabs.find((lab) => lab.id === "lab-15282");
assert.ok(yoshimuraLab, "奈良女子大学吉村研究室が公開対象に含まれていない");
assert.equal(yoshimuraLab.official_url, "https://www.chem.nara-wu.ac.jp/~yoshimura/");
assert.equal(yoshimuraLab.quality?.contentLevel, "sourced");
assert.deepEqual(yoshimuraLab.members.map((member) => member.name), ["吉村倫一", "河合里紗"]);
assert.ok(yoshimuraLab.keywords.includes("両親媒性イオン液体"));
for (const lab of publicLabs) {
  const workbookPromoted = Boolean(lab.quality?.notes?.some((note) =>
    note.startsWith("研究室リスト_DB 2026-07-28:") && !note.includes("問い・研究概要")));
  assert.ok(lab.official_url?.startsWith("http"), `${lab.id}: 確認済み研究室HPがない`);
  assert.ok(!legacyProfileUrl.test(lab.official_url || "") || manuallyPublishedIds.has(lab.id), `${lab.id}: 教員・研究者ページを研究室HPとして公開している`);
  if (workbookPromoted) {
    assert.ok(!looksLikeResearcherProfile(lab.official_url || ""), `${lab.id}: Excel更新から教員・研究者ページを研究室HPとして公開している`);
    assert.ok(!looksLikeAggregateLabPage(lab.official_url || ""), `${lab.id}: Excel更新から研究室一覧ページを個別研究室HPとして公開している`);
  }
  assert.equal(lab.sources[0]?.label, "研究室ホームページ", `${lab.id}: 主出典の種別が不正`);
  assert.equal(lab.sources[0]?.url, lab.official_url, `${lab.id}: 主出典と研究室HPが不一致`);
  const aggregate = looksLikeAggregateLabName(lab.name);
  if (aggregate) assert.equal(lab.official_url, null, `${lab.id}: 集合ページに研究室HPリンクがある`);
}
for (const lab of heldLabs) {
  assert.equal(lab.official_url, null, `${lab.id}: 未確認ページに外部URLがある`);
  assert.equal(lab.sources.length, 0, `${lab.id}: 未確認ページに出典リンクがある`);
  assert.match(lab.sections.research_summary, /確認中/, `${lab.id}: 未確認表示になっていない`);
}

const homepageGroups = new Map<string, Lab[]>();
for (const lab of publicLabs.filter((item) => item.official_url)) {
  const key = homepageKey(lab.official_url!);
  homepageGroups.set(key, [...(homepageGroups.get(key) || []), lab]);
}
for (const [url, groupedLabs] of homepageGroups) {
  const identities = new Set(groupedLabs.map((lab) => coreLabName(lab.name)).filter(Boolean));
  assert.ok(identities.size <= 1, `${url}: 異なる研究室名へ同じ研究室HPが割り当てられている`);
}

const report = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-publication-audit.json"), "utf-8")) as {
  counts: { publishable: number };
};
const workbookReport = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-workbook-update-report.json"), "utf-8")) as {
  result: {
    evidenceStored: number;
    trustedEvidence: number;
    provisionalStored: number;
    promoted: number;
  };
};
assert.equal(
  baseQualityApprovedLabs.length,
  report.counts.publishable + workbookReport.result.promoted,
  "一括監査済みとExcelで個別確認済みの公開件数が一致しない",
);
assert.equal(
  qualityApprovedLabs.length,
  report.counts.publishable + workbookReport.result.promoted + 4,
  "個別確認済みの研究室が公開対象へ追加されていない",
);
assert.equal(
  publicLabs.length,
  5897 + workbookReport.result.promoted,
  "掲載停止依頼を除いた公開件数が一致しない",
);
const workbookEvidence = JSON.parse(
  fs.readFileSync(path.join(root, "data", "lab-research-evidence.json"), "utf-8"),
) as { labId: string; confidence: "confirmed" | "candidate" }[];
assert.equal(workbookEvidence.length, workbookReport.result.evidenceStored);
assert.equal(
  workbookEvidence.filter((evidence) => evidence.confidence === "confirmed").length,
  workbookReport.result.trustedEvidence,
);
assert.equal(
  workbookEvidence.filter((evidence) => evidence.confidence === "candidate").length,
  workbookReport.result.provisionalStored,
);
const workbookPromotedLab = publicLabs.find((lab) => lab.id === "lab-4");
assert.ok(workbookPromotedLab, "Excelで研究室HP確認済みの研究室が公開されていない");
assert.equal(workbookPromotedLab.researchQuestions?.length, 2);
assert.equal(workbookEvidence.find((evidence) => evidence.labId === "lab-4")?.confidence, "confirmed");
const workbookCandidateLab = publicLabs.find((lab) => lab.id === "lab-1");
assert.ok(workbookCandidateLab, "既存公開研究室がExcel差分更新で消えている");
assert.equal(workbookEvidence.find((evidence) => evidence.labId === "lab-1")?.confidence, "candidate");
assert.equal(workbookCandidateLab.researchQuestions, undefined, "候補状態の問いを公開表示へ反映している");

console.log(`lab publication quality: OK (${publicLabs.length.toLocaleString()} published / ${labs.length.toLocaleString()} total)`);
