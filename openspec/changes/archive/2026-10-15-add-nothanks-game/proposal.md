## Why

心理戰分類想再多一款「很快、規則一句話講完」的遊戲。不要謝謝（No Thanks!）一局 10～15 分鐘、3～7 人，每次只有一個決定（付籌碼跳過或收下），只要兩個按鈕就能玩，很適合 Slack；判斷「該不該收」也很適合寫成簡單的 bot 策略，一個人加 bot 也能玩。

## What Changes

- 新增遊戲「🙅 不要謝謝」（代號 `nothanks`），3～7 人，支援 bot（`addbot`／`removebot`）
- 照官方規則：牌 3～35 共 33 張，洗牌後拿掉 9 張不公開（遊戲結束時才公布）；每人籌碼 3～5 人 11 個、6 人 9 個、7 人 7 個
- 翻開一張牌，從起始玩家（隨機）開始輪流二選一：
  - 「🙅 不要謝謝」：付 1 個籌碼放在牌上，輪到下一位
  - 「✋ 收下」：收下這張牌和牌上所有籌碼，翻開下一張，**還是輪到他**
  - 沒有籌碼時只能收下
- 頻道公開：目前的牌、牌上的籌碼、牌堆剩幾張、每人收下的牌（連號一組顯示）；每人的籌碼數**不公開**，只有本人能按「👀 我的籌碼」看到
- 同一張牌的輪流都更新同一則頻道訊息（`ref`），收下後才發新的一則，避免洗版
- 每次輪到有 60 秒，超時：有籌碼就自動「不要謝謝」，沒有籌碼就自動收下
- 牌堆翻完、最後一張被收下時遊戲結束：分數＝收下的牌點數加總（連號只算最小那張）減去手上籌碼，**分數最低的人贏，同分並列都算贏**
- 結束公告每人的牌、籌碼、分數和名次，公布被拿掉的 9 張牌，送出 `result` 事件，貼「再來一局」
- 再來一局、取消、一個頻道一局、遊戲清單／大廳（🎲 心理戰）／help 和其他遊戲相同

### 誰算贏（戰績）

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是**分數最低的所有玩家（同分並列都算）**。取消的遊戲不送 `result`；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `nothanks/setup`：房間、bot 加減、牌組與籌碼、開局、遊戲清單與說明
- `nothanks/rounds`：輪流不要謝謝／收下、頻道牌桌、我的籌碼、過期按鈕、超時、計分、勝負與結束
- `nothanks/bots`：bot 收牌策略，一個真人也能玩完

### Modified Capabilities
（大廳分類和戰績規則由主控統一修改）

## Impact

- Code：新增 `src/nothanks.ts`（engine，用 `src/common.ts` 的房間邏輯、`runGame`、`shuffle`、`reply`、`startTimer`）；新增 `src/games/nothanks.ts`（`GameDef`）；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent 種類
- Tests：新增 `test/nothanks.test.ts`；`test/slack.test.ts`（KINDS、大廳心理戰分類）；`test/__snapshots__/characterization.test.ts.snap` 預期多一款遊戲的文字
- Docs：README（遊戲列表、wiki 連結、manifest description／usage_hint）、wiki 新增「不要謝謝」「不要謝謝-遊戲規則」「不要謝謝-指令」三頁

> 註：禁語、四葉草、不要謝謝一起合併。大廳分類（`game-commands`）和戰績獲勝規則（`player-stats`）的修改，統一寫在 `add-soclover-game` 的 delta（最後歸檔）。
