## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出誰是牛頭王的名稱 (🐮 誰是牛頭王)、代號 `nimmt`、人數 (2～10 人) 和開房方式，大廳分類是「🧩 策略桌遊」。輸入 `/game nimmt help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到誰是牛頭王的條列式指令說明 (new、addbot、removebot、start、play、cancel，以及「🃏 選牌」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game nimmt help`
- **THEN** 只有這位使用者看到誰是牛頭王所有指令的條列說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🧩 策略桌遊」
- **THEN** 看到誰是牛頭王 (`nimmt`，2～10 人) 和它的「開房」按鈕
