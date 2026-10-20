# cockroach/setup Specification

## Purpose
TBD - created by archiving change add-cockroach-game. Update Purpose after archive.

## Requirements

### Requirement: 蟑螂撲克的房間
蟑螂撲克的房間 SHALL 和其他遊戲有相同的操作方式：`/game cockroach new` 開房 (開房者為房主並自動加入)、房間公告有「加入」「離開」「開始遊戲」按鈕、房主可以用 `addbot [數量]`、`removebot [數量]` 加減 bot、`/game cockroach start` 開始、`/game cockroach cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 2～6 人之間 (bot 也算)，房間公告 SHALL 標示這是蟑螂撲克。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 1 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 2 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 6 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 用 bot 補人數
- **WHEN** 房間有 1 位真人，房主輸入 `/game cockroach addbot 2`
- **THEN** 名單變成 3 人，其中 2 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: bot 超過上限
- **WHEN** 房間已有 5 人，房主輸入 `/game cockroach addbot 3`
- **THEN** 只加到 6 人，多的不加，只讓房主看到房間已滿

#### Scenario: 非房主不能加 bot
- **WHEN** 不是房主的玩家輸入 `/game cockroach addbot`
- **THEN** 系統拒絕，只讓這位玩家看到只有房主可以加 bot

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩骷髏與玫瑰，有人輸入 `/game cockroach new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 牌堆與發牌
牌堆 SHALL 是 64 張牌：8 種害蟲各 8 張——🪳 蟑螂、🐀 老鼠、🪰 蒼蠅、🦂 蠍子、🪲 臭蟲、🕷️ 蜘蛛、🐸 青蛙、🦇 蝙蝠。遊戲開始時系統 SHALL 洗牌並**全部發完**；張數除不盡時，座位順序前面的玩家各多 1 張。每位玩家面前一開始 SHALL 沒有牌。座位順序 SHALL 是加入房間的順序，第一位出牌的玩家 SHALL 隨機決定。系統 SHALL 私訊每位真人他的手牌 (每種害蟲幾張) 和規則摘要；bot 不收私訊。頻道 SHALL 公告遊戲開始、座位順序、每人手牌張數、第一位出牌的玩家和輸的條件 (面前同一種害蟲 4 張，或輪到自己出牌時手上沒牌)，SHALL NOT 透露任何人的手牌內容。

#### Scenario: 牌堆內容
- **WHEN** 檢查遊戲開始前的牌堆
- **THEN** 共 64 張，8 種害蟲各 8 張

#### Scenario: 4 人發牌
- **WHEN** 4 人開始遊戲
- **THEN** 每人 16 張手牌、面前 0 張，真人收到手牌私訊

#### Scenario: 除不盡
- **WHEN** 6 人開始遊戲
- **THEN** 座位前 4 位各 11 張、後 2 位各 10 張，總共 64 張

#### Scenario: 開始公告不洩漏手牌
- **WHEN** 3 人開始遊戲
- **THEN** 頻道公告座位順序、每人手牌張數和第一位出牌的玩家，不包含任何手牌內容

### Requirement: 我的手牌
遊戲開始後、結束前，頻道的按鈕列 SHALL 有「🃏 我的手牌」。這局的玩家按下時，系統 SHALL 只讓他看到自己手上每種害蟲的張數、手牌總張數，以及自己面前每種害蟲的張數。不在這局的人按 SHALL 被拒絕，只讓他看到「你不在這局遊戲裡」。按了 SHALL NOT 改變遊戲狀態。

#### Scenario: 查看手牌
- **WHEN** A 手上有 3 張蟑螂、2 張蝙蝠，A 按「🃏 我的手牌」
- **THEN** 只有 A 看到「🪳 蟑螂 ×3、🦇 蝙蝠 ×2，共 5 張」和自己面前的牌

#### Scenario: 不在遊戲裡
- **WHEN** 沒參加的 D 按「🃏 我的手牌」
- **THEN** 系統拒絕，只讓 D 看到「你不在這局遊戲裡」，遊戲狀態不變

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出蟑螂撲克的名稱 (🪳 蟑螂撲克)、代號 `cockroach`、人數 (2～6 人) 和開房方式 `/game cockroach new`。輸入 `/game cockroach help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到蟑螂撲克的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用按鈕操作的說明)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game cockroach help`
- **THEN** 只有這位使用者看到蟑螂撲克所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game cockroach foo`
- **THEN** 只有這位使用者看到蟑螂撲克的指令說明
