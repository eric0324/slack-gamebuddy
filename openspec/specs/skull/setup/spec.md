# skull/setup Specification

## Purpose
TBD - created by archiving change add-skull-game. Update Purpose after archive.

## Requirements

### Requirement: 骷髏與玫瑰的房間
骷髏與玫瑰的房間 SHALL 和其他遊戲有相同的操作方式：`/game skull new` 開房 (開房者為房主並自動加入)、房間公告有「加入」「離開」「開始遊戲」按鈕、房主可以用 `addbot [數量]`、`removebot [數量]` 加減 bot、`/game skull start` 開始、`/game skull cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～6 人之間 (bot 也算)，房間公告 SHALL 標示這是骷髏與玫瑰。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 6 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 用 bot 補人數
- **WHEN** 房間有 1 位真人，房主輸入 `/game skull addbot 2`
- **THEN** 名單變成 3 人，其中 2 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩吹牛骰，有人輸入 `/game skull new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 發牌與座位
遊戲開始時，每位玩家 SHALL 拿到 4 張牌：3 朵🌹玫瑰和 1 個💀骷髏，0 次挑戰成功。座位順序 SHALL 是加入房間的順序，第 1 輪的起始玩家 SHALL 隨機決定。系統 SHALL 私訊每位真人玩家規則摘要；頻道 SHALL 公告遊戲開始、座位順序、起始玩家和勝利條件 (挑戰成功 2 次，或最後一位還有牌的人)。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲
- **THEN** 每人有 3 朵玫瑰和 1 個骷髏，頻道公告座位順序和隨機選出的起始玩家

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出骷髏與玫瑰的名稱 (💀 骷髏與玫瑰)、代號 `skull`、人數 (3～6 人) 和開房方式 `/game skull new`。輸入 `/game skull help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到骷髏與玫瑰的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用按鈕操作的說明)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game skull help`
- **THEN** 只有這位使用者看到骷髏與玫瑰所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game skull foo`
- **THEN** 只有這位使用者看到骷髏與玫瑰的指令說明
