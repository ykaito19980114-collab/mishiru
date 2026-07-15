# source-data-schema

## data/source

Excel原本を保存する。編集せず、再取り込み時の一次データとして扱う。

## data/normalized

- `labs.json`: Excel由来の研究室原本正規化。既存検索マスタとは別管理。
- `universities.json`: Excel由来の大学別件数。
- `researchers.json`: 研究者名・所属大学・関連研究室。
- `fields.json`: 研究領域。階層、定義、座標、関連学会・ジャーナルを保持。
- `methods.json`: 研究方法の表示語彙。
- `societies.json`: 学会。研究領域との候補接続を含む。
- `journals.json`: ジャーナル。研究領域との候補接続を含む。
- `research-graph.json`: field/society/journalのcandidate接続。
- `import-report.json`: 取り込み件数と方針。
- `import-warnings.json`: 重複候補・表記揺れ・保留事項。

## connectionStatus

- `official`: 公式情報で確認済み
- `editorial`: 運営編集で妥当と判断
- `candidate`: Excelやキーワードからの候補
- `unverified`: 未確認

現時点の学会・ジャーナル接続は、研究室との直接紐づきがないため `candidate` として扱う。
