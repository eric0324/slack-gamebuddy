# nothanks/setup Specification

## Purpose
TBD - created by archiving change add-nothanks-game. Update Purpose after archive.

## Requirements

### Requirement: 不要謝謝的房間
不要謝謝的房間 SHALL 和其他遊戲有相同的操作方式：`/game nothanks new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game nothanks start` 開始、`/game nothanks cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～7 人之間 (bot 也算)。房間公告 SHALL 標示這是不要謝謝。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 7 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 房主開始前離開
- **WHEN** 房主在開始前按「離開」
- **THEN** 房間被取消，頻道公告遊戲已取消

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩骷髏與玫瑰，有人輸入 `/game nothanks new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 加入與移除 bot
房主 SHALL 可以在開始前用 `/game nothanks addbot [數量]` 加入 bot、`/game nothanks removebot [數量]` 移除 bot (沒寫數量就是 1，從最後加入的移除)。bot 的名字和顯示方式 SHALL 和其他遊戲相同 (「🤖<名字>」、同房間不重複)。加 bot 超過 7 人時 SHALL 只加到 7 人並只讓房主看到「房間已滿」。非房主或遊戲開始後使用 SHALL 被拒絕。

#### Scenario: 一個人加 bot
- **WHEN** 房間有 1 位真人，房主輸入 `/game nothanks addbot 2`
- **THEN** 名單變成 3 人，其中 2 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: 加 bot 超過上限
- **WHEN** 房間已有 6 人，房主輸入 `/game nothanks addbot 3`
- **THEN** 只加入 1 個 bot，只讓房主看到「房間已滿」

#### Scenario: 非房主加 bot
- **WHEN** 不是房主的玩家輸入 `/game nothanks addbot`
- **THEN** 系統拒絕，只讓他看到「只有房主可以加入 bot」

### Requirement: 牌組與籌碼
遊戲開始時，系統 SHALL 把 3～35 共 33 張牌洗牌，拿掉最上面 9 張不使用，剩下 24 張當牌堆。被拿掉的牌 SHALL NOT 在遊戲中公開，SHALL 在遊戲結束時公布。每位玩家的起始籌碼 SHALL 依人數決定：3～5 人每人 11 個、6 人每人 9 個、7 人每人 7 個。座位順序 SHALL 是加入房間的順序，起始玩家 SHALL 隨機決定。

#### Scenario: 牌堆
- **WHEN** 4 人開始遊戲
- **THEN** 牌堆有 24 張 3～35 之間不重複的牌，另外 9 張被拿掉，兩者合起來剛好是 3～35 全部

#### Scenario: 5 人的籌碼
- **WHEN** 5 人開始遊戲
- **THEN** 每人有 11 個籌碼

#### Scenario: 6 人的籌碼
- **WHEN** 6 人開始遊戲
- **THEN** 每人有 9 個籌碼

#### Scenario: 7 人的籌碼
- **WHEN** 7 人開始遊戲
- **THEN** 每人有 7 個籌碼

### Requirement: 開局公告
遊戲開始時，頻道 SHALL 公告遊戲開始、座位順序、起始玩家、每人起始籌碼數和勝利條件 (分數最低的人贏)，接著翻開第一張牌輪到起始玩家。系統 SHALL 私訊每位真人玩家規則摘要和自己的起始籌碼數。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲
- **THEN** 頻道公告座位順序、隨機選出的起始玩家、每人 11 個籌碼，翻開第一張牌輪到起始玩家；每位真人收到規則私訊

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出不要謝謝的名稱 (🙅 不要謝謝)、代號 `nothanks`、人數 (3～7 人) 和開房方式 `/game nothanks new`，大廳分類是「🎲 心理戰」。輸入 `/game nothanks help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到不要謝謝的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中「🙅 不要謝謝」「✋ 收下」「👀 我的籌碼」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game nothanks help`
- **THEN** 只有這位使用者看到不要謝謝所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game nothanks foo`
- **THEN** 只有這位使用者看到不要謝謝的指令說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🎲 心理戰」
- **THEN** 看到不要謝謝 (`nothanks`，3～7 人) 和它的「開房」按鈕
