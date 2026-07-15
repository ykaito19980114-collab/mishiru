// 大学まとめページ（/universities/:name）：設置区分・都道府県・研究室数・専攻・研究室一覧
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, MapPin } from "lucide-react";
import { api } from "../lib/api";
import type { Lab } from "../../shared/types";
import { UNIV_TYPE_LABEL } from "../../shared/universities";
import { Skeleton, ErrorState, Chip } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";

export default function UniversityDetail() {
  const { name } = useParams();
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [data, setData] = useState<{ university: { name: string; prefecture: string; region: string; type: string | null; count: number }; labs: Lab[]; departments: { name: string; count: number }[] } | null>(null);
  const [dept, setDept] = useState("");
  const [limit, setLimit] = useState(24);

  const load = () => { setState("loading"); api.getUniversity(name!).then((d) => { setData(d); setState("ok"); }).catch(() => setState("error")); };
  useEffect(() => { load(); window.scrollTo(0, 0); }, [name]);

  const shown = data ? (dept ? data.labs.filter((l) => l.department === dept) : data.labs) : [];

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>{data?.university.name || "大学"}の研究室 ｜ MISHIRU</title></Helmet>
      <Link to="/universities" className="flex items-center gap-1 text-sm font-bold text-[var(--c-ink-2)] min-h-[44px] mb-1"><ArrowLeft className="w-4 h-4" />大学一覧</Link>

      {state === "loading" && <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && data && (
        <>
          <header className="mb-4">
            <h1 className="text-2xl font-bold">{data.university.name}</h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-[var(--c-ink-2)]">
              <MapPin className="w-4 h-4" />{data.university.prefecture}
              <Chip>{data.university.type ? UNIV_TYPE_LABEL[data.university.type as keyof typeof UNIV_TYPE_LABEL] : "—"}</Chip>
              <span>{data.university.count}研究室</span>
            </div>
          </header>

          {/* 専攻フィルタ */}
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2 mb-4">
            <button onClick={() => { setDept(""); setLimit(24); }} className={`shrink-0 text-[13px] px-3 py-1.5 rounded-full border min-h-[36px] ${!dept ? "bg-[var(--c-primary)] text-white border-transparent" : "border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>すべて</button>
            {data.departments.slice(0, 30).map((d) => (
              <button key={d.name} onClick={() => { setDept(dept === d.name ? "" : d.name); setLimit(24); }}
                className={`shrink-0 text-[13px] px-3 py-1.5 rounded-full border min-h-[36px] whitespace-nowrap ${dept === d.name ? "bg-[var(--c-primary)] text-white border-transparent" : "border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>
                {d.name.replace(/^大学院/, "")} <span className={dept === d.name ? "text-white/70" : "text-[var(--c-ink-3)]"}>{d.count}</span>
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {shown.slice(0, limit).map((l) => <LabMiniCard key={l.id} lab={l} />)}
          </div>
          {shown.length > limit && (
            <div className="mt-6 flex justify-center">
              <button onClick={() => setLimit((n) => n + 24)} className="px-6 py-2.5 rounded-[10px] border border-[var(--c-border)] font-bold text-sm min-h-[44px]">さらに表示（残り{shown.length - limit}）</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
