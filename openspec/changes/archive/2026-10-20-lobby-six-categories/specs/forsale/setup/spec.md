## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出地產大亨的名稱 (🏠 地產大亨)、代號 `forsale`、人數 (3～6 人) 和開房方式，大廳分類是 🧩 策略桌遊。輸入 `/game forsale help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到地產大亨的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用面板上的按鈕出價、放棄、選房產和查看自己的狀態)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game forsale help`
- **THEN** 只有這位使用者看到地產大亨所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game forsale buy`
- **THEN** 只有這位使用者看到地產大亨的指令說明
