## Why

`i18n-game-kit` 定好了每款遊戲的翻譯寫法，接下來分批把遊戲翻成英文。這是批次 A：吹牛骰、政變、骷髏與玫瑰、誰是牛頭王、不要謝謝、情書。翻好之後，英文頻道玩這幾款遊戲時，大廳、指令說明、遊戲中的訊息和按鈕都會是英文，不再標示「(中文)」。

## What Changes

- 6 款遊戲各新增字典檔 `src/i18n/games/<代號>.ts` (zh-TW 和原本的字串一字不差，加上 en)
- engine 裡玩家看得到的字串 (公告、prompt、按鈕、私下訊息、DM) 改成照這局語系 `tx(s.lang, key, params)`；state 加 `lang`
- 卡牌／角色名稱依語系顯示 (政變的角色、情書的卡牌)，英文用官方名稱
- GameDef 加 `locales.en`：官方英文名 (Liar's Dice、Coup、Skull、6 nimmt!、No Thanks!、Love Letter)、人數、介紹、英文指令說明
- 每款遊戲新增英文測試 `test/<代號>.en.test.ts`
- 共用測試 `test/i18n.test.ts` 原本拿政變、骷髏與玫瑰當「還沒翻譯的遊戲」的例子，改成在測試裡暫時拿掉它們的 `locales` (測試意圖不變)
- wiki：每款遊戲 3 頁英文版 (`<English-Name>.md`、`-Rules.md`、`-Commands.md`)
- 中文頻道的輸出完全不變

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增 6 款遊戲的英文版 requirement

## Impact

- `src/liarsdice.ts`、`src/coup.ts`、`src/skull.ts`、`src/nimmt.ts`、`src/nothanks.ts`、`src/loveletter.ts`
- `src/games/` 底下對應的 6 個 GameDef
- 新增 `src/i18n/games/` 底下 6 個字典檔
- Tests：新增 6 個 `test/<代號>.en.test.ts`；調整 `test/i18n.test.ts` 的範例遊戲
