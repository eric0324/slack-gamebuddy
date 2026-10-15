## Why

四葉草下架後想要一款「規則一句話講完、大家會笑」的派對遊戲。梗圖大亂鬥（What Do You Meme? 的玩法）每輪看一張梗圖、配一句最好笑的標題、大家投票，不用教就會玩。我們把原版的「出手上的文字卡」和「自己寫梗」合在一起：想不到就出手牌，有靈感就自己寫；有手牌也讓 bot 能參加，人少也開得成。

## What Changes

- 新增遊戲「😂 梗圖大亂鬥」（代號 `meme`），3～8 人，支援 bot（`addbot`／`removebot`），大廳分類「🎲 心理戰」
- 開局每人拿 7 張文字卡（題庫 300 句以上的繁體中文梗），共 6 輪
- 每輪流程：
  1. 頻道貼一張梗圖（整局不重複），開始配圖（90 秒）
  2. 每人按「🃏 我的手牌」從 7 張文字卡挑一張，或按「✍️ 自己寫」在視窗打一句（1～40 字）；送出後不能改；出手牌的人補一張
  3. 全部送出或時間到就進入投票；超時沒送出的人由系統從他的手牌隨機出一張
  4. 所有答案打亂、匿名列出（A、B、C…），每人投一票給最好笑的（不能投自己，投票結束前可以改票），60 秒或全部真人都投完就揭曉
  5. 揭曉每個答案的作者和票數（自己寫的標 ✍️），每得 1 票 +1 分，公布目前比分
- 6 輪後總分最高的人贏，同分並列；送出 `result` 事件，貼「再來一局」
- 梗圖兩種來源：Imgflip 熱門梗圖模板（挑適合配一句話的）＋台灣梗圖清單（使用者之後提供網址，放進同一個檔案）
- 頻道公告新增可選的圖片欄位 `image`，adapter 用 Slack image block 顯示（和現有的 GIF 一樣）
- 再來一局、取消、一個頻道一局、遊戲清單／大廳／help 和其他遊戲相同

### 誰算贏（戰績）

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`winners` 是總分最高的所有玩家（同分都算贏）。取消的遊戲不送；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `meme/setup`：房間、bot 加減、文字卡題庫與發牌、梗圖題庫、開局、遊戲清單與說明
- `meme/rounds`：配圖（手牌／自己寫）、超時、匿名投票、揭曉計分、輪數與結束
- `meme/bots`：bot 出牌和投票

### Modified Capabilities
- `game-commands`：大廳「🎲 心理戰」加上梗圖大亂鬥
- `player-stats`：獲勝規則表加上梗圖大亂鬥

## Impact

- 新增 `src/meme.ts`（engine）、`src/memeCards.ts`（文字卡題庫）、`src/memeImages.ts`（梗圖清單）、`src/games/meme.ts`（Slack 設定），`GAMES` 加一行
- `src/engine.ts` 的 announce 事件加 `image?: string`；`src/slack.ts` 顯示圖片
- 測試：`test/meme.test.ts`、`test/memeCards.test.ts`、`test/slack.test.ts`、characterization snapshot（只會多出梗圖大亂鬥的行）
- README、wiki 加梗圖大亂鬥
- 圖片直接連到 i.imgflip.com 和使用者提供的網址，由 Slack 抓圖；網址失效時那張圖顯示不出來
