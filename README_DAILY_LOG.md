# Daily Log 運用メモ

Daily Logは、GitHub Pagesでそのまま動く静的HTMLと `data/daily-posts.js` で管理します。

## 新しいログを追加する手順

1. `daily/YYYY-MM-DD.html` を作成します。
2. `data/daily-posts.js` の配列先頭に、同じ日付の記事メタデータを追加します。
3. 写真を使う場合は `images/daily/YYYY-MM-DD/` に配置し、記事HTMLから相対パスで参照します。
4. ローカルで `python -m http.server 8080` を実行し、`http://localhost:8080/daily.html` と個別記事を確認します。

## `data/daily-posts.js` の形

```js
{
  date: "YYYY-MM-DD",
  title: "記事タイトル",
  summary: "一覧とトップページに表示する短い概要",
  tags: ["Research", "AI Agents"],
  url: "daily/YYYY-MM-DD.html"
}
```

新しい順に表示されるよう、日付は `YYYY-MM-DD` 形式で入れてください。

## 公開前チェック

- `daily.html` で新しい記事が先頭に出ているか
- タグが長すぎてスマホ幅ではみ出していないか
- 個別記事の見出し、本文、リンクが読みやすいか
- 公開してよい個人情報や写真だけが含まれているか
