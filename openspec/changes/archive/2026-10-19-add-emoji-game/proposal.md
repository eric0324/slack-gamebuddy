## Why

心理戰分類已經有「寫一句」（梗圖大亂鬥）和「猜數字」（猜猜看），還沒有「傳話走鐘」的派對遊戲。傳情畫意（Telestrations）是一邊畫圖一邊猜、傳一圈看題目怎麼走鐘，但 Slack 不方便畫圖；Slack 人人都會用 emoji，把「畫圖」換成「只用 emoji 描述」剛好適合聊天室。作答用視窗或指令、投票用私下按鈕選單，和猜猜看、梗圖大亂鬥的做法相同，不需要新的 Slack 功能。

## What Changes

- 新增遊戲「🔗 Emoji 傳話」（代號 `emoji`），4～10 位真人，不支援 bot，大廳分類 🎲 心理戰
- 開局每人從系統題庫拿到一個題目（同一局不重複），當作自己那條鏈的起點；傳遞順序是加入順序，公告在開局訊息
- 一局只有一輪傳遞，共 K 步（人數是偶數時 K＝人數，奇數時 K＝人數－1），每一步所有人同時進行：
  - **奇數步（🎨 emoji，90 秒）**：拿到文字（起點題目或上一位的猜測），只能用 emoji 描述；系統驗證只含 emoji（Unicode emoji 和 Slack `:shortcode:` 都可以，可以有空白），1～20 個
  - **偶數步（🧠 猜測，60 秒）**：拿到上一位的 emoji，用文字猜那是什麼（1～30 字）
  - 第 1 步由鏈的主人自己做，之後每一步交給傳遞順序的下一位；K ≤ 人數，所以同一條鏈不會傳回同一個人，最後一步一定是文字猜測
  - 按「✍️ 作答」只讓自己看到這一步拿到的內容並打開視窗；也可以 `/game emoji send <內容>`。截止前可以重送覆蓋；全員交完提前進下一步
- 逾時：沒交的人這一步留白，下一位拿到這條鏈「最近一則需要的類型」（emoji 步拿最近的文字、猜測步拿最近的 emoji）；猜測步找不到任何 emoji 時這位玩家這一步跳過；整步沒有任何人交時遊戲中止
- 全部步驟結束後，頻道依序公布每一條鏈（起點題目 → emoji → 猜測 → …），每則作品標上編號（例如 `2-3`）和作者
- 投票（90 秒）：每人投 1 票「🎨 最佳 emoji」和 1 票「🧠 最神猜測」，不能投自己，截止前可以改票；全員投完提前揭曉
- 每得 1 票 +1 分，總分最高者獲勝，同分並列
- 新增題庫 `src/emojiPrompts.ts`：至少 150 題，適合用 emoji 表達的詞或短句（成語、電影影視、食物、台灣日常、動作職業）；同一頻道跨局不重複（新的一局接著上一局剩下的題目發，全部發完才重洗）
- 結束送出 `result` 事件；附「再來一局」；房主可取消

### 誰算贏（戰績）

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是總分（得票數）最高的玩家；同分**全部都算贏**（包括全員 0 分）。房主取消或整步沒人交而中止的遊戲不送 `result`。

## Capabilities

### New Capabilities
- `emoji/setup`：房間、題庫與發題、開局、遊戲清單與指令說明
- `emoji/rounds`：鏈的步驟與傳遞、emoji 格式、猜測、逾時、公布鏈、投票、計分與勝負、結束

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上 Emoji 傳話（由主控統一寫 delta）
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上 Emoji 傳話（由主控統一寫 delta）

## Impact

- Code：新增 `src/emoji.ts`（engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`）、`src/emojiPrompts.ts`（題庫）、`src/games/emoji.ts`（`GameDef`，含 `modals.emojiSend`）；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent，不需要改 `src/slack.ts`
- Tests：新增 `test/emoji.test.ts`、`test/emojiPrompts.test.ts`；`test/slack.test.ts`（KINDS、大廳心理戰分類）；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README（遊戲列表、wiki 連結、manifest description／usage_hint）、wiki 三頁（Emoji 傳話、Emoji 傳話-遊戲規則、Emoji 傳話-指令）
