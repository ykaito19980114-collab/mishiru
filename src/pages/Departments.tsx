// SCR-08 専攻一覧（束売りの入口 FR-DEP-01）
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Building2, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { Card, Skeleton, ErrorState } from "../components/ui";

export default function Departments() {
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [depts, setDepts] = useState<{ key: string; university: string; department: string; count: number }[]>([]);

  const load = async () => {
    setState("loading");
    try { setDepts((await api.getDepartments()).departments); setState("ok"); } catch { setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const byUniv: Record<string, typeof depts> = {};
  for (const d of depts) (byUniv[d.university] ||= []).push(d);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>専攻から見る ｜ MISHIRU</title></Helmet>
      <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-[var(--c-primary)]" /><h1 className="text-xl font-bold">専攻から見る</h1></div>
      <p className="text-sm text-[var(--c-ink-2)] mb-4">専攻ごとに、所属研究室を研究テーマ・方法・進路から比較できます。</p>

      {state === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && (
        <div className="space-y-6">
          {Object.entries(byUniv).map(([univ, list]) => (
            <section key={univ}>
              <h2 className="text-sm font-bold text-[var(--c-ink-3)] mb-2">{univ}</h2>
              <div className="space-y-2">
                {list.map((d) => (
                  <Link key={d.key} to={`/departments/${encodeURIComponent(d.key)}`}>
                    <Card className="p-4 flex items-center justify-between hover:border-[var(--c-teal)] transition-colors">
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--c-ink)] line-clamp-1">{d.department}</p>
                        <p className="text-xs text-[var(--c-ink-3)] mt-0.5">{d.count}研究室</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[var(--c-ink-3)] shrink-0" />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
