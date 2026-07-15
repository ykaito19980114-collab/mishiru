# MISHIRU研究資源・関心接続スキーム v0.1 draft

scheme_version: `mishiru-research-resource@0.1.0-draft`  
base_protocol: `STS-MP v1.0`  
status: `draft`  
scope: MISHIRUに登録される研究資源と、ユーザーの研究関心・研究の問いとの接続

Phase 2.6 audit note: v0.1は人間レビュー前のdraftであり、パイロットでG4閾値を満たしても自動的にv1.0へ昇格しない。必要に応じて `0.1.1-draft` または `0.2.0-draft` へ改訂する。

## 1. ドメイン宣言(S1)

### 対象ドメイン

MISHIRUに登録される研究室・研究領域・学会・ジャーナルを、ユーザーの研究関心、保存、反応、メモ、研究の問いへ接続するための主題分析スキーム。

### 対象エンティティ

| MISHIRU対象 | STS-MP型 | 採用ID | 主な層 | 備考 |
| --- | --- | --- | --- | --- |
| 研究室 | `COLLECTIVE` | `ent:COLLECTIVE:lab:<existing-id>` | CORE, EXPR, MANIF, INST | COREは反復的な研究関心・問い・価値観。現状データでは多くがEXPR相当の紹介文。 |
| 研究領域 | `RESEARCH_FIELD` | `ent:RESEARCH_FIELD:<existing-id>` | CORE, EXPR | `CONTEXT`だけでは、対象・問い・方法を持つ安定した学術分類体を表しにくい。STS-MP §13 S4の条件を満たすMISHIRU下位型として採用する。 |
| 学会 | `COLLECTIVE` | `ent:COLLECTIVE:society:<existing-id>` | CORE, EXPR, MANIF | 学術コミュニティとしての問い・対象・方法・参加範囲を扱う。 |
| ジャーナル | `COLLECTIVE` | `ent:COLLECTIVE:journal:<existing-id>` | CORE, EXPR, MANIF | 個別論文WORKの集合を束ねる媒体型。Phase 2.5では媒体/コミュニティとして扱い、個別論文主題分析は行わない。 |
| ユーザーが作る研究の問い | `DEMAND` | `ent:DEMAND:rq:<id>` | CORE, EXPR | 研究資源側のQタグとは分離する。 |

### 除外対象

個別論文の詳細主題分析、書籍主題分析、教授個人のAGENT分析、市場性評価、採用評価、ブランド評価、人物の価値観・tension分析は対象外。

## 2. PurposeSpecs(S2)

```json
[
  {
    "purpose_id": "purpose:mishiru-search",
    "decision": "ユーザーが、自分の関心や研究したい対象に近い研究室・研究領域・学会・ジャーナルを探す。",
    "actor": "大学院進学検討者、研究初心者、社会人大学院志望者",
    "search_mode": "SUBJECT",
    "error_cost": { "false_positive": "M", "false_negative": "H" },
    "comparison_axis": "扱う対象、問い、方法、スコープ、研究領域",
    "action_vocabulary": ["探す", "比較する", "保存する", "詳しく見る"],
    "time_horizon": "年〜恒久",
    "success_signal": "検索結果の保存、詳細閲覧、研究プロジェクトへの素材利用"
  },
  {
    "purpose_id": "purpose:mishiru-discover",
    "decision": "ユーザーが、自分では検索しなかった研究世界に問いを通じて出会い、反応する。",
    "actor": "研究初心者、大学院進学検討者",
    "search_mode": "SERENDIPITY",
    "error_cost": { "false_positive": "M", "false_negative": "H" },
    "comparison_axis": "問いの近さ、問いの意外性、対象の距離、方法の違い",
    "action_vocabulary": ["出会う", "気になる", "わからない", "違う", "保存する"],
    "time_horizon": "年",
    "success_signal": "気になる反応、保存、後の問い生成への利用"
  },
  {
    "purpose_id": "purpose:mishiru-reflect-question",
    "decision": "ユーザーが、保存・反応・メモから自分の関心を理解し、研究可能なRQ候補へ変換する。",
    "actor": "大学院進学検討者、社会人大学院志望者、研究初心者",
    "search_mode": "EXPLORE",
    "error_cost": { "false_positive": "H", "false_negative": "M" },
    "comparison_axis": "ユーザー関心と研究資源の問い・対象・方法・スコープの接続",
    "action_vocabulary": ["見つめる", "問いにする", "比較する", "研究骨子を作る", "相談する"],
    "time_horizon": "月〜年",
    "success_signal": "RQ候補の採用、ResearchProject保存、相談セット作成"
  }
]
```

