## Context

- 大廳是 `chat.postEphemeral` 送出的訊息。ephemeral 訊息不能用 `chat.update` 改，只能用按鈕點擊帶來的 `response_url` 搭配 `replace_original: true` 換掉。
- 大廳的按鈕目前是 `ww:lobbyOpen:<i>`，value 是 `<channel>|<遊戲代號>`，在 `GameHost.button()` 最前面處理。

## Decisions

1. **分類寫在 `CATALOG`**：每筆加 `category` 欄位，另外一個 `CATEGORIES` 陣列定義順序、emoji 和名稱。有測試檢查每款遊戲剛好一個分類、每個分類至少一款。
2. **分類按鈕**：`ww:lobbyTab:<i>`，value 是 `<channel>|<分類>`；目前的分類用 `style: 'primary'`（Slack 的藍色按鈕）。
3. **換內容用 `response_url`**：`index.ts` 的按鈕 handler 多傳 `body.response_url`；`GameHost.button()` 新增可選的 `responseUrl` 參數。`HostOptions` 新增 `respond?: (url, payload) => Promise<void>`，預設用 `fetch` POST JSON；測試可以注入假的 `respond` 檢查送出的內容。
   - 替代方案：每次按分類就再發一則 ephemeral → 會越疊越多則，違反「不另外發新訊息」。
4. **`lobbyBlocks(channel, category)`**：預設第一個分類。

## Risks / Trade-offs

- [`response_url` 有時效（30 分鐘、最多 5 次）] → 失敗時記 log，改成發一則新的大廳（ephemeral），使用者還是看得到內容
