// SCR-02 カード詳細（関連研究室＋接続理由 FR-MATCH-01、0件時 FR-MATCH-02）
import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, X, Heart, Bookmark } from "lucide-react";
import { api } from "../lib/api";
import type { ThemeCard, Lab, CardAction } from "../../shared/types";
import { Button, Card, Chip, Skeleton, ErrorState, Toast, useToast } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";

const METHOD_LABEL: Record<string, string> = {
  理論: "理論的に考える", 実験: "実験する", シミュレーション: "計算・シミュレーション", データ解析: "データを解析する", 装置開発: "装置を作る", フィールド調査: "現地で調べる",
};

export default function CardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [card, setCard] = useState<ThemeCard | null>(null);
  const [labs, setLabs] = useState<{ lab: Lab; reasons: string[] }[]>([]);
  const [nearby, setNearby] = useState<ThemeCard[]>([]);
  const { toast, showToast } = useToast();

  const load = async () => {
    setState("loading");
    try {
      const res = await api.getCard(id!);
      setCard(res.card);
      setLabs(res.relatedLabs);
      setNearby(res.nearbyCards);
      setState("ok");
    } catch { setState("error"); }
  };
  useEffect(() => { load(); window.scrollTo(0, 0); }, [id]);

  const act = async (action: CardAction) => {
    if (!card) return;
    await api.act(card.id, action);
    showToast(action === "save" ? "保存しました" : action === "like" ? "気になるリストに追加しました" : "記録しました");
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>{card?.title || "カード"} ｜ MISHIRU</title></Helmet>
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-bold text-[var(--c-ink-2)] min-h-[44px] mb-2">
        <ArrowLeft className="w-4 h-4" />戻る
      </button>

      {state === "loading" && <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-32" /></div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && card && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 flex-wrap mb-3"><Chip tone="blue">{card.everyday_hook}</Chip></div>
            <h1 className="text-2xl font-bold leading-snug mb-4">{card.title}</h1>
            <div className="space-y-4">
              <div>
                <h2 className="text-xs font-bold text-[var(--c-teal)] mb-1">やさしい説明</h2>
                <p className="text-[15px] text-[var(--c-ink-2)] leading-relaxed">{card.plain_summary}</p>
              </div>
              <div>
                <h2 className="text-xs font-bold text-[var(--c-teal)] mb-1">何が面白いか</h2>
                <p className="text-[15px] text-[var(--c-ink-2)] leading-relaxed">{card.why_interesting}</p>
              </div>
              <div>
                <h2 className="text-xs font-bold text-[var(--c-teal)] mb-1">この研究で使う方法</h2>
                <div className="flex flex-wrap gap-1.5">{card.methods.map((m) => <Chip key={m}>{METHOD_LABEL[m] || m}</Chip>)}</div>
              </div>
              <div>
                <h2 className="text-xs font-bold text-[var(--c-teal)] mb-1">こんな人に向いています</h2>
                <p className="text-[15px] text-[var(--c-ink-2)]">{card.suited_for}</p>
              </div>
            </div>
          </Card>

          {/* 評価ボタン */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => act("skip")}><X className="w-4 h-4" />違うかも</Button>
            <Button onClick={() => act("save")}><Bookmark className="w-4 h-4" />保存する</Button>
            <Button variant="secondary" onClick={() => act("like")}><Heart className="w-4 h-4" />気になる</Button>
          </div>

          {/* 関連研究室（FR-MATCH-01） */}
          <section>
            <h2 className="text-sm font-bold text-[var(--c-ink-2)] mb-2">このテーマに関連する研究室</h2>
            {labs.length > 0 ? (
              <div className="space-y-3">{labs.map((l) => <LabMiniCard key={l.lab.id} lab={l.lab} reasons={l.reasons} />)}</div>
            ) : (
              /* FR-MATCH-02：0件時は行き止まりにせず近いテーマへ */
              <Card className="p-4">
                <p className="text-sm text-[var(--c-ink-2)] mb-3">このテーマに直接つながる研究室はまだ登録されていません。近いテーマを見てみましょう。</p>
                <div className="space-y-2">
                  {nearby.map((c) => (
                    <Link key={c.id} to={`/cards/${c.id}`} className="block text-sm font-bold text-[var(--c-teal)] hover:underline min-h-[44px] flex items-center">
                      → {c.title}
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </div>
      )}
      <Toast message={toast.msg} show={toast.show} />
    </div>
  );
}
