## Why

心理戰分類大多要算牌或唬人，缺一款「人越多越好玩、規則一句話講完」的派對遊戲。從眾心理（Herd Mentality）每題大家私下寫答案，跟多數人一樣就得分；不用策略也能玩，4～12 人都熱鬧。Slack 上自由打字的答案系統比不出「珍奶」和「珍珠奶茶」是同一個，所以先自動分組，再讓房主用按鈕合併意思相同的組。

## What Changes

- 新增遊戲「🐑 從眾心理」（代號 `herd`），4～12 位真人，不支援 bot，大廳分類 🎲 心理戰
- 每題流程：
  - **作答（60 秒）**：頻道公告題目（例如「最好吃的夜市小吃？」），附「✍️ 作答」按鈕開視窗，也可以用 `/game herd answer <答案>`；答案 1～20 字，揭曉前可以改；所有人都答完就提前結束
  - **分組**：系統把正規化後（NFKC、英文小寫、去掉空白、標點和符號）完全相同的答案歸成一組，頻道公告每組的答案和作答者
  - **合併（30 秒）**：房主用按鈕選兩組以上按「🔗 合併」，把意思相同的組合併（例如「珍奶」「珍珠奶茶」）；按「✅ 完成」或 30 秒到就計分。只有一組時跳過合併
  - **計分**：人數唯一最多的那組（至少 2 人）每人 +1；最多人數平手時沒人得分。剛好只有一個人「自己一組」時，他拿到🐮粉紅牛（從原本持有的人那裡轉過來）
- 勝負：有人分數到 8 分且沒有粉紅牛就獲勝（同一題有多人達成就並列）；拿著粉紅牛到 8 分不算贏，要等粉紅牛被搶走。最多 15 題，15 題後由沒有粉紅牛的玩家中分數最高的獲勝（同分並列）
- 超時沒作答的人這題不得分，也不算「自己一組」
- 新增題庫 `src/herdQuestions.ts`：至少 150 題，台灣日常、開放式；同一頻道跨局不重複（新的一局接著上一局剩下的題目抽，全部抽完才重洗，和禁語相同做法）
- 結束時送出 `result` 事件記錄戰績；附「再來一局」；房主可以取消

## 誰算贏（給戰績規則表用）

| 遊戲 | 誰算贏 |
|---|---|
| 從眾心理 | 先到 8 分且沒有粉紅牛的玩家（同一題多人達成就全部算贏）；15 題結束時沒人達成，由沒有粉紅牛的玩家中分數最高的全部算贏；最高分是 0 分時沒有人贏 |

房主取消的遊戲不送 `result`（不記錄）。

## Capabilities

### New Capabilities
- `herd/setup`：房間、題庫、遊戲清單與指令說明
- `herd/rounds`：作答、自動分組、房主合併、計分、粉紅牛、勝負與結束

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上從眾心理（由主控統一寫 delta）
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上從眾心理（由主控統一寫 delta）

## Impact

- Code：新增 `src/herd.ts`（engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`startTimer`、`reply`、`shuffle`、`lobbyEvent`）、`src/herdQuestions.ts`（題庫）、`src/games/herd.ts`（`GameDef`，含 `modals.herdAnswer`）；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent 種類，不需要改 `src/slack.ts`
- Tests：新增 `test/herd.test.ts`、`test/herdQuestions.test.ts`；`test/slack.test.ts`（KINDS、大廳心理戰分類）；`test/characterization.test.ts` 的 KINDS 和 snapshot 會多一款遊戲的文字
- Docs：README（遊戲列表、wiki 連結、manifest description／usage_hint）、wiki 三頁（從眾心理、從眾心理-遊戲規則、從眾心理-指令）
