// カード提示順の決定（FR-CARD-01/03）。未評価カードを、選択ジャンル＞多様性で並べる。
import { store } from "./store";
import type { ThemeCard } from "../shared/types";

// 決定的な擬似シャッフル（sessionIdベース。Math.random非依存でテスト再現性を確保）
function seededOrder<T>(arr: T[], seedStr: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  return arr
    .map((v, i) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return { v, k: seed ^ (i * 2654435761) };
    })
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v);
}

export function nextCards(sessionId: string, genre: string | null, batch = 10): ThemeCard[] {
  const evaluated = store.evaluatedCardIds(sessionId);
  const remaining = store.allCards().filter((c) => !evaluated.has(c.id));

  // ジャンル選択があれば、そのジャンルを優先しつつ他ジャンルも混ぜる（探索の幅を残す）
  let ordered = seededOrder(remaining, sessionId + (genre || ""));
  if (genre) {
    const inGenre = ordered.filter((c) => c.hook_genre === genre);
    const others = ordered.filter((c) => c.hook_genre !== genre);
    // 先頭は選択ジャンル多め、その後に多様性（3:1で交互）
    const merged: ThemeCard[] = [];
    let gi = 0, oi = 0;
    while (gi < inGenre.length || oi < others.length) {
      for (let k = 0; k < 3 && gi < inGenre.length; k++) merged.push(inGenre[gi++]);
      if (oi < others.length) merged.push(others[oi++]);
    }
    ordered = merged;
  } else {
    // ジャンル未選択：多様性重視（同ジャンル連続を避ける）
    ordered = diversify(ordered);
  }
  return ordered.slice(0, batch);
}

function diversify(cards: ThemeCard[]): ThemeCard[] {
  const byGenre: Record<string, ThemeCard[]> = {};
  for (const c of cards) (byGenre[c.hook_genre] ||= []).push(c);
  const genres = Object.keys(byGenre);
  const result: ThemeCard[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const g of genres) {
      const list = byGenre[g];
      if (list.length) { result.push(list.shift()!); added = true; }
    }
  }
  return result;
}
