# ラボいきたい！

全国の大学研究室を検索・閲覧し、「気になること」を研究室・研究領域・学会・ジャーナルへ接続する探索サービス。

## 2026-07-08 update

- 既存アプリを維持したまま、サービス軸を「気になることを、自分の研究にしたい人へ。」へ拡張しました。
- ナビゲーションは `さがす / であう / ためる / 問い / 研究室の方へ` です。`/profile` は互換性維持のため残し、表示名を「問い」にしています。
- Excel原本は `data/source`、正規化済みデータは `data/normalized` に配置しています。
- 正規化済み件数は、研究室 19,785 件、研究領域 606 件、学会 1,697 件、ジャーナル 1,648 件、グラフエッジ 37,182 件です。
- `であう` は研究室だけでなく、問い・研究領域・学会・ジャーナルを混合カードとして表示します。
- `問い` では、反応やマーキングをもとに、研究ルート・候補研究室・近い学会/ジャーナル・自分の問いの持ち込み方を表示します。
- 学会・ジャーナルと研究室の関係は、確定情報ではなく候補接続として表示します。

## ローカル実行

```bash
pnpm install
pnpm run dev
```

起動後、`.env` の `PORT` に設定したURL（この作業環境では `http://localhost:3008/search`）を開きます。

## 生成AI

- OpenAI Responses API と Google Gemini GenerateContent API に対応しています。
- `.env` に `OPENAI_API_KEY` / `GEMINI_API_KEY` を設定します。キーはサーバー側だけで読み込み、画面へは配信しません。
- PCは左レール、モバイルは「メニュー」内の「AIモデル」から、許可済みのGPT / Geminiモデルを選べます。
- キー未設定・一時障害時も、テンプレートと辞書ベース処理へ自動で切り替わります。

## 初期セットアップ

1. **Supabaseの設定**
   - Supabaseで新しいプロジェクトを作成し、データベースを構築します。
   - `supabase/schema.sql` の内容をSupabaseのSQLエディタで実行して、テーブルとRLSポリシーを作成します。
   - テーブルはすべて `mishiru_` から始まります。既存の `universities` などは変更・削除しません。各DDLは再実行可能なので、エラー時は修正後に新しいQueryから全体を再実行できます。
   - 続けて `supabase/verify-schema.sql` を実行します。必須テーブル不足・RLS未設定・回数制限関数不足があれば、SQLが明示的にエラーを返します。
   - Supabase Auth の Email プロバイダーを有効にします。
   - プロジェクトの Settings > API から、Project URL、Anon Key、Service Role Key を取得します。
   - VercelのEnvironment Variables または `.env` に、取得した値を以下のように設定します。
     - `SUPABASE_URL=your_project_url`
     - `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`
     - `VITE_SUPABASE_URL=your_project_url`
     - `VITE_SUPABASE_ANON_KEY=your_anon_key`
     - `MISHIRU_GUEST_ACTION_LIMIT=5`

2. **データのインポート**
   - お手元の研究室リスト（スプレッドシートやCSV）を、`labs.csv` というファイル名でプロジェクトのルートディレクトリに配置します。
   - 以下のコマンドを実行して、データをSupabaseにインポートします。
     ```bash
     npx tsx import-labs.ts
     ```

## 開発と運用

- 未登録ユーザーは閲覧を自由に行え、検索・保存・AI生成などの価値操作を5回まで試せます。6回目は無料アカウント作成を案内し、それまでの内容を引き継ぎます。
- Vercelでは `vercel.json` と `api/[...path].ts` を使って、Viteの画面とExpress APIを同じドメインで配信します。Build Commandは `pnpm run build:vercel`、Output Directoryは `dist` です。
- データの管理、問い合わせステータスの管理などはSupabaseの管理画面から直接行うことができます。
- 管理用ダッシュボード (`/admin`) は `ADMIN_TOKEN` で保護してください。公開環境で未設定にしないでください。
