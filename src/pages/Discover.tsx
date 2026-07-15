// SCR-01 であう＝研究室カードデッキ（ADR-005）：実研究室からAIが生成したカードを
// 「違うかも／気になる／保存」で評価する。生成は7日サーバーキャッシュ（全員で共有・コスト一定）。
// デッキは3モード：既定（週次共有）／AI検索（q）／傾向に沿う（profile。FR-LABCARD-04）
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Heart, Bookmark, ChevronRight, WifiOff, RotateCcw, MapPin, Sparkles, TrendingUp, CornerUpLeft, HelpCircle, Layers, BookOpen, Landmark, Undo2 } from "lucide-react";
import { api, DiscoveryDeckResponse } from "../lib/api";
import type { CardAction, DiscoveryCard } from "../../shared/types";
import { Button, Chip, Skeleton, EmptyState, Toast, useToast } from "../components/ui";
import { labLocation, verificationText } from "../lib/labText";

type DeckSource = { kind: "default" } | { kind: "search"; q: string } | { kind: "profile" };
type CardHistoryEntry = { index: number; card: DiscoveryCard; action: CardAction };

export default function Discover() {
  const [threshold, setThreshold] = useState(10);
  const [source, setSource] = useState<DeckSource>({ kind: "default" });
  const [deckMeta, setDeckMeta] = useState<{ totalMatched?: number; profileTop?: string[]; profileQuery?: string; summary?: DiscoveryDeckResponse["summary"] }>({});
  const [cards, setCards] = useState<DiscoveryCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [evaluated, setEvaluated] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  const [history, setHistory] = useState<CardHistoryEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const fetchingMore = useRef(false);

  const loadMeta = useCallback(async () => {
    try {
      const m = await api.meta();
      setThreshold(m.profileThreshold);
    } catch { /* 致命的でない */ }
  }, []);

  const loadCards = useCallback(async (src: DeckSource, append = false) => {
    if (!append) { setLoading(true); setError(false); }
    try {
      const res = await api.getDiscoveryCards(16, src.kind === "search" ? src.q : "");
      setDeckMeta({ totalMatched: res.cards.length, summary: res.summary, profileTop: src.kind === "profile" ? ["みつめる"] : undefined, profileQuery: undefined });
      setCards((prev) => (append ? [...prev, ...res.cards.filter((c) => !prev.some((p) => p.id === c.id))] : res.cards));
      if (!append) { setIdx(0); setHistory([]); }
      setLoading(false);
    } catch {
      if (!append) { setError(true); setLoading(false); }
    } finally {
      fetchingMore.current = false;
    }
  }, []);

  useEffect(() => {
    loadMeta();
    api.logEvent("session_start");
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // モード変更で読み直し（初回含む）
  useEffect(() => { loadCards(source); }, [source, loadCards]);

  const toggleProfileMode = () => {
    if (source.kind === "profile") { setSource({ kind: "default" }); return; }
    if (evaluated < threshold) {
      showToast(`カードをあと${threshold - evaluated}枚評価すると使えます`);
      return;
    }
    setSource({ kind: "profile" });
  };

  const exitToDefault = () => { setSource({ kind: "default" }); };

  const current = cards[idx];

  // 残り3枚を切ったら次バッチを先読み（同じモードで継ぎ足し）
  useEffect(() => {
    if (!loading && cards.length - idx <= 3 && !fetchingMore.current && cards.length > 0) {
      fetchingMore.current = true;
      loadCards(source, true);
    }
  }, [idx, cards.length, loading, source, loadCards]);

  const act = async (action: CardAction) => {
    if (!current || exitDir || undoing) return;
    const wasReady = evaluated + 1 >= threshold && evaluated < threshold;
    setExitDir(action === "skip" ? "left" : "right");
    if (action === "like") showToast("気になるとして、ためるに入れました");
    setHistory((items) => [...items, { index: idx, card: current, action }]);

    setTimeout(() => { setExitDir(null); setIdx((i) => i + 1); }, 220);

    const res = current.kind === "lab" && current.sourceId
      ? await api.actOnLab(current.sourceId, action)
      : await api.actOnDiscoveryItem(current, action);
    setEvaluated((e) => e + 1);
    if (((res && "readyForProfile" in res && res.readyForProfile) || wasReady) && !sessionStorage.getItem("profile_prompted")) {
      sessionStorage.setItem("profile_prompted", "1");
      setTimeout(() => showToast("興味の傾向がまとまりました"), 300);
    }
  };

  const goBack = async () => {
    if (!history.length || exitDir || undoing) return;
    const previous = history[history.length - 1];
    setUndoing(true);
    setHistory((items) => items.slice(0, -1));
    setIdx(previous.index);
    try {
      const res = previous.card.kind === "lab" && previous.card.sourceId
        ? await api.undoLabAction(previous.card.sourceId, previous.action)
        : await api.undoDiscoveryItemAction(previous.card);
      setEvaluated(res.evaluatedCount);
      showToast("ひとつ前のカードに戻りました");
    } catch {
      setHistory((items) => [...items, previous]);
      setIdx(previous.index + 1);
      showToast("前のカードに戻れませんでした");
    } finally {
      setUndoing(false);
    }
  };

  const saveCurrent = async () => {
    if (!current) return;
    showToast("保存しました");
    const res = current.kind === "lab" && current.sourceId
      ? await api.actOnLab(current.sourceId, "save")
      : await api.actOnDiscoveryItem(current, "save");
    if (res?.evaluatedCount) setEvaluated(res.evaluatedCount);
  };

  const openLab = () => {
    if (!current) return;
    if (current.kind === "lab" && current.sourceId) {
      api.actOnLab(current.sourceId, "deep"); // もっと知りたい＝deepシグナル
      navigate(`/labs/${current.sourceId}`);
      return;
    }
    api.actOnDiscoveryItem(current, "deep");
    if (current.url) window.open(current.url, "_blank", "noopener,noreferrer");
    else navigate(`/labs?ai=${encodeURIComponent(current.title)}`);
  };

  const remaining = threshold - evaluated;
  const profileModeAvailable = evaluated >= threshold;

  return (
    <div className="max-w-xl mx-auto px-4 pt-4">
      <Helmet><title>であう ｜ MISHIRU</title></Helmet>

      {offline && (
        <div className="mb-3 flex items-center gap-2 text-sm bg-[var(--c-surface)] text-[var(--c-ink-2)] px-3 py-2 rounded-[10px]">
          <WifiOff className="w-4 h-4" /> オフライン中です。評価は保存され、オンライン復帰時に反映されます。
        </div>
      )}

      <div className="mb-3">
        <div>
          <h1 className="text-xl font-bold">であう</h1>
          <p className="text-sm text-[var(--c-ink-2)] leading-relaxed">いろいろな研究室の問いを眺めながら、思っていた分野の外側にも出会い、気になる問いの扱い方を見つけます。</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-3">
        <button onClick={toggleProfileMode}
          aria-pressed={source.kind === "profile"}
          className={`flex items-center gap-1.5 text-[13px] font-bold px-3 py-2 rounded-full border min-h-[44px] transition-colors ${
            source.kind === "profile" ? "bg-[var(--c-primary)] text-white border-transparent"
            : profileModeAvailable ? "border-[var(--c-primary)] text-[var(--c-primary)]"
            : "border-[var(--c-border)] text-[var(--c-ink-3)]"}`}>
          <TrendingUp className="w-4 h-4" />傾向に沿って表示
        </button>
        {source.kind !== "default" && (
          <button onClick={exitToDefault} className="flex items-center gap-1 text-[13px] text-[var(--c-ink-3)] font-bold min-h-[44px] px-2">
            解除
          </button>
        )}
      </div>

      {/* モードバナー */}
      {source.kind === "search" && !loading && (
        <div className="mb-3 bg-[var(--c-surface-blue)] rounded-[var(--radius-panel)] p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--c-primary)] mb-1">
            <Sparkles className="w-4 h-4" />「{source.q}」で今日の研究セットを再構成中（{deckMeta.totalMatched ?? 0}枚）
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="blue">研究室</Chip><Chip tone="blue">研究領域</Chip><Chip tone="blue">学会</Chip><Chip tone="blue">ジャーナル</Chip>
          </div>
        </div>
      )}
      {source.kind === "profile" && !loading && (
        <div className="mb-3 bg-[var(--c-surface-blue)] rounded-[var(--radius-panel)] p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--c-primary)] mb-1">
            <TrendingUp className="w-4 h-4" />あなたの傾向（{(deckMeta.profileTop || []).join("・") || "分析中"}）に沿って表示中
          </div>
          <div className="flex items-center justify-between gap-2">
            <Link to="/reflect" className="text-[12px] text-[var(--c-ink-3)] underline min-h-[44px] flex items-center">傾向の詳細を見る</Link>
            {deckMeta.profileQuery && (
              <Link to={`/labs?ai=${encodeURIComponent(deckMeta.profileQuery)}`}
                className="text-[12px] font-bold text-[var(--c-teal)] border border-[var(--c-teal)] rounded-full px-3 min-h-[44px] flex items-center gap-1">
                この傾向で研究室をさがす<ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {evaluated < threshold && source.kind === "default" && (
        <div className="mb-4">
          <div className="h-1.5 bg-[var(--c-surface)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--c-teal)] transition-all duration-300" style={{ width: `${Math.min(100, (evaluated / threshold) * 100)}%` }} />
          </div>
          <p className="text-xs text-[var(--c-ink-3)] mt-1">傾向がまとまるまであと {Math.max(0, remaining)} 枚</p>
        </div>
      )}

      {loading ? (
        <div>
          <Skeleton className="w-full h-[27rem]" />
          <p className="text-xs text-[var(--c-ink-3)] text-center mt-3 flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[var(--c-teal)]" />AIが研究室カードを準備しています…
          </p>
        </div>
      ) : error ? (
        <EmptyState title="カードを読み込めませんでした" description="通信状況を確認して再試行してください。"
          action={<Button variant="secondary" onClick={() => loadCards(source)}><RotateCcw className="w-4 h-4" />再試行</Button>} />
      ) : !current ? (
        source.kind === "default" ? (
          <EmptyState
            title="今日のカードはここまで"
            description="ためた研究室を見返したり、あなた向けの候補をチェックしてみましょう。"
            action={
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Link to="/reflect"><Button className="w-full">みつめる</Button></Link>
                <Link to="/saved"><Button variant="secondary" className="w-full">ためた研究室を見る</Button></Link>
              </div>
            }
          />
        ) : (
          <EmptyState
            title={source.kind === "search" ? "この条件のカードは出し切りました" : "傾向に沿うカードは出し切りました"}
            description="絞り込みを解除するか、別の言い方でもう一度お試しください。"
            action={
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button className="w-full" onClick={exitToDefault}>絞り込みを解除して続ける</Button>
                {source.kind === "profile" && deckMeta.profileQuery && (
                  <Link to={`/labs?ai=${encodeURIComponent(deckMeta.profileQuery)}`}><Button variant="secondary" className="w-full">この傾向で研究室をさがす</Button></Link>
                )}
              </div>
            }
          />
        )
      ) : (
        <>
          <div className="relative h-[31rem]">
            {cards[idx + 2] && <div className="absolute inset-x-4 top-4 h-full bg-white border border-[var(--c-border)] rounded-[var(--radius-card)] scale-[0.92] opacity-40" />}
            {cards[idx + 1] && <div className="absolute inset-x-2 top-2 h-full bg-white border border-[var(--c-border)] rounded-[var(--radius-card)] scale-96 opacity-70" />}
            <DiscoveryCardFace item={current} exitDir={exitDir} onOpen={openLab} onSave={saveCurrent} />
          </div>

          <div className="flex justify-start mt-3 max-w-sm mx-auto">
            <button onClick={goBack} disabled={!history.length || undoing || !!exitDir} aria-label="前のカードに戻る"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border border-[var(--c-border)] bg-white text-[12px] font-bold text-[var(--c-ink-2)] disabled:opacity-35 disabled:cursor-not-allowed hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors">
              <Undo2 className="w-4 h-4" />{undoing ? "戻しています…" : "前のカードに戻る"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5 max-w-sm mx-auto">
            <button onClick={() => act("not_fit")} aria-label="今は違う"
              className="h-16 rounded-full bg-white border-2 border-[var(--c-border)] grid place-items-center text-[var(--c-ink-3)] hover:border-[var(--c-danger)] hover:text-[var(--c-danger)] transition-colors active:scale-95">
              <CornerUpLeft className="w-8 h-8 -rotate-12" strokeWidth={2.5} />
            </button>
            <button onClick={() => act("unclear")} aria-label="わからない"
              className="h-16 rounded-full bg-white border-2 border-[var(--c-border)] grid place-items-center text-[var(--c-ink-3)] hover:border-[var(--c-primary)] hover:text-[var(--c-primary)] transition-colors active:scale-95">
              <HelpCircle className="w-8 h-8" strokeWidth={2.5} />
            </button>
            <button onClick={() => act("like")} aria-label="気になる"
              className="h-16 rounded-full bg-[var(--c-primary)] border-2 border-[var(--c-primary)] grid place-items-center text-white hover:bg-[var(--c-primary-strong)] transition-colors active:scale-95 shadow-[var(--shadow-sm)]">
              <Heart className="w-8 h-8" strokeWidth={2.5} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 mb-4 max-w-sm mx-auto text-[12px] text-[var(--c-ink-3)] font-bold text-center">
            <span>今は違う</span><span>わからない</span><span>気になる</span>
          </div>
        </>
      )}

      <Toast message={toast.msg} show={toast.show} />
    </div>
  );
}

function DiscoveryCardFace({ item, exitDir, onOpen, onSave }: { item: DiscoveryCard; exitDir: "left" | "right" | null; onOpen: () => void; onSave: () => void }) {
  const cls = exitDir === "left" ? "card-out-left" : exitDir === "right" ? "card-out-right" : "";
  const lab = item.lab;
  const kindIcon = item.kind === "field" ? <Layers className="w-4 h-4" />
    : item.kind === "society" ? <Landmark className="w-4 h-4" />
    : item.kind === "journal" ? <BookOpen className="w-4 h-4" />
    : item.kind === "question" ? <HelpCircle className="w-4 h-4" />
    : <Sparkles className="w-4 h-4" />;
  return (
    <div className={`absolute inset-0 bg-white border border-[var(--c-border)] rounded-[var(--radius-card)] shadow-[var(--shadow-float)] p-5 flex flex-col overflow-hidden ${cls}`}>
      <button onClick={onSave} className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full bg-white border border-[var(--c-border)] text-[var(--c-primary)] text-[12px] font-black shadow-[var(--shadow-sm)]" aria-label="保存する">
        <Bookmark className="w-4 h-4" />保存する
      </button>
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--c-ink-3)] mb-2">
        {lab ? <MapPin className="w-3 h-3 shrink-0" /> : kindIcon}
        <span className="truncate pr-28">{lab ? `${lab.university.name}・${lab.major || lab.department}・${labLocation(lab as any)}` : item.label}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center py-5 min-h-0">
        <div className="mb-3"><Chip tone="blue">{item.label}</Chip></div>
        <h2 className="text-[22px] font-black leading-tight text-[var(--c-primary)] mb-3 pr-2">{item.title}</h2>
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {item.tags.slice(0, 3).map((tag) => <Chip key={tag} tone="yellow">{tag}</Chip>)}
        </div>
        <p className="text-[14px] text-[var(--c-ink-2)] leading-relaxed line-clamp-5">{item.summary}</p>
      </div>
      <div className="mt-auto">
        {lab && (
          <>
            <div className="flex items-center justify-between gap-2 mt-2 mb-1.5">
              <p className="text-[13px] font-bold text-[var(--c-ink)] truncate">{lab.name}</p>
              {lab.pi.name && <span className="text-[12px] text-[var(--c-ink-3)] shrink-0">{lab.pi.name} {lab.pi.title}</span>}
            </div>
            <p className="text-[12px] text-[var(--c-ink-3)] mb-1.5 flex items-center gap-1 leading-relaxed">
              <Sparkles className="w-3 h-3 text-[var(--c-teal)]" />この紹介は公開情報から作成しました（{verificationText(false)}）
            </p>
          </>
        )}
        <button onClick={onOpen} className="w-full flex items-center justify-center gap-1 text-sm font-bold text-[var(--c-teal)] min-h-[44px] border-t border-[var(--c-border)] pt-1.5">
          {lab ? "研究室ページを見る" : item.url ? "公式ページを見る" : "近い研究室をさがす"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
