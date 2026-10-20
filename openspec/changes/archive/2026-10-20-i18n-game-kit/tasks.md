## 1. 共用

- [x] 1.1 先寫失敗的測試 (`test/i18n.test.ts`)：`gameText()` 依語系查字、`en` 少 key 時 typecheck 失敗 (用 `@ts-expect-error`)；英文頻道 `/game <遊戲> help` 有英文翻譯時顯示英文、沒有時顯示中文；英文房間的規則連結指向「<英文名稱>-Rules」、沒翻譯的指向中文頁面 (用測試假資料的 `locales.en`)
- [x] 1.2 實作 `gameText()`、GameDef `locales` 加 `help`、`src/slack.ts` 的 help 和規則連結依語系，讓 1.1 綠燈
- [x] 1.3 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈、既有測試沒改
