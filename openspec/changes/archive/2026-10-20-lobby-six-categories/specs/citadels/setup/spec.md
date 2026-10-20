## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出富饒之城的名稱 (🏛️ 富饒之城)、代號 `citadels`、人數 (4～7 人) 和開房方式 `/game citadels new`，大廳分類是「🧩 策略桌遊」。輸入 `/game citadels help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到富饒之城的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中「🎭 選角色」「🏰 行動」「📜 我的狀態」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game citadels help`
- **THEN** 只有這位使用者看到富饒之城所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game citadels foo`
- **THEN** 只有這位使用者看到富饒之城的指令說明

#### Scenario: 大廳策略桌遊分類
- **WHEN** 使用者在大廳按「🧩 策略桌遊」
- **THEN** 列表有 🏛️ 富饒之城 (`citadels`) 4～7 人和它的「開房」按鈕