## 3. 想定失敗様態(S3)

### さがす

- 広すぎるタグで無関係な研究室が大量に混ざる。
- 研究方法と研究対象を混同する。
- 学会名や大学名を主題タグとして扱う。
- sourceKeywordsを生成タグと誤認する。
- 研究室名だけから主題を確定する。

### であう

- 同じ研究領域だけを繰り返し推薦する。
- 問いの表面語一致だけでカードを近いと判定する。
- 問いが欠損している対象へAIが仮の問いを作る。
- 近い対象だけを優先し、Qが近くISが遠い接続を逃す。
- 理由タグIDなしで推薦する。

### みつめる・問いにしてみる

- ユーザーの一度の反応を強い関心と断定する。
- 「違う」反応を肯定的関心に混ぜる。
- 保存素材にない主題をAIが追加する。
- 研究室の問いとユーザー自身のRQを同じエンティティへ混ぜる。
- HYPOTHESISタグをapproved相当として研究支援に使う。

## 4. ファセット表(S4)

| エンティティ | 必須 | 推奨 | 任意 | 通常非対象 |
| --- | --- | --- | --- | --- |
| 研究室 | Σ, IS, Q | M, SC, ST | C, V | E, N, F, A |
| 研究領域 | Σ, IS, Q, M | SC, C | ST, V | E, N, F, A |
| 学会 | Σ, IS, Q | SC, M, A | C, ST | E, N, F, V |
| ジャーナル | Σ, IS, Q | M, SC, A | C, F | E, N, V, ST |
| ユーザーRQ | Q, IS, SC | M, C | V | E, N, F, A |

引用順序は `Σ -> IS -> Q -> M -> SC -> ST -> C -> V -> A -> F` とする。MISHIRUでは「研究領域」「大学名」「学会名」はファセットではなくエンティティ属性として保持する。

## 5. 語彙方針(S5)

- `surface`: Excel由来の説明・問い・研究対象・代表テーマのニュアンスを保持する。
- `controlled`: 軽量統制語彙。確定できない場合は `null`。
- `candidate_term`: 統制形がない場合の候補語。
- `sourceKeywords`: 元Excel由来語。生成タグとは分離し、タグ根拠として単独使用しない。
- 既存研究領域階層、上位/下位領域、研究対象、代表テーマ、研究方法、`shared/taxonomy.ts` は基礎分類候補であり、STS-MPタグ体系そのものではない。
- 新語はBT/NT/RT/ANT/UFの最低1本を提案し、人間レビュー前に正式統制語として採用しない。

## 6. 証拠方針(S6)

| 対象 | E1/E2候補 | 原則未使用 |
| --- | --- | --- |
| 研究室 | `研究内容_引用説明`, `扱う問い_1`, `扱う問い_2`, 公式研究室サイトURL | E3第三者紹介、E4業績/被引用 |
| 研究領域 | `初心者向け説明`, `研究目的`, `研究対象`, `代表テーマ`, `扱う問い`, `代表的研究方法` | E3/E4 |
| 学会 | `学会説明_引用説明`, `扱う問い`, `関連研究領域`, 公式URL | E4活動実績 |
| ジャーナル | `ジャーナル説明_引用説明`, `扱う問い`, `関連研究領域`, `発行主体`, `論文種別`, `投稿規定URL` | 個別論文WORK |

実行モード:

- FULL: 研究領域では説明、研究目的、問い、対象、方法が証拠フィールドから確認できる。研究室・学会・ジャーナルなどCOLLECTIVEのCOREをFULL確定するには、単一Excel行ではなく、複数ページ、複数時点、複数研究テーマ、Aims & Scope、分科会、掲載論文傾向などの反復証拠が必要。
- RAPID: 説明または問いがあり、定足数の50%以上。confidence上限0.6。
- HYPOTHESIS: 名称、sourceKeywords、短い説明だけ。confidence上限0.4。本番検索・推薦には利用しない。

