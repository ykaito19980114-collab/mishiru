// SCR-10 掲載ポリシー（BR-07/BR-08。出典・削除・第三者性の明示）
import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Policy() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <Helmet><title>掲載ポリシー ｜ MISHIRU</title></Helmet>
      <h1 className="text-2xl font-bold mb-6">掲載ポリシー</h1>
      <p className="text-sm text-[var(--c-ink-3)] mb-6">最終更新：2026年7月23日</p>

      <div className="space-y-6 text-[15px] text-[var(--c-ink-2)] leading-relaxed">
        <Sec title="本サービスの位置づけ">
          MISHIRUは、学生が興味関心から研究テーマ・研究室に出会うための独立した第三者サービスです。各大学・研究室が運営するものではありません。研究室ランキング・教授評価・口コミ投稿は行いません。
        </Sec>
        <Sec title="情報の出典と正確性">
          掲載停止のご依頼がない研究室は、研究室名・所属などの基礎情報を掲載します。研究内容の整理と外部リンクは、研究室名・責任者・大学との対応を研究室ホームページで確認できた場合だけ表示します。教員プロフィール、researchmap、学部の教員一覧を研究室ホームページとして掲載することはありません。
        </Sec>
        <Sec title="修正・掲載停止のご依頼">
          研究室関係者の方は、<Link to="/claim" className="text-[var(--c-primary)] font-bold underline">修正・掲載のご依頼</Link>からいつでもご連絡いただけます。誤情報や掲載停止のご依頼は、原則1営業日以内に一次確認します。必要な場合は、事実確認の完了前でも一時非公開を優先します。
        </Sec>
        <Sec title="個人情報の取り扱い">
          評価・保存・閲覧の記録は、ブラウザごとの匿名IDに結び付けて保存します。記録は、ご本人の研究探索を支えるためだけに使います。研究室や企業などの第三者へは提供しません。アカウント設定からいつでも削除できます。
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
