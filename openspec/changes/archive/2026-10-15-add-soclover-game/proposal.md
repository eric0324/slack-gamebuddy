## Why

「🤝 合作」分類目前只有一字千金、花火、心電感應（合作）。同一群人想要一款「大家一起動腦、討論很熱鬧」的合作遊戲；四葉草（So Clover!）的「私下寫提示 → 全員一起把卡片排回原位」很適合 Slack：寫提示可以沿用截碼戰的多欄位視窗，排卡可以用頻道按鈕加上同一則訊息更新（`ref`）。

## What Changes

- 新增遊戲「🍀 四葉草」（代號 `soclover`），3～6 位真人，不支援 bot；大廳放在「🤝 合作」分類
- 開局每人一片四葉草：4 張詞卡（每張卡 4 個詞，朝上右下左）隨機擺在 4 格、隨機方向；每片葉子連著相鄰兩張卡朝外的兩個詞，共 4 片葉子 = 4 組詞對
- **寫提示**（所有人同時）：私訊用文字畫出自己的四葉草（4 片葉子的詞對、4 張卡的位置），按頻道的「✍️ 寫提示」開 4 欄視窗，每片葉子寫一個提示；也可以用 `/game soclover clue 提示1 / 提示2 / 提示3 / 提示4`。5 分鐘，全部送出提早結束；沒送出的人這片四葉草跳過、0 分
- **一起排卡**（依隨機順序，一片一片來）：頻道公告 4 個提示和 5 張卡（4 張 + 1 張干擾卡，順序打亂、方向隨機），用同一則按鈕訊息操作「選格 → 選卡 → 🔄 旋轉 → ✅ 送出」。每片四葉草由一位**擺放者**操作（猜的人輪流），其他人在頻道討論；任何猜的人都可以按「🙋 換我排」接手。作者不能操作
- **計分（官方）**：第 1 次 4 張全對（位置和方向都對）得 6 分；否則對的卡留在原位🔒、錯的卡收回，第 2 次再排，結束時盤面上對了幾張就得幾分（0～4）。每次 4 分鐘，時間到就以目前盤面送出
- **結束**：所有四葉草猜完，公告全隊總分／滿分（6 × 玩家數）和評價文字，附「再來一局」
- **戰績**：正常結束時送出 `{ type: 'result', players, winners: [], score }`，`score` 是**全隊總分**（各片四葉草得分加總，0～6 × 玩家數，和頻道公告的總分相同）；取消的遊戲不送
- 新詞庫 `src/socloverWords.ts`：至少 200 個具體名詞

## Capabilities

### New Capabilities
- `soclover/setup`：房間、詞庫與發卡、四葉草的結構（格子、方向、葉子）、遊戲清單與說明
- `soclover/rounds`：寫提示、一起排卡（擺放者、按鈕操作、旋轉）、計分、結束與評價、戰績結果

### Modified Capabilities
（大廳分類和戰績規則由主控統一修改）

## Impact

- Code：新增 `src/soclover.ts`（engine，用 `src/common.ts` 的 `joinRoom`、`leaveRoom`、`cancelGame`、`runGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`）、`src/socloverWords.ts`、`src/games/soclover.ts`（`GameDef`）；`src/games/index.ts` 的 `GAMES` 加一行。`src/engine.ts`、`src/slack.ts`、`src/index.ts` 不需要改（多欄位視窗、`ref` 更新同一則 prompt 都已支援）
- Tests：新增 `test/soclover.test.ts`、`test/socloverWords.test.ts`；`test/slack.test.ts`（KINDS、大廳合作分類、指令解析、按鈕路由、視窗）；`test/characterization.test.ts` 的 KINDS 加 `soclover`，snapshot 會多一款遊戲的文字（預期中的變更）
- Docs：README（遊戲列表、wiki 連結、manifest `description`／`usage_hint`）、wiki 新增「四葉草」「四葉草-遊戲規則」「四葉草-指令」三頁

> 註：禁語、四葉草、不要謝謝一起合併。大廳分類（`game-commands`）和戰績獲勝規則（`player-stats`）的修改，統一寫在 `add-soclover-game` 的 delta（最後歸檔）。
