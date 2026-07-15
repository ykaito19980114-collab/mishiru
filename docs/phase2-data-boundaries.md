# Phase 2 データ取込・保存境界

## 方針

Phase 2では、既存の本番相当マスターデータを上書きしない。サンプルExcelは別経路で `data/mishiru-sample-normalized/` に正規化し、`MISHIRU_DATASET=sample` を指定した時だけアプリが参照する。

## マスターデータ

| 区分 | 既定の保存場所 | サンプル検証時 | 備考 |
| --- | --- | --- | --- |
| 研究室 | `data/labs.json` | `data/mishiru-sample-normalized/labs.json` | 起動時にserver runtimeへロード |
| 研究領域 | `data/normalized/fields.json` | `data/mishiru-sample-normalized/fields.json` | ラボいきたい側DBを正本とし、問いクラフトDBで上書きしない |
| 学会 | `data/normalized/societies.json` | `data/mishiru-sample-normalized/societies.json` | 既存 `ResearchSociety` 互換 |
| ジャーナル | `data/normalized/journals.json` | `data/mishiru-sample-normalized/journals.json` | 既存 `ResearchJournal` 互換 |
| 研究グラフ・凡例 | `data/normalized/research-graph.json`, `resource-legends.json` | 既定を継続 | Phase 2ではサンプルから全面再構築しない |

## ユーザー可変データ

| 区分 | 現行保存場所 | Phase 2での扱い |
| --- | --- | --- |
| であうの反応 | `data/runtime/store.json` の `discoveryActions` | 既存維持 |
| 研究室カード反応 | `data/runtime/store.json` の `labActions` | 既存維持 |
| テーマカード反応 | `data/runtime/store.json` の `cardActions` | 既存維持 |
| 保存 | `data/runtime/store.json` の action=`save` | 既存維持 |
| フォルダ | `localStorage` の `openlab_stock_folders` | 既存維持 |
| 研究室メモ | `localStorage` の `openlab_lab_notes` | 既存維持 |
| マーキング・メモ・外部URL | `localStorage` の `openlab_annotations_v2` | 既存維持 |
| 関心ドラフト | `localStorage` の `openlab_interest_draft_v1` | 既存維持 |

サンプル検証時は `MISHIRU_DATASET=sample` により、server runtime JSONの保存先を `data/runtime/store.sample.json` に分離する。localStorageはブラウザ単位の現行仕様のまま。

## 一時UI状態

| 区分 | 現行保存場所 |
| --- | --- |
| 入力途中 | React state |
| 選択状態 | React state / URL query |
| オフラインキュー | `localStorage` の `openlab_action_queue` |
| セッションID | `localStorage` の `openlab_session_id` |

## タグ境界

STSMPタグ生成プロトコル未提供のため、Phase 2の正規化データは全件で以下を保持する。

```json
{
  "tags": [],
  "tag_generation_status": "pending_STSMP_protocol"
}
```

Excel由来の表示・検索補助語は `sourceKeywords` として保持し、将来生成するSTSMPタグとは分離する。

## Repository層への将来移行メモ

現行は `server/store.ts` がマスタ読み込み、検索インデックス生成、runtime永続化をまとめて担っている。Phase 3以降でRepository層へ寄せる場合は、少なくとも以下を分ける。

- `MasterDataRepository`: 研究室・研究領域・学会・ジャーナルの読み取り
- `UserStateRepository`: 反応・保存・プロジェクト・プロフィール
- `ClientStorageRepository`: フォルダ・マーキング・メモ・一時キュー
- `ImportRepository`: Excel原本から正規化JSON/DBへ変換し、既存マスタとは別に検証
