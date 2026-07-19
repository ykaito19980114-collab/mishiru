import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "src/components/Layout.tsx",
  "src/components/AccountAccess.tsx",
  "src/components/ui.tsx",
  "src/pages/Labs.tsx",
  "src/pages/Discover.tsx",
  "src/pages/Questions.tsx",
  "src/pages/Reflect.tsx",
  "src/pages/Saved.tsx",
  "src/pages/Projects.tsx",
  "src/pages/Consult.tsx",
];

const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

for (const phrase of ["詳しくはこちら", ">再試行<", "Step 1：", "Step 2：", "SAVE TO TAME-RU", "FREE ACCOUNT", "YOUR ACCOUNT"]) {
  assert.equal(source.includes(phrase), false, `曖昧または説明者目線の文言が残っています: ${phrase}`);
}

for (const phrase of ["保存したもの", "関心を整理", "問いをつくる", "研究プラン", "相談先を探す", "もう一度読み込む"]) {
  assert.equal(source.includes(phrase), true, `主要な表示名が見つかりません: ${phrase}`);
}

console.log("UX writing checks passed");
