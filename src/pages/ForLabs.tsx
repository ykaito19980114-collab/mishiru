// SCR-09 研究室運営者向け（営業導線。BR-02。ポジショニング宣言に沿った文言）
import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Eye, PenLine, RefreshCw, ShieldCheck, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import type { Lab } from "../../shared/types";
import { Button, Card } from "../components/ui";

const STEPS = [
  { icon: Eye, title: "① 研究室サイト相談（無料）", body: "研究室の公式サイトや公開情報が学生からどう見えているか、不足している情報と改善案を無料でご提示します。" },
  { icon: PenLine, title: "② 研究室ページ制作", body: "研究内容を学生に伝わる言葉へ翻訳。公開前に必ず内容をご確認いただきます。" },
  { icon: RefreshCw, title: "③ 継続更新（任意）", body: "成果・学生テーマ・記事の更新を代行。研究に集中いただけます。" },
];

export default function ForLabs() {
  const [params] = useSearchParams();
  const labId = params.get("lab_id") || "";
  const [lab, setLab] = useState<Lab | null>(null);
  useEffect(() => { if (labId) api.getLab(labId).then((r) => setLab(r.lab)).catch(() => {}); }, [labId]);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <Helmet><title>研究室運営者の方へ ｜ MISHIRU</title></Helmet>

      <div className="bg-[var(--c-primary)] text-white rounded-[var(--radius-card)] p-6 mb-6">
        <p className="text-sm text-white/70 mb-2">研究室運営者・専攻の方へ</p>
        <h1 className="text-2xl font-bold leading-tight mb-3">研究の魅力を、<br />相性の良い学生に届く形へ。</h1>
        <p className="text-white/80 text-sm leading-relaxed">
          これは評価サイトでもランキングでもありません。研究内容を正確に、学生に伝わる言葉で整理し、ミスマッチを防ぐための情報整備サービスです。
          {lab && <><br /><span className="text-white font-bold">対象：{lab.name}</span></>}
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="p-4 flex gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[var(--c-surface-blue)] text-[var(--c-primary)] grid place-items-center shrink-0"><Icon className="w-5 h-5" /></div>
              <div><h2 className="font-bold text-[var(--c-ink)]">{s.title}</h2><p className="text-sm text-[var(--c-ink-2)] mt-0.5 leading-relaxed">{s.body}</p></div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-[var(--c-teal)]" /><h2 className="font-bold">安心のための約束</h2></div>
        <ul className="space-y-2 text-sm text-[var(--c-ink-2)]">
          <li>・掲載は公開情報にもとづき、公開前に必ずご確認いただきます。</li>
          <li>・出典・最終更新日・確度を常に明示します。</li>
          <li>・修正・掲載停止のご依頼には1営業日以内に対応します。</li>
          <li>・学生の個人データを研究室・企業へ提供することはありません。</li>
        </ul>
      </Card>

      <div className="flex flex-col gap-3">
        <Link to={`/claim?lab_id=${labId}`}><Button className="w-full">研究室サイトについて相談する<ArrowRight className="w-4 h-4" /></Button></Link>
        <Link to="/labs/demo-lab"><Button variant="secondary" className="w-full">整備済みページの見本を見る</Button></Link>
      </div>
    </div>
  );
}
