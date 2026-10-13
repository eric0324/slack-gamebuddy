# wavelength/setup Specification

## Purpose
TBD - created by archiving change add-wavelength-game. Update Purpose after archive.

## Requirements

### Requirement: 心電感應的房間
心電感應的房間 SHALL 和其他遊戲有相同的操作方式：`/game wavelength new` 開房（開房者為房主並自動加入）、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game wavelength start` 開始、`/game wavelength cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～12 位真人之間；心電感應 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「心電感應不支援 bot」。房間公告 SHALL 標示這是心電感應。一個頻道同時只能有一局遊戲（不分遊戲種類）。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 12 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game wavelength addbot`
- **THEN** 系統拒絕並只讓房主看到「心電感應不支援 bot」

### Requirement: 分隊與出題順序
遊戲開始時，系統 SHALL 把玩家隨機分成🟠橘隊和🟣紫隊（人數相差最多 1 人），並隨機決定先出題的隊伍。出題順序 SHALL 兩隊輪流，各隊內依隨機順序，直到每位玩家都出過一題；人數較多的隊伍多出的那位排在最後。頻道 SHALL 公告兩隊成員和總題數。

#### Scenario: 5 人分隊
- **WHEN** 5 人開始遊戲
- **THEN** 一隊 3 人、一隊 2 人，總共 5 題，每人出一題

#### Scenario: 出題輪流
- **WHEN** 橘隊 A、B，紫隊 C、D，橘隊先出題
- **THEN** 出題順序是一位橘隊、一位紫隊、一位橘隊、一位紫隊

### Requirement: 光譜卡
每題 SHALL 從光譜卡隨機抽一張，同一局不重複。每張光譜卡是一組相反的兩端（例如「冷 ↔ 熱」「被低估 ↔ 被高估」）。光譜卡 SHALL 至少有 60 張，兩端都是不空白、不重複的中文。

#### Scenario: 不重複
- **WHEN** 一局有 12 題
- **THEN** 12 題的光譜卡都不一樣

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出心電感應的名稱、代號 `wavelength`、人數（4～12 人）和開房方式。輸入 `/game wavelength help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到心電感應的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game wavelength help`
- **THEN** 只有這位使用者看到心電感應所有指令的條列說明
