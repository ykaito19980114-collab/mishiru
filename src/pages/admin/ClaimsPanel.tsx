// Claim対応（FR-CLAIM-01/02, SLA表示・一時非公開ボタン）
import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import type { Claim, ClaimStatus } from "../../../shared/types";
import { Button, Card, Chip, Skeleton, ErrorState } from "../../components/ui";

const TYPE_LABEL: Record<string, string> = { fix: "内容修正", takedown: "掲載停止", claim: "公認相談", other: "その他" };
const STATUS_LABEL: Record<ClaimStatus, string> = { pending: "対応待ち", in_review: "確認中", resolved: "対応済", rejected: "却下" };

function slaHours(createdAt: string) {
  return (Date.now() - new Date(createdAt).getTime()) / 36e5;
}

export function ClaimsPanel() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); adminApi.claims().then((r) => setClaims(r.claims)).catch(() => setErr(true)); };
  useEffect(load, []);

  const update = async (id: string, patch: Partial<Claim>) => { await adminApi.updateClaim(id, patch); load(); };
  const hide = async (c: Claim) => {
    if (!c.labId) return alert("対象研究室が特定できません");
    if (!confirm(`「${c.labName}」を一時非公開にします。よろしいですか？`)) return;
    await adminApi.setLabStatus(c.labId, "hidden");
    await update(c.id, { status: "in_review", note: "一時非公開に設定" });
    alert("一時非公開にしました。");
  };

  if (err) return <ErrorState onRetry={load} />;
  if (!claims) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>;

  const pending = claims.filter((c) => c.status === "pending");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--c-ink-2)]">対応待ち {pending.length}件 ／ 全{claims.length}件</p>
      {claims.length === 0 && <Card className="p-6 text-center text-[var(--c-ink-3)]">まだ依頼はありません。</Card>}
      <div className="space-y-3">
        {claims.map((c) => {
          const hrs = slaHours(c.createdAt);
          const overSla = c.status === "pending" && hrs > 24;
          return (
            <Card key={c.id} className={`p-4 ${overSla ? "border-[var(--c-danger)]" : ""}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Chip tone={c.type === "takedown" ? "yellow" : "default"}>{TYPE_LABEL[c.type]}</Chip>
                  <span className="text-xs text-[var(--c-ink-3)]">{c.labName || "対象なし"}</span>
                </div>
                <span className={`text-[11px] font-bold ${overSla ? "text-[var(--c-danger)]" : "text-[var(--c-ink-3)]"}`}>
                  {STATUS_LABEL[c.status]}{c.status === "pending" && `・${hrs.toFixed(0)}h経過${overSla ? "（SLA超過）" : ""}`}
                </span>
              </div>
              <p className="text-sm text-[var(--c-ink-2)] mb-1">{c.message}</p>
              <p className="text-xs text-[var(--c-ink-3)] mb-3">{c.name}（{c.affiliation || "所属未記入"}）｜{c.email}{c.evidenceUrl && <> ｜ <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--c-teal)] underline">資料</a></>}</p>
              <div className="flex flex-wrap gap-2">
                {c.labId && <Button variant="danger" onClick={() => hide(c)} className="text-xs !min-h-[36px] !px-3">一時非公開</Button>}
                {c.status !== "in_review" && <button onClick={() => update(c.id, { status: "in_review" })} className="text-xs px-3 min-h-[36px] rounded-[10px] border border-[var(--c-border)]">確認中に</button>}
                {c.status !== "resolved" && <button onClick={() => update(c.id, { status: "resolved" })} className="text-xs px-3 min-h-[36px] rounded-[10px] border border-[var(--c-border)]">対応済に</button>}
                {c.status !== "rejected" && <button onClick={() => update(c.id, { status: "rejected" })} className="text-xs px-3 min-h-[36px] rounded-[10px] border border-[var(--c-border)]">却下</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
