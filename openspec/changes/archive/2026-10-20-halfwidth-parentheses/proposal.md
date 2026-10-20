## Why

全專案的說明文字、Slack 訊息和文件混用全形括弧 (U+FF08、U+FF09)，和英數混排時很擠。統一改成半形括號，左右補空白 (例如「我是 (括號) 示範」)，讀起來比較清爽。

## What Changes

- 全形括弧 (U+FF08、U+FF09) 一律換成半形括號，括號裡面不加空白
- 括號外側緊鄰中英文字或數字時補一個空白；行頭行尾、緊鄰標點 (，。、：；「」等)、引號、另一個括號、全形符號 (｜／) 或本來就有空白時不加
- 程式碼片段 (反引號) 結尾後面接括號時補空白，例如「`/game werewolf new` (或 …)」
- 程式裡接在文字後面的字尾字串 (例如 `${name}${cond ? ' (隊長)' : ''}`) 在字串開頭補空白，讓玩家看到的訊息也有空白
- 粗體結尾的 `*` 前面不補空白 (「*… (60 秒)*」)，避免 Slack 粗體失效
- 遊戲名稱「心電感應 (合作)」改成「心電感應 (合作)」；wiki 頁面改名為「心電感應-(合作)」，房間公告的規則連結和 README 連結跟著更新
- 範圍：`src/`、`test/`(含 snapshot)、`README.md`、`openspec/specs/`、`openspec/changes/archive/`、`deploy/`、GitHub wiki
- 遊戲行為不變，只改文字排版，所以不寫 delta spec (`skip_specs`)，主 spec 的文字直接用同一個轉換更新

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

(無，只有排版；主 spec 文字直接更新)

## Impact

- 所有遊戲的 Slack 訊息、指令說明、大廳文字
- `src/slack.ts`：遊戲名稱以括號結尾時，房間公告的「房間」「遊戲規則」前補空白
- Tests：測試字串、正規表示式 (半形括號要跳脫)、characterization snapshot
- wiki：所有頁面，加上心電感應 (合作) 三頁改名
