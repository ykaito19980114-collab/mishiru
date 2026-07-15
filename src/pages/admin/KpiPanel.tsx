import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import { Card, Skeleton, ErrorState } from "../../components/ui";

// KPI合格ライン（docs/01 §9）
const TARGETS = { saveRate: 0.6, completionRate: 0.5, labTransitionRate: 0.3 };

export function KpiPanel() {
  const [kpi, setKpi] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); adminApi.kpi().then(setKpi).catch(() => setErr(true)); };
  useEffect(load, []);

  if (err) return <ErrorState onRetry={load} />;
  if (!kpi) return <div className="grid sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>;

  const cards = [
    { label: "カード保存率 (KPI-01)", value: kpi.saveRate, target: TARGETS.saveRate, note: "保存 / 全評価" },
    { label: "診断完了率 (KPI-02)", value: kpi.completionRate, target: TARGETS.completionRate, note: "プロファイル生成 / セッション" },
    { label: "研究室遷移率 (KPI-03)", value: kpi.labTransitionRate, target: TARGETS.labTransitionRate, note: "研究室閲覧 / プロファイル生成" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const pass = c.value >= c.target;
          return (
            <Card key={c.label} className="p-5">
              <p className="text-sm text-[var(--c-ink-3)]">{c.label}</p>
              <div className="flex items-end gap-2 mt-2">
                <span className={`text-3xl font-bold ${pass ? "text-[var(--c-success)]" : "text-[var(--c-ink)]"}`}>{(c.value * 100).toFixed(0)}%</span>
                <span className="text-xs text-[var(--c-ink-3)] mb-1.5">目標 {(c.target * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-[var(--c-surface)] rounded-full mt-2 overflow-hidden">
                <div className={`h-full ${pass ? "bg-[var(--c-success)]" : "bg-[var(--c-teal)]"}`} style={{ width: `${Math.min(100, c.value * 100)}%` }} />
              </div>
              <p className="text-[11px] text-[var(--c-ink-3)] mt-2">{c.note}｜{pass ? "合格ライン到達" : "未達"}</p>
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <h3 className="font-bold mb-3">計測サマリー</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="セッション数" value={kpi.sessions} />
          <Stat label="カード評価回数" value={kpi.evaluations} />
          <Stat label="プロファイル生成" value={kpi.profilesGenerated} />
          <Stat label="公式リンク遷移" value={kpi.outboundClicks} />
        </div>
        <p className="text-xs text-[var(--c-ink-3)] mt-4">※ M0検証の合格ライン：保存率60%・診断完了率50%・研究室遷移率30%（docs/01 §9）。未達時はカード文言・初回導線・接続理由を見直す。</p>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[var(--c-ink-3)] text-xs">{label}</p><p className="text-xl font-bold">{value ?? 0}</p></div>;
}
