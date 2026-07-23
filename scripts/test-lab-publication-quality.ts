import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Lab } from "../shared/types";

const root = process.cwd();
const labs = JSON.parse(fs.readFileSync(path.join(root, "data", "labs.json"), "utf-8")) as Lab[];
const eligibleLabs = labs.filter((lab) => lab.status === "published" || lab.status === "claimed");
const publicLabs = eligibleLabs.filter((lab) =>
  lab.quality?.sourceKind === "lab_homepage" && Boolean(lab.official_url));
const heldLabs = eligibleLabs.filter((lab) => !publicLabs.includes(lab));
const aggregateName = /全研究室|研究室群|各研究室|各分野|各領域|各専攻|講座群|連携研究室|教員一覧|担当教員一覧|研究室・教員一覧|ほか(?:\d+)?(?:研究室)?|他研究室|多数|主要分野/;
const profileUrl = /researchmap\.jp|k-ris\.keio\.ac\.jp|r-info\.tohoku\.ac\.jp|research-db\.|researchers?\.|ridb\.|yudb\.|hyokadb|profs\.|elsevierpure\.com|search\.adb\.|rdb\.|nrid\.nii\.ac\.jp|kaken\.nii\.ac\.jp|jglobal\.jst\.go\.jp|orcid\.org|scholar\.google\.|cir\.nii\.ac\.jp|\/(?:faculty|staff|teacher|researcher|profile|people|member)(?:\/|$)/i;
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
for (const lab of publicLabs) {
  assert.ok(lab.official_url?.startsWith("http"), `${lab.id}: 確認済み研究室HPがない`);
  assert.ok(!profileUrl.test(lab.official_url || ""), `${lab.id}: 教員・研究者ページを研究室HPとして公開している`);
  assert.equal(lab.sources[0]?.label, "研究室ホームページ", `${lab.id}: 主出典の種別が不正`);
  assert.equal(lab.sources[0]?.url, lab.official_url, `${lab.id}: 主出典と研究室HPが不一致`);
  const aggregate = aggregateName.test(lab.name);
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
assert.equal(publicLabs.length, report.counts.publishable, "監査レポートと公開件数が一致しない");

console.log(`lab publication quality: OK (${publicLabs.length.toLocaleString()} published / ${labs.length.toLocaleString()} total)`);
