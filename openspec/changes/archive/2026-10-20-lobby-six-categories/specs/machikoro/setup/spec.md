## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出骰子街的名稱 (🏘️ 骰子街)、代號 `machikoro`、人數 (2～5 人) 和開房方式，大廳分類是 🧩 策略桌遊。輸入 `/game machikoro help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到骰子街的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用回合面板上的「🏘️ 行動」「📋 城鎮一覽」按鈕操作)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game machikoro help`
- **THEN** 只有這位使用者看到骰子街所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game machikoro roll`
- **THEN** 只有這位使用者看到骰子街的指令說明

#### Scenario: 大廳策略桌遊分類
- **WHEN** 使用者在大廳看 🧩 策略桌遊
- **THEN** 列表有 🏘️ 骰子街 (`machikoro`) 2～5 人和「開房」按鈕
