// SCR-06 修正・掲載のご依頼フォーム（FR-CLAIM-01/02, AC-03）
import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import type { Lab } from "../../shared/types";
import { Button, Card } from "../components/ui";

const TYPES = [
  { id: "fix", label: "内容の修正" },
  { id: "takedown", label: "掲載の停止" },
  { id: "claim", label: "公認・情報充実の相談" },
  { id: "other", label: "その他" },
];

export default function Claim() {
  const [params] = useSearchParams();
  const labId = params.get("lab_id") || "";
  const [lab, setLab] = useState<Lab | null>(null);
  const [form, setForm] = useState({ type: "fix", name: "", affiliation: "", email: "", message: "", evidenceUrl: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (labId) api.getLab(labId).then((r) => setLab(r.lab)).catch(() => {});
  }, [labId]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "お名前を入力してください";
    if (!form.email.trim()) e.email = "メールアドレスを入力してください";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "メールアドレスの形式が正しくありません";
    if (!form.message.trim()) e.message = "ご依頼内容を入力してください";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.submitClaim({ ...form, labId: labId || null });
      setDone(res.id);
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 text-center">
        <Helmet><title>受け付けました ｜ MISHIRU</title></Helmet>
        <CheckCircle2 className="w-14 h-14 text-[var(--c-success)] mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">受け付けました</h1>
        <p className="text-[var(--c-ink-2)] mb-2">1営業日以内に運営が確認し、ご連絡します。</p>
        <p className="text-sm text-[var(--c-ink-3)] mb-2">受付番号：{done}</p>
        <p className="text-sm text-[var(--c-ink-3)] mb-6">掲載停止・誤情報のご指摘は、研究室確認の完了前でも一時非公開の措置を優先します。</p>
        <Link to="/discover"><Button variant="secondary">トップに戻る</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
      <Helmet><title>修正・掲載のご依頼 ｜ MISHIRU</title></Helmet>
      <div className="flex items-center gap-2 mb-1"><ShieldAlert className="w-5 h-5 text-[var(--c-primary)]" /><h1 className="text-xl font-bold">修正・掲載のご依頼</h1></div>
      <p className="text-sm text-[var(--c-ink-2)] mb-4">掲載情報の修正・停止、または研究室ページの整備についてご相談いただけます。{lab && <>（対象：<span className="font-bold">{lab.name}</span>）</>}</p>

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.form && <p className="text-sm text-[var(--c-danger)]">{errors.form}</p>}
          <Field label="ご依頼の種別">
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <label key={t.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] border cursor-pointer text-sm min-h-[44px] ${form.type === t.id ? "border-[var(--c-teal)] bg-[var(--c-surface-blue)]" : "border-[var(--c-border)]"}`}>
                  <input type="radio" name="type" checked={form.type === t.id} onChange={() => setForm({ ...form, type: t.id })} className="accent-[var(--c-teal)]" />
                  {t.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="お名前" required error={errors.name}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls(errors.name)} maxLength={100} />
          </Field>
          <Field label="ご所属（任意）">
            <input value={form.affiliation} onChange={(e) => setForm({ ...form, affiliation: e.target.value })} className={inputCls()} maxLength={200} placeholder="例：○○大学 △△研究室" />
          </Field>
          <Field label="メールアドレス" required error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls(errors.email)} maxLength={200} />
          </Field>
          <Field label="ご依頼内容" required error={errors.message}>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className={inputCls(errors.message)} maxLength={2000} placeholder="修正してほしい箇所、掲載停止の理由などをご記入ください" />
          </Field>
          <Field label="確認できる資料のURL（任意）">
            <input value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} className={inputCls()} maxLength={500} placeholder="研究室公式ページなど" />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">{submitting ? "送信中…" : "送信する"}</Button>
          <p className="text-xs text-[var(--c-ink-3)]">いただいた個人情報はご依頼対応のみに利用し、第三者へ提供しません。</p>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold text-[var(--c-ink)] mb-1.5">{label}{required && <span className="text-[var(--c-danger)] ml-1">*</span>}</label>
      {children}
      {error && <p className="text-xs text-[var(--c-danger)] mt-1">{error}</p>}
    </div>
  );
}
const inputCls = (error?: string) =>
  `w-full px-3 py-2.5 min-h-[44px] rounded-[10px] border outline-none text-[15px] focus:border-[var(--c-teal)] ${error ? "border-[var(--c-danger)]" : "border-[var(--c-border)]"}`;
