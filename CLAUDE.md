# プロジェクトルール（OpenLab：研究テーマ発見ナビ＋研究室ページ運用代行）

本リポジトリは「AI駆動モバイルアプリ開発ガイドライン v1.0」の4文書体系で運用する。

## 絶対規則

1. **実装・設計変更の前に `docs/01_要求定義書.md` → `docs/02_要件定義書.md` → `docs/03_仕様書.md` を必ず読むこと。** 矛盾を見つけたら実装せず報告すること。
2. **docsにない機能を追加しないこと。** 提案は歓迎するが、まずdocsの更新を提案する（コードより先にdocsを直す）。
3. **デザインは `docs/03_仕様書.md` §8（SPEC）に厳密に従うこと。** カラー・フォント・余白・コピーの独自判断を禁止する。確定コピー（§8.5）の変更はdocs先行。
4. **技術スタック**：React 19 + Vite 6 + TypeScript + Tailwind CSS 4 + react-router 7 + motion + Express + ローカルJSONストア（既定）/ Supabase（M2）+ OpenAI / Gemini（任意）+ Resend（任意）。これ以外のライブラリ追加は理由を添えて事前提案すること。
5. **PROH（恒久的禁止事項）** — これらのコードを書かないこと（Test-PROH-01〜05で検査される）：
   - PROH-01: 「研究室版Tinder」「教授評価」「ランキング」等の表現・見せ方
   - PROH-02: 全国研究室検索・口コミDBを主商品として扱う導線
   - PROH-03: 無断口コミ・教授評価・晒し系の自由投稿UI
   - PROH-04: 学生の保存履歴・プロフィールを本人同意なく教授・企業へ渡す処理
   - PROH-05: 人材送客・成果報酬機能
6. 各文書冒頭の「前提資料」を尊重し、上位文書の判断とズレていないか自己検証しながら進めること。以下に遭遇したら**停止して人間に確認**：①文書間の矛盾 ②PROH抵触の可能性 ③K前提が崩れる発見 ④受入基準を満たせない制約 ⑤docsにない機能の必要性。

## 実装規約

- 学生向けUIはモバイルファースト（基準幅375px・最小320px）。タッチターゲット44px以上。本文16px以上。
- 診断・プロファイルは常に「傾向」表現（断定禁止）。研究室情報の未確認項目は「未確認」表示（空欄・削除禁止）。
- 外部APIキーはサーバー側のみ（フロント露出禁止）。研究成果の論文検索は自前で持たず、研究室ページから外部DB（researchmap/CiNii/KAKEN/Google Scholar）へ教員名リンクで橋渡しする（ADR-003）。CiNii/KAKEN/OpenAlexの**API**は利用登録完了まで呼ばない。
- 大学サイト・論文の本文転載禁止（自前要約＋出典リンクのみ）。
- 可変データは `data/runtime/`（gitignore）。マスタは `data/`。スキーマ変更は `supabase/schema.sql` と `docs/03` を同時更新。

## データ（全国19,785研究室・ADR-003）

- 一次ソース：`全国大学研究室データベース...csv`（19,785件）。正規化は `npx tsx scripts/convert-national.ts` → `data/labs.json`（24MB）。
- 大学マスタ＝`shared/universities.ts`（100大学・地域/都道府県/設置区分。**全大学突合必須**、未マッピングでビルド停止）。
- 分野は二層：`shared/fields.ts` の field_major（12大分類・フィルタ用）と `shared/taxonomy.ts` の area_tags（15細分・カードマッチング用）。両方を維持すること。
- **氏名クレンジング**（`shared/clean-name.ts`）：教員氏名の「（教員）」「 准教授」「〇〇研究室」等を除去。外部研究者DB検索には氏名のみを渡す（FR-NAME-01）。氏名を確認できない研究室（~1%）は外部検索リンクを非表示。
- **ホームは `/labs`（研究室をさがす）**。タブ順＝さがす/見つける/保存/プロフィール。カード体験(discover)は2番目。
- **AI意味検索**（`server/smart-search.ts`・`/api/labs/smart`）：自然文→分野/キーワード解釈→研究室。GEMINI設定時はLLM、未設定時は辞書フォールバック。
- **研究室ページ充実**（`server/enrich.ts`・`/api/labs/:id/enrich`・ADR-004）：①AI学生ガイド（選択中の許可済みAIモデルがキーワードから生成・「AI推定/本人未確認」明示）②公開論文のin-app埋め込み（OpenAlex・**機関一致 or 主分野一致&業績3件以上の高確度時のみ**表示＝誤同定防止・PM-05）。lazy＋`data/runtime/enrich-cache.json`キャッシュ。
- **生成AI**：`server/ai.ts`でOpenAI Responses API / Gemini GenerateContent API・許可モデルID・フォールバックを一元管理。APIキーはサーバー側だけで保持し、report/smart-search/enrich/lab-cardsが共用する。
- **見つける＝研究室カードデッキ（ADR-005）**：`server/lab-cards.ts`・`/api/lab-cards`。実研究室から8枚/1回の選択中AIモデルによるバッチ生成。**AI生成物は7日TTLでサーバーキャッシュ**（enrichはSWR）。デッキは**週次共有ウィンドウ**（ジャンル別240件/週・週バケットシード）で全セッションがキャッシュを共有＝生成コスト上限。評価は`lab_actions`（冪等）でプロファイル/マッチングに統合。テーマカード100枚はマッチング語彙として存続。
- **研究室ページの公式URL**：ヘッダー直下に常設（未登録時は「Webで探す」代替導線）。消さないこと。
- **外部API制約(K)**：OpenAlexは日本語氏名を索引（romajiは不可）・キー不要・mailto礼儀プール。CiNii/KAKENはappID登録必須で未使用。論文の名寄せは同姓同名リスクが高く、確信が持てない時は出さない。
- CSVを更新したら convert-national → build-cards → test-acceptance の順で再生成・検証。
- URL未登録（has_url=false・約7,350件）は営業リスト。管理画面「研究室データ」タブで抽出。

## コマンド

- 開発サーバー: `npm run dev`（Express+Vite統合、ポート3000）
- 型チェック: `npm run lint`（tsc --noEmit）
- 受入テスト: `npx tsx scripts/test-acceptance.ts`（devサーバー起動中に実行）
- 本番ビルド: `npm run build` → `npm start`

## 環境変数（すべて任意。未設定でも全コア機能が動作すること＝AC-05）

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（M2）、`OPENAI_API_KEY` / `GEMINI_API_KEY`（生成AI）、`AI_MODEL`（既定モデル）、`RESEND_API_KEY`・`CLAIM_NOTIFY_EMAIL`（Claim通知）、`ADMIN_TOKEN`（管理画面保護。**公開環境では必須**）、`APP_URL`。
