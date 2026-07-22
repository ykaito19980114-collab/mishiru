// プライバシーポリシー：取得する情報・使いみち・第三者提供・削除導線を明示（SCR-12の同意チェックボックスからリンク）
import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <Helmet><title>プライバシーポリシー ｜ MISHIRU</title></Helmet>
      <h1 className="text-2xl font-bold mb-6">プライバシーポリシー</h1>
      <p className="text-sm text-[var(--c-ink-3)] mb-6">最終更新：2026年7月22日</p>

      <div className="space-y-6 text-[15px] text-[var(--c-ink-2)] leading-relaxed">
        <Sec title="このポリシーについて">
          MISHIRUが取得する利用者の情報と、その使いみちをまとめたページです。掲載している研究室情報の出典や訂正については、<Link to="/policy" className="text-[var(--c-primary)] font-bold underline">掲載ポリシー</Link>をご覧ください。
        </Sec>
        <Sec title="取得する情報">
          アカウントなしで使う場合は、ブラウザに作る匿名の識別子を使います。この識別子に、保存した研究室・つくった問い・研究プラン・メモ、検索語、評価の記録を結び付けて保存します。氏名やメールアドレスは含みません。無料アカウントを作成すると、メールアドレスと認証情報をSupabaseで管理します。パスワードは運営から読めない形で保存されます。
        </Sec>
        <Sec title="情報の使いみち">
          取得した情報は、保存内容の復元、興味の傾向の表示、AIによる問い・研究プランの生成のためだけに使います。検索やメモの内容は生成機能の提供元へ送りますが、氏名やメールアドレスを添えて送ることはありません。
        </Sec>
        <Sec title="第三者への提供">
          保存内容・評価・興味の傾向を、研究室・大学・広告事業者へ販売・提供しません。広告のための追跡タグも使いません。サービス提供に必要な範囲で、認証・保存を担うSupabase、文章生成を担うOpenAIまたはGoogle、メール送信を担うResendへ情報を送ります。各社のサーバーが日本国外にある場合があります。
        </Sec>
        <Sec title="保存期間と安全管理">
          アカウントの保存内容は、退会するまで保持します。アカウントなしの保存内容は、この端末のデータ削除から消せます。修正・掲載のご依頼は、対応記録と法令上必要な期間に限って保持します。通信の暗号化、アクセス制限、秘密鍵の分離により、不正な閲覧や変更を防ぎます。
        </Sec>
        <Sec title="データの削除">
          アカウント設定からいつでもご自身で削除できます。退会するとアカウントと保存内容をすべて削除し、元に戻せません。アカウントを作らずに使っていた場合も、同じ設定画面から端末内のデータを削除できます。
        </Sec>
        <Sec title="お問い合わせ">
          取り扱いについてのご質問は、<a href="mailto:support@mishiru-lab.com" className="text-[var(--c-primary)] font-bold underline">support@mishiru-lab.com</a>または<Link to="/claim" className="text-[var(--c-primary)] font-bold underline">修正・掲載のご依頼フォーム</Link>からご連絡ください。
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
