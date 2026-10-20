## Why

現在只有狼人殺有戰績 (`/werewolf stats`)，其他 19 款遊戲玩完什麼都沒留下。大家想知道誰是這個頻道的桌遊王，也想看自己每款遊戲的成績。

## What Changes

- 狼人殺以外的 19 款遊戲，正常結束時都記錄結果：誰參加、誰贏；合作遊戲記錄分數、不分勝負
- 有 bot 參加的局、房主取消的局不記錄 (和狼人殺一致)
- `/game stats [@某人]`：查詢自己或別人在這個頻道**所有遊戲**的戰績 (總場數、勝場、勝率、每款遊戲一行；合作遊戲顯示最高分)
- `/game rank`：這個頻道的排行榜，依勝場數排前 10 名 (同分比勝率，再比場數)
- `/game rank <遊戲代號>`：單一遊戲的排行榜；合作遊戲依最高分排
- 狼人殺的紀錄也算進跨遊戲戰績和排行榜 (包含以前的紀錄)；`/werewolf stats` 維持原樣 (陣營、角色的細節)
- 遊戲清單 (`/game help`) 加一行說明戰績和排行榜指令

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
- `player-stats`：新增「記錄各遊戲結果」「查詢跨遊戲戰績」「排行榜」三個 requirement

## Impact

- Code：`src/engine.ts` (新增 `result` 事件)、17 個 engine 的結束處送出 `result`、`src/stats.ts` (新的資料表、查詢、格式化)、`src/slack.ts` (記錄、`/game stats`、`/game rank`、遊戲清單)
- 資料：SQLite 新增 `matches`、`match_players` 兩張表；原本狼人殺的表不動，查詢時合併
- Tests：各 engine 的結束測試、`test/stats.test.ts`、`test/slack.test.ts`；characterization snapshot 的遊戲清單會多一行 (預期中的變更)
