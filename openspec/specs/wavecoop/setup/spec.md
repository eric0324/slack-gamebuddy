# wavecoop/setup Specification

## Purpose
TBD - created by archiving change add-wavelength-coop. Update Purpose after archive.

## Requirements

### Requirement: 心電感應 (合作) 的房間
心電感應 (合作) 的房間 SHALL 和其他遊戲有相同的操作方式：`/game wavecoop new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game wavecoop start` 開始、`/game wavecoop cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 2～12 位真人之間；心電感應 (合作) SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「心電感應 (合作) 不支援 bot」。房間公告 SHALL 標示這是心電感應 (合作)。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 1 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 2 人」

#### Scenario: 兩人可以開始
- **WHEN** 房間有 2 人，房主按下開始
- **THEN** 遊戲開始

#### Scenario: 房間已滿
- **WHEN** 房間已有 12 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game wavecoop addbot`
- **THEN** 系統拒絕並只讓房主看到「心電感應 (合作) 不支援 bot」

### Requirement: 出題順序與題數
遊戲開始時，所有玩家 SHALL 在同一隊。系統 SHALL 隨機決定出題順序，每題由下一位玩家出題，輪完一輪再從第一位開始。一局基本 SHALL 有 7 題；加題的規則見計分。頻道 SHALL 公告所有玩家、出題順序和基本題數。

#### Scenario: 兩人輪流
- **WHEN** A、B 兩人開始遊戲，出題順序是 A、B
- **THEN** 第 1～7 題的出題者依序是 A、B、A、B、A、B、A

#### Scenario: 人數比題數多
- **WHEN** 9 人開始遊戲，沒有任何加題
- **THEN** 出題順序前 7 位各出一題，後 2 位這局不出題

### Requirement: 光譜卡
每題 SHALL 從心電感應的光譜卡 (和兩隊對抗版同一份) 隨機抽一張，同一局不重複。

#### Scenario: 不重複
- **WHEN** 一局有 10 題 (含加題)
- **THEN** 10 題的光譜卡都不一樣

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出心電感應 (合作) 的名稱、代號 `wavecoop`、人數 (2～12 人) 和開房方式。輸入 `/game wavecoop help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到心電感應 (合作) 的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game wavecoop help`
- **THEN** 只有這位使用者看到心電感應 (合作) 所有指令的條列說明
