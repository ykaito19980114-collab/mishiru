// 研究室データ・営業リスト（URL未登録＝整備ニーズが高い層。BR-06 営業初日リスト）
import React, { useEffect, useState, useCallback } from "react";
import { adminApi } from "./adminApi";
import { fieldLabel, FIELD_MAJORS } from "../../../shared/fields";
import { REGIONS } from "../../../shared/universities";
import { Card, Skeleton, ErrorState, Button } from "../../components/ui";

type Row = { id: string; name: string; university: string; department: string; pi: string; memberCount: number; hasUrl: boolean; field: string; region: string };

export function LabsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<{ totalLabs: number; noUrl: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState(false);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ q: "", field: "", region: "", has_url: "false" });

  const load = useCallback((pg: number) => {
    setErr(false);
    const p: Record<string, string> = { page: String(pg), limit: "30" };
    if (f.q) p.q = f.q;
    if (f.field) p.field = f.field;
    if (f.region) p.region = f.region;
    if (f.has_url) p.has_url = f.has_url;
    adminApi.labs(p).then((d) => {
      setRows((prev) => (pg === 1 ? d.data : [...(prev || []), ...d.data]));
      setTotal(d.total); setSummary(d.summary);
    }).catch(() => setErr(true));
  }, [f]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  const inp = "px-3 py-2 min-h-[40px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] text-sm";

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="p-4"><p className="text-xs text-[var(--c-ink-3)]">掲載研究室</p><p className="text-2xl font-bold">{summary.totalLabs.toLocaleString()}</p></Card>
          <Card className="p-4"><p className="text-xs text-[var(--c-ink-3)]">公式サイト未登録（営業対象）</p><p className="text-2xl font-bold text-[var(--c-teal)]">{summary.noUrl.toLocaleString()}</p></Card>
          <Card className="p-4"><p className="text-xs text-[var(--c-ink-3)]">現在の抽出結果</p><p className="text-2xl font-bold">{total.toLocaleString()}</p></Card>
        </div>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input className={`${inp} flex-1 min-w-[160px]`} placeholder="大学名・研究室・教員名で検索" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select className={inp} value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}>
            <option value="">分野すべて</option>
            {FIELD_MAJORS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <select className={inp} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            <option value="">地域すべて</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={inp} value={f.has_url} onChange={(e) => setF({ ...f, has_url: e.target.value })}>
            <option value="false">URL未登録のみ（営業対象）</option>
            <option value="">すべて</option>
            <option value="true">URL登録済のみ</option>
          </select>
        </div>
      </Card>

      {err && <ErrorState onRetry={() => load(1)} />}
      {!rows && !err && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
      {rows && (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="bg-[var(--c-surface)] text-[var(--c-ink-3)] text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-bold">研究室</th>
                    <th className="text-left px-3 py-2 font-bold">大学・専攻</th>
                    <th className="px-3 py-2 font-bold">分野</th>
                    <th className="px-3 py-2 font-bold">URL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--c-border)]">
                      <td className="px-4 py-2 max-w-[260px]">
                        <a href={`/labs/${r.id}`} target="_blank" rel="noreferrer" className="font-bold text-[var(--c-primary)] line-clamp-1 hover:underline">{r.name}</a>
                        <span className="text-xs text-[var(--c-ink-3)]">{r.pi}{r.memberCount > 1 ? `・教員${r.memberCount}名` : ""}</span>
                      </td>
                      <td className="px-3 py-2 max-w-[220px]"><span className="line-clamp-1 text-[var(--c-ink-2)]">{r.university}</span><span className="text-xs text-[var(--c-ink-3)] line-clamp-1">{r.department}</span></td>
                      <td className="px-3 py-2 text-center text-xs">{fieldLabel(r.field)}</td>
                      <td className="px-3 py-2 text-center">{r.hasUrl ? <span className="text-[var(--c-success)]">✓</span> : <span className="text-[var(--c-teal)] text-xs font-bold">未登録</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {rows.length < total && (
            <div className="flex justify-center"><Button variant="secondary" onClick={() => { const n = page + 1; setPage(n); load(n); }}>さらに表示（{rows.length}/{total.toLocaleString()}）</Button></div>
          )}
          <p className="text-xs text-[var(--c-ink-3)]">※ 公式サイト未登録の研究室は、ページ整備ニーズが最も高い営業優先層です（見え方診断→制作提案の初手リスト）。</p>
        </>
      )}
    </div>
  );
}
