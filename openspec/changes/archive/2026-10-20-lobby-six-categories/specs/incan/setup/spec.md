## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出印加寶藏的名稱 (💎 印加寶藏)、代號 `incan`、人數 (3～8 人) 和開房方式，大廳分類是 🧩 策略桌遊。輸入 `/game incan help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到印加寶藏的條列式指令說明 (new、addbot、removebot、start、cancel，以及遊戲中用步驟訊息上的「🔦 繼續探險」「⛺ 回營地」按鈕選擇)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game incan help`
- **THEN** 只有這位使用者看到印加寶藏所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game incan dig`
- **THEN** 只有這位使用者看到印加寶藏的指令說明

#### Scenario: 大廳策略桌遊分類
- **WHEN** 使用者在大廳看 🧩 策略桌遊
- **THEN** 列表有 💎 印加寶藏 (`incan`) 3～8 人和「開房」按鈕
