## MODIFIED Requirements

### Requirement: 梗圖題庫
系統 SHALL 內建梗圖清單，每張有名稱和圖片網址，來源分成 Imgflip 熱門模板和台灣梗圖兩種，放在同一個檔案裡，新增台灣梗圖只要加一筆名稱和網址。清單 SHALL 至少有 6 張（夠一局用）。

遊戲開始時，系統 SHALL 決定這局 6 輪的梗圖：從這個頻道的投稿梗圖隨機挑 `min(2, 投稿數)` 張，其餘從內建清單隨機挑，再把 6 張的順序打亂。同一局 SHALL NOT 重複。用到投稿梗圖的那一輪，公告 SHALL 標示投稿者。開局後投稿被刪掉，這一局 SHALL 照樣使用已經選好的梗圖。

#### Scenario: 同一局不重複
- **WHEN** 一局玩完 6 輪
- **THEN** 6 輪的梗圖都不一樣

#### Scenario: 每局最多 2 張投稿
- **WHEN** 頻道有 5 張投稿，開始一局
- **THEN** 6 輪裡剛好 2 輪是投稿梗圖，其他 4 輪是內建梗圖

#### Scenario: 投稿不夠
- **WHEN** 頻道只有 1 張投稿，開始一局
- **THEN** 6 輪裡 1 輪是投稿梗圖，其他 5 輪是內建梗圖

#### Scenario: 沒有投稿
- **WHEN** 頻道沒有投稿，開始一局
- **THEN** 6 輪都是內建梗圖

#### Scenario: 投稿那一輪標示投稿者
- **WHEN** 這一輪是 A 投稿的「老闆的眼神」
- **THEN** 這一輪的公告顯示「老闆的眼神（@A 投稿）」和圖片

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出梗圖大亂鬥的名稱（😂 梗圖大亂鬥）、代號 `meme`、人數（3～8 人）和開房方式 `/game meme new`，大廳分類是「🎲 心理戰」，排在壽司派對後面。輸入 `/game meme help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到梗圖大亂鬥的條列式指令說明（new、addbot、removebot、start、cancel、write、add、list、remove，以及「🃏 我的手牌」「✍️ 自己寫」按鈕的用法）。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game meme help`
- **THEN** 只有這位使用者看到梗圖大亂鬥所有指令的條列說明，包含投稿梗圖的 add、list、remove

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game meme foo`
- **THEN** 只有這位使用者看到梗圖大亂鬥的指令說明
