# MISHIRU authentication email templates

Supabase Dashboard の `Authentication > Email Templates` に登録する本番用テンプレートです。ロゴは公開アセット `https://mishiru-lab.com/assets/brand/mishiru-logo.png` を参照します。画像がブロックされても、件名・見出し・署名だけでMISHIRUからのメールだと判断できる構成です。

| Supabase template | Subject | File |
| --- | --- | --- |
| Confirm sign up | `[MISHIRU] メールアドレスをご確認ください` | `confirm-sign-up.html` |
| Magic Link | `[MISHIRU] ログインのご案内` | `magic-link.html` |
| Reset Password | `[MISHIRU] パスワード再設定のご案内` | `reset-password.html` |

## Sender

- Sender name: `MISHIRU サポートチーム`
- Sender email: `support@mishiru-lab.com`
- Reply-to（SMTPサービス側で設定できる場合）: `support@mishiru-lab.com`

Supabaseの標準メール送信では件名・本文の編集が無効になるため、先に `Authentication > SMTP Settings` でカスタムSMTPを有効にします。Resendを使う場合は、`mishiru-lab.com` のドメイン認証と送信元アドレスの利用可否を確認してから、Resendが発行したSMTP認証情報をSupabaseへ登録します。APIキーやSMTPパスワードはGitへ保存しません。

認証後の戻り先は、SupabaseのURL Configurationで以下を許可します。

- Site URL: `https://mishiru-lab.com`
- Redirect URL: `https://mishiru-lab.com/auth/callback`
- ローカル確認用: `http://localhost:3008/auth/callback`
