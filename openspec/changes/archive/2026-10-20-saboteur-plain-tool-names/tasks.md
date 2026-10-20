## 1. 工具只用文字

- [x] 1.1 先改測試 (`test/saboteur.test.ts`)：回合面板「壞了：鎬子、礦車」；上一步和私下確認「弄壞了／修好了 … 的鎬子」；「🎒 我的手牌」壞掉的工具只寫文字；確認紅燈
- [x] 1.2 改 `src/saboteur.ts`、`src/saboteurCards.ts`，讓 1.1 綠燈 (`npx vitest run test/saboteur.test.ts`)，並確認 `src/saboteur.ts` 不再出現 ⛏️🔦🛒 代表工具

## 2. 文件與驗證

- [x] 2.1 檢查 wiki 矮人礦坑三頁有沒有工具 emoji，有的話改成文字 (草稿寫好後問過再 push)
- [x] 2.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
