## Why

希望外國團隊也能用這個 bot。目前所有訊息都寫死繁體中文，之後也可能加其他語言，所以先做 i18n 的基礎建設：頻道可以設定語系，大廳、房間和共用訊息先翻成英文；各遊戲之後一款一款翻譯，還沒翻的照樣可以玩。

## What Changes

- 新增語系：`zh-TW` (預設) 和 `en`；字典結構預留之後加其他語言
- 新增 `/game lang` (查看) 和 `/game lang <語系>` (設定)，以頻道為單位，頻道裡任何人都可以改，保存在檔案中
- 每局在開房時採用當下的頻道語系，進行中改語系不影響這一局
- 每款遊戲標示有哪些語系的翻譯；英文頻道裡還沒翻譯的遊戲照樣列在大廳，名稱後面標示「(中文)」，玩起來是中文
- 英文頻道的共用文字翻成英文：大廳、`/game help` 清單、房間公告和按鈕、共用的房間回覆、戰績和排行榜、`/game lang`
- 這個 change 不翻譯任何遊戲本身的訊息 (之後分批做)

## Capabilities

### New Capabilities

- `i18n`：支援的語系、頻道語系指令、語系保存、開房時決定語系、遊戲的翻譯狀態、共用文字的英文翻譯

### Modified Capabilities

(無；既有 spec 描述的是 `zh-TW` 頻道，行為不變)

## Impact

- 新增 `src/i18n/` (語系清單、`t()`、字典)、`src/langStore.ts` (頻道語系存在 SQLite，和戰績同一個檔案)
- `src/common.ts`：`runGame` 開房時把語系存進 state；共用房間回覆改用 `t()`
- `src/slack.ts`：`/game lang`、大廳、遊戲清單、房間公告依語系顯示；開房和再來一局的 action 帶上頻道語系
- `src/stats.ts`：戰績和排行榜依語系顯示
- `src/games/types.ts`：GameDef 加上各語系的名稱、人數、介紹 (有填的語系才算翻譯好)
- Tests：新增 `test/i18n.test.ts`；既有測試都是 `zh-TW`，不需要改
- Docs：README、wiki 加上 `/game lang` 說明
