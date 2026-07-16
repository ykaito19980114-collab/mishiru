// SCR-08 専攻一覧（束売りの入口 FR-DEP-01）
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Building2 } from "lucide-react";
import { api } from "../lib/api";
import { Skeleton, ErrorState, Chip } from "../components/ui";

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
      <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-[var(--c-primary)]" /><h1 className="text-xl font-black">専攻から見る</h1></div>
      <p className="text-sm text-[var(--c-ink-2)] mb-4 line-clamp-1">専攻ごとに所属研究室のテーマや方法を見比べられます。</p>

      {state === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && (
        <div className="space-y-6">
          {Object.entries(byUniv).map(([univ, list]) => (
            <section key={univ}>
              <h2 className="text-sm font-bold text-[var(--c-ink-3)] mb-2">{univ}</h2>
              <div className="space-y-2">
                {list.map((d) => (
                  <Link key={d.key} to={`/departments/${encodeURIComponent(d.key)}`} className="entity-row">
                    <div className="entity-row__main">
                      <span>{univ}</span>
                      <h3>{d.department}</h3>
                      <Chip>専攻</Chip>
                    </div>
                    <strong className="entity-row__count">{d.count}<small>研究室</small></strong>
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
