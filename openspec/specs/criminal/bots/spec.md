# criminal/bots Specification

## Purpose
TBD - created by archiving change add-criminal-game. Update Purpose after archive.

## Requirements

### Requirement: bot 的出牌策略
bot 的名字和顯示方式 SHALL 和其他遊戲相同。輪到 bot 或需要 bot 選擇時，bot SHALL 立刻行動，走和真人一樣的規則和公告。bot 的策略：
- 出牌：從合法的牌中選；手上有偵探而且知道誰拿著犯人 (自己用目擊者或少年看到，之後那張犯人沒有被交換、抽走) 時，優先出偵探指認那個人；否則不出不在場證明 (留著防偵探)，其餘合法的牌隨機選一張；只剩不在場證明可以出時才出它
- 選對象：偵探、神犬優先選已知拿著犯人的人，否則從合法對象隨機選；目擊者、交易隨機選；神犬盲抽時隨機選第幾張
- 同時選牌 (情報交換、交易)：bot 自己拿著犯人時，優先交出犯人以外的牌；其他情況隨機選一張，但盡量不交出不在場證明

超時沒選的真人 SHALL NOT 用 bot 策略，而是隨機選合法的選項 (見 rounds 的超時規則)。

#### Scenario: 知道犯人就指認
- **WHEN** 第 2 圈輪到 bot，bot 先前用少年得知 C 拿著犯人，之後沒有發生交換，bot 手上有偵探
- **THEN** bot 出偵探並指認 C

#### Scenario: 留著不在場證明
- **WHEN** 輪到 bot，手上有不在場證明、普通人、謠言
- **THEN** bot 出普通人或謠言，不出不在場證明

#### Scenario: 拿著犯人時交出別張
- **WHEN** bot 手上有犯人和交易，情報交換要選一張傳出去
- **THEN** bot 傳交易

### Requirement: 一個人也能玩完整局
1 位真人加上 bot 時，即使真人完全不操作，遊戲 SHALL 一定會結束 (每個決策點超時都會替他選，牌只會越出越少)，並送出 `result` 事件。

#### Scenario: 真人不操作也會結束
- **WHEN** 1 位真人加 2 個 bot 開始一局，真人什麼都不做，每次輪到他或需要他選擇時都觸發超時
- **THEN** 遊戲靠計時和 bot 的行動推進到有人勝利，公告勝負並送出 `result`
