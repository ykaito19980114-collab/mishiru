# source-data-import-plan

## 方針

既存の `data/labs.json` は検索・詳細・保存状態と強く結びついているため、全面置換しない。Excel由来データは `data/source` と `data/normalized` に追加し、Adapter/APIで参照する。

## 手順

1. Excel原本を `data/source` に保存する。
2. シート監査を行い、列名・空欄率・重複候補を `docs/source-data-audit.md` に記録する。
3. 研究領域・学会・ジャーナルを `data/normalized` に正規化する。
4. `server/store.ts` から正規化データを読み込み、検索・であう・問い・研究室詳細へ接続する。
5. 研究室Excelは、既存マスタとの差分確認と今後の更新候補として保持する。

## 注意

- 学会・ジャーナルと研究室の接続は確定表示しない。
- 外部URL保存時に本文のLLM要約はしない。
- 既存の保存・フォルダ・マーキング・関心マップは保持する。
