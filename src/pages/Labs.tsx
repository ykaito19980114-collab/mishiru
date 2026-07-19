// SCR-04b 研究室一覧（ホーム）。全国2万件を多軸フィルタ＋AI意味検索で探索。
import React, { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SlidersHorizontal, Building2, X, Sparkles, Loader2, ArrowDown, Layers, Landmark, BookOpen, Search, ExternalLink, Info } from "lucide-react";
import { api, LabWithReasons, ResearchResourceResponse } from "../lib/api";
import type { ResearchField, ResearchJournal, ResearchSociety } from "../../shared/types";
import { fieldLabel } from "../../shared/fields";
import { UNIV_TYPE_LABEL } from "../../shared/universities";
import { Button, Skeleton, EmptyState, ErrorState, Chip } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";
import { FilterSheet, Filters, EMPTY_FILTERS } from "../components/FilterSheet";

const FILTER_KEYS: (keyof Filters | "tag")[] = ["q", "univ", "field", "tag", "region", "prefecture", "type", "pi_title", "size", "major"];
const MULTI_FILTER_KEYS = new Set<keyof Filters>(["field", "region", "prefecture", "type", "size"]);
const splitValues = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);
const CHIP_LABEL: Record<string, (v: string) => string> = {
  q: (v) => `"${v}"`, univ: (v) => v, field: (v) => fieldLabel(v), region: (v) => v, prefecture: (v) => v,
  type: (v) => UNIV_TYPE_LABEL[v as keyof typeof UNIV_TYPE_LABEL] || v, pi_title: (v) => v,
  size: (v) => ({ "1": "単独主宰", "2-3": "中規模", "4+": "大規模" }[v] || v), major: (v) => `専攻:${v}`, tag: (v) => `タグ:${v}`,
};

type AiResult = {
  interpreted: { fieldLabels: string[]; areaLabels: string[]; keywords: string[] };
  by: "llm" | "keyword"; total: number; data: LabWithReasons[];
};
type ActiveChip = { key: keyof Filters | "tag"; value: string };
type SearchMode = "labs" | "fields" | "societies" | "journals";

const MODE_SUGGESTIONS = [
  "人が本音を言いづらいのはなぜ？",
  "チームで意見が出ないのはなぜ？",
  "学び方は人によってどう違う？",
  "地域に居場所があると何が変わる？",
  "人はなぜ先延ばししてしまう？",
  "AIで仕事の判断はどう変わる？",
  "子どもの好奇心はどう育つ？",
  "まちの使われ方はどう変わる？",
];

const SEARCH_MODES: { id: SearchMode; label: string; icon: React.ElementType }[] = [
  { id: "labs", label: "研究室", icon: Building2 },
  { id: "fields", label: "研究領域", icon: Layers },
  { id: "societies", label: "学会", icon: Landmark },
  { id: "journals", label: "ジャーナル", icon: BookOpen },
];

