---
name: search
description: >
  過去チケット検索 — PivotalTracker 時代の ptosh チケット・コメント（〜2025-04、
  5,246 stories / 20,347 comments）を pt-viewer の JSON API で検索・取得する。
  「昔のチケット」「Pivotal のチケット」「この機能の元チケット・過去の経緯」など、
  Linear 移行以前の履歴を調べる時に使う。
---

# pt-viewer — 過去チケット検索 API

PivotalTracker export の読み取り専用ビューア（https://github.com/dot/pt-viewer）。
ブラウザ閲覧は Cloudflare Access のメールOTP、この skill が使う API は Service Token 認証。
トークンは 1Password から実行時に `op read` で取得する（平文をディスクに置かない）。

## Config

`~/.config/pt-viewer/env`（非シークレットの座標のみ、chmod 600）:

```bash
PT_VIEWER_BASE_URL=<pt-viewer の URL>
PT_VIEWER_OP_ACCOUNT=<会社の 1Password アカウント URL>
PT_VIEWER_OP_ITEM=op://<共有保管庫>/<Service Token アイテム>
```

アイテムには `client_id` / `client_secret` フィールドが必要（会社共有保管庫、管理者 @dot が管理）。

**secret の値を echo / ログ / 会話に出さない。** curl ヘッダへの command substitution 渡しのみ。

env ファイルが無い・op read が失敗する場合は、上記セットアップ（env 作成、`op` CLI +
アプリ連携、共有保管庫へのアクセス権）をユーザーに案内して止まる。

## 使い方

共通ヘルパー（毎回これを前置）:

```bash
set -a; source ~/.config/pt-viewer/env; set +a
pt() { curl -s \
  -H "CF-Access-Client-Id: $(op read "$PT_VIEWER_OP_ITEM/client_id" --account "$PT_VIEWER_OP_ACCOUNT")" \
  -H "CF-Access-Client-Secret: $(op read "$PT_VIEWER_OP_ITEM/client_secret" --account "$PT_VIEWER_OP_ACCOUNT")" \
  "$PT_VIEWER_BASE_URL$1"; }
```

### 検索

```bash
pt "/api/ptosh/search?q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' '登録票')" | jq '.results[] | {id, title, permalink}'
```

クエリパラメータ（全て組み合わせ可、50件/ページ）:

| param | 意味 |
|---|---|
| `q` | 全文検索（日本語可、3文字以上で FTS / 1-2文字は LIKE）。`#12345` or 数字のみでチケット番号直接ヒット |
| `type` | feature / bug / chore / release / epic |
| `state` | accepted / unscheduled / unstarted / started |
| `label` | ラベル名（例 cdisc） |
| `user` | 表示名（requester / owner / コメント著者のいずれか一致） |
| `from` / `to` | created_at の範囲 (YYYY-MM-DD) |
| `page` | ページ番号（`has_next` で続き判定） |

結果の `comment_permalink` があればコメント位置への深リンク。

### チケット詳細（コメント・タスク・添付メタ込み）

```bash
pt "/api/ptosh/stories/165240043" | jq '{title, comments: [.comments[] | {seq, author, commented_on}]}'
```

本文が長いことがある。まず jq で構造を絞ってから必要フィールドを読む。

### プロジェクト一覧

```bash
pt "/api/projects"
```

## Notes

- **Linear に貼る permalink** は `$PT_VIEWER_BASE_URL` + `permalink`（例 `.../ptosh/stories/165240043#comment-5`）。閲覧は Access ログイン（チームメンバーのメールは許可済み）
- 302 で cloudflareaccess.com にリダイレクトされる場合は Service Token が無効/未設定
- 添付はメタデータのみ（`rel_path` 表示）。実体は export フォルダ保持者（@dot）に依頼
- 日付は day 精度。同日コメントの順序は `seq` が正
- ドメイン移行時は env の `PT_VIEWER_BASE_URL` を書き換えるだけ
