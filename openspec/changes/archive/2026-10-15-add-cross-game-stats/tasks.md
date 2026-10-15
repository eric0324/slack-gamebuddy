## 1. 結果事件（engine）

- [x] 1.1 `GameEvent` 新增 `result`
- [x] 1.2 先寫失敗的測試：17 款遊戲正常結束時送出正確的 `result`（依獲勝規則表；平手、合作遊戲、沒猜中的圈內人），取消時不送
- [x] 1.3 各 engine 在結束處送出 `result`，讓 1.2 綠燈

## 2. 儲存與查詢（src/stats.ts）

- [x] 2.1 先寫失敗的測試：記錄對戰和合作遊戲；跨遊戲戰績（含舊的狼人殺紀錄、每個頻道分開、依場數排序、合作遊戲最高分）；排行榜（勝場、勝率、場數排序、前 10 名、單一遊戲、合作遊戲依最高分）
- [x] 2.2 實作 `matches`／`match_players`、`recordMatch`、`playerSummary`、`leaderboard` 和格式化，讓 2.1 綠燈

## 3. Adapter（src/slack.ts）

- [x] 3.1 先寫失敗的測試：`result` 事件在沒有 bot 時記錄、有 bot 時不記錄；`/game stats [@某人]`、`/game rank [代號]`、不認識的代號顯示說明；遊戲清單多一行戰績說明
- [x] 3.2 實作，讓 3.1 綠燈；確認 characterization snapshot 只多了戰績那一行後更新

## 4. 文件與驗證

- [x] 4.1 README、wiki 首頁提到 `/game stats`、`/game rank`
- [x] 4.2 跑全部測試、typecheck
