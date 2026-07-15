// リード管理（FR-LEAD-01, STATE-03かんばん・次アクション日必須 AC-08）
import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import type { Lead, LeadStatus } from "../../../shared/types";
import { Button, Card, Skeleton, ErrorState } from "../../components/ui";

const STATUSES: LeadStatus[] = ["new", "diagnosed", "contacted", "meeting", "proposal", "won", "lost", "nurture"];
const LABEL: Record<LeadStatus, string> = {
  new: "新規", diagnosed: "診断済", contacted: "接触", meeting: "面談", proposal: "提案", won: "受注", lost: "失注", nurture: "育成",
};

export function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const load = () => { setErr(false); adminApi.leads().then((r) => setLeads(r.leads)).catch(() => setErr(true)); };
  useEffect(load, []);

  const advance = async (l: Lead, status: LeadStatus) => {
    const nextActionDate = prompt(`「${LABEL[status]}」に変更します。次アクション日 (YYYY-MM-DD) を入力してください`, l.nextActionDate);
    if (!nextActionDate) return; // 次アクション日必須
    const nextAction = prompt("次アクション内容", l.nextAction) || l.nextAction;
    try {
      await adminApi.updateLead(l.id, { status, nextActionDate, nextAction });
      load();
    } catch (e) { alert((e as Error).message); }
  };

  if (err) return <ErrorState onRetry={load} />;
  if (!leads) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--c-ink-2)]">{leads.length}件のリード</p>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>{showForm ? "閉じる" : "＋ リード追加"}</Button>
      </div>
      {showForm && <LeadForm onDone={() => { setShowForm(false); load(); }} />}
      {leads.length === 0 && <Card className="p-6 text-center text-[var(--c-ink-3)]">まだリードがありません。営業対象を登録してください。</Card>}
      <div className="space-y-2">
        {leads.map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-[var(--c-ink)]">{l.labName}</p>
                <p className="text-xs text-[var(--c-ink-3)]">{l.university} {l.department}</p>
                <div className="flex gap-2 mt-1 text-[11px] text-[var(--c-ink-3)]">
                  {l.hasUrl ? <span>公式サイトあり</span> : <span className="text-[var(--c-danger)]">公式サイトなし</span>}
                  {l.urlStale && <span>更新停止</span>}
                  {l.hasKaken && <span>科研費あり</span>}
                </div>
                <p className="text-xs text-[var(--c-ink-2)] mt-1">次アクション：{l.nextAction || "—"}（{l.nextActionDate}）</p>
              </div>
              <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-[var(--c-surface-blue)] text-[var(--c-primary)]">{LABEL[l.status]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {STATUSES.filter((s) => s !== l.status).map((s) => (
                <button key={s} onClick={() => advance(l, s)} className="text-[11px] px-2 py-1 rounded-full border border-[var(--c-border)] text-[var(--c-ink-2)] hover:border-[var(--c-teal)] min-h-[32px]">
                  →{LABEL[s]}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LeadForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ university: "", department: "", labName: "", nextAction: "初回コンタクト", nextActionDate: "", hasUrl: false, urlStale: false, hasKaken: false });
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    try { await adminApi.addLead(f); onDone(); } catch (e) { setErr((e as Error).message); }
  };
  const inp = "w-full px-3 py-2 min-h-[44px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] text-sm";
  return (
    <Card className="p-4 space-y-3">
      {err && <p className="text-sm text-[var(--c-danger)]">{err}</p>}
      <div className="grid sm:grid-cols-3 gap-2">
        <input className={inp} placeholder="大学名 *" value={f.university} onChange={(e) => setF({ ...f, university: e.target.value })} />
        <input className={inp} placeholder="専攻" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
        <input className={inp} placeholder="研究室名 *" value={f.labName} onChange={(e) => setF({ ...f, labName: e.target.value })} />
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <input className={inp} placeholder="次アクション内容" value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} />
        <input className={inp} type="date" value={f.nextActionDate} onChange={(e) => setF({ ...f, nextActionDate: e.target.value })} />
      </div>
      <div className="flex gap-4 text-sm text-[var(--c-ink-2)]">
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.hasUrl} onChange={(e) => setF({ ...f, hasUrl: e.target.checked })} />公式サイトあり</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.urlStale} onChange={(e) => setF({ ...f, urlStale: e.target.checked })} />更新停止</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.hasKaken} onChange={(e) => setF({ ...f, hasKaken: e.target.checked })} />科研費</label>
      </div>
      <p className="text-xs text-[var(--c-ink-3)]">※ 次アクション日は必須です（STATE-03）。</p>
      <Button onClick={submit}>登録</Button>
    </Card>
  );
}
