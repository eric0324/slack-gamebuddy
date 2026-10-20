## Why

接下來要把 36 款遊戲全部翻成英文，會分批交給 agent 同時做。各批都會用到的共用部分 (指令說明、規則連結、每款遊戲的翻譯寫法) 要先做好、先定好，才不會各批改同一批檔案互相衝突，寫法也才一致。

## What Changes

- `/game <遊戲> help` 依頻道語系顯示：GameDef 的 `locales.<語系>` 多一個 `help`
- 房間公告的規則連結依這局語系：英文指向「<英文名稱>-Rules」，還沒翻譯的指向中文頁面
- 定下每款遊戲的翻譯寫法 (見 design.md)，之後各批照做：每款一個字典檔、詞庫依語系分開、state 記住語系、英文測試另外寫
- bot 名字本來就是英文 (Sam、Emma…)，不用改

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增「指令說明依語系」「規則連結依語系」

## Impact

- `src/i18n/index.ts`：新增 `gameText()` helper (每款遊戲的字典)
- `src/games/types.ts`：`locales` 加 `help`
- `src/slack.ts`：help 和規則連結依語系
- Tests：`test/i18n.test.ts`
