// data/cards/*.json を統合し data/cards.json を生成＋整合検証（docs/03 §5, §付録A）
// 実行: npx tsx scripts/build-cards.ts
import fs from "fs";
import path from "path";
import { RESEARCH_AREAS, HOOK_GENRES } from "../shared/taxonomy";
import type { ThemeCard, Lab } from "../shared/types";

const cardsDir = path.join(process.cwd(), "data", "cards");
const files = fs.readdirSync(cardsDir).filter((f) => /^cards-\d+\.json$/.test(f)).sort();

const cards: ThemeCard[] = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(cardsDir, f), "utf-8")) as ThemeCard[];
  cards.push(...arr);
}

// --- 検証 ---
const errors: string[] = [];
const ids = new Set<string>();
const areaIds = new Set(RESEARCH_AREAS.map((a) => a.id));
const genreIds = new Set(HOOK_GENRES.map((g) => g.id));

for (const c of cards) {
  if (ids.has(c.id)) errors.push(`重複ID: ${c.id}`);
  ids.add(c.id);
  if (!c.title || !c.everyday_hook || !c.plain_summary || !c.why_interesting) errors.push(`必須文欠落: ${c.id}`);
  if (!genreIds.has(c.hook_genre)) errors.push(`不正genre: ${c.id} (${c.hook_genre})`);
  if (!c.area_tags?.length) errors.push(`area_tagsなし: ${c.id}`);
  for (const t of c.area_tags) if (!areaIds.has(t)) errors.push(`不正area_tag: ${c.id} (${t})`);
  if (![1, 2, 3].includes(c.difficulty)) errors.push(`難易度不正: ${c.id}`);
  if (c.orientation < -1 || c.orientation > 1) errors.push(`orientation範囲外: ${c.id}`);
  // 論文タイトル転記防止の簡易チェック（英字だらけの見出しは要注意）
  if (/^[A-Za-z0-9 ,.\-:]+$/.test(c.title)) errors.push(`titleが英字のみ（論文転記の疑い）: ${c.id}`);
}

// カードの分野カバレッジ vs labsの分野
const labs: Lab[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "labs.json"), "utf-8"));
const labAreaCount: Record<string, number> = {};
for (const l of labs) for (const t of l.area_tags) labAreaCount[t] = (labAreaCount[t] || 0) + 1;
const cardAreaCount: Record<string, number> = {};
for (const c of cards) for (const t of c.area_tags) cardAreaCount[t] = (cardAreaCount[t] || 0) + 1;

const genreCount: Record<string, number> = {};
for (const c of cards) genreCount[c.hook_genre] = (genreCount[c.hook_genre] || 0) + 1;

// labが存在する分野にカードが1枚もない = マッチング不成立リスク
for (const area of Object.keys(labAreaCount)) {
  if (!cardAreaCount[area]) errors.push(`⚠ labはあるがカードが0枚の分野: ${area}`);
}

if (errors.length) {
  console.error("❌ 検証エラー:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

fs.writeFileSync(path.join(process.cwd(), "data", "cards.json"), JSON.stringify(cards, null, 1), "utf-8");
console.log(`✔ ${cards.length}枚のカードを data/cards.json へ統合しました`);
console.log("ジャンル分布:", JSON.stringify(genreCount));
console.log("カード分野分布:", JSON.stringify(cardAreaCount));
console.log("研究室分野分布:", JSON.stringify(labAreaCount));
const orientations = cards.map((c) => c.orientation);
console.log(`基礎/応用バランス: 基礎寄り(<0)=${orientations.filter((o) => o < 0).length} / 中立=${orientations.filter((o) => o === 0).length} / 応用寄り(>0)=${orientations.filter((o) => o > 0).length}`);
