# 研究室ページの公開品質

## 掲載方針

掲載停止の対象を除き、研究室名・所属などの基礎情報は公開します。
ただし、研究内容の要約・問い・AI補足・外部リンクを表示できるのは、次をすべて満たす場合だけです。

1. 研究室ホームページへ到達できる
2. ページ上で研究室名または責任者名を照合できる
3. 教員プロフィール、researchmap、研究者データベース、部局の一覧ページではない
4. 同一大学・部局・研究室名・責任者の重複ページではない
5. 研究室ホームページ上で具体的な研究キーワードを2件以上確認できる
6. 掲載停止対象ではない

大学の教員ページ、researchmap、研究室一覧は、研究室ホームページを見つけるための確認元にだけ使います。公開ページのリンク先にはしません。
確認できていないページには「確認中」と表示し、推測した研究内容や外部リンクを出しません。

## 監査

```bash
pnpm audit:lab-homepages -- --concurrency=12
```

結果は `data/lab-publication-audit.json` に保存されます。内容を確認してから、次のコマンドで `data/labs.json` へ反映します。

```bash
pnpm audit:lab-homepages -- --concurrency=12 --apply
pnpm test:lab-publication-quality
```

確認できなかった研究室もページ自体は公開します。研究室ホームページを確認できるまでは、基礎情報と確認状況だけを表示します。

## 手動確認

自動照合で判断できない研究室は `data/lab-homepage-overrides.json` に記録します。教員ページしか見つからない場合は、URLを代用せず `publish: false` にします。

## Supabase

`supabase/migrations/20260723_lab_publication_quality.sql` を適用すると、`published` / `claimed` のページを公開し、研究室ホームページの確認状況を別に管理できます。監査履歴は `mishiru_lab_publication_audits` に保存します。
