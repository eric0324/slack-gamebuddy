## 1. Engine：給提示的按鈕流程 (src/hanabi.ts、src/engine.ts)

- [x] 1.1 先寫失敗的測試：輪到時按鈕順序是 看牌 → 給提示 → 出牌 → 棄牌，公告不含 `/game hanabi hint`
- [x] 1.2 先寫失敗的測試：`hintMenu` 回傳只給輪到的人看的其他玩家按鈕；沒有標記、不是自己的回合時拒絕
- [x] 1.3 先寫失敗的測試：`hintTarget` 回傳對方手牌和實際有的顏色、數字按鈕 (不重複、顏色在前、數字由小到大)
- [x] 1.4 `GameEvent` 的 prompt 新增 `audience: 'ephemeral'`
- [x] 1.5 實作 `hintMenu`、`hintTarget`，調整按鈕順序和公告文字，讓 1.1～1.3 綠燈

## 2. Adapter (src/slack.ts)

- [x] 2.1 先寫失敗的測試：`audience: 'ephemeral'` 的 prompt 用 `postEphemeral` 帶按鈕送出
- [x] 2.2 先寫失敗的測試：按鈕 `hint`、`hintTarget:<id>`、`hint:<id>:<值>` 分別轉成 `hintMenu`、`hintTarget`、`hint` action
- [x] 2.3 實作 adapter 送出和按鈕路由，讓 2.1～2.2 綠燈
- [x] 2.4 花火說明改成具體範例 (`/game hanabi hint @某人 紅`)，並註明可以用按鈕

## 3. 收尾

- [x] 3.1 跑全部測試和 typecheck，確認綠燈
