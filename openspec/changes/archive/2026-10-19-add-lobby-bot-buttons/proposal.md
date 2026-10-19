## Why
加減 bot 現在只能打 `/game <代號> addbot` / `removebot`，房主常常不記得指令。房間公告已經有「加入」「離開」「開始遊戲」按鈕，直接多兩顆 bot 按鈕最省事。另外房間公告的人數上限寫死狼人殺的 12 人（例如印加寶藏顯示「1/12」，實際最多 8 人），一起修正。

## What Changes
- 支援 bot 的遊戲（遊戲清單沒有標「不支援 bot」的，包含狼人殺），房間公告多「🤖 +」「🤖 -」兩顆按鈕，每按一次加入或移除 1 個 bot，效果等同房主輸入 `addbot` / `removebot`
- 不支援 bot 的遊戲不顯示這兩顆按鈕
- 只有房主能按；其他人按到時的提示、人數上限、沒有 bot 可以移除，都沿用指令的處理
- 房間公告的「玩家（N/上限）」改用這款遊戲自己的人數上限

## Capabilities
### New Capabilities
（無）
### Modified Capabilities
- `game-lobby`：新增「房間公告的 bot 按鈕」「房間公告顯示這款遊戲的人數上限」兩個 requirement

## Impact
- Code：只改 `src/slack.ts`（房間公告的按鈕和人數、`addbot` / `removebot` 按鈕轉成既有的 action）；各遊戲 engine 不用動
- Tests：`test/slack.test.ts`；`test/characterization.test.ts` 的房間公告 snapshot 可能會多出按鈕
- Docs：README、wiki 首頁「開始玩」提到可以按按鈕加 bot
