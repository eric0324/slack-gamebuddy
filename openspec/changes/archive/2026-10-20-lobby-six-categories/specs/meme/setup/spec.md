## REMOVED Requirements

### Requirement: 遊戲清單與指令說明
**Reason**: 大廳分類從 4 類改成 6 類，情境標題跟著改，所以改寫成新的 requirement。
**Migration**: 內容移到「大廳與指令說明」，只有大廳分類不同。

## ADDED Requirements

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出梗圖大亂鬥的名稱 (😂 梗圖大亂鬥)、代號 `meme`、人數 (3～8 人) 和開房方式 `/game meme new`，大廳分類是「😂 派對創意」。輸入 `/game meme help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到梗圖大亂鬥的條列式指令說明 (new、addbot、removebot、start、cancel、write、add、list、remove，以及「🃏 我的手牌」「✍️ 自己寫」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game meme help`
- **THEN** 只有這位使用者看到梗圖大亂鬥所有指令的條列說明，包含投稿梗圖的 add、list、remove

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game meme foo`
- **THEN** 只有這位使用者看到梗圖大亂鬥的指令說明
