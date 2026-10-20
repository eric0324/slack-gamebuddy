## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出猜猜看的名稱 (💰 猜猜看)、代號 `wager`、人數 (3～10 人)、「不支援 bot」和開房方式，大廳分類是 😂 派對創意。輸入 `/game wager help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到猜猜看的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game wager help`
- **THEN** 只有這位使用者看到猜猜看所有指令的條列說明

#### Scenario: 大廳派對創意分類
- **WHEN** 使用者在大廳看 😂 派對創意
- **THEN** 列表有 💰 猜猜看 (`wager`) 3～10 人和「開房」按鈕
