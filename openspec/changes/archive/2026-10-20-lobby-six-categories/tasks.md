## 1. 分類

- [x] 1.1 先改測試：`test/slack.test.ts` 的大廳 (六個分類按鈕、預設身分推理、各分類的遊戲清單)，以及各遊戲測試裡 GameDef `category` 的斷言；確認紅燈
- [x] 1.2 `src/games/types.ts` 加 `party`、`strategy`；`src/slack.ts` 的 `CATEGORIES` 改成六類；各遊戲 GameDef 改 `category`，讓 1.1 綠燈
- [x] 1.3 更新 characterization snapshot，確認差異只有分類按鈕和各分類的遊戲清單

## 2. 文件與驗證

- [x] 2.1 README、wiki 各遊戲首頁的「分類」改成新分類 (wiki 問過再 push)
- [x] 2.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈
