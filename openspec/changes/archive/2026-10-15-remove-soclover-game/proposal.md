## Why

實際玩過後，四葉草 (So Clover!) 規則太抽象：寫提示要同時連兩個詞，排卡又要選格、選卡、旋轉，玩家看不懂怎麼玩。決定下架，讓合作分類只留好上手的遊戲。

## What Changes

- **BREAKING** 移除遊戲「🍀 四葉草」(代號 `soclover`)：`/game soclover ...` 變成不認識的遊戲代號，顯示遊戲大廳
- 大廳「🤝 合作」分類只剩一字千金、花火、心電感應 (合作)
- 戰績的獲勝規則表拿掉四葉草；資料庫裡已經記錄的四葉草場次**保留不刪**，`/game stats` 照樣列出，名稱顯示為代號 `soclover`
- 刪除 `src/soclover.ts`、`src/socloverWords.ts`、`src/games/soclover.ts` 和對應測試；`GAMES` 拿掉一行
- README 和 wiki 拿掉四葉草的介紹、遊戲規則、指令頁；Slack App 設定的指令說明拿掉 `soclover new`

## Capabilities

### New Capabilities

(無)

### Modified Capabilities
- `game-commands`：合作分類拿掉四葉草
- `player-stats`：獲勝規則表拿掉四葉草；已移除遊戲的舊紀錄照樣列出
- `soclover/setup`、`soclover/rounds`：整份移除

## Impact

- 程式：`src/soclover.ts`、`src/socloverWords.ts`、`src/games/soclover.ts` (刪除)、`src/games/index.ts`
- 測試：`test/soclover.test.ts`、`test/socloverWords.test.ts` (刪除)、`test/slack.test.ts`、`test/characterization.test.ts` 和 snapshot (這次是預期中的「刪掉幾行」)
- 文件：README、wiki (四葉草-遊戲規則、四葉草-指令、首頁、側邊欄)
- 部署後頻道裡正在進行的四葉草會消失 (state 只在記憶體)
