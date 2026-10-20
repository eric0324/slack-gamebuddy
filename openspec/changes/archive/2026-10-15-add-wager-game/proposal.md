## Why

心理戰分類目前都是卡牌或嘴砲，還沒有「不用會答題也能贏」的益智派對遊戲。猜猜看 (Wits & Wagers) 每題是答案為數字的冷知識，大家先各寫一個猜測，再押注「誰最接近」：不會答的人也能靠押注贏分，節奏輕鬆、3～10 人都好玩。作答用視窗或指令、押注用按鈕，和梗圖大亂鬥、壽司派對的做法相同，不需要新的 Slack 功能。

## What Changes

- 新增遊戲「💰 猜猜看」(代號 `wager`)，3～10 位真人，不支援 bot，大廳分類 🎲 心理戰
- 一局 7 題，每題三個階段：
  - **作答 (60 秒)**：頻道公告題目和單位，附「✍️ 寫答案」按鈕 (開視窗)；也可以 `/game wager answer <數字>`。答案只接受阿拉伯數字 (可有逗號和小數點、全形也可以)，截止前可以改；全員答完提前結束
  - **押注 (45 秒)**：相同數字合併成一格，由小到大列出 (標示作者)，最前面加一格「全部太大」。每人 2 個押注標記，按「🎯 押注」私下選格子，兩個可以押同一格，截止前可以「重押」；全員押完 2 個提前結束
  - **揭曉**：公布正解和補充說明；**最接近但不超過正解**的那格是贏格 (沒有答案 ≤ 正解時，「全部太大」是贏格)。每個押在贏格的標記 +1 分，寫出贏格答案的人另外 +1 分；公告本題得分和總分，接著下一題
- 沒有人作答的題目直接公布正解、不計分，換下一題
- 7 題結束總分最高者獲勝，同分並列
- 新增題庫 `src/wagerQuestions.ts`：至少 120 題，答案是數字的穩定冷知識 (台灣和世界)，每題有單位和補充說明；同一頻道跨局不重複 (新的一局接著上一局剩下的題目抽，全部抽完才重洗)
- 結束送出 `result` 事件；附「再來一局」；房主可取消

### 誰算贏 (戰績)

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是總分最高的玩家；同分**全部都算贏** (包括全員 0 分)。取消的遊戲不送 `result`。

## Capabilities

### New Capabilities
- `wager/setup`：房間、題庫、開局、遊戲清單與指令說明
- `wager/rounds`：作答、答案格式、押注、揭曉與計分、勝負與結束

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上猜猜看 (由主控統一寫 delta)
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上猜猜看 (由主控統一寫 delta)

## Impact

- Code：新增 `src/wager.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)、`src/wagerQuestions.ts` (題庫)、`src/games/wager.ts` (`GameDef`，含 `modals.wagerAnswer`)；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent，不需要改 `src/slack.ts`
- Tests：新增 `test/wager.test.ts`、`test/wagerQuestions.test.ts`；`test/slack.test.ts` (KINDS、大廳心理戰分類)；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 三頁 (猜猜看、猜猜看-遊戲規則、猜猜看-指令)
