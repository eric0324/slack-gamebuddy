## 1. 富饒之城：「🏰 行動」

- [x] 1.1 先改測試 (`test/citadels.test.ts`)：牌桌按鈕是「🏰 行動」、過期提示和墓地等待提示寫「🏰 行動」、help 列出「🏰 行動」；確認紅燈
- [x] 1.2 改 `src/citadels.ts`、`src/games/citadels.ts`，讓 1.1 綠燈 (`npx vitest run test/citadels.test.ts`)

## 2. 矮人礦坑：「⛏️ 行動」和文字牌名

- [x] 2.1 先改測試 (`test/saboteur.test.ts`)：回合面板按鈕是「⛏️ 行動」、過期提示、help；手牌選單和「🎒 我的手牌」的牌名是「破壞 鎬子」「修理 鎬子／礦燈」「藏寶圖」「落石」；修理目標按鈕是「p2 鎬子」；確認紅燈
- [x] 2.2 改 `src/saboteur.ts`、`src/games/saboteur.ts`，讓 2.1 綠燈 (`npx vitest run test/saboteur.test.ts`)

## 3. 整合與文件

- [x] 3.1 更新 `test/characterization.test.ts` 的 snapshot，確認差異只有兩款遊戲 help 裡的按鈕名稱
- [x] 3.2 wiki：富饒之城-指令、矮人礦坑、矮人礦坑-指令、矮人礦坑-遊戲規則的按鈕名稱和牌名 (草稿寫好後問過再 push)
- [x] 3.3 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
