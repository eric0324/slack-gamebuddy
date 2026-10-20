## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出詭影神探的名稱 (🔎 詭影神探)、代號 `deception`、人數 (4～12 人)、「不支援 bot」和開房方式，大廳分類是 🔍 身分推理。輸入 `/game deception help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到詭影神探的條列式指令說明 (new、start、cancel，以及遊戲中用回合面板上的「🧪 鑑識官放子彈」「✅ 說完了」「🔍 破案」「🗂️ 我的身分」按鈕操作、討論直接在頻道打字)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game deception help`
- **THEN** 只有這位使用者看到詭影神探所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game deception kill`
- **THEN** 只有這位使用者看到詭影神探的指令說明

#### Scenario: 大廳身分推理分類
- **WHEN** 使用者在大廳看 🔍 身分推理
- **THEN** 列表有 🔎 詭影神探 (`deception`) 4～12 人和「開房」按鈕
