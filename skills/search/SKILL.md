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

## Config

認証情報は `~/.config/pt-viewer/env`（chmod 600）から読む:

```bash
set -a; source ~/.config/pt-viewer/env; set +a
# PT_VIEWER_BASE_URL            (現在: https://pt-viewer.prebyte.workers.dev)
# PT_VIEWER_ACCESS_CLIENT_ID
# PT_VIEWER_ACCESS_CLIENT_SECRET
```

**値を echo / ログ / 会話に出さない。** 存在確認は `[ -n "$VAR" ] && echo SET || echo MISSING` のみ。

### 初回セットアップ（ユーザー向け）

Service Token は 1Password の会社共有保管庫にある（見つからなければ管理者 @dot に依頼）。
`op` CLI があれば1コマンドで env を生成できる:

```bash
mkdir -p ~/.config/pt-viewer
OP_ACCOUNT=<会社アカウント>.1password.com op inject -o ~/.config/pt-viewer/env <<'EOF'
PT_VIEWER_BASE_URL=https://pt-viewer.prebyte.workers.dev
PT_VIEWER_ACCESS_CLIENT_ID={{ op://<共有保管庫>/pt-viewer-team/client_id }}
PT_VIEWER_ACCESS_CLIENT_SECRET={{ op://<共有保管庫>/pt-viewer-team/credential }}
EOF
chmod 600 ~/.config/pt-viewer/env
```

（op を使わない場合は同じ3変数を手書きで作成。1Password のアイテム名・フィールド名は
保管庫の実物に合わせる）

env ファイルが無い状態でこの skill が呼ばれたら、上記手順をユーザーに案内して止まる。

## 使い方

共通ヘルパー（毎回これを前置）:

```bash
set -a; source ~/.config/pt-viewer/env; set +a
pt() { curl -s -H "CF-Access-Client-Id: $PT_VIEWER_ACCESS_CLIENT_ID" \
             -H "CF-Access-Client-Secret: $PT_VIEWER_ACCESS_CLIENT_SECRET" \
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

## Notes

- **Linear に貼る permalink** は `$PT_VIEWER_BASE_URL` + `permalink`（例 `.../ptosh/stories/165240043#comment-5`）。閲覧は Access ログイン（チームメンバーのメールは許可済み）
- 302 で cloudflareaccess.com にリダイレクトされる場合は Service Token が無効/未設定
- 添付はメタデータのみ（`rel_path` 表示）。実体は export フォルダ保持者（@dot）に依頼
- 日付は day 精度。同日コメントの順序は `seq` が正
- カスタムドメイン移行時は env の `PT_VIEWER_BASE_URL` を書き換えるだけ
