## Why

36 款遊戲分 6 批翻成英文後，還剩幾個要動共用檔案的地方是中文，各批依規定沒碰：梗圖庫指令、視窗打不開的提示、沒開過房時的星際探險隊關卡指令。另外圈內人和截碼戰共用同一份中文詞庫，兩批各自翻了一份英文版，要合併成一份。

## What Changes

- 梗圖庫 (`/game meme add|list|remove`) 的回覆和公告依頻道語系
- 文字視窗的「送出」「取消」按鈕和視窗打不開的提示依這局語系：GameDef `modals` 多一個各語系的提示
- 星際探險隊沒有房間時的 `level`／`reset` 依頻道語系
- 圈內人改用截碼戰的英文詞庫，刪掉重複的 `src/insiderWords.ts`
- wiki 首頁和側邊欄加上所有遊戲的英文頁面

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增「梗圖庫指令依頻道語系」「視窗打不開的提示依語系」「星際探險隊的關卡指令依頻道語系」

## Impact

- `src/memeLibrary.ts`、`src/i18n/games/memeLibrary.ts` (新)、`src/slack.ts`、`src/games/types.ts`、9 款有文字視窗的 GameDef、`src/crew.ts`、`src/insider.ts`
- Tests：`test/i18n.test.ts`
- Docs：wiki 首頁、側邊欄
