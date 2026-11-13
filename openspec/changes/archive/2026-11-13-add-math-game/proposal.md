## Why

派對分類的遊戲大多要想字、寫字，還沒有「動腦但不用打字」的快節奏對戰。口算擂台 (Math Duel) 一題 10 秒、按按鈕就能答，一局兩三分鐘，很適合在頻道裡隨時揪人比一場。題目用程式產生，不需要題庫。

## What Changes

- 新增遊戲「🧮 口算擂台」(代號 `math`，英文名 Math Duel)，2～8 位真人，**不支援 bot** (`noBots: true`)，大廳分類「😂 派對創意」
- 房主按開始後，頻道出現設定面板 (原地更新)：模式 (分數比大小／四則運算)、難度 (簡單／普通／困難／地獄)、題數 (10／15／20)，預設「四則運算、普通、10 題」；房主按「▶️ 開始出題」或 60 秒到就用目前設定開始
- 每題 10 秒 (地獄 20 秒)，用按鈕作答，每人每題只能答一次 (按了不能改)
  - 分數比大小：`a/b ? c/d`，三顆按鈕 `<` `=` `>`
  - 四則運算：`a × b = ?`，四個數字選項 (一個正解、三個接近的錯誤答案)
  - 地獄難度：四則運算模式改出微分、積分、極限、混合運算 (先乘除後加減、平方、開根號)，答案都是整數；分數比大小改成分母到 50、兩個分數非常接近
- 計分：答對 10 分，再依「答對的順序」加速度分：第 1 個答對 +5、第 2 個 +4、第 3 個 +3、第 4 個 +2、第 5 個 +1、之後 +0；答錯或沒答 0 分
- 全員作答或時間到就揭曉 (正解、每個人對錯和得分、目前排名)，3 秒後出下一題
- 題數出完後公告最終排名；送出 `result` (總分最高的人獲勝，同分並列；最高分 0 時沒有人贏)；附「再來一局」；房主可取消
- 中英文兩種語系都翻好

## Capabilities

### New Capabilities
- `math/setup`：房間 (2～8 位真人、不支援 bot)、設定面板 (模式、四種難度、題數)、大廳與指令說明、語系
- `math/rounds`：出題規則 (兩種模式 × 四種難度，含地獄的微積分題)、作答、計分、揭曉、結束與排名、取消與再來一局

### Modified Capabilities
- `game-commands`：「遊戲大廳與分類」的 😂 派對創意加上口算擂台
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上口算擂台

## Impact

- 這個 change 疊在 `add-sync-game` 上面：兩份 MODIFIED delta 都已經包含同詞相遇和默契問答，**必須在 `add-sameword-game`、`add-sync-game` 之後歸檔**
- Code：新增 `src/math.ts` (engine 和出題)、`src/i18n/games/math.ts` (字典)、`src/games/math.ts` (`GameDef`)；`src/games/index.ts` 加一行。不需要新的 GameEvent 種類、modal 或改 `src/slack.ts`
- Tests：新增 `test/math.test.ts`、`test/math.en.test.ts`；更新 `test/slack.test.ts`、`test/i18n.test.ts`、`test/characterization.test.ts`
- Docs：README (遊戲列表、manifest)
