## MODIFIED Requirements

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出矮人礦坑的名稱（⛏️ 矮人礦坑）、代號 `saboteur`、人數（3～10 人）和開房方式，大廳分類是 🔍 推理。輸入 `/game saboteur help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到矮人礦坑的條列式指令說明（new、addbot、removebot、start、cancel，以及遊戲中用回合面板上的「⛏️ 行動」「🎒 我的手牌」按鈕操作）。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game saboteur help`
- **THEN** 只有這位使用者看到矮人礦坑所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game saboteur dig`
- **THEN** 只有這位使用者看到矮人礦坑的指令說明

#### Scenario: 大廳推理分類
- **WHEN** 使用者在大廳看 🔍 推理
- **THEN** 列表有 ⛏️ 矮人礦坑（`saboteur`）3～10 人和「開房」按鈕
