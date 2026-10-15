# sushigo/setup Specification

## Purpose
TBD - created by archiving change add-sushigo-game. Update Purpose after archive.

## Requirements

### Requirement: 壽司派對的房間
壽司派對的房間 SHALL 和其他遊戲有相同的操作方式：`/game sushigo new` 開房（開房者為房主並自動加入）、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game sushigo start` 開始、`/game sushigo cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 2～5 人之間（bot 也算）。房間公告 SHALL 標示這是壽司派對。一個頻道同時只能有一局遊戲（不分遊戲種類）。

#### Scenario: 人數不足
- **WHEN** 房間只有房主 1 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 2 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 5 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 房主開始前離開
- **WHEN** 房主在開始前按「離開」
- **THEN** 房間被取消，頻道公告遊戲已取消

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩不要謝謝，有人輸入 `/game sushigo new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 加入與移除 bot
房主 SHALL 可以在開始前用 `/game sushigo addbot [數量]` 加入 bot、`/game sushigo removebot [數量]` 移除 bot（沒寫數量就是 1，從最後加入的移除）。bot 的名字和顯示方式 SHALL 和其他遊戲相同（「🤖<名字>」、同房間不重複）。加 bot 超過 5 人時 SHALL 只加到 5 人並只讓房主看到「房間已滿」。非房主或遊戲開始後使用 SHALL 被拒絕。

#### Scenario: 一個人加 bot
- **WHEN** 房間有 1 位真人，房主輸入 `/game sushigo addbot`
- **THEN** 名單變成 2 人，其中 1 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: 加 bot 超過上限
- **WHEN** 房間已有 4 人，房主輸入 `/game sushigo addbot 3`
- **THEN** 只加入 1 個 bot，只讓房主看到「房間已滿」

#### Scenario: 非房主加 bot
- **WHEN** 不是房主的玩家輸入 `/game sushigo addbot`
- **THEN** 系統拒絕，只讓他看到「只有房主可以加入 bot」

### Requirement: 牌組與發牌
遊戲開始時，系統 SHALL 建立 108 張牌的牌組並洗牌：天婦羅 14、生魚片 14、煎餃 14、壽司捲①（1 個壽司捲圖示）6、壽司捲②12、壽司捲③8、鮭魚握壽司 10、魷魚握壽司 5、玉子握壽司 5、布丁 10、芥末 6、筷子 4。每輪開始時，系統 SHALL 從牌組上方發給每位玩家手牌：2 人 10 張、3 人 9 張、4 人 8 張、5 人 7 張。每輪結束後出過的牌（布丁以外）SHALL 丟棄，下一輪從剩下的牌組繼續發，SHALL NOT 重新洗牌。座位順序 SHALL 是加入房間的順序，傳牌方向是座位順序的下一位（最後一位傳給第一位）。

#### Scenario: 牌組
- **WHEN** 遊戲開始
- **THEN** 所有玩家的手牌加上牌組剩下的牌，剛好是上面列出的 108 張

#### Scenario: 3 人的手牌
- **WHEN** 3 人開始遊戲
- **THEN** 每人手牌 9 張，牌組剩 81 張

#### Scenario: 5 人的手牌
- **WHEN** 5 人開始遊戲
- **THEN** 每人手牌 7 張

#### Scenario: 2 人的手牌
- **WHEN** 2 人開始遊戲
- **THEN** 每人手牌 10 張

#### Scenario: 第 2 輪不重新洗牌
- **WHEN** 4 人局第 1 輪結束，開始第 2 輪
- **THEN** 每人從牌組上方再拿 8 張新的手牌，牌組剩 108 − 64 = 44 張

### Requirement: 開局公告
遊戲開始時，頻道 SHALL 公告遊戲開始、座位順序（傳牌方向）、共 3 輪、每輪手牌張數、計分重點摘要和勝利條件（總分最高的人贏，同分比布丁），接著開始第 1 輪第 1 回合。系統 SHALL 私訊每位真人玩家規則摘要（各種牌的計分方式和筷子的用法）。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲
- **THEN** 頻道公告座位順序、共 3 輪、每輪 8 張手牌和勝利條件，接著出現第 1 輪第 1 回合的牌桌訊息；每位真人收到規則私訊

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出壽司派對的名稱（🍣 壽司派對）、代號 `sushigo`、人數（2～5 人）和開房方式 `/game sushigo new`，大廳分類是「🎲 心理戰」，排在不要謝謝後面。輸入 `/game sushigo help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到壽司派對的條列式指令說明（new、addbot、removebot、start、cancel，以及遊戲中「🍣 我的手牌」按鈕和「🥢 用筷子再出一張」的用法）。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game sushigo help`
- **THEN** 只有這位使用者看到壽司派對所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game sushigo foo`
- **THEN** 只有這位使用者看到壽司派對的指令說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🎲 心理戰」
- **THEN** 看到壽司派對（`sushigo`，2～5 人）和它的「開房」按鈕，排在最後
