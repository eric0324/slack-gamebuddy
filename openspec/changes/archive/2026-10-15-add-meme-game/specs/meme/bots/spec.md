## ADDED Requirements

### Requirement: bot 出牌與投票
bot SHALL 在每輪配圖開始時立刻從手牌隨機出一張（並補牌），在投票開始時立刻隨機投給一個不是自己的答案。bot 的動作 SHALL 不需要真人操作；只有 bot 和一位真人時遊戲也能完整玩完。投票進度和「全部投完」只看真人。

#### Scenario: bot 出牌
- **WHEN** 有 bot 的一局開始新的一輪
- **THEN** 每個 bot 都已經送出一張手牌，配圖進度包含 bot

#### Scenario: bot 投票
- **WHEN** 進入投票
- **THEN** 每個 bot 都投了一個不是自己的答案

#### Scenario: 一個真人加兩個 bot
- **WHEN** 1 位真人和 2 個 bot 開始遊戲，真人每輪都送出並投票
- **THEN** 遊戲玩完 6 輪並公布結果
