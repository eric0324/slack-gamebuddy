## 1. Engine (src/hanabi.ts)

- [x] 1.1 先寫失敗的測試：按鈕順序是 看牌 → 棄牌堆 → 給提示 → 出牌 → 棄牌
- [x] 1.2 先寫失敗的測試：`discards` 依顏色分行、數字由小到大、空的時候顯示「棄牌堆是空的」；任何人都能看，不改變狀態
- [x] 1.3 實作 `discards` action 和按鈕，讓 1.1～1.2 綠燈

## 2. Adapter (src/slack.ts)

- [x] 2.1 先寫失敗的測試：按鈕 `discards` 轉成 `discards` action
- [x] 2.2 實作按鈕路由，花火說明補上棄牌堆按鈕，讓 2.1 綠燈

## 3. 收尾

- [x] 3.1 跑全部測試和 typecheck，確認綠燈
