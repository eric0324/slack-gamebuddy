## 1. engine：不通知的名字標記

- [x] 1.1 先寫測試：`quiet()` 對真人回傳 `{{name:<id>}}`、對 bot 回傳和 `mention()` 一樣，確認紅燈
- [x] 1.2 在 `src/engine.ts` 實作 `quiet()`，確認 1.1 綠燈

## 2. 富饒之城牌桌訊息

- [x] 2.1 先寫 `test/citadels.test.ts` 測試，對應 spec「牌桌訊息」四個 scenario（第一行粗體 👉 + @、其他人只有 `{{name:}}`、👉 標在輪到的那一行、回合結束那行沒有 @），並更新既有斷言（例如 `🦹 盜賊 <@p1>`），確認紅燈
- [x] 2.2 改 `src/citadels.ts` 的 `board()`，`npx vitest run test/citadels.test.ts` 全綠

## 3. Slack adapter 換名字

- [x] 3.1 先寫 `test/slack.test.ts` 測試：有記住名字時 `{{name:U2}}` 變成名字、沒記住時變成 `<@U2>`，確認紅燈
- [x] 3.2 在 `src/slack.ts` 的 `send()` 替換標記，確認 3.1 綠燈

## 4. 整合

- [x] 4.1 `npx vitest run` 與 `npx tsc --noEmit` 全部通過

## 5. 回合選單列出自己的城市

- [x] 5.1 先寫 `test/citadels.test.ts` 測試，對應「回合選單」新增的兩個 scenario（收集前後的選單、建造清單都有「🏘️ 你的城市」），確認紅燈
- [x] 5.2 改 `src/citadels.ts` 的 `turnMenu()`，`npx vitest run` 全綠

## 6. 場上一覽

- [x] 6.1 先寫 `test/citadels.test.ts` 測試，對應「回合選單」的場上一覽 scenario 和「我的狀態」的場上一覽 scenario（有 `👥 場上：`、每人一行、沒有 `<@`），確認紅燈
- [x] 6.2 改 `src/citadels.ts` 的 `turnMenu()` 和 `status()`，`npx vitest run` 全綠
