-- 公開anon keyを使ったClaimテーブルへの直接大量投稿を止める。
-- 申請フォームはExpress APIからservice_roleで保存するため、通常の受付には影響しない。
drop policy if exists "anon insert claims" on public.mishiru_claims;
revoke insert on table public.mishiru_claims from anon, authenticated;
