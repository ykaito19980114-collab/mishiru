// 記事ワークフロー（FR-ARTICLE-01, STATE-02。差戻し理由必須）
import React, { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import type { Article, ArticleStatus } from "../../../shared/types";
import { Button, Card, Skeleton, ErrorState } from "../../components/ui";

const FLOW: ArticleStatus[] = ["idea", "assigned", "draft", "editing", "professor_review", "approved", "published"];
const LABEL: Record<ArticleStatus, string> = {
  idea: "企画", assigned: "割当", draft: "執筆中", editing: "編集中", professor_review: "教授確認", approved: "承認", published: "公開", rejected: "却下", archived: "保管",
};

export function ArticlesPanel() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ labName: "", title: "", writer: "" });
  const load = () => { setErr(false); adminApi.articles().then((r) => setArticles(r.articles)).catch(() => setErr(true)); };
  useEffect(load, []);

  const move = async (a: Article, status: ArticleStatus) => {
    // 差戻し（professor_review→editing）は理由必須
    if (status === "editing" && a.status === "professor_review") {
      const returnReason = prompt("差戻し理由を入力してください（必須）");
      if (!returnReason) return;
      await adminApi.updateArticle(a.id, { status, returnReason });
    } else {
      await adminApi.updateArticle(a.id, { status });
    }
    load();
  };
  const add = async () => {
    if (!f.labName || !f.title) return alert("研究室名とタイトルは必須です");
    await adminApi.addArticle(f); setF({ labName: "", title: "", writer: "" }); setShow(false); load();
  };

  if (err) return <ErrorState onRetry={load} />;
  if (!articles) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--c-ink-2)]">{articles.length}件の記事</p>
        <Button variant="secondary" onClick={() => setShow(!show)}>{show ? "閉じる" : "＋ 記事企画"}</Button>
      </div>
      {show && (
        <Card className="p-4 space-y-2">
          <input className={inp} placeholder="研究室名 *" value={f.labName} onChange={(e) => setF({ ...f, labName: e.target.value })} />
          <input className={inp} placeholder="タイトル *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={inp} placeholder="学生ライター名" value={f.writer} onChange={(e) => setF({ ...f, writer: e.target.value })} />
          <Button onClick={add}>企画を追加</Button>
        </Card>
      )}
      {articles.length === 0 && <Card className="p-6 text-center text-[var(--c-ink-3)]">まだ記事がありません。</Card>}
      <div className="space-y-2">
        {articles.map((a) => {
          const idx = FLOW.indexOf(a.status);
          const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
          return (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--c-ink)] line-clamp-1">{a.title}</p>
                  <p className="text-xs text-[var(--c-ink-3)]">{a.labName}｜ライター：{a.writer || "未定"}</p>
                  {a.returnReason && <p className="text-xs text-[var(--c-danger)] mt-1">差戻し理由：{a.returnReason}</p>}
                </div>
                <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-[var(--c-surface-blue)] text-[var(--c-primary)]">{LABEL[a.status]}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {next && <button onClick={() => move(a, next)} className="text-[11px] px-2 py-1 rounded-full border border-[var(--c-teal)] text-[var(--c-teal)] min-h-[32px]">→{LABEL[next]}へ進める</button>}
                {a.status === "professor_review" && <button onClick={() => move(a, "editing")} className="text-[11px] px-2 py-1 rounded-full border border-[var(--c-danger)] text-[var(--c-danger)] min-h-[32px]">編集中へ差戻し</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
const inp = "w-full px-3 py-2 min-h-[44px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] text-sm";
