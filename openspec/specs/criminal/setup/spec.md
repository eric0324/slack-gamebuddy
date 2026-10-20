# criminal/setup Specification

## Purpose
TBD - created by archiving change add-criminal-game. Update Purpose after archive.

## Requirements

### Requirement: 犯人在跳舞的房間
犯人在跳舞的房間 SHALL 和其他遊戲有相同的操作方式：`/game criminal new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game criminal start` 開始、`/game criminal cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～8 人之間 (bot 也算)。房間公告 SHALL 標示這是犯人在跳舞。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 房主開始前離開
- **WHEN** 房主在開始前按「離開」
- **THEN** 房間被取消，頻道公告遊戲已取消

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩情書，有人輸入 `/game criminal new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 加入與移除 bot
房主 SHALL 可以在開始前用 `/game criminal addbot [數量]` 加入 bot、`/game criminal removebot [數量]` 移除 bot (沒寫數量就是 1，從最後加入的移除)。bot 的名字和顯示方式 SHALL 和其他遊戲相同 (「🤖<名字>」、同房間不重複)。加 bot 超過 8 人時 SHALL 只加到 8 人並只讓房主看到「房間已滿」。非房主或遊戲開始後使用 SHALL 被拒絕。

#### Scenario: 一個人加 bot
- **WHEN** 房間有 1 位真人，房主輸入 `/game criminal addbot 2`
- **THEN** 名單變成 3 人，其中 2 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: 加 bot 超過上限
- **WHEN** 房間已有 7 人，房主輸入 `/game criminal addbot 3`
- **THEN** 只加入 1 個 bot，只讓房主看到「房間已滿」

#### Scenario: 非房主加 bot
- **WHEN** 不是房主的玩家輸入 `/game criminal addbot`
- **THEN** 系統拒絕，只讓他看到「只有房主可以加入 bot」

### Requirement: 依人數組牌組與發牌
全部的牌 SHALL 是 32 張：第一發現者 1、犯人 1、偵探 4、不在場證明 5、共犯 2、目擊者 3、情報交換 3、交易 5、謠言 4、普通人 2、少年 1、神犬 1。遊戲開始時，系統 SHALL 依人數組成「人數 × 4」張的牌組：先放入必放的牌，再從 32 張扣掉必放之後剩下的牌中隨機補滿：
- 3 人：第一發現者、犯人、偵探 1、不在場證明 1
- 4 人：第一發現者、犯人、偵探 1、不在場證明 1、共犯 1
- 5 人：第一發現者、犯人、偵探 1、不在場證明 2、共犯 1
- 6 人：第一發現者、犯人、偵探 2、不在場證明 2、共犯 2
- 7 人：第一發現者、犯人、偵探 2、不在場證明 3、共犯 2
- 8 人：32 張全部

牌組洗牌後 SHALL 發給每位玩家 4 張，沒有剩下的牌。座位順序 SHALL 是加入房間的順序；「下一位」是座位順序的下一位 (最後一位的下一位是第一位)，「上一位」反過來。

#### Scenario: 3 人的牌組
- **WHEN** 3 人開始遊戲
- **THEN** 3 人手牌合計 12 張，其中一定有第一發現者、犯人、至少 1 張偵探和至少 1 張不在場證明

#### Scenario: 6 人的牌組
- **WHEN** 6 人開始遊戲
- **THEN** 手牌合計 24 張，其中一定有第一發現者、犯人、至少 2 張偵探、至少 2 張不在場證明和 2 張共犯

#### Scenario: 8 人用全部的牌
- **WHEN** 8 人開始遊戲
- **THEN** 手牌合計剛好是 32 張全部的牌

#### Scenario: 每人 4 張
- **WHEN** 5 人開始遊戲
- **THEN** 每人手牌 4 張

### Requirement: 開局
遊戲開始時，頻道 SHALL 公告遊戲開始、座位順序、每人 4 張和勝利條件 (犯人撐到手上最後一張打出：犯人和共犯贏；用偵探或神犬抓到犯人：只有出那張牌的人贏，出牌的人是共犯時沒有人贏)。系統 SHALL 私訊每位真人玩家他的 4 張手牌和各張牌效果的摘要。接著系統 SHALL 自動替持有第一發現者的玩家打出第一發現者並在頻道公告，然後輪到他的下一位出牌。第一發現者打出的這一圈是第 1 圈；之後每次輪回到第一發現者的持有者時進入下一圈。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲，B 拿到第一發現者
- **THEN** 頻道公告座位順序和勝利條件；每位真人私下收到自己的 4 張手牌；頻道公告 B 打出第一發現者，接著輪到 B 的下一位

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出犯人在跳舞的名稱 (🕺 犯人在跳舞)、代號 `criminal`、人數 (3～8 人) 和開房方式 `/game criminal new`，大廳分類是「🎭 吹牛心機」。輸入 `/game criminal help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到犯人在跳舞的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中「🃏 我的手牌」按鈕的用法和各張牌效果的摘要)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game criminal help`
- **THEN** 只有這位使用者看到犯人在跳舞所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game criminal foo`
- **THEN** 只有這位使用者看到犯人在跳舞的指令說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🎭 吹牛心機」
- **THEN** 看到犯人在跳舞 (`criminal`，3～8 人) 和它的「開房」按鈕
