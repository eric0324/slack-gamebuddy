## Why

富饒之城的回合選單每按一次按鈕就多一則「只有你看得到」的訊息，舊選單留在畫面上、很多按鈕已經過期；做完一個動作後還要回到牌桌再按「🏰 我的回合」才能繼續，訊息越疊越多，玩家覺得困擾。

## What Changes

- 回合中在私下選單按按鈕時，回應 SHALL 取代原本那則選單 (原地更新)，不另發新訊息
- 拿金、留牌、建造、收稅、角色能力、紫色建築等動作完成後，選單自動換成下一步的回合選單，不必回牌桌重按
- 動作附帶的私下資訊 (例如「🃏 你拿到 城堡」「📐 你多抽到…」) 併進下一步選單的開頭
- 按「✅ 結束回合」後選單變成「✅ 你的回合結束了」，沒有按鈕
- 選角時按角色後，「你選了 X」取代選角選單
- 只套用在富饒之城，其他遊戲行為不變

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `citadels/turns`：新增「回合面板」requirement
- `citadels/draft`：新增「選角選單原地更新」requirement

## Impact

- `src/engine.ts`：`ephemeral` 和 `prompt` 事件新增可選的 `replace` 旗標
- `src/citadels.ts`：私下訊息加上 `replace`；動作後自動送下一步選單；資訊併進選單
- `src/slack.ts`、`src/index.ts`：按鈕來自私下訊息時，把帶 `replace` 的第一則回應用 `response_url` 取代原訊息
- 測試：`test/citadels.test.ts`、`test/slack.test.ts`