export default function Labs() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of FILTER_KEYS) if (k !== "q" && k !== "tag") f[k] = params.get(k) || "";
    return f;
  });
  const [tag, setTag] = useState(params.get("tag") || "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [labs, setLabs] = useState<LabWithReasons[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState(params.get("sort") || "");

  // AI意味検索の状態
  const [aiInput, setAiInput] = useState(params.get("ai") || "");
  const [aiQuery, setAiQuery] = useState(params.get("ai") || "");
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [resources, setResources] = useState<ResearchResourceResponse | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [resourceMode, setResourceMode] = useState<SearchMode>("labs");
  const [showExamples, setShowExamples] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const activeChips: ActiveChip[] = FILTER_KEYS.flatMap((k): ActiveChip[] => {
    if (k === "q") return [];
    if (k === "tag") return tag ? [{ key: k, value: tag }] : [];
    const raw = filters[k];
    if (!raw) return [];
    return MULTI_FILTER_KEYS.has(k) ? splitValues(raw).map((value) => ({ key: k, value })) : [{ key: k, value: raw }];
  });
  const hasFilter = activeChips.length > 0;
  const inAiMode = !!aiQuery;

  // フィルタ検索
  const load = useCallback(async (f: Filters, srt: string, pg: number) => {
    if (pg === 1) setState("loading"); else setLoadingMore(true);
    try {
      const p: Record<string, string> = { limit: "8", page: String(pg) };
      for (const k of FILTER_KEYS) if (k !== "q" && k !== "tag" && f[k]) p[k] = f[k];
      if (tag) p.tag = tag;
      if (srt) p.sort = srt;
      const res = await api.getLabs(p);
      setTotal(res.total);
      setLabs((prev) => (pg === 1 ? res.data : [...prev, ...res.data]));
      setState("ok");
    } catch { setState("error"); } finally { setLoadingMore(false); }
  }, [tag]);

  // AI検索
  const runAi = useCallback(async (query: string) => {
    if (query.trim().length < 2) return;
    setAiQuery(query);
    setAiState("loading");
    const np = new URLSearchParams(params); np.set("ai", query); setParams(np, { replace: true });
    try {
      const res = await api.smartSearch(query);
      const specificTerms = [...res.interpreted.keywords, ...res.interpreted.areaLabels];
      const terms = specificTerms.length ? specificTerms : res.interpreted.fieldLabels;
      const resourceRes = await api.getResearchResources(query, 6, {}, terms);
      setAiResult(res);
      setResources(resourceRes);
      setAiState("idle");
    } catch { setAiState("error"); }
  }, [params, setParams]);

  const exitAi = () => {
    setAiQuery(""); setAiInput(""); setAiResult(null); setResources(null); setAiState("idle");
    const np = new URLSearchParams(params); np.delete("ai"); setParams(np, { replace: true });
  };

  // 初回: URLにaiがあればAI検索、なければフィルタ検索
  useEffect(() => {
    if (params.get("ai")) { runAi(params.get("ai")!); }
    else api.getResearchResources("", 12).then(setResources).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inAiMode) return; // AIモード中はフィルタ検索を止める
    setPage(1); load(filters, sort, 1);
    const np = new URLSearchParams();
    for (const k of FILTER_KEYS) if (k !== "q" && k !== "tag" && filters[k]) np.set(k, filters[k]);
    if (tag) np.set("tag", tag);
    if (sort) np.set("sort", sort);
    setParams(np, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, tag]);

  const removeChip = (k: keyof Filters | "tag", value?: string) => {
    if (k === "tag") { setTag(""); return; }
    setFilters((f) => {
      if (!MULTI_FILTER_KEYS.has(k) || !value) return { ...f, [k]: "", ...(k === "region" ? { prefecture: "" } : {}) };
      const next = splitValues(f[k]).filter((v) => v !== value).join(",");
      return { ...f, [k]: next, ...(k === "region" ? { prefecture: "" } : {}) };
    });
  };
  const loadMore = () => { const next = page + 1; setPage(next); load(filters, sort, next); };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 md:pt-8 pb-12">
      <Helmet><title>さがす ｜ MISHIRU</title></Helmet>

      {/* 記憶の1点＝青い帯×彫刻ポスター。主アクションは検索箱ひとつ（ADR-007） */}
      <section className="hero-band" aria-labelledby="labs-hero-title">
        <p className="hero-band__eyebrow">気になることから探せます</p>
        <h1 id="labs-hero-title">気になることから、研究を探す。</h1>

        {/* ボタンは常にフルカラー。未入力での送信は入力欄へフォーカスを返す（押せない見た目を作らない） */}
        <form onSubmit={(e) => { e.preventDefault(); if (aiInput.trim().length < 2) { searchInputRef.current?.focus(); return; } runAi(aiInput); }} className="hero-search">
          <div className="hero-search__box">
            <Search aria-hidden="true" />
            <input ref={searchInputRef} id="mode-search-input" value={aiInput} onChange={(e) => setAiInput(e.target.value)}
              placeholder="例：人が本音を言いづらいのはなぜ？"
              aria-label="気になっていること"
              autoComplete="off" />
          </div>
          <button type="submit" className="hero-search__submit" disabled={aiState === "loading"} aria-disabled={aiState === "loading"}>
            {aiState === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : <>さがす</>}
          </button>
        </form>
        <div className="hero-examples" aria-label="入力例">
          <span className="hero-examples__prefix">たとえば</span>
          {MODE_SUGGESTIONS.slice(0, showExamples ? MODE_SUGGESTIONS.length : 3).map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => { setAiInput(suggestion); runAi(suggestion); }}>{suggestion}</button>
          ))}
          <button type="button" onClick={() => setShowExamples((value) => !value)}>{showExamples ? "例を閉じる" : "例をもっと見る"}</button>
        </div>

        {/* 彫刻ポスター＝キャッチーの担い手。実数バッジを重ねて情報と結婚させる（md+は帯の右に額装・モバイルは帯の裾に鎮座） */}
        <figure className="hero-band__figure">
          <img src="/assets/motifs/mishiru-sculpture-640.png" alt="青い額の中に置かれた白い彫刻——研究前夜のモチーフ" width={613} height={640} loading="eager" decoding="async" />
          {!inAiMode && !hasFilter && total > 0 && (
            <span className="hero-band__count" aria-label={`全国${total.toLocaleString()}件の研究室を掲載`}>
              全国の研究室<strong>{total.toLocaleString()}<small>件</small></strong>
            </span>
          )}
        </figure>
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="search-segments" role="tablist" aria-label="探す対象">
          {SEARCH_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <button key={mode.id} type="button" role="tab" aria-selected={resourceMode === mode.id}
                onClick={() => setResourceMode(mode.id)}
                className={`search-segment ${resourceMode === mode.id ? "search-segment--active" : ""}`}>
                <Icon className="w-4 h-4" aria-hidden="true" />{mode.label}
              </button>
            );
          })}
        </div>
        <Link to="/universities" className="text-[13px] font-bold text-[var(--c-ink-2)] flex items-center gap-1.5 min-h-[44px] hover:text-[var(--c-primary)]"><Building2 className="w-4 h-4" aria-hidden="true" />大学から探す</Link>
      </div>

      {/* AIモード：解釈バナー */}
      {inAiMode && (
        <div className="mb-4 bg-[var(--c-surface-blue)] rounded-[var(--radius-panel)] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-primary)] mb-1">
                <Sparkles className="w-4 h-4" />「{aiQuery}」を研究の言葉に置き換えました
              </div>
              {aiResult && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {aiResult.interpreted.fieldLabels.map((l, index) => <Chip key={`f:${l}:${index}`} tone="blue">{l}</Chip>)}
                  {aiResult.interpreted.keywords.slice(0, 5).map((k, index) => <Chip key={`k:${k}:${index}`}>{k}</Chip>)}
                  {aiResult.interpreted.fieldLabels.length === 0 && aiResult.interpreted.keywords.length === 0 &&
                    <span className="text-xs text-[var(--c-ink-3)]">キーワードを特定できませんでした。言い換えてお試しください。</span>}
                </div>
              )}
              <p className="text-[11px] text-[var(--c-ink-3)] mt-1.5">{aiResult?.by === "llm" ? "AIで意味を整理" : "登録語から検索"} ・ 研究室{aiResult?.total ?? 0}件</p>
            </div>
            <button onClick={exitAi} className="shrink-0 flex items-center gap-1 text-xs font-bold text-[var(--c-ink-2)] min-h-[36px]"><X className="w-4 h-4" />検索を終える</button>
          </div>
        </div>
      )}

      {inAiMode && resources && (
        <div className="mb-5 grid lg:grid-cols-3 gap-3">
          <ResourceLane title="関連する研究領域" items={resources.fields.map((f) => ({ name: f.nameJa, sub: f.beginnerDescription || f.researchPurpose || f.coordinate || f.definition, to: `/labs?ai=${encodeURIComponent(f.nameJa)}` }))} />
          <ResourceLane title="関連学会" items={resources.societies.map((s) => ({ name: s.name, sub: s.relatedFields.slice(0, 3).join("・") || s.disciplines.slice(0, 3).join("・") || s.kind || "学会", url: s.url }))} />
          <ResourceLane title="関連ジャーナル" items={resources.journals.map((j) => ({ name: j.name, sub: j.relatedFields.slice(0, 3).join("・") || j.disciplines.slice(0, 3).join("・") || j.kind || "ジャーナル", url: j.url }))} />
        </div>
      )}

      {resourceMode !== "labs" && (
        <ResourceExplorer
          mode={resourceMode}
          resources={resources}
          query={aiQuery || aiInput}
          onSearch={(q) => { setAiInput(q); runAi(q); setResourceMode("labs"); }}
        />
      )}

      {/* フィルタモードのアクティブチップ */}
      {resourceMode === "labs" && !inAiMode && activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeChips.map(({ key, value }) => (
            <button key={`${key}:${value}`} onClick={() => removeChip(key, value)} className="flex items-center gap-1 text-[13px] px-2.5 py-1 rounded-full bg-[var(--c-surface-blue)] text-[var(--c-primary)] min-h-[32px]">
              {CHIP_LABEL[key](value)}<X className="w-3 h-3" />
            </button>
          ))}
          <button onClick={() => { setFilters(EMPTY_FILTERS); setTag(""); }} className="text-[13px] text-[var(--c-ink-3)] underline min-h-[32px]">すべて解除</button>
        </div>
      )}

      <div className="flex gap-8">
        {resourceMode === "labs" && !inAiMode && <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} filters={filters} onChange={setFilters} onApply={() => {}} />}

        {resourceMode === "labs" && <div className="flex-1 min-w-0">
          {/* ===== AIモードの結果 ===== */}
          {inAiMode ? (
            aiState === "loading" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
            ) : aiState === "error" ? (
              <ErrorState onRetry={() => runAi(aiQuery)} />
            ) : aiResult && aiResult.data.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">
                {aiResult.data.map((l, index) => <LabMiniCard key={`${l.id}:${index}`} lab={l} />)}
              </div>
            ) : (
              <EmptyState title="近い研究室が見つかりませんでした" description="対象や場面を加えると見つかりやすくなります。例：『職場で本音を言いづらい』『まちの空き家を減らしたい』"
                action={<Button variant="secondary" onClick={() => { exitAi(); searchInputRef.current?.focus(); }}>言い換えて探す</Button>} />
            )
          ) : (
            /* ===== フィルタモードの結果 ===== */
            <>
              <div className="labs-result-tools">
                <p className="text-xs text-[var(--c-ink-3)]">{state === "ok" ? `${total.toLocaleString()}件` : "　"}</p>
                <div><button type="button" onClick={() => setSheetOpen(true)} className="labs-filter-button"><SlidersHorizontal className="w-4 h-4"/>{activeChips.length ? `絞り込み（${activeChips.length}）` : "絞り込み"}</button><select value={sort} onChange={(e) => setSort(e.target.value)} className="text-sm px-2 py-1.5 rounded-[8px] border border-[var(--c-border)] min-h-[44px]"><option value="">{hasFilter ? "関連度順" : "おすすめ順"}</option><option value="univ">大学名順</option><option value="newest">新着順</option></select></div>
              </div>
              {state === "loading" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
              {state === "error" && <ErrorState onRetry={() => load(filters, sort, 1)} />}
              {state === "ok" && labs.length === 0 && (
                <EmptyState title="条件に合う研究室がありません" description="条件を1つ減らすと、候補が見つかりやすくなります。"
                  action={<Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>すべての研究室を見る</Button>} />
              )}
              {state === "ok" && labs.length > 0 && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">{labs.map((l, index) => <LabMiniCard key={`${l.id}:${index}`} lab={l} reasons={l.matchReasons} />)}</div>
                  {labs.length < total && (
                    <div className="mt-8 flex justify-center"><Button variant="secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "読み込み中…" : "さらに表示"}</Button></div>
                  )}
                </>
              )}
            </>
          )}
        </div>}
      </div>
    </div>
  );
}