### 独立証拠の条件

同一Excel行、同一元ページ、同一説明文を分割した複数フィールドは、原則として同一 `evidence_chain_id` とする。独立証拠として数えるには、以下のいずれかを満たす必要がある。

- 別URLまたは別ページ由来である。
- 別時点の更新・別資料・別媒体に由来する。
- 研究室であれば、複数の研究テーマ・プロジェクト・成果紹介が独立に確認できる。
- 学会であれば、公式目的、継続的活動、分科会、年次大会等が別資料として確認できる。
- ジャーナルであれば、Aims & Scope、投稿規程、掲載論文傾向など別系統の資料が確認できる。

出典URLや生成元情報が不足している場合、`independent_chain: false` または `independence_status: unknown` とする。Phase 2サンプルExcel由来の複数フィールドは、基本的に `same_source_row` として扱う。

### 層とモダリティ

研究室・学会・ジャーナルの単一紹介行から言える主張は、原則 `EXPR asserted` とする。反復証拠がない限り `CORE asserted` へ昇格しない。COREの仮説を出す場合は `CORE hypothesis` とし、approvedへ直接変更できない。

## 7. ゲート設定(S7)

| Gate | 閾値 |
| --- | --- |
| G1 区分原理純度 | 同一ファセット混交0件。対象・方法・受け手・領域名を混ぜない。 |
| G2 根拠被覆 | assertedタグはE1〜E4証拠必須。E5のみはhypothesisへ隔離。 |
| G3 特定性 | 「科学」「社会」「研究」「教育」等の死語タグは禁止。小規模パイロットでは30%基準は参考扱いにし、広すぎる語を手動ルールで検出する。 |
| G4 識別力 | 固有名称、大学名、教授名、学会名、ジャーナル名、URL、既存ID、対象固有の表記ゆれを除外し、IS/Q/M/ST/SCを中心に近接候補群から上位3件以内に識別できるか。top1/top3/MRRを別々に記録する。v1.0候補は40件中80%以上合格が必要。 |
| G5 翻訳可逆性 | surfaceの限定・極性をcontrolled/candidate_termで失わない。 |
| G6 目的汚染 | invariantタグに「検索向き」「相談向き」等の用途語を混ぜない。目的従属タグはderived_from必須。 |
| G7 反証可能性 | confidence 0.7以上はrefutation必須。RAPID上限0.6では任意だが、主要Σには可能な範囲で記録する。 |

## 8. ビュー定義(S8)

### 検索ビュー

- 起動ファセット: Σ, IS, Q, M, SC
- 出力: 検索用統制語、同義展開、比較可能な対象、方法、スコープ、検索理由
- 新しい事実は追加しない。

### であうビュー

- 起動ファセット: Q, IS, M, V, C
- 規則: `Q一致 > Mの補完性 > IS一致`。ISが遠くQが近いものを優先する。
- 出力: 表示する問い、なぜ出したか、近い問い、意外性、根拠タグID

### 研究支援ビュー

- 起動ファセット: Q, IS, M, SC, C
- 出力: 関心の形式化、対象限定、方法候補、接続する研究資源、研究可能性検査、RQ候補、限界、意義
- ユーザー自身のRQは`DEMAND`として分離する。

## 9. フィードバック運用(S9)

判定: `approve`, `fix`, `reject`, `useful`  
reviewStatus: `pending`, `approved`, `rejected`, `needs_revision`

記録項目: reviewer, reviewedAt, reasonCode, originalValue, correctedValue, note

初期運用では `approved` のみ本番検索・推薦へ利用可能。Phase 2.5ではUI反映を行わない。

## 10. 検収記録(S10)

このv0.1 draftはパイロット40件の実行とG4識別力測定前の設計版である。G4合格率80%以上に達しない場合、v1.0候補には進めず、S4ファセット設計またはS5語彙方針へ戻す。
