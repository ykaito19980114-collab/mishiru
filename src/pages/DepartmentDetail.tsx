// 専攻詳細：研究室比較（FR-DEP-01）
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import type { Lab } from "../../shared/types";
import { Skeleton, ErrorState } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";

export default function DepartmentDetail() {
  const { key } = useParams();
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [data, setData] = useState<{ university: string; department: string; labs: Lab[] } | null>(null);

  const load = async () => {
    setState("loading");
    try { setData(await api.getDepartment(key!)); setState("ok"); } catch { setState("error"); }
  };
  useEffect(() => { load(); window.scrollTo(0, 0); }, [key]);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>{data?.department || "専攻"} ｜ MISHIRU</title></Helmet>
      <Link to="/departments" className="flex items-center gap-1 text-sm font-bold text-[var(--c-ink-2)] min-h-[44px] mb-1"><ArrowLeft className="w-4 h-4" />専攻一覧</Link>

      {state === "loading" && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-32" /></div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && data && (
        <>
          <p className="text-sm text-[var(--c-ink-3)]">{data.university}</p>
          <h1 className="text-xl font-black mb-1">{data.department}</h1>
          <p className="text-sm text-[var(--c-ink-2)] mb-4">{data.labs.length}の研究室を、分野と研究テーマから比べられます。</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.labs.map((l) => <LabMiniCard key={l.id} lab={l} />)}
          </div>
          <div className="mt-6 bg-[var(--c-surface)] rounded-[var(--radius-panel)] p-4 text-sm text-[var(--c-ink-2)]">
            この専攻の研究室情報を、学生が比べやすい形へ整えませんか。<Link to="/for-labs" className="text-[var(--c-primary)] font-bold underline">掲載について相談する</Link>
          </div>
        </>
      )}
    </div>
  );
}
