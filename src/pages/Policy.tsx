// SCR-10 掲載ポリシー（BR-07/BR-08。出典・削除・第三者性の明示）
import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Policy() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <Helmet><title>掲載ポリシー ｜ MISHIRU</title></Helmet>
      <h1 className="text-2xl font-bold mb-6">掲載ポリシー</h1>

      <div className="space-y-6 text-[15px] text-[var(--c-ink-2)] leading-relaxed">
        <Sec title="本サービスの位置づけ">
          MISHIRUは、学生が興味関心から研究テーマ・研究室に出会うための独立した第三者サービスです。各大学・研究室が運営するものではありません。研究室ランキング・教授評価・口コミ投稿は行いません。
        </Sec>
        <Sec title="情報の出典と正確性">
          掲載情報は、研究室公式サイト・大学公式教員ページ・researchmap等の公開情報にもとづき、運営が学生向けに要約・整理したものです（本文の転載は行いません）。各ページには出典・最終更新日・確度を明示し、研究室未確認の項目は「研究室未確認」と表示します。
        </Sec>
        <Sec title="修正・掲載停止のご依頼">
          研究室関係者の方は、<Link to="/claim" className="text-[var(--c-primary)] font-bold underline">修正・掲載のご依頼</Link>からいつでもご連絡いただけます。誤情報のご指摘・掲載停止のご依頼には、研究室確認の完了前でも一時非公開の措置を優先し、1営業日以内に対応します。
        </Sec>
        <Sec title="個人情報の取り扱い">
          学生の評価・保存・閲覧の記録は、ブラウザごとの匿名IDに紐づけて保存され、ご本人の進路探索の支援のみに利用します。第三者（研究室・企業等）へ提供することはありません。プロフィール画面からいつでも削除できます。
        </Sec>
        <Sec title="お問い合わせ">
          掲載・取材・連携に関するお問い合わせは、<Link to="/claim" className="text-[var(--c-primary)] font-bold underline">ご依頼フォーム</Link>よりご連絡ください。
        </Sec>
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-black text-[var(--c-ink)] mb-2">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
