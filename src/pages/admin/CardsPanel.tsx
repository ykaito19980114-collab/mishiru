// カード成績（品質改善用。KPI-01未達時にカード粒度・文言を見直す入力）
import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import { Card, Skeleton, ErrorState } from "../../components/ui";

type Row = { id: string; title: string; stats: { saves: number; likes: number; skips: number; deep: number } };

export function CardsPanel() {
  const [cards, setCards] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);
  const [sort, setSort] = useState<"eval" | "saveRate" | "skips">("eval");
  const load = () => { setErr(false); adminApi.cards().then((r) => setCards(r.cards)).catch(() => setErr(true)); };
  useEffect(load, []);

  if (err) return <ErrorState onRetry={load} />;
  if (!cards) return <Skeleton className="h-64" />;

  const withMetrics = cards.map((c) => {
    const evals = c.stats.saves + c.stats.likes + c.stats.skips + c.stats.deep;
    const positive = c.stats.saves + c.stats.likes + c.stats.deep;
    return { ...c, evals, saveRate: evals ? positive / evals : 0 };
  });
  const sorted = [...withMetrics].sort((a, b) =>
    sort === "eval" ? b.evals - a.evals : sort === "saveRate" ? b.saveRate - a.saveRate : b.stats.skips - a.stats.skips);
  const evaluated = withMetrics.filter((c) => c.evals > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--c-ink-2)]">評価のあったカード {evaluated.length} / {cards.length}</p>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="text-sm px-2 py-1.5 rounded-[8px] border border-[var(--c-border)] min-h-[40px]">
          <option value="eval">評価数順</option>
          <option value="saveRate">好意率順</option>
          <option value="skips">スキップ数順</option>
        </select>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-[var(--c-surface)] text-[var(--c-ink-3)] text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-bold">カード</th>
                <th className="px-3 py-2 font-bold">評価</th>
                <th className="px-3 py-2 font-bold">好意率</th>
                <th className="px-3 py-2 font-bold">保存</th>
                <th className="px-3 py-2 font-bold">スキップ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="border-t border-[var(--c-border)]">
                  <td className="px-4 py-2 max-w-[280px]"><span className="line-clamp-1 text-[var(--c-ink)]">{c.title}</span></td>
                  <td className="px-3 py-2 text-center">{c.evals}</td>
                  <td className={`px-3 py-2 text-center font-bold ${c.evals && c.saveRate < 0.6 ? "text-[var(--c-danger)]" : "text-[var(--c-ink)]"}`}>{c.evals ? (c.saveRate * 100).toFixed(0) + "%" : "—"}</td>
                  <td className="px-3 py-2 text-center">{c.stats.saves}</td>
                  <td className="px-3 py-2 text-center">{c.stats.skips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-[var(--c-ink-3)]">※ 好意率（保存＋気になる＋深掘り）が低いカードは、文言・粒度・分野の切り方を見直す候補（docs/01 KPI-01の未達対応）。</p>
    </div>
  );
}
