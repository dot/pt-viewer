-- Local development / smoke-test fixture. All content is INVENTED for two
-- fictional apps; no real export data. Apply after db/schema.sql:
--   npm run db:local

INSERT INTO projects (id, slug, name) VALUES
  (1, 'aozora', '青空文庫リーダー'),
  (2, 'yasai', '家庭菜園プランナー');

INSERT INTO users (id, name) VALUES
  (1, '佐藤花子'),
  (2, '鈴木一郎'),
  (3, '田中太郎'),
  (4, '高橋美咲');

-- ---------------------------------------------------------------- aozora

INSERT INTO stories (id, project_id, title, story_type, current_state, priority, estimate, requested_by_id, created_at, accepted_at, deadline, description, url, extra) VALUES
(180000001, 1, 'しおり機能', 'epic', 'accepted', NULL, NULL, 1, '2021-06-01', '2021-09-30', NULL,
'# しおり機能エピック

読書位置を保存・復元できるようにする。

- しおりの保存
- しおりの一覧表示
- 端末間の同期は**対象外**とする',
'https://www.pivotaltracker.com/epic/show/180000001', NULL),

(180000002, 1, 'しおりを保存できるようにする', 'feature', 'accepted', 'p1', 2, 1, '2021-06-15', '2021-07-20', NULL,
'## 概要

読んでいるページに*しおり*を挟めるようにする。

## 受け入れ条件

1. ページ長押しでしおりを追加できる
2. しおり一覧から該当ページへ移動できる
3. 削除できる

実装メモ: `BookmarkStore` を新設する。

```ruby
def add_bookmark(page)
  BookmarkStore.save(book_id, page)
end
```

参考: [設計メモ](https://example.com/docs/bookmark-design)',
'https://www.pivotaltracker.com/story/show/180000002',
'{"pull_requests":["https://example.com/git/aozora/pull/42"],"git_branches":["https://example.com/git/aozora/tree/feature/bookmark-store"],"reviews":[{"type":"code","reviewer":"鈴木一郎","status":"pass"}],"iteration":"2021W28"}'),

(180000003, 1, '縦書き表示でルビがはみ出して崩れる', 'bug', 'accepted', 'p2', NULL, 2, '2021-07-05', '2021-08-02', NULL,
'縦書きモードでルビ付きの行が折り返されると、ルビが隣の行に重なって表示が崩れる。

再現手順:

1. 縦書きモードに切り替える
2. ルビの多い作品を開く
3. 文字サイズを最大にする

期待値: ルビが行間に収まって表示される',
'https://www.pivotaltracker.com/story/show/180000003',
'{"blockers":[{"description":"組版ライブラリ v3 へのアップデート待ち","status":"resolved"}]}'),

(180000004, 1, '作品検索の精度を改善する', 'feature', 'finished', 'p2', 3, 3, '2021-08-10', NULL, NULL,
'ひらがな・カタカナ・漢字の表記ゆれを吸収して検索できるようにしたい。

例: 「はしれめろす」で『走れメロス』がヒットすること。',
'https://www.pivotaltracker.com/story/show/180000004', NULL),

(180000005, 1, '依存ライブラリを最新版へ更新する', 'chore', 'started', NULL, 1, 2, '2021-09-01', NULL, NULL,
'四半期の定期更新。breaking change の有無を changelog で確認すること。',
'https://www.pivotaltracker.com/story/show/180000005', NULL),

(180000006, 1, 'v1.2 リリース', 'release', 'unstarted', NULL, NULL, 1, '2021-09-15', NULL, '2021-10-01',
'しおり機能と縦書き修正を含むリリース。',
'https://www.pivotaltracker.com/story/show/180000006', NULL),

(180000007, 1, 'ダークモードで注釈の文字が読めない', 'bug', 'started', 'p3', 1, 4, '2021-09-20', NULL, NULL,
'ダークモード時、注釈ポップアップの文字色が背景と同じ濃紺になって読めない。',
'https://www.pivotaltracker.com/story/show/180000007', NULL),

(180000008, 1, 'ルビの表示位置を調整できるようにする', 'feature', 'unscheduled', NULL, NULL, 2, '2021-10-01', NULL, NULL, NULL,
'https://www.pivotaltracker.com/story/show/180000008', NULL);

-- ---------------------------------------------------------------- yasai

INSERT INTO stories (id, project_id, title, story_type, current_state, priority, estimate, requested_by_id, created_at, accepted_at, deadline, description, url, extra) VALUES
(190000001, 2, '水やりリマインダーを追加する', 'feature', 'accepted', 'p1', 2, 4, '2022-03-01', '2022-03-25', NULL,
'作物ごとに水やり間隔を設定して、時間になったら通知する。

- 間隔は日単位で設定
- 通知はプッシュ通知で行う',
'https://www.pivotaltracker.com/story/show/190000001', NULL),

(190000002, 2, '収穫記録が保存されないことがある', 'bug', 'delivered', 'p1', NULL, 3, '2022-04-10', NULL, NULL,
'オフライン時に収穫量を入力すると、オンライン復帰後も記録が反映されない。

`SyncQueue` の再送処理を確認する。',
'https://www.pivotaltracker.com/story/show/190000002', NULL);

-- ---------------------------------------------------------------- relations

INSERT INTO story_owners (story_id, user_id, position) VALUES
  (180000002, 2, 1),
  (180000002, 3, 2),
  (180000003, 3, 1),
  (180000004, 2, 1),
  (180000005, 1, 1),
  (180000007, 2, 1),
  (190000001, 4, 1),
  (190000002, 4, 1);

INSERT INTO story_labels (story_id, label) VALUES
  (180000001, 'しおり'),
  (180000002, 'しおり'),
  (180000002, 'ui'),
  (180000003, '縦書き'),
  (180000003, 'ui'),
  (180000004, '検索'),
  (180000007, 'ui'),
  (190000001, '通知'),
  (190000002, '同期');

INSERT INTO tasks (story_id, seq, description, status) VALUES
  (180000002, 1, 'BookmarkStore の実装', 'completed'),
  (180000002, 2, '一覧画面の実装', 'completed'),
  (180000002, 3, 'E2E テストの追加', 'not completed'),
  (180000003, 1, '再現手順の確認', 'completed'),
  (180000003, 2, '組版ライブラリの更新', 'completed'),
  (190000001, 1, '通知基盤の調査', 'completed'),
  (190000001, 2, '設定画面の実装', 'not completed');

INSERT INTO comments (story_id, seq, author_id, commented_on, body) VALUES
(180000002, 1, 2, '2021-06-20',
'設計メモを確認しました。`BookmarkStore` は端末ローカル保存で良さそうです。'),
(180000002, 2, 3, '2021-07-01',
'実装中に気づいた点です。

**長押し判定**が既存のページ送りと競合します。以下で回避しました。

```
long_press_threshold = 500ms
```

一覧画面は次の PR に分けます。'),
(180000002, 3, 1, '2021-07-20',
'動作確認しました。受け入れます。<b>タグ</b>のような文字列もそのまま表示されることを確認。'),
(180000003, 1, 3, '2021-07-10',
'組版ライブラリ v3 で修正されているようです。アップデート後に再確認します。
参考: https://example.com/kumihan/releases/v3'),
(180000003, 2, 2, '2021-08-01',
'v3 更新後、崩れが解消したことを確認しました。'),
(180000004, 1, 2, '2021-08-15',
'表記ゆれの吸収はトライグラム索引で対応できそうです。ひらがな正規化も併用します。'),
(180000007, 1, 4, '2021-09-21',
'注釈ポップアップ以外にも、目次のホバー色に同じ問題がありました。まとめて直します。'),
(190000001, 1, 4, '2022-03-05',
'通知の許諾フローは初回起動時に出すのではなく、リマインダー設定時に出す方針にします。'),
(190000002, 1, 3, '2022-04-12',
'再現しました。オフライン時のキューが `flush` 前に破棄されています。');

INSERT INTO attachments (story_id, filename, size, rel_path) VALUES
  (180000002, 'しおり画面モック.png', 245760, '180000002/しおり画面モック.png'),
  (180000002, '設計メモ.pdf', 1048576, '180000002/設計メモ.pdf'),
  (180000003, '崩れの再現スクリーンショット.png', 512000, '180000003/崩れの再現スクリーンショット.png');

-- Rebuild external-content FTS indexes after bulk load.
INSERT INTO stories_fts(stories_fts) VALUES('rebuild');
INSERT INTO comments_fts(comments_fts) VALUES('rebuild');
