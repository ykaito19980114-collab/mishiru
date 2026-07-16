// SCR-04 研究室ページ（FR-LAB-01/02, AC-02, AC-09 ＋ FR-ENRICH：AI学生ガイド・公開論文のin-app埋め込み）
import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin, ExternalLink, Sparkles, ShieldAlert, ArrowLeft, Compass, Wrench, GraduationCap, Route, Lightbulb, FileText, Highlighter, Heart, Bookmark } from "lucide-react";
import { api, Enrichment, ResearchResourceResponse } from "../lib/api";
import type { Lab } from "../../shared/types";
import { Button, Card, Chip, Skeleton, ErrorState, VerifiedBadge, Toast, useToast, TrustNote } from "../components/ui";
import { fieldLabel } from "../../shared/fields";
import { displayLabName, labQuestions } from "../lib/labText";
import { makeLabAnnotation, MarkLabel, saveAnnotation } from "../lib/annotations";

// 研究室確認済みの確定情報セクション（値があるときのみ表示）
function VerifiedSection({ title, children, value }: { title: string; children?: React.ReactNode; value?: unknown }) {
  const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0);
  if (empty) return null;
  return (
    <section className="py-4 border-b border-[var(--c-border)] last:border-0">
      <h2 className="text-sm font-bold text-[var(--c-primary)] mb-1.5">{title}</h2>
      <div className="text-[15px] text-[var(--c-ink-2)] leading-relaxed">{children}</div>
    </section>
  );
}

function fallbackResearchSummary(lab: Lab, shownLabName: string) {
  const keywords = lab.keywords.slice(0, 3).join("、") || fieldLabel(lab.field_major);
  return `${shownLabName}では、${keywords}を手がかりに、対象となる現象の仕組みや応用の可能性を探る研究に取り組んでいると考えられます。`;
}

function cleanResearchSummary(value: string) {
  return value
    .replace(/（公開情報のキーワードに基づく要約）。詳細は公式サイト・出典をご確認ください。?/g, "")
    .replace(/（公開情報のキーワードに基づく引用・要約です。詳細は公式サイト・出典をご確認ください。）/g, "")
    .trim();
}

