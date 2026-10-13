## 1. 大廳分類（src/slack.ts）

- [ ] 1.1 先寫失敗的測試：`/game` 大廳有四個分類按鈕、預設只列推理類、每款遊戲剛好一個分類
- [ ] 1.2 先寫失敗的測試：按分類按鈕用 `response_url` 換掉原本的訊息（`replace_original`），內容是該分類的遊戲、該分類按鈕標示；`response_url` 失敗時改發新的大廳
- [ ] 1.3 實作 `CATEGORIES`、`lobbyBlocks(channel, category)`、`lobbyTab` 按鈕和 `respond`，讓 1.1～1.2 綠燈
- [ ] 1.4 `index.ts` 按鈕 handler 傳入 `body.response_url`

## 2. 文件與驗證

- [ ] 2.1 wiki 首頁「開始玩」提到分類
- [ ] 2.2 跑全部測試和 typecheck，確認綠燈
