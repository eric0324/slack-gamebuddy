## 1. 測試

- [x] 1.1 回合開始時每位真人收到 DM「⛏️ 矮人礦坑第 N/3 回合：你是 <身分>」、沒有身分 ephemeral，公告寫「身分已私訊給每個人」(中英文，先紅燈)

## 2. 實作

- [x] 2.1 `src/saboteur.ts`：`startRound()` 的身分改發 `dm`
- [x] 2.2 `src/i18n/games/saboteur.ts`：`yourRole`、`roundStart` 中英文字
- [x] 2.3 全部測試綠燈；wiki 中英文規則頁有提到身分發送方式的話跟著改
