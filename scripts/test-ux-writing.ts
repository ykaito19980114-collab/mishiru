import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const collectTsx = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? collectTsx(path) : entry.name.endsWith(".tsx") ? [path] : [];
});
const files = [...collectTsx("src/components"), ...collectTsx("src/pages")];

const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

for (const phrase of ["詳しくはこちら", ">再試行<", ">次へ<", ">送信する<", ">さらに表示<", "Step 1：", "Step 2：", "SAVE TO TAME-RU", "FREE ACCOUNT", "YOUR ACCOUNT", "先行研究と参照先を詳しく見る", "検索クエリ", "学術コミュニティへの接続", "AI作成・検査済み", "仮説たたき台"]) {
  assert.equal(source.includes(phrase), false, `曖昧または説明者目線の文言が残っています: ${phrase}`);
}

for (const phrase of ["研究をさがす", "問いを見る", "保存したもの", "関心を整理", "問いをつくる", "研究プラン", "相談先を探す", "もう一度読み込む"]) {
  assert.equal(source.includes(phrase), true, `主要な表示名が見つかりません: ${phrase}`);
}

console.log("UX writing checks passed");
