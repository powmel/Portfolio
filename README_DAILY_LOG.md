# Daily Log 運用メモ

Daily Logの正本は `data/daily-posts.js` の構造化データです。
`daily/YYYY-MM-DD.html` はGitHub Pagesの個別URLを維持するための生成物であり、直接編集しません。

## 新しいログを追加する手順

1. `data/daily-posts.js` の配列先頭へ、メタデータと構造化 `content` を追加します。
2. `npm run daily:build` を実行し、個別HTMLを生成します。
3. `npm run daily:check` を実行し、データと生成物が一致することを確認します。
4. 写真を使う場合は `images/daily/YYYY-MM-DD/` に配置し、構造化データから参照します。
5. `file://.../daily.html` とローカルHTTPサーバーの両方で一覧・モーダル・個別記事を確認します。

## `data/daily-posts.js` の形

```js
{
  date: "YYYY-MM-DD",
  title: "記事タイトル",
  summary: "一覧とトップページに表示する短い概要",
  tags: ["Research", "AI Agents"],
  url: "daily/YYYY-MM-DD.html",
  content: {
    lead: ["導入文"],
    sections: [
      {
        heading: "見出し",
        paragraphs: ["本文"],
        bullets: ["必要な場合のみ"]
      }
    ]
  }
}
```

新しい順に表示されるよう、日付は `YYYY-MM-DD` 形式で入れてください。

## 公開前チェック

- `daily.html` で新しい記事が先頭に出ているか
- `file://` で記事タイトルを押した時に本文がモーダル表示されるか
- タグが長すぎてスマホ幅ではみ出していないか
- 個別記事の見出し、本文、リンクが読みやすいか
- 公開してよい個人情報や写真だけが含まれているか
- `npm run daily:check` が通るか
