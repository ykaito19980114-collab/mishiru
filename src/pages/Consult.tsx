import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { BookOpen, Check, Copy, ExternalLink, FlaskConical, Send, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, Skeleton, TrustNote } from "../components/ui";
import type { Lab } from "../../shared/types";
import type { ConsultationAsset, ResearchProject } from "../../shared/research-project";

type ConsultationRow = {
  project: ResearchProject;
  labs: Lab[];
  asset?: ConsultationAsset;
};

export default function Consult() {
  const [rows, setRows] = useState<ConsultationRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [selectedId, setSelectedId] = useState("");
  const [copied, setCopied] = useState("");

  const load = () => {
    setState("loading");
    api.getProjects().then(async ({ projects }) => {
      const next = await Promise.all(projects.map(async (project) => {
        const ids = Array.from(new Set([
          ...(project.step2Response.academic_mapping.matched_lab_ids || []),
          ...project.sourceMaterials.filter((item) => item.sourceType === "lab").map((item) => item.sourceId),
        ])).slice(0, 5);
        let labs = (await Promise.all(ids.map((id) => api.getLab(id).then((result) => result.lab).catch(() => null)))).filter((lab): lab is Lab => Boolean(lab));
        if (!labs.length) {
          const query = project.step2Response.academic_mapping.target_domain || project.displayTitle;
          labs = (await api.getLabs({ q: query, limit: "3", sort: "match" }).catch(() => ({ data: [], total: 0 }))).data;
        }
        const assets = await api.getConsultationAssets(project.id).then((result) => result.assets).catch(() => []);
        const asset = assets.filter((item) => item.status === "ready").sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
        return { project, labs, asset };
      }));
      setRows(next);
      setSelectedId((current) => current || next[0]?.project.id || "");
      setState("ok");
    }).catch(() => setState("error"));
  };

  useEffect(load, []);
  const current = useMemo(() => rows.find((row) => row.project.id === selectedId) || rows[0], [rows, selectedId]);
  const shareUrl = current ? `${window.location.origin}/projects/${current.project.id}?tab=assets` : "";
  const copyShareUrl = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(current.project.id);
    window.setTimeout(() => setCopied(""), 1600);
  };

  return <div className="consult-page max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
    <Helmet><title>つたえる ｜ MISHIRU</title></Helmet>
    <header className="consult-heading">
      <div><p className="eyebrow">SHARE & CONNECT</p><h1>相談できる相手へ、つなげる</h1><p>整えた相談セットと、問いに近い研究室を一緒に確認できます</p></div>
      <Send aria-hidden="true" />
    </header>
    {state === "loading" && <div className="consult-loading"><Skeleton className="h-28"/><Skeleton className="h-72"/></div>}
    {state === "error" && <ErrorState onRetry={load}/>} 
    {state === "ok" && rows.length === 0 && <Card><EmptyState icon={<BookOpen className="w-8 h-8"/>} title="相談セットはまだありません" description="研究テーマを一冊にすると、相談先候補をここで確認できます" action={<Link to="/projects"><Button>相談セットを作る</Button></Link>}/></Card>}
    {state === "ok" && current && <div className="consult-layout">
      <aside className="consult-projects" aria-label="相談セットを選択">
        <h2>相談セット</h2>
        {rows.map(({project}) => <button key={project.id} className={project.id === current.project.id ? "active" : ""} onClick={() => setSelectedId(project.id)}><span>{project.displayTitle}</span><small>{project.step2Response.academic_mapping.target_domain || "研究領域を整理中"}</small></button>)}
      </aside>
      <main className="consult-content">
        <section className="consult-share-panel">
          <div><span>共有する相談セット</span><h2>{current.project.displayTitle}</h2><p>{current.project.subtitle}</p></div>
          <div className="consult-share-link"><Link to={`/projects/${current.project.id}?tab=assets`}>{shareUrl}</Link><button onClick={copyShareUrl} title="共有リンクをコピー" aria-label="共有リンクをコピー">{copied === current.project.id ? <Check/> : <Copy/>}</button></div>
          <div className="consult-share-actions"><Link to={`/projects/${current.project.id}?tab=assets`}><Button variant="secondary"><BookOpen/>相談セットを確認</Button></Link>{current.asset && <a className="consult-download" href={api.consultationAssetDownloadUrl(current.project.id, current.asset.id)}><ExternalLink/>生成済み資料を開く</a>}</div>
        </section>
        <section className="consult-candidates">
          <div className="consult-section-heading"><div><p className="eyebrow">RELATED LABS</p><h2>相談先の候補</h2></div><span>{current.labs.length}研究室</span></div>
          {current.labs.length === 0 ? <Card className="consult-no-labs"><FlaskConical/><div><h3>相談先の候補はまだありません</h3><p>相談セットの関連素材に研究室を追加すると、ここへ優先して表示されます</p></div><Link to="/search">研究室をさがす</Link></Card> : <div className="consult-lab-list">{current.labs.map((lab) => <Card className="consult-lab-card" key={lab.id}>
            <div className="consult-lab-mark"><FlaskConical/></div>
            <div className="consult-lab-main"><small>{lab.university.name} ・ {lab.department}</small><h3>{lab.name}</h3><p><UserRound/>{lab.pi?.name || "担当教員未確認"}<span>{lab.pi?.title}</span></p></div>
            <div className="consult-lab-links"><Link to={`/labs/${lab.id}?returnTo=${encodeURIComponent("/consult")}`}>MISHIRUで見る</Link>{lab.official_url ? <a href={lab.official_url} target="_blank" rel="noreferrer">研究室公式サイト<ExternalLink/></a> : <span>公式サイト未確認</span>}</div>
          </Card>)}</div>}
          <TrustNote className="mt-2">候補は相談セットと公開情報をもとに整理しています。未確認表示は各研究室で確認できます。</TrustNote>
        </section>
      </main>
    </div>}
  </div>;
}
