## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出 Emoji 傳話的名稱 (🔗 Emoji 傳話)、代號 `emoji`、人數 (4～10 人)、「不支援 bot」和開房方式，大廳分類是 😂 派對創意。輸入 `/game emoji help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到 Emoji 傳話的條列式指令說明 (new、start、send、cancel、help)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game emoji help`
- **THEN** 只有這位使用者看到 Emoji 傳話所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game emoji foo`
- **THEN** 只有這位使用者看到 Emoji 傳話的指令說明

#### Scenario: 大廳派對創意分類
- **WHEN** 使用者在大廳看 😂 派對創意
- **THEN** 列表有 🔗 Emoji 傳話 (`emoji`) 4～10 人 (不支援 bot) 和「開房」按鈕