function ResourceExplorer({ mode, resources, query, onSearch }: { mode: Exclude<SearchMode, "labs">; resources: ResearchResourceResponse | null; query: string; onSearch: (q: string) => void }) {
  const [resourceQuery, setResourceQuery] = useState(query);
  const [result, setResult] = useState<ResearchResourceResponse | null>(resources);
  const [loading, setLoading] = useState(false);
  const [resourceFilters, setResourceFilters] = useState<Record<string, string>>({});
  useEffect(() => { setResult(resources); }, [resources]);
  useEffect(() => {
    setResourceQuery("");
    setResourceFilters({});
    setLoading(true);
    api.getResearchResources("", 30).then(setResult).finally(() => setLoading(false));
  }, [mode]);

  const runResourceSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    try { setResult(await api.getResearchResources(resourceQuery, 30, resourceFilters)); }
    finally { setLoading(false); }
  };
  const items =
    mode === "fields" ? result?.fields || [] :
    mode === "societies" ? result?.societies || [] :
    result?.journals || [];
  const title = mode === "fields" ? "研究領域から探す" : mode === "societies" ? "学会から探す" : "ジャーナルから探す";
  const description = mode === "fields"
    ? "身近な疑問が、どの研究分野につながるかを見つけられます。"
    : mode === "societies"
      ? "同じテーマを研究する人が集まる学会を探せます。"
      : "読みたい論文が載りそうな学術誌を探せます。";
  return (
    <section className="mb-8" aria-labelledby="resource-explorer-title">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 id="resource-explorer-title" className="text-lg font-black text-[var(--c-ink)]">{title}</h3>
          <p className="text-sm text-[var(--c-ink-2)]">{description}</p>
        </div>
      </div>
      {(mode === "societies" || mode === "journals") && <ResourceLegendGuide mode={mode} legends={result?.legends || []} />}
      <ResourceSearchControls
        mode={mode}
        query={resourceQuery}
        onQuery={setResourceQuery}
        filters={resourceFilters}
        onFilters={setResourceFilters}
        facets={result?.facets}
        onSubmit={runResourceSearch}
        loading={loading}
      />
      {!result ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title="候補が見つかりませんでした" description="言葉を短くするか、絞り込みを減らして検索してください。" />
      ) : (
        <div className={`grid sm:grid-cols-2 gap-3 ${mode === "fields" ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {mode === "fields" && (items as ResearchField[]).map((item, index) => <FieldResourceCard key={`${item.id}:${index}`} item={item} labs={result.labCandidates?.[item.id] || []} onSearch={onSearch} />)}
          {mode === "societies" && (items as ResearchSociety[]).map((item, index) => <SocietyResourceCard key={`${item.id}:${index}`} item={item} labs={result.labCandidates?.[item.id] || []} />)}
          {mode === "journals" && (items as ResearchJournal[]).map((item, index) => <JournalResourceCard key={`${item.id}:${index}`} item={item} labs={result.labCandidates?.[item.id] || []} />)}
        </div>
      )}
    </section>
  );
}

function FieldResourceCard({ item, labs, onSearch }: { item: ResearchField; labs: LabWithReasons[]; onSearch: (q: string) => void }) {
  const societies = [...item.domesticSocieties, ...item.internationalSocieties].slice(0, 4).join(" / ");
  const journals = [...item.domesticJournals, ...item.internationalJournals].slice(0, 4).join(" / ");
  const hierarchyPath = item.fullPath.split(" > ").filter((part) => part && part !== item.nameJa).join(" > ");
  return (
    <article className="resource-card">
      {hierarchyPath && <p className="resource-field-path">{hierarchyPath}</p>}
      <h4 className="text-[18px] font-black text-[var(--c-primary)] leading-snug">{item.nameJa}</h4>
      <p className="mt-2 text-sm text-[var(--c-ink-2)] line-clamp-3">{item.beginnerDescription || item.definition || item.fullPath || "説明データを整備中です。"}</p>
      <div className="mt-3 space-y-2 text-[12px] text-[var(--c-ink-2)]">
        {item.researchPurpose && <ResourceLine label="この分野が目指すこと" value={item.researchPurpose} />}
        <ResourceQuestions label="この領域が扱う問いの例" questions={item.questions} />
        {!!item.researchObjects?.length && <ResourceLine label="研究対象" value={item.researchObjects.slice(0, 5).join(" / ")} />}
        {!!item.representativeThemes?.length && <ResourceLine label="代表的なテーマ" value={item.representativeThemes.slice(0, 5).join(" / ")} />}
        <ResourceLine label="関連学会" value={societies || "確認中"} />
        <ResourceLine label="関連ジャーナル" value={journals || "確認中"} />
      </div>
      <div className="mt-auto pt-4 space-y-2">
        <button type="button" onClick={() => onSearch(item.nameJa)} className="text-sm font-black text-[var(--c-primary)] inline-flex items-center gap-1">
          関連する研究室を見る<ArrowDown className="w-4 h-4 -rotate-90" />
        </button>
        <LabCandidateLinks labs={labs} />
      </div>
    </article>
  );
}

function SocietyResourceCard({ item, labs }: { item: ResearchSociety; labs: LabWithReasons[] }) {
  return (
    <article className="resource-card">
      <h4 className="text-[17px] font-black text-[var(--c-primary)] leading-snug">{item.name}</h4>
      {item.description && <p className="mt-2 text-sm text-[var(--c-ink-2)] leading-relaxed">{item.description}</p>}
      <div className="mt-3 space-y-2 text-[12px] text-[var(--c-ink-2)]">
        <ResourceQuestions label="扱っている問いの例" questions={item.questions} />
        <ResourceLine label="関連研究領域" value={item.relatedFields.slice(0, 4).join(" / ") || item.disciplines.slice(0, 3).join(" / ") || "確認中"} />
        <ResourceMetrics entries={[
          ["会員数目安", item.memberCountEstimate],
          ["活発さ", item.activityLevel],
          ["分野内での位置づけ", item.fieldPosition],
          ["参加しやすさ", item.accessibility],
        ]} />
        {item.memberCountNote && <ResourceLine label="会員数補足" value={item.memberCountNote} />}
        {item.memberCountAsOf && <p className="text-[10px] text-[var(--c-ink-3)]">会員数情報時点: {item.memberCountAsOf}</p>}
      </div>
      <div className="mt-auto pt-4 space-y-2">
        <LabCandidateLinks labs={labs} />
        {(item.sourceUrl || item.url) && <a href={item.sourceUrl || item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-[var(--c-primary)] inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />公式サイト</a>}
      </div>
    </article>
  );
}

function JournalResourceCard({ item, labs }: { item: ResearchJournal; labs: LabWithReasons[] }) {
  const fieldPath = [item.kingdom, item.division, item.className, item.orderName, item.family].filter(Boolean).join(" / ");
  return (
    <article className="resource-card">
      <h4 className="text-[17px] font-black text-[var(--c-primary)] leading-snug">{item.name}</h4>
      {item.description && <p className="mt-2 text-sm text-[var(--c-ink-2)] leading-relaxed">{item.description}</p>}
      <div className="mt-3 space-y-2 text-[12px] text-[var(--c-ink-2)]">
        <ResourceQuestions label="扱っている問いの例" questions={item.questions} />
        <ResourceLine label="研究領域" value={fieldPath || item.relatedFields.slice(0, 4).join(" / ") || "確認中"} />
        <ResourceMetrics entries={[
          ["発行主体", item.publisher],
          ["創刊年", item.foundedYear],
          ["発行頻度", item.frequency],
          ["刊行・更新の活発さ", item.activityLevel],
          ["査読有無", item.peerReview],
          ["論文種別", item.articleTypes],
          ["言語", item.languages],
          ["オープンアクセス", item.openAccess],
          ["初学者向けの読みやすさ", item.beginnerReadability],
          ["掲載媒体としての位置づけ", item.publicationPosition],
          ["投稿しやすさ", item.submissionAccessibility],
        ]} />
      </div>
      <div className="mt-auto pt-4 space-y-2">
        <LabCandidateLinks labs={labs} />
        {(item.sourceUrl || item.url) && <a href={item.sourceUrl || item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-[var(--c-primary)] inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />公式サイト</a>}
      </div>
    </article>
  );
}

function LabCandidateLinks({ labs }: { labs: LabWithReasons[] }) {
  if (!labs.length) return null;
  return (
    <div>
      <p className="text-[11px] font-black text-[var(--c-ink-3)] mb-1">関連研究室</p>
      <div className="flex flex-wrap gap-1.5">
        {labs.slice(0, 3).map((lab, index) => (
          <Link key={`${lab.id}:${index}`} to={`/labs/${lab.id}?returnTo=${encodeURIComponent("/labs")}`} className="text-[12px] font-black text-[var(--c-primary)] underline underline-offset-2">
            {lab.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ResourceLine({ label, value }: { label: string; value: string }) {
  return (
    <p><span className="font-black text-[var(--c-ink-3)]">{label}: </span>{value}</p>
  );
}

function ResourceQuestions({ label, questions }: { label: string; questions: string[] }) {
  return (
    <div className="resource-question-list">
      <p className="text-[11px] font-black text-[var(--c-primary)] mb-1.5">{label}</p>
      <ul className="space-y-1.5">
        {(questions || []).slice(0, 2).map((question, index) => (
          <li key={`${question}:${index}`} className="text-[13px] font-bold leading-snug text-[var(--c-ink)] flex gap-1.5"><span className="text-[var(--c-primary)]">Q.</span>{question}</li>
        ))}
      </ul>
    </div>
  );
}

function ResourceMetrics({ entries }: { entries: [string, string][] }) {
  const visible = entries.filter(([, value]) => value);
  if (!visible.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-[12px] bg-[var(--c-surface-blue)] p-3">
      {visible.map(([label, value]) => (
        <div key={label} className={value.length > 34 ? "col-span-2" : ""}>
          <dt className="text-[10px] font-black text-[var(--c-ink-3)]">{label}</dt>
          <dd className="text-[12px] font-bold text-[var(--c-ink)] leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceLegendGuide({ mode, legends }: { mode: "societies" | "journals"; legends: NonNullable<ResearchResourceResponse["legends"]> }) {
  const category = mode === "societies" ? "society" : "journal";
  const items = legends.filter((legend) => legend.category === category);
  if (!items.length) return null;
  return (
    <div className="mb-3 rounded-[14px] border border-[var(--c-border)] bg-white/75 p-3">
      <p className="text-[11px] font-black text-[var(--c-ink-3)] mb-2">項目の見方 <span className="font-normal">（項目にカーソルを重ねると基準を確認できます）</span></p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((legend) => (
          <span key={legend.item} title={`${legend.definition}\n\n判断基準: ${legend.criteria}`} tabIndex={0} className="inline-flex items-center gap-1 rounded-full border border-[var(--c-border)] bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--c-ink-2)] cursor-help">
            {legend.item}<Info className="w-3 h-3 text-[var(--c-primary)]" />
          </span>
        ))}
      </div>
    </div>
  );
}

function ResourceSearchControls({ mode, query, onQuery, filters, onFilters, facets, onSubmit, loading }: {
  mode: Exclude<SearchMode, "labs">;
  query: string;
  onQuery: (value: string) => void;
  filters: Record<string, string>;
  onFilters: (value: Record<string, string>) => void;
  facets?: ResearchResourceResponse["facets"];
  onSubmit: (event?: React.FormEvent) => void;
  loading: boolean;
}) {
  const [filtersOpen,setFiltersOpen]=useState(false);
  // Filter values follow the workbook legend rather than exposing every raw label.
  const societyOptions: [string, string, string[]][] = [
    ["societyActivity", "活発さ", ["非常に高い", "高い", "中", "低め", "確認中"]],
    ["societyPosition", "分野内での位置づけ", ["国際的な主要学会", "国内の代表的学会", "専門分野の中核学会", "専門特化型の学会", "新興・成長中の学会", "地域・実践コミュニティ型", "確認中"]],
    ["societyAccessibility", "参加しやすさ", ["参加しやすい", "比較的参加しやすい", "一定の専門知識が必要", "専門性が高い", "確認中"]],
  ];
  const journalOptions: [string, string, string[]][] = [
    ["journalPublisher", "発行主体", ["学会", "出版社", "大学", "研究機関", "公的機関", "共同発行", "確認中"]],
    ["journalActivity", "刊行・更新の活発さ", ["非常に高い", "高い", "中", "低め", "確認中"]],
    ["journalPeerReview", "査読有無", ["査読あり", "編集委員会審査あり", "一部査読あり", "査読なしまたは確認不可", "確認中"]],
    ["journalArticleType", "論文種別", ["原著論文", "レビュー", "総説", "短報", "研究ノート", "実践報告", "事例報告", "資料", "解説", "書評", "確認中"]],
    ["journalLanguage", "言語", ["日本語", "英語", "日英両方", "多言語", "確認中"]],
    ["journalOpenAccess", "オープンアクセス", ["OA", "一部OA", "購読型", "エンバーゴ（制限）あり", "確認中"]],
    ["journalReadability", "初学者向けの読みやすさ", ["読みやすい", "比較的読みやすい", "一定の専門知識が必要", "専門性が高い", "確認中"]],
    ["journalPosition", "掲載媒体としての位置づけ", ["国際的な主要誌", "国内の代表的学術誌", "専門分野の中核誌", "専門特化型ジャーナル", "新興・成長中ジャーナル", "実践・事例共有型ジャーナル", "確認中"]],
    ["journalSubmission", "投稿しやすさ", ["投稿しやすい", "比較的投稿しやすい", "一定の専門性が必要", "専門性が高い", "確認中"]],
  ];
  const options = mode === "societies" ? societyOptions : mode === "journals" ? journalOptions : [];
  const activeCount=Object.values(filters).flatMap(splitValues).length;
  const toggleFilter=(key:string,value:string)=>{const current=splitValues(filters[key]||"");onFilters({...filters,[key]:(current.includes(value)?current.filter((item)=>item!==value):[...current,value]).join(",")});};
  return (
    <form onSubmit={onSubmit} className="mb-4 rounded-[16px] bg-[var(--c-surface)] border border-[var(--c-border)] p-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-ink-3)]" />
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={mode === "fields" ? "研究領域・問い・学会名で検索" : mode === "societies" ? "学会名・問い・会員規模・活動内容で検索" : "誌名・問い・発行主体・掲載条件で検索"} className="w-full min-h-[44px] rounded-[12px] border border-[var(--c-border)] pl-10 pr-3 text-sm outline-none focus:border-[var(--c-primary)]" />
        </div>
        {options.length>0&&<button type="button" className={`resource-filter-toggle ${filtersOpen?"active":""}`} onClick={()=>setFiltersOpen((value)=>!value)}><SlidersHorizontal/>{activeCount?`${activeCount}件の条件`:"絞り込み"}</button>}
        <Button type="submit" className="min-h-[44px] px-4" disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 animate-spin" />検索中…</> : <><Search className="w-4 h-4" />候補を見る</>}</Button>
      </div>
      {filtersOpen&&options.length>0&&<div className="resource-filter-panel">{options.map(([key,label,values])=><fieldset key={key}><legend>{label}</legend><div>{values.map((value)=><label key={value}><input type="checkbox" checked={splitValues(filters[key]||"").includes(value)} onChange={()=>toggleFilter(key,value)}/><span>{value}</span></label>)}</div></fieldset>)}<div className="resource-filter-actions"><button type="button" onClick={()=>onFilters({})}>すべて解除</button><Button type="submit" disabled={loading}>この条件で表示</Button></div></div>}
    </form>
  );
}

function ResourceLane({ title, items }: { title: string; items: { name: string; sub: string; to?: string; url?: string }[] }) {
  return (
    <section className="bg-white/82 border border-[var(--c-border)] rounded-[var(--radius-panel)] p-3">
      <h3 className="text-[13px] font-black text-[var(--c-primary)] mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--c-ink-3)]">近い候補はまだ見つかっていません。</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((item) => {
            const body = (
              <>
                <span className="block text-[13px] font-bold text-[var(--c-ink)] leading-snug">{item.name}</span>
                <span className="block text-[11px] text-[var(--c-ink-3)] line-clamp-2">{item.sub}</span>
              </>
            );
            return item.url ? (
              <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-[12px] bg-[var(--c-surface-blue)] px-3 py-2 hover:brightness-95">{body}</a>
            ) : (
              <Link key={item.name} to={item.to || `/labs?ai=${encodeURIComponent(item.name)}`} className="block rounded-[12px] bg-[var(--c-surface-blue)] px-3 py-2 hover:brightness-95">{body}</Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
