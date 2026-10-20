## Context

梗圖大亂鬥的 engine 是純邏輯，不碰資料庫和網路；戰績用 `StatsStore` (better-sqlite3) 存在 `statsFile`。`/game stats`、`/game rank` 是 adapter 直接處理、不進遊戲 engine 的指令，投稿指令照這個模式。

## Goals / Non-Goals

**Goals:** 頻道各自的梗圖庫；投稿時就擋掉壞網址；投稿梗圖每局一定會出現 (有投稿的話)；壞圖不會卡住遊戲。

**Non-Goals:** 不支援直接上傳圖片檔 (Slack 檔案是私人的，要另外做檔案代管)；不做審核流程、權限角色；不做跨頻道共用。

## Decisions

- **`MemeStore` 獨立一個類別**：`src/memeStore.ts`，用同一個 SQLite 檔案、另開一個連線，表 `meme_images(id, channel, url, name, user_id, created_at)`，`UNIQUE(channel, url)`。方法：`add`、`list(channel)`、`get(channel, id)`、`remove(channel, id)`。和戰績分開，職責單純。
- **編號就是資料庫的 id**：刪除後不重新編號，避免「我要刪 3 號」時編號剛好變了。
- **網址檢查在 adapter**：`fetch(url, { method: 'GET' })`，要 200 而且 `content-type` 是 `image/*`，5 秒逾時。測試注入假的 `checkImage`。
- **engine 怎麼拿到投稿**：adapter 收到梗圖大亂鬥的 `start` 時，把 `custom: MemeStore.list(channel)` 加進 action。engine 開局時從 `custom` 隨機挑 `min(2, custom.length)` 張，從內建隨機挑其餘的，再把 6 張打亂，所以投稿的那幾輪位置隨機。state 的 `images` 從 index 改成 `{ name, url, by? }[]`，這樣開局後投稿被刪也不影響這一局。
- **任何人都能刪**：頻道公告「🗑️ @刪的人 刪掉了 #3 名稱 (@投稿者 投稿)」，靠公開透明自律。
- **圖片公告失敗的備案**：`chat.postMessage` 帶 image block 失敗時 (Slack 回 `invalid_blocks` 或下載失敗)，改發純文字並附上網址。內建和投稿的圖片都適用。

## Risks / Trade-offs

- [網址之後失效] → 投稿當下檢查過，之後失效時靠備案發文字，玩家可以用 `list` 找到再 `remove`。
- [不當圖片] → 任何人都能刪，而且刪除會公告。
- [檢查網址時對方網站很慢] → 5 秒逾時就拒絕，請使用者換一個網址。
