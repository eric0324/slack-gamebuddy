## Context

- 狼人殺 engine 結束時送出 `gameRecord` 事件，adapter 檢查沒有 bot 才呼叫 `StatsStore.record()`，存進 `games`、`game_players` 兩張表。
- 其他 17 個 engine 結束時把結果存在各自的 state (`winner`、`winners`、`loser`、`score`…)，格式都不一樣。

## Decisions

1. **新的 `result` 事件**：`{ type: 'result'; players: string[]; winners: string[]; score?: number }`。對戰遊戲送 `winners`；合作遊戲送 `score`、`winners` 為空。由 engine 在正常結束的地方送出 (取消不會經過那裡)，adapter 統一處理「有 bot 就不記」並帶上遊戲代號。
2. **新的資料表**，不動狼人殺原本的表：
   - `matches(id, channel, kind, ended_at, score)`
   - `match_players(match_id, user_id, won)`，`won` 在合作遊戲是 `NULL`
   查詢跨遊戲戰績和排行榜時，用 `UNION ALL` 把狼人殺的 `games`／`game_players` 當成 `kind = 'werewolf'` 一起算，以前的狼人殺紀錄自動算進來，不用搬資料。
3. **排序在 SQL 做**：勝場 DESC、勝率 DESC、場數 DESC，`LIMIT 10`。
4. **`/game stats` 改成跨遊戲** (原本會導到狼人殺戰績)；`/werewolf stats` 不變。
5. **玩家名稱用 mention** (`<@U123>`)，Slack 會顯示名字，不用另外存。

## Risks / Trade-offs

- [遊戲清單文字改變，characterization snapshot 會失敗] → 這是預期中的變更，確認 diff 只多了戰績那一行再更新 snapshot
- [17 個 engine 都要改] → 每個只在結束處加一個事件，並各補一個測試
