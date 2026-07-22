// プライバシーポリシー：取得する情報・使いみち・第三者提供・削除導線を明示（SCR-12の同意チェックボックスからリンク）
import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <Helmet><title>プライバシーポリシー ｜ MISHIRU</title></Helmet>
      <h1 className="text-2xl font-bold mb-6">プライバシーポリシー</h1>

      <div className="space-y-6 text-[15px] text-[var(--c-ink-2)] leading-relaxed">
        <Sec title="このポリシーについて">
          MISHIRUが取得する利用者の情報と、その使いみちをまとめたページです。掲載している研究室情報の出典や訂正については、<Link to="/policy" className="text-[var(--c-primary)] font-bold underline">掲載ポリシー</Link>をご覧ください。
        </Sec>
        <Sec title="取得する情報">
          アカウントなしで使う場合は、端末のブラウザに保存する匿名の識別子だけを使います。氏名やメールアドレスは含みません。無料アカウントを作成すると、メールアドレスとパスワードを認証基盤（Supabase）で管理します。パスワードは暗号化され、運営が内容を見ることはできません。保存した研究室・つくった問い・研究プラン・メモ、検索した語句、評価の記録もあわせて保存します。
        </Sec>
        <Sec title="情報の使いみち">
          取得した情報は、保存内容の復元、興味の傾向の表示、AIによる問い・研究プランの生成のためだけに使います。検索やメモの内容は生成機能の提供元へ送りますが、氏名やメールアドレスを添えて送ることはありません。
        </Sec>
        <Sec title="第三者への提供">
          保存内容・評価・興味の傾向を、研究室・大学・企業などの第三者へ提供することはありません。広告のための追跡や解析タグも使用していません。外部に情報が渡るのは、①認証・保存を担うSupabase、②問い・要約を生成するAIの提供元、③修正・掲載のご依頼フォームを送信した場合に運営へ通知するための送信サービスに限られます。
        </Sec>
        <Sec title="データの削除">
          アカウント設定からいつでもご自身で削除できます。退会するとアカウントと保存内容をすべて削除し、元に戻せません。アカウントを作らずに使っていた場合も、同じ設定画面から端末内のデータを削除できます。
        </Sec>
        <Sec title="お問い合わせ">
          取り扱いについてのご質問は、<Link to="/claim" className="text-[var(--c-primary)] font-bold underline">修正・掲載のご依頼フォーム</Link>からご連絡ください。
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
