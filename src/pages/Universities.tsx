// 大学から探す（universities_master由来。地域別・件数つき）
import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search as SearchIcon } from "lucide-react";
import { api } from "../lib/api";
import { REGIONS, UNIV_TYPE_LABEL } from "../../shared/universities";
import { Skeleton, ErrorState, Chip } from "../components/ui";

type Univ = { name: string; prefecture: string; region: string; type: string | null; count: number };

export default function Universities() {
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [univs, setUnivs] = useState<Univ[]>([]);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");

  const load = () => { setState("loading"); api.getUniversities().then((d) => { setUnivs(d.universities); setState("ok"); }).catch(() => setState("error")); };
  useEffect(load, []);

  const filtered = useMemo(() => univs.filter((u) =>
    (!q || u.name.includes(q)) && (!region || u.region === region)), [univs, q, region]);
  const byRegion = useMemo(() => {
    const m: Record<string, Univ[]> = {};
    for (const u of filtered) (m[u.region] ||= []).push(u);
    return m;
  }, [filtered]);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>大学から探す ｜ MISHIRU</title></Helmet>
      <h1 className="text-xl font-black mb-1">大学から探す</h1>
      <p className="text-sm text-[var(--c-ink-2)] mb-4 line-clamp-1">大学ごとに研究室数と専攻を見比べられます。</p>

      <div className="relative mb-3">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-3)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="大学名で絞り込む" className="w-full pl-9 pr-3 min-h-[44px] rounded-[var(--radius-btn)] border border-[var(--c-border-strong)] focus:border-[var(--c-primary)] outline-none text-[15px]" />
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2 mb-4">
        <button onClick={() => setRegion("")} className={`shrink-0 text-[13px] px-3 py-1.5 rounded-full border min-h-[36px] ${!region ? "bg-[var(--c-primary)] text-white border-transparent" : "border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>全国</button>
        {REGIONS.map((r) => (
          <button key={r} onClick={() => setRegion(region === r ? "" : r)} className={`shrink-0 text-[13px] px-3 py-1.5 rounded-full border min-h-[36px] ${region === r ? "bg-[var(--c-primary)] text-white border-transparent" : "border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>{r}</button>
        ))}
      </div>

      {state === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && (
        <div className="space-y-6">
          {REGIONS.filter((r) => byRegion[r]?.length).map((r) => (
            <section key={r}>
              <h2 className="text-sm font-bold text-[var(--c-ink-3)] mb-2">{r}</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {byRegion[r].map((u) => (
                  <Link key={u.name} to={`/universities/${encodeURIComponent(u.name)}`} className="entity-row">
                    <div className="entity-row__main">
                      <span>{u.prefecture}</span>
                      <h3>{u.name}</h3>
                      {u.type && <Chip>{UNIV_TYPE_LABEL[u.type as keyof typeof UNIV_TYPE_LABEL]}</Chip>}
                    </div>
                    <strong className="entity-row__count">{u.count}<small>研究室</small></strong>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && <p className="text-center text-[var(--c-ink-3)] py-12">該当する大学がありません。</p>}
        </div>
      )}
    </div>
  );
}
