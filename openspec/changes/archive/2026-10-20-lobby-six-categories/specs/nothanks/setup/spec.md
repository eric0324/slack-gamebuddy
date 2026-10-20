## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出不要謝謝的名稱 (🙅 不要謝謝)、代號 `nothanks`、人數 (3～7 人) 和開房方式 `/game nothanks new`，大廳分類是「🧩 策略桌遊」。輸入 `/game nothanks help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到不要謝謝的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中「🙅 不要謝謝」「✋ 收下」「👀 我的籌碼」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game nothanks help`
- **THEN** 只有這位使用者看到不要謝謝所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game nothanks foo`
- **THEN** 只有這位使用者看到不要謝謝的指令說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🧩 策略桌遊」
- **THEN** 看到不要謝謝 (`nothanks`，3～7 人) 和它的「開房」按鈕
