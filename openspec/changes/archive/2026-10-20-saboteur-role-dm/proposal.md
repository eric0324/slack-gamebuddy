## Why

矮人礦坑每回合開始時，用頻道裡的私下訊息 (ephemeral) 發身分。Slack 的私下訊息位置會亂跳 (可能排在前面的訊息上面)，重新整理或換裝置也會消失，玩家回報第 2 回合「沒有私下發身分」。bot 其實有送出，但玩家找不到。

## What Changes

- 每回合的身分改成 DM 私訊給每位真人，訊息寫出第幾回合 (例如「⛏️ 矮人礦坑第 2/3 回合：你是 ⛏️ 金礦工」)，不會消失也不會跑位
- 回合開始公告改成「身分已私訊給每個人」
- 「🎒 我的手牌」照樣顯示身分

## Capabilities

### Modified Capabilities

- `saboteur/setup`：修改「身分分配」

## Impact

- `src/saboteur.ts`：`startRound()` 的身分事件從 `ephemeral` 改成 `dm`
- `src/i18n/games/saboteur.ts`：`yourRole`、`roundStart` 中英文字
- 測試：`test/saboteur.test.ts`、`test/saboteur.en.test.ts`