export default function LabDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "error" | "notfound" | "ok">("loading");
  const [lab, setLab] = useState<Lab | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [enrich, setEnrich] = useState<Enrichment | null>(null);
  const [resources, setResources] = useState<ResearchResourceResponse | null>(null);
  const [enrichState, setEnrichState] = useState<"loading" | "done">("loading");
  const [markText, setMarkText] = useState("");
  const [markLabel, setMarkLabel] = useState<MarkLabel>("good");
  const [markNote, setMarkNote] = useState("");
  const [markUrl, setMarkUrl] = useState("");
  const [actBusy, setActBusy] = useState(false);
  const [acted, setActed] = useState<{ like?: boolean; save?: boolean }>({});
  const { toast, showToast } = useToast();
  const returnTo = params.get("returnTo") || "/labs";
  const returnLabel = returnTo.startsWith("/discover") ? "であうに戻る" : returnTo.startsWith("/saved") ? "ためるに戻る" : returnTo.startsWith("/profile") || returnTo.startsWith("/reflect") ? "みつめるに戻る" : "さがすに戻る";

  const load = async () => {
    setState("loading"); setEnrich(null); setEnrichState("loading");
    try {
      const res = await api.getLab(id!);
      setLab(res.lab);
      setReasons(res.connectionReasons);
      setState("ok");
      api.getResearchResources(res.lab.keywords.slice(0, 3).join(" "), 5).then(setResources).catch(() => {});
      // 充実情報は遅延取得（Gemini＋OpenAlexで数秒かかるため本文表示をブロックしない）
      api.getEnrichment(id!).then((e) => { setEnrich(e); setEnrichState("done"); }).catch(() => setEnrichState("done"));
    } catch (e) {
      setState((e as Error).message.includes("見つかりません") ? "notfound" : "error");
    }
  };
  useEffect(() => { load(); window.scrollTo(0, 0); }, [id]);

  if (state === "loading") return <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (state === "error") return <div className="max-w-2xl mx-auto px-4 pt-6"><ErrorState onRetry={load} /></div>;
  if (state === "notfound" || !lab)
    return (
      <div className="max-w-2xl mx-auto px-4 pt-16 text-center">
        <p className="text-[var(--c-ink-2)]">このページは現在ご覧いただけません（非公開または存在しません）。</p>
        <Link to="/labs" className="text-[var(--c-teal)] font-bold mt-4 inline-block">研究室一覧に戻る</Link>
      </div>
    );

  const s = lab.sections;
  const hasVerifiedDetail = !!(s.student_themes?.length || s.methods?.length || s.daily_life || s.mentoring || s.careers || s.fit || s.collaboration || s.key_papers?.length);
  const guide = enrich?.aiGuide;
  const papers = enrich?.papers || [];
  const shownLabName = displayLabName(lab);
  const researchText = cleanResearchSummary(s.research_summary || fallbackResearchSummary(lab, shownLabName));
  const sourcedQuestions = labQuestions(lab, 2);
  const primarySource = lab.sources[0]?.url || lab.official_url || "";
  const primarySourceLabel = lab.sources[0]?.label || (lab.official_url ? "研究室公式サイト" : "");
  const captureSelection = () => {
    const text = window.getSelection()?.toString().trim() || "";
    if (text) setMarkText(text.slice(0, 220));
    else showToast("ページ内の気になる文章を選択してください");
  };
  const saveMark = () => {
    if (!markText.trim()) { showToast("気になる文章を入力してください"); return; }
    saveAnnotation(makeLabAnnotation(lab, markText, markLabel, markNote, markUrl || `/labs/${lab.id}`));
    setMarkText(""); setMarkNote(""); setMarkUrl("");
    showToast("関心プロフィールの材料として保存しました");
  };
  // 評価アクション（一覧から詳細へ集約・即確定→トースト）
  const act = async (action: "like" | "save") => {
    if (actBusy || acted[action]) return;
    setActBusy(true);
    await api.actOnLab(lab.id, action);
    setActed((a) => ({ ...a, [action]: true }));
    setActBusy(false);
    showToast(action === "like" ? "「気になる」に追加しました" : "「ためる」に保存しました");
  };

  const jsonLd = {
    "@context": "https://schema.org", "@type": "ResearchOrganization", name: shownLabName,
    parentOrganization: { "@type": "CollegeOrUniversity", name: lab.university.name },
    member: { "@type": "Person", name: lab.pi.name, jobTitle: lab.pi.title },
    knowsAbout: lab.keywords, sameAs: lab.official_url ? [lab.official_url] : [],
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-40 md:pb-28">
      <Helmet>
        <title>{shownLabName} - {lab.university.name} ｜ MISHIRU</title>
        <meta name="description" content={`${lab.university.name} ${lab.department} ${shownLabName}（${lab.pi.name} ${lab.pi.title}）。研究テーマ・研究方法・進路などを学生向けに整理。`} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <Link to={returnTo} className="flex items-center gap-1 text-sm font-bold text-[var(--c-ink-2)] min-h-[44px] mb-1"><ArrowLeft className="w-4 h-4" />{returnLabel}</Link>

      {/* ヘッダー */}
      <header className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1 text-xs text-[var(--c-ink-3)]"><MapPin className="w-3 h-3" />{lab.university.name}・{lab.department}</div>
          <VerifiedBadge verified={lab.verified} />
        </div>
        <h1 className="text-2xl font-bold leading-tight mb-2">{shownLabName}</h1>
        {(() => {
          const shown = lab.members.map((m) => `${m.name} ${m.title}`.trim()).filter(Boolean).join("／");
          return shown ? <p className="text-[var(--c-ink-2)] font-medium">{shown}</p> : null;
        })()}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip tone="blue">{fieldLabel(lab.field_major)}</Chip>
          {lab.keywords.slice(0, 4).map((k) => <Chip key={k}>{k}</Chip>)}
        </div>
      </header>

      {/* 大元の研究室URL（ヘッダー直下・常設 FR-LAB系）。巨大枠をやめ1行リンクに降格（主アクションは下部バー） */}
      {lab.official_url ? (
        <a href={lab.official_url} target="_blank" rel="noopener noreferrer"
          onClick={() => { api.logEvent("outbound_click", { labId: lab.id }); }}
          className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--c-primary)] underline underline-offset-4 min-h-[44px]">
          研究室の公式サイトを見る<ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <a href={`https://www.google.com/search?q=${encodeURIComponent(`${lab.university.name} ${lab.name}`)}`}
          target="_blank" rel="noopener noreferrer"
          onClick={() => { api.logEvent("outbound_click", { labId: lab.id, dest: "web_search" }); }}
          className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--c-ink-2)] underline underline-offset-4 min-h-[44px]">
          公式サイト未登録 — 「{lab.university.name} {lab.name}」をWebで探す<ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
        </a>
      )}

      {/* あなたとの接続（AC-09） */}
      {reasons.length > 0 && (
        <Card className="p-4 mb-4 bg-[var(--c-surface-blue)] border-transparent">
          <div className="flex items-center gap-1 text-sm font-bold text-[var(--c-primary)] mb-1"><Sparkles className="w-4 h-4" />あなたとの接続</div>
          <ul className="space-y-1">{reasons.map((r, i) => <li key={i} className="text-[14px] text-[var(--c-ink-2)] leading-snug">・{r}</li>)}</ul>
        </Card>
      )}

      {/* 研究内容（公開キーワードからの要約・既存） */}
      <Card className="p-5 mb-4">
        <h2 className="text-sm font-bold text-[var(--c-primary)] mb-1.5">研究内容</h2>
        <p className="text-[15px] text-[var(--c-ink-2)] leading-relaxed">{researchText}</p>
        <div className="mt-3 pt-3 border-t border-[var(--c-border)]">
          <TrustNote>公開情報のキーワードに基づく要約です。詳細は公式サイト・出典をご確認ください。</TrustNote>
          {primarySource && (
            <a href={primarySource} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--c-primary)] underline underline-offset-2">
              {primarySourceLabel || "出典を確認"}<ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </Card>

      {sourcedQuestions.length > 0 && (
        <Card className="p-5 mb-4">
          <h2 className="text-sm font-bold text-[var(--c-primary)] mb-2">この研究室が扱う問い</h2>
          <ul className="space-y-2">
            {sourcedQuestions.map((question, index) => (
              <li key={`${question}:${index}`} className="text-[15px] text-[var(--c-ink-2)] leading-snug flex gap-2">
                <span className="font-black text-[var(--c-teal)]">Q.</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {resources && (resources.fields.length > 0 || resources.societies.length > 0 || resources.journals.length > 0) && (
        <Card className="p-5 mb-4 bg-[var(--c-surface-blue)] border-transparent">
          <h2 className="text-sm font-bold text-[var(--c-primary)] mb-1.5">関連する研究領域・学会・ジャーナル候補</h2>
          <TrustNote className="mb-3">公開キーワードと研究領域データベースから探した候補です（研究室との確定した関係ではありません）。</TrustNote>
          <div className="grid sm:grid-cols-3 gap-3">
            <ResourceMini title="研究領域" items={resources.fields.map((f) => f.nameJa)} />
            <ResourceMini title="学会" items={resources.societies.map((s) => s.name)} />
            <ResourceMini title="ジャーナル" items={resources.journals.map((j) => j.name)} />
          </div>
        </Card>
      )}

      {/* ===== AI学生ガイド（FR-ENRICH。公開情報からの推定・明示ラベル） ===== */}
      {enrichState === "loading" && (
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-2 text-sm text-[var(--c-ink-3)] mb-3"><Sparkles className="w-4 h-4 animate-pulse text-[var(--c-teal)]" />学生向けガイドを準備しています…</div>
          <Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-5/6" />
        </Card>
      )}
      {guide && (
        <Card className="p-5 mb-4 border-[var(--c-teal)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-teal)]"><Sparkles className="w-4 h-4" />学生向けガイド（{guide.generatedBy === "template" ? "公開キーワードの整理" : "AIによる参考情報"}）</div>
          </div>
          <p className="text-[15px] text-[var(--c-ink)] leading-relaxed mb-4">{guide.overview}</p>
          <div className="space-y-4">
            <GuideBlock icon={<Compass className="w-4 h-4" />} title="この研究室が扱う問い">
              <ul className="space-y-1.5">{guide.questions.map((q, i) => <li key={i} className="text-[14px] text-[var(--c-ink-2)] leading-snug flex gap-2"><span className="text-[var(--c-teal)]">Q.</span>{q}</li>)}</ul>
            </GuideBlock>
            <GuideBlock icon={<Wrench className="w-4 h-4" />} title="主な研究の進め方">
              <ul className="space-y-1">{guide.methods.map((m, i) => <li key={i} className="text-[14px] text-[var(--c-ink-2)] leading-snug">・{m}</li>)}</ul>
            </GuideBlock>
            <div className="grid sm:grid-cols-2 gap-4">
              <GuideBlock icon={<GraduationCap className="w-4 h-4" />} title="向いていそうな学生"><p className="text-[14px] text-[var(--c-ink-2)] leading-snug">{guide.fit}</p></GuideBlock>
              <GuideBlock icon={<Route className="w-4 h-4" />} title="想定される進路"><p className="text-[14px] text-[var(--c-ink-2)] leading-snug">{guide.careers}</p></GuideBlock>
            </div>
            <GuideBlock icon={<Lightbulb className="w-4 h-4" />} title="この研究室のおもしろさ"><p className="text-[14px] text-[var(--c-ink-2)] leading-snug">{guide.appeal}</p></GuideBlock>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--c-border)]">
            <TrustNote>この「学生向けガイド」は、公開されている分野キーワードをもとに{guide.generatedBy === "template" ? "決定論的に整理した開発用の" : "AIが生成した"}<b>参考情報</b>です。研究室による確認は受けていないため、実際の研究内容と異なる場合があります。</TrustNote>
          </div>
        </Card>
      )}

      {/* ===== 公開論文（OpenAlexからin-app表示・FR-ENRICH。著者一致→関連論文の二段構え） ===== */}
      {papers.length > 0 && (
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-primary)] mb-1">
            <FileText className="w-4 h-4" />
            {enrich?.papersConfidence === "related" ? "この研究テーマの関連論文" : `${lab.pi.name} 先生の公開論文`}
          </div>
          {enrich?.papersConfidence === "related" ? (
            <TrustNote className="mb-3">研究キーワード「{lab.keywords.slice(0, 3).join("・")}」で公開データベース（OpenAlex）を検索した関連論文です。<b>この研究室の業績一覧ではありません</b>。正確な業績は下の外部DBリンクでご確認ください。</TrustNote>
          ) : (
            <TrustNote className="mb-3">「{lab.pi.name}」名義で公開データベース（OpenAlex）に登録されている論文です。{enrich?.papersConfidence === "name_only" && "分野が一致する確証が弱いため、"}<b>同姓同名を含む場合があります</b>。正確な業績は researchmap 等でご確認ください。</TrustNote>
          )}
          <ul className="space-y-3">
            {papers.map((p, i) => (
              <li key={i} className="border-b border-[var(--c-border)] last:border-0 pb-3 last:pb-0">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={() => api.logEvent("outbound_click", { labId: lab.id, dest: "paper" })}
                    className="text-[14px] font-bold text-[var(--c-teal)] hover:underline leading-snug">{p.title}</a>
                ) : (
                  <span className="text-[14px] font-bold text-[var(--c-ink)] leading-snug">{p.title}</span>
                )}
                <div className="text-[12px] text-[var(--c-ink-3)] mt-0.5">
                  {[p.year ? `${p.year}年` : null, p.citations ? `被引用${p.citations}` : null].filter(Boolean).join("・")}
                  {p.authors.length > 0 && <span className="block truncate">著者: {p.authors.join("、")}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ===== 研究室確認済みの確定情報（verifiedラボのみ表示・無い項目は出さない） ===== */}
      {hasVerifiedDetail && (
        <Card className="px-5 py-1 mb-4">
          <div className="pt-4 flex items-center gap-1.5 text-xs font-bold text-[var(--c-teal)]"><VerifiedBadge verified /> 研究室が確認・提供した情報</div>
          <VerifiedSection title="学生が取り組むテーマ例" value={s.student_themes}>
            <ul className="list-disc pl-5 space-y-1">{s.student_themes?.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </VerifiedSection>
          <VerifiedSection title="研究方法" value={s.methods}><div className="flex flex-wrap gap-1.5">{s.methods?.map((m) => <Chip key={m}>{m}</Chip>)}</div></VerifiedSection>
          <VerifiedSection title="主要な論文・成果" value={s.key_papers}>
            <ul className="space-y-1">{s.key_papers?.map((p, i) => <li key={i}>{p.url ? <a className="text-[var(--c-teal)] underline" href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}{p.note && <span className="text-[var(--c-ink-3)] text-sm">（{p.note}）</span>}</li>)}</ul>
          </VerifiedSection>
          <VerifiedSection title="研究室の日常" value={s.daily_life}>{s.daily_life}</VerifiedSection>
          <VerifiedSection title="指導体制" value={s.mentoring}>{s.mentoring}</VerifiedSection>
          <VerifiedSection title="修了後の進路" value={s.careers}>{s.careers}</VerifiedSection>
          <VerifiedSection title="向いている／向いていない学生" value={s.fit}>
            {s.fit && <div className="space-y-1"><p><span className="font-bold text-[var(--c-success)]">向いている：</span>{s.fit.suited}</p><p><span className="font-bold text-[var(--c-ink-3)]">別分野が向くかも：</span>{s.fit.not_suited}</p></div>}
          </VerifiedSection>
          <VerifiedSection title="共同研究の相談領域" value={s.collaboration}>{s.collaboration}</VerifiedSection>
        </Card>
      )}

      {/* 外部DBでの確認リンク（正確な業績の一次確認用に格下げ） */}
      {lab.pi.name && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-[var(--c-ink-3)] uppercase tracking-wide mb-2">{lab.pi.name} 先生の情報を一次ソースで確認する</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "researchmap", url: `https://researchmap.jp/researchers?q=${encodeURIComponent(lab.pi.name)}` },
              { label: "CiNii Research", url: `https://cir.nii.ac.jp/all?q=${encodeURIComponent(lab.pi.name)}` },
              { label: "KAKEN(科研費)", url: `https://kaken.nii.ac.jp/ja/search/?qm=${encodeURIComponent(lab.pi.name)}` },
              { label: "Google Scholar", url: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${lab.pi.name}" ${lab.university.name}`)}` },
            ].map((x) => (
              <a key={x.label} href={x.url} target="_blank" rel="noopener noreferrer" onClick={() => api.logEvent("outbound_click", { labId: lab.id, dest: x.label })}
                className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--c-teal)] border border-[var(--c-teal)] rounded-full px-3 py-1.5 min-h-[40px] hover:bg-[var(--c-surface-blue)] transition-colors">
                {x.label}<ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 出典・更新日・修正依頼（FR-LAB-02 / AC-02） */}
      <div className="mb-4 bg-[var(--c-surface)] rounded-[var(--radius-panel)] p-4 text-sm">
        <h3 className="text-xs font-bold text-[var(--c-ink-3)] uppercase tracking-wide mb-2">出典・情報について</h3>
        <ul className="space-y-1 mb-3">
          {lab.sources.map((src, i) => (
            <li key={i}><a href={src.url} target="_blank" rel="noopener noreferrer" className="text-[var(--c-teal)] underline">{src.label}</a></li>
          ))}
          {lab.sources.length === 0 && <li className="text-[var(--c-ink-3)]">公開情報にもとづく暫定掲載です。</li>}
        </ul>
        <p className="text-xs text-[var(--c-ink-3)] mb-3">最終更新：{lab.last_updated}　／　情報の確度：{lab.confidence === "verified" ? "研究室確認済み" : "公開情報ベース（一部AI推定・研究室未確認項目あり）"}</p>
        <Link to={`/claim?lab_id=${lab.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink)] min-h-[44px]">
          <ShieldAlert className="w-4 h-4" />この情報の修正・掲載について依頼する
        </Link>
      </div>

      {/* 研究室関係者向け */}
      <div className="bg-[var(--c-primary)] text-white rounded-[var(--radius-card)] p-5">
        <h3 className="font-bold text-lg mb-1">この研究室の関係者の方へ</h3>
        <p className="text-sm text-white/80 mb-4 leading-relaxed">学生テーマ例・日常・指導体制・進路など、確認済みの情報を掲載しませんか。整備・更新を運営が代行します。まずは無料の「研究室サイト相談」から。</p>
        <Link to={`/for-labs?lab_id=${lab.id}`} className="inline-block bg-white text-[var(--c-primary)] font-bold px-5 py-3 rounded-[10px] text-sm">研究室サイトについて相談する</Link>
      </div>

      <Card className="p-5 mt-4 border-[var(--c-primary)]">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-primary)] mb-2">
          <Highlighter className="w-4 h-4" />気になる箇所をマーキング
        </div>
        <p className="text-xs text-[var(--c-ink-3)] mb-3">ページ内で気になった文章を選択して「選択文を入れる」ボタンを押す、もしくは外部サイトの気になった文章をコピー&ペーストし、「いい／わからない／違う／大事」とメモを残すと、関心プロフィールの材料になります。</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[["good", "いい"],["unclear", "わからない"],["not_fit", "違う"],["important", "大事"]].map(([id, label]) => (
            <button key={id} onClick={() => setMarkLabel(id as MarkLabel)} className={`min-h-[36px] px-3 rounded-full border text-[13px] font-bold ${markLabel === id ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white text-[var(--c-ink-2)] border-[var(--c-border)]"}`}>{label}</button>
          ))}
        </div>
        <textarea value={markText} onChange={(e) => setMarkText(e.target.value)} rows={3} placeholder="選択した文章、または気になった内容" className="w-full rounded-[12px] border border-[var(--c-border)] p-3 text-sm outline-none focus:border-[var(--c-primary)] mb-2" />
        <input value={markNote} onChange={(e) => setMarkNote(e.target.value)} placeholder="理由メモ（任意）" className="w-full min-h-[42px] rounded-[12px] border border-[var(--c-border)] px-3 text-sm outline-none focus:border-[var(--c-primary)] mb-3" />
        <input value={markUrl} onChange={(e) => setMarkUrl(e.target.value)} placeholder="参照リンク（任意。このページ内の情報なら空欄でOK）" className="w-full min-h-[42px] rounded-[12px] border border-[var(--c-border)] px-3 text-sm outline-none focus:border-[var(--c-primary)] mb-3" />
        <div className="flex gap-2"><Button variant="secondary" onClick={captureSelection}>選択文を入れる</Button><Button onClick={saveMark}>関心プロフィールに保存</Button></div>
      </Card>

      {/* 下部固定アクションバー：評価は即確定→トースト（確認ダイアログなし） */}
      <div className="action-bar">
        <div className="action-bar__inner" role="group" aria-label="この研究室へのアクション">
          <button type="button" className={`action-bar__btn ${acted.like ? "action-bar__btn--done" : ""}`} onClick={() => act("like")} disabled={actBusy}>
            <Heart aria-hidden="true" />{acted.like ? "追加済み" : "気になる"}
          </button>
          <button type="button" className={`action-bar__btn ${acted.save ? "action-bar__btn--done" : "action-bar__btn--primary"}`} onClick={() => act("save")} disabled={actBusy}>
            <Bookmark aria-hidden="true" />{acted.save ? "保存済み" : "保存する"}
          </button>
        </div>
      </div>
      <Toast message={toast.msg} show={toast.show} />
    </div>
  );
}

function ResourceMini({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[12px] font-black text-[var(--c-primary)] mb-1">{title}</p>
      {items.length ? (
        <div className="space-y-1">{items.slice(0, 4).map((item) => <p key={item} className="text-[12px] font-bold text-[var(--c-ink-2)] leading-snug">・{item}</p>)}</div>
      ) : (
        <p className="text-[12px] text-[var(--c-ink-3)]">候補なし</p>
      )}
    </div>
  );
}

function GuideBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--c-primary)] mb-1.5">{icon}{title}</h3>
      {children}
    </div>
  );
}
