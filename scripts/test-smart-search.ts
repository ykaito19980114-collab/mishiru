import assert from "node:assert/strict";
import { smartSearch } from "../server/smart-search";

const universityAndSurname = await smartSearch("兵庫県立大学 古賀", 24);
assert.equal(universityAndSurname.mode, "name", "大学名＋姓を固有名検索として扱う");
assert.equal(universityAndSurname.labs[0]?.id, "lab-1234", "兵庫県立大学の古賀研究室を先頭に返す");
assert.ok(universityAndSurname.labs[0]?._why.some((reason) => reason.includes("兵庫県立大学")), "大学名の一致理由を返す");

const fullName = await smartSearch("古賀麻由子", 24);
assert.equal(fullName.mode, "name", "教員のフルネームを固有名検索として扱う");
assert.equal(fullName.labs[0]?.id, "lab-1234", "教員名から所属研究室を返す");

const labName = await smartSearch("古賀研究室", 24);
assert.equal(labName.mode, "name", "研究室名を固有名検索として扱う");
assert.ok(labName.labs.some((lab) => lab.id === "lab-1234"), "研究室名から該当研究室を返す");

const compactQuery = await smartSearch("兵庫県立大学古賀", 24);
assert.equal(compactQuery.labs[0]?.id, "lab-1234", "空白なしの大学名＋姓にも対応する");

const suppressedLab = await smartSearch("兵庫県立大学 古山", 24);
assert.equal(suppressedLab.mode, "name", "該当なしでも大学名を意味検索へ流さない");
assert.equal(suppressedLab.total, 0, "掲載停止済み研究室を検索結果へ戻さない");

console.log("Smart search checks passed");
