## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出矮人礦坑的名稱 (⛏️ 矮人礦坑)、代號 `saboteur`、人數 (3～10 人) 和開房方式，大廳分類是 🔍 身分推理。輸入 `/game saboteur help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到矮人礦坑的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用回合面板上的「⛏️ 行動」「🎒 我的手牌」按鈕操作)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game saboteur help`
- **THEN** 只有這位使用者看到矮人礦坑所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game saboteur dig`
- **THEN** 只有這位使用者看到矮人礦坑的指令說明

#### Scenario: 大廳身分推理分類
- **WHEN** 使用者在大廳看 🔍 身分推理
- **THEN** 列表有 ⛏️ 矮人礦坑 (`saboteur`) 3～10 人和「開房」按鈕
