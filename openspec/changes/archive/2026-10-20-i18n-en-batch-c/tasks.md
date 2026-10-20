## 1. 花火

- [x] 1.1 先寫失敗的英文測試 (`test/hanabi.en.test.ts`)：英文局的公告、prompt、按鈕、提示訊息、help、`locales.en`、英文顏色的 hint 指令，確認紅燈
- [x] 1.2 字典檔 `src/i18n/games/hanabi.ts`、engine 和 GameDef 改成依語系，讓 1.1 綠燈

## 2. 星際探險隊

- [x] 2.1 先寫失敗的英文測試 (`test/crew.en.test.ts`)：英文局的公告、prompt、按鈕、任務說明、help、`locales.en`，確認紅燈
- [x] 2.2 字典檔 `src/i18n/games/crew.ts`、英文任務 (`src/crewMissions.ts`)、engine 和 GameDef 改成依語系，讓 2.1 綠燈

## 3. 阿瓦隆

- [x] 3.1 先寫失敗的英文測試 (`test/avalon.en.test.ts`)：英文局的公告、身分私訊、組隊／投票／任務的 prompt 和按鈕、bot 台詞、help、`locales.en`，確認紅燈
- [x] 3.2 字典檔 `src/i18n/games/avalon.ts`、engine 和 GameDef 改成依語系，讓 3.1 綠燈

## 4. 矮人礦坑

- [x] 4.1 先寫失敗的英文測試 (`test/saboteur.en.test.ts`)：英文局的公告、身分私訊、出牌的 prompt 和按鈕、卡名、help、`locales.en`，確認紅燈
- [x] 4.2 字典檔 `src/i18n/games/saboteur.ts`、卡名 (`src/saboteurCards.ts`)、engine 和 GameDef 改成依語系，讓 4.1 綠燈

## 5. 圈內人

- [x] 5.1 先寫失敗的英文測試 (`test/insider.en.test.ts`)：英文詞庫數量相同、英文局抽英文詞、公告、身分私訊、主持人按鈕、help、`locales.en`，確認紅燈
- [x] 5.2 字典檔 `src/i18n/games/insider.ts`、英文詞庫 (`src/insiderWords.ts`)、engine 和 GameDef 改成依語系，讓 5.1 綠燈

## 6. 狼人殺

- [x] 6.1 先寫失敗的英文測試 (`test/werewolf.en.test.ts`)：英文局記住語系、開局公告／私訊／夜晚 prompt 和按鈕、房間回覆、和 bot 玩完整局沒有中文、bot 台詞、英文頻道訊息解析、`formatStats`、`/werewolf help`、英文房間公告和規則連結、大廳顯示 Werewolf，確認紅燈
- [x] 6.2 字典檔 `src/i18n/games/werewolf.ts`；`src/engine.ts`、`src/botLines.ts`、`src/chatParser.ts`、`src/stats.ts`、`src/slack.ts` (狼人殺的部分) 改成依語系，讓 6.1 綠燈

## 7. 全部驗證

- [x] 7.1 `test/i18n.test.ts` 用狼人殺、花火當「還沒翻譯的遊戲」的情境，改成測試中暫時拿掉翻譯
- [x] 7.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈、既有測試的中文預期值沒改
- [x] 7.3 寫 6 款遊戲的英文 wiki (各 3 頁)
