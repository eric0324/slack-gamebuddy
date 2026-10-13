## Why

心理戰分類目前只有吹牛骰和政變。骷髏與玫瑰（Skull）規則只有幾句話、一局 10～20 分鐘、3～6 人就能玩，「蓋牌 → 喊數 → 翻牌」的節奏和吹牛骰很像，可以沿用吹牛骰的輪流喊數、bot 補位，以及花火、截碼戰的「只有自己看得到的按鈕選單」。

## What Changes

- 新增遊戲「💀 骷髏與玫瑰」（代號 `skull`），3～6 人，支援 bot 補位
- 每人 4 張牌（3 朵🌹玫瑰、1 個💀骷髏），手牌私下保管
- 每輪：所有人**同時**蓋第一張牌 → 從起始玩家開始輪流「再蓋一張」或「開始挑戰」喊數 → 喊數階段輪流加注或放棄 → 最高喊數者成為挑戰者，先翻開自己全部的牌，再一張一張選別人疊最上面的牌翻
- 翻到的全是玫瑰：挑戰成功，成功 2 次獲勝；翻到骷髏：挑戰者隨機失去 1 張牌（其他人看不到失去哪張），牌全沒了就出局；只剩一人時這人獲勝
- 蓋牌選玫瑰或骷髏用只有自己看得到的按鈕選單；喊數、放棄、選要翻誰都是頻道按鈕，只有輪到的人能按
- 每個決策 2 分鐘，超時自動行動（蓋第一張→蓋玫瑰、輪到時→再蓋一張或用最低數字開始挑戰、喊數→放棄、翻牌→隨機翻一位）
- 「👀 我的牌」按鈕：遊戲中的玩家隨時看自己的手牌和自己疊的牌
- 遊戲大廳「🎲 心理戰」分類加入骷髏與玫瑰

## Capabilities

### New Capabilities
- `skull/setup`：房間、bot 加減、發牌、遊戲清單與說明
- `skull/rounds`：蓋牌、喊數、翻牌、成功與失敗、我的牌、超時、勝負與結束
- `skull/bots`：bot 的蓋牌、喊數、翻牌策略，一個真人也能玩完

### Modified Capabilities
- `game-commands`：遊戲大廳的「🎲 心理戰」分類加上骷髏與玫瑰

## Impact

- Code：新增 `src/skull.ts`；`src/slack.ts`（Kind、GameHost.defs 註冊、`parseSkullCommand`、`skullButton`、`SKULL_HELP`、`GAME_LIST`、`CATALOG` 加 `category: 'bluff'`）
- Tests：新增 `test/skull.test.ts`；`test/slack.test.ts`（KINDS、大廳心理戰分類、指令和按鈕路由）
- Docs：README（遊戲列表、manifest description／usage_hint）、wiki 新增骷髏與玫瑰三頁

> 註：這次 5 款遊戲一起合併。大廳分類的 `game-commands` 修改統一寫在 `add-loveletter-game` 的 delta（最後歸檔），這個 change 不另外修改 `game-commands`，避免依序歸檔時互相覆蓋。
