# current-data-model

既存マスタは `data/labs.json` と `data/cards.json`。学生の反応は `data/runtime/store.json`。マーキングとフォルダは現在ブラウザlocalStorageに保存される。

今回、`data/source` と `data/normalized` を追加し、研究領域・学会・ジャーナルを既存データに重ねる。既存研究室IDや保存状態は変更しない。

本番のアカウントはSupabase Authを正とし、`mishiru_user_sessions` がユーザーと正規sessionId、`mishiru_guest_usage` が匿名5回の利用数、`mishiru_session_state` が保存・評価・問い・研究プロジェクトを保持する。登録・ログイン時に匿名sessionIdを正規sessionIdへ統合し、退会時はAuthユーザーと本人に結び付く各レコードを削除する。
