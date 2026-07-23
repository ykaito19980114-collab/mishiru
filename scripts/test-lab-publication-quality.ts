import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Lab } from "../shared/types";

const root = process.cwd();
const labs = JSON.parse(fs.readFileSync(path.join(root, "data", "labs.json"), "utf-8")) as Lab[];
const publicLabs = labs.filter((lab) => lab.status === "published" || lab.status === "claimed");
const aggregateName = /全研究室|研究室群|各研究室|各分野|各領域|各専攻|講座群|連携研究室|教員一覧|担当教員一覧|研究室・教員一覧|ほか(?:\d+)?(?:研究室)?|他研究室|多数|主要分野/;
const profileUrl = /researchmap\.jp|k-ris\.keio\.ac\.jp|r-info\.tohoku\.ac\.jp|research-db\.|researchers?\.|ridb\.|yudb\.|hyokadb|profs\.|elsevierpure\.com|search\.adb\.|rdb\.|nrid\.nii\.ac\.jp|kaken\.nii\.ac\.jp|jglobal\.jst\.go\.jp|orcid\.org|scholar\.google\.|cir\.nii\.ac\.jp|\/(?:faculty|staff|teacher|researcher|profile|people|member)(?:\/|$)/i;

assert.ok(publicLabs.length > 0, "公開対象が0件になっている");
for (const lab of publicLabs) {
  assert.equal(lab.quality?.sourceKind, "lab_homepage", `${lab.id}: 研究室HP確認なしで公開されている`);
  assert.ok(lab.official_url?.startsWith("http"), `${lab.id}: 研究室HPがない`);
  assert.ok(!profileUrl.test(lab.official_url || ""), `${lab.id}: 教員・研究者ページを研究室HPとして公開している`);
  assert.equal(lab.sources[0]?.label, "研究室ホームページ", `${lab.id}: 主出典の種別が不正`);
  assert.equal(lab.sources[0]?.url, lab.official_url, `${lab.id}: 主出典と研究室HPが不一致`);
  const wrappedAggregate = /^[（(].*[）)]$/.test(lab.name)
    && (lab.name.match(/[・／/]/g) || []).length >= 1
    && !/^[（(][^）)]*研究室[^）)]*[）)]$/.test(lab.name);
  assert.ok(!aggregateName.test(lab.name) && !wrappedAggregate, `${lab.id}: 複数研究室の集合ページを個別研究室として公開している`);
}

const directDuplicates = new Map<string, string>();
for (const lab of publicLabs) {
  const key = [lab.university.name, lab.department, lab.name, lab.pi.name].join("\u0000");
  assert.ok(!directDuplicates.has(key), `${lab.id}: ${directDuplicates.get(key)} と完全重複`);
  directDuplicates.set(key, lab.id);
}

const report = JSON.parse(fs.readFileSync(path.join(root, "data", "lab-publication-audit.json"), "utf-8")) as {
  counts: { publishable: number };
};
assert.equal(publicLabs.length, report.counts.publishable, "監査レポートと公開件数が一致しない");

console.log(`lab publication quality: OK (${publicLabs.length.toLocaleString()} published / ${labs.length.toLocaleString()} total)`);
