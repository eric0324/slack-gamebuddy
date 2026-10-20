## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出犯人在跳舞的名稱 (🕺 犯人在跳舞)、代號 `criminal`、人數 (3～8 人) 和開房方式 `/game criminal new`，大廳分類是「🎭 吹牛心機」。輸入 `/game criminal help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到犯人在跳舞的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中「🃏 我的手牌」按鈕的用法和各張牌效果的摘要)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game criminal help`
- **THEN** 只有這位使用者看到犯人在跳舞所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game criminal foo`
- **THEN** 只有這位使用者看到犯人在跳舞的指令說明

#### Scenario: 大廳
- **WHEN** 使用者在大廳按「🎭 吹牛心機」
- **THEN** 看到犯人在跳舞 (`criminal`，3～8 人) 和它的「開房」按鈕
