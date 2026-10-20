## 1. 死路標記

- [x] 1.1 先改測試 (`test/saboteur.test.ts`)：地圖上死路畫成「形狀＋x」(`┃x`、`╋x`、`┳x`、單口 `╹x`)，右邊有開口的死路不畫橫線；手牌「┃ 死路」；落石目標「E5 ━x」；確認紅燈
- [x] 1.2 改 `src/saboteurCards.ts` 的繪圖和 `src/saboteur.ts` 的落石按鈕，讓 1.1 綠燈 (`npx vitest run test/saboteur.test.ts`)
- [x] 1.3 `action-button-plain-cards` 的 spec 範例「│ 死路」改成「┃ 死路」

## 2. 文件與驗證

- [x] 2.1 wiki 矮人礦坑-遊戲規則：地圖範例和「粗線通道、細線死路」的說明改成「格子裡有 x 的是死路」(草稿寫好後問過再 push)
- [x] 2.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
