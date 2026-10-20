# meme/setup Specification

## Purpose
TBD - created by archiving change add-meme-game. Update Purpose after archive.

## Requirements

### Requirement: 梗圖大亂鬥的房間
梗圖大亂鬥的房間 SHALL 和其他遊戲有相同的操作方式：`/game meme new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game meme start` 開始、`/game meme cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～8 人之間 (bot 也算)。房間公告 SHALL 標示這是梗圖大亂鬥。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 房主開始前離開
- **WHEN** 房主在開始前按「離開」
- **THEN** 房間被取消，頻道公告遊戲已取消

### Requirement: 加入與移除 bot
房主 SHALL 可以在開始前用 `/game meme addbot [數量]` 加入 bot、`/game meme removebot [數量]` 移除 bot (沒寫數量就是 1，從最後加入的移除)。bot 的名字和顯示方式 SHALL 和其他遊戲相同。加 bot 超過 8 人時 SHALL 只加到 8 人並只讓房主看到「房間已滿」。非房主或遊戲開始後使用 SHALL 被拒絕。

#### Scenario: 一個人加 bot
- **WHEN** 房間有 1 位真人，房主輸入 `/game meme addbot 2`
- **THEN** 名單變成 3 人，房主可以開始遊戲

#### Scenario: 加 bot 超過上限
- **WHEN** 房間已有 7 人，房主輸入 `/game meme addbot 3`
- **THEN** 只加入 1 個 bot，只讓房主看到「房間已滿」

### Requirement: 文字卡題庫與發牌
系統 SHALL 內建至少 300 句不重複的繁體中文文字卡，每句 1～30 字。遊戲開始時 SHALL 洗牌並發給每位玩家 7 張。玩家出了一張手牌後 SHALL 從牌庫補 1 張，手牌維持 7 張。牌庫抽完時 SHALL 把出過的牌洗回牌庫再抽。

#### Scenario: 開局發牌
- **WHEN** 4 人開始遊戲
- **THEN** 每人手牌 7 張，所有手牌都不重複

#### Scenario: 出牌後補牌
- **WHEN** 玩家出了一張手牌
- **THEN** 他的手牌少了那一張、多了一張新的，仍然是 7 張

#### Scenario: 牌庫用完
- **WHEN** 要補牌時牌庫是空的
- **THEN** 出過的牌洗回牌庫，再抽一張

### Requirement: 梗圖題庫
系統 SHALL 內建梗圖清單，每張有名稱和圖片網址，來源分成 Imgflip 熱門模板和台灣梗圖兩種，放在同一個檔案裡，新增台灣梗圖只要加一筆名稱和網址。清單 SHALL 至少有 6 張 (夠一局用)。

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
- **THEN** 這一輪的公告顯示「老闆的眼神 (@A 投稿)」和圖片

### Requirement: 開局公告
遊戲開始時，頻道 SHALL 公告遊戲開始、共 6 輪、規則摘要 (每輪看梗圖配一句話：出手牌或自己寫；匿名投票，不能投自己；每得 1 票 +1 分；總分最高的人贏)，接著開始第 1 輪。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲
- **THEN** 頻道公告共 6 輪和規則摘要，接著貼出第 1 輪的梗圖

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出梗圖大亂鬥的名稱 (😂 梗圖大亂鬥)、代號 `meme`、人數 (3～8 人) 和開房方式 `/game meme new`，大廳分類是「😂 派對創意」。輸入 `/game meme help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到梗圖大亂鬥的條列式指令說明 (new、addbot、removebot、start、cancel、write、add、list、remove，以及「🃏 我的手牌」「✍️ 自己寫」按鈕的用法)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game meme help`
- **THEN** 只有這位使用者看到梗圖大亂鬥所有指令的條列說明，包含投稿梗圖的 add、list、remove

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game meme foo`
- **THEN** 只有這位使用者看到梗圖大亂鬥的指令說明
