## Why

心理戰分類目前只有吹牛骰和政變。誰是牛頭王 (6 Nimmt!) 規則簡單、所有人同時出牌，不用等輪到自己，很適合 Slack 非同步、人數多 (2～10 人) 的場合，也能用 bot 補人數一個人玩。

## What Changes

- 新增遊戲「🐮 誰是牛頭王」(代號 `nimmt`)，2～10 人，支援 bot (`addbot`／`removebot`)
- 官方 104 張牌 (1～104)，每張牌有 1～7 個牛頭；每輪每人發 10 張手牌，桌上開 4 列各 1 張
- 每回合所有人**同時**選一張牌：頻道按「🃏 選牌」後，跳出只有自己看得到的手牌按鈕選單 (10 張用 `perRow: 5` 分 2 列)，揭曉前可以改選；頻道那則選牌訊息會更新成「已選 N/M」並列出還沒選的人
- 全部選好或 2 分鐘到就揭曉；超時沒選的人自動出手上最小的牌
- 系統從小到大依序擺牌：接在「列尾比它小、而且最接近」的那一列；成為第 6 張就收走前 5 張；比所有列尾都小時由出牌的人選一列收走 (60 秒，超時／bot／超時自動出牌的人自動選牛頭最少的列)
- 每回合公告擺牌過程、四列的牌和每列牛頭數、每人累積牛頭
- 一輪 10 回合；每輪結束時有人累積 66 牛頭以上就結束，牛頭最少的人獲勝 (同分並列)，否則重新洗牌發下一輪
- 再來一局、取消、一個頻道一局、遊戲清單／大廳 (🎲 心理戰)／help 和其他遊戲相同

## Capabilities

### New Capabilities
- `nimmt/setup`：房間、bot、牌與牛頭數、發牌、遊戲清單與說明
- `nimmt/rounds`：同時選牌、揭曉擺牌、收列、選列、牌桌顯示、輪與勝負、bot 行動

### Modified Capabilities
- `game-commands`：大廳「🎲 心理戰」分類加上誰是牛頭王

## Impact

- Code：新增 `src/nimmt.ts`；`src/engine.ts` (prompt 加可選的 `ref`，用來更新同一則訊息)；`src/slack.ts` (註冊遊戲、指令、按鈕、help、GAME_LIST、CATALOG、prompt `ref` 的 update)
- Tests：新增 `test/nimmt.test.ts`；`test/slack.test.ts` (KINDS、大廳分類)
- Docs：README (遊戲列表、manifest description／usage_hint)、wiki 新增誰是牛頭王三頁

> 註：這次 5 款遊戲一起合併。大廳分類的 `game-commands` 修改統一寫在 `add-loveletter-game` 的 delta (最後歸檔)，這個 change 不另外修改 `game-commands`，避免依序歸檔時互相覆蓋。
