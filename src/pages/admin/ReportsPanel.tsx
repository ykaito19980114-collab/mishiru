// 見え方診断レポート（FR-REPORT-01/02, AC-04）：生成→編集→状態管理
import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import type { Report, ReportStatus } from "../../../shared/types";
import { Button, Card, Chip, Skeleton, ErrorState } from "../../components/ui";

const STATUS: ReportStatus[] = ["draft", "edited", "sent", "negotiating", "won", "lost"];
const LABEL: Record<ReportStatus, string> = { draft: "下書き", edited: "編集済", sent: "送付済", negotiating: "商談中", won: "受注", lost: "失注" };

export function ReportsPanel() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [err, setErr] = useState(false);
  const [labId, setLabId] = useState("");
  const [labName, setLabName] = useState("");
  const [gen, setGen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = () => { setErr(false); adminApi.reports().then((r) => setReports(r.reports)).catch(() => setErr(true)); };
  useEffect(load, []);

  const generate = async () => {
    if (!labId && !labName) return alert("研究室ID（例: lab-1）または研究室名を入力してください");
    setGen(true);
    try { await adminApi.generateReport({ labId: labId || undefined, labName: labName || undefined }); setLabId(""); setLabName(""); load(); }
    catch (e) { alert((e as Error).message); }
    finally { setGen(false); }
  };
  const save = async (id: string) => { await adminApi.updateReport(id, { content: draft, status: "edited" }); setEditing(null); load(); };

  if (err) return <ErrorState onRetry={load} />;
  if (!reports) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-bold mb-2">診断レポートを生成</h3>
        <div className="flex flex-wrap gap-2">
          <input className="flex-1 min-w-[140px] px-3 py-2 min-h-[44px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] text-sm" placeholder="研究室ID（例: lab-1）" value={labId} onChange={(e) => setLabId(e.target.value)} />
          <input className="flex-1 min-w-[140px] px-3 py-2 min-h-[44px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] text-sm" placeholder="または 研究室名" value={labName} onChange={(e) => setLabName(e.target.value)} />
          <Button onClick={generate} disabled={gen}>{gen ? "生成中…" : "下書き生成"}</Button>
        </div>
        <p className="text-xs text-[var(--c-ink-3)] mt-2">LLM未設定時はテンプレートで生成されます（人間編集前提の下書き）。</p>
      </Card>

      {reports.length === 0 && <Card className="p-6 text-center text-[var(--c-ink-3)]">まだレポートがありません。</Card>}
      <div className="space-y-3">
        {reports.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2"><span className="font-bold text-[var(--c-ink)]">{r.labName}</span><Chip>{r.generatedBy === "llm" ? "LLM生成" : "テンプレ生成"}</Chip></div>
              <select value={r.status} onChange={async (e) => { await adminApi.updateReport(r.id, { status: e.target.value as ReportStatus }); load(); }}
                className="text-xs px-2 py-1 rounded-[8px] border border-[var(--c-border)] min-h-[36px]">
                {STATUS.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
              </select>
            </div>
            {editing === r.id ? (
              <>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} className="w-full text-sm px-3 py-2 rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] font-mono" />
                <div className="flex gap-2 mt-2"><Button onClick={() => save(r.id)}>保存</Button><Button variant="ghost" onClick={() => setEditing(null)}>キャンセル</Button></div>
              </>
            ) : (
              <>
                <pre className="text-xs text-[var(--c-ink-2)] whitespace-pre-wrap font-sans bg-[var(--c-surface)] rounded-[10px] p-3 max-h-52 overflow-auto scrollbar-thin">{r.content}</pre>
                <Button variant="secondary" className="mt-2" onClick={() => { setEditing(r.id); setDraft(r.content); }}>編集する</Button>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
