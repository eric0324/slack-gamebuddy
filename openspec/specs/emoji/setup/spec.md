# emoji/setup Specification

## Purpose
TBD - created by archiving change add-emoji-game. Update Purpose after archive.

## Requirements

### Requirement: Emoji 傳話的房間
Emoji 傳話的房間 SHALL 和其他遊戲有相同的操作方式：`/game emoji new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game emoji start` 開始、`/game emoji cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～10 位真人之間；Emoji 傳話 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「Emoji 傳話不支援 bot」。房間公告 SHALL 標示這是 Emoji 傳話。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 10 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game emoji addbot`
- **THEN** 系統拒絕並只讓房主看到「Emoji 傳話不支援 bot」

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道裡有一局進行中的猜猜看，有人輸入 `/game emoji new`
- **THEN** 系統拒絕並只讓他看到「這個頻道已經有遊戲了」

### Requirement: 開局與發題
遊戲開始時，系統 SHALL 從題庫發給每位玩家一個題目 (同一局 SHALL NOT 重複)，這個題目是這位玩家那條鏈的起點，題目 SHALL NOT 在頻道公開。傳遞順序 SHALL 是加入順序。步數 K SHALL 是：人數是偶數時等於人數，奇數時等於人數－1。頻道 SHALL 公告玩家、傳遞順序 (例如「A → B → C → D → A」)、步數和規則摘要 (奇數步看文字只能用 emoji 描述、偶數步看 emoji 用文字猜；傳完一起看每條鏈怎麼走鐘，再投最佳 emoji 和最神猜測，每得 1 票 +1 分)，每位玩家從 0 分開始，接著 SHALL 開始第 1 步。

#### Scenario: 4 人開局
- **WHEN** A、B、C、D 依序加入後開始遊戲
- **THEN** 每人拿到一個不重複的題目，頻道公告傳遞順序 A → B → C → D → A、共 4 步和規則摘要，沒有出現任何題目，然後開始第 1 步

#### Scenario: 奇數人數
- **WHEN** 5 人開始遊戲
- **THEN** 共 4 步

### Requirement: 題庫
題目 SHALL 放在獨立的檔案，至少 150 題，每題是 2～12 字、適合用 emoji 表達的繁體中文詞或短句，分類包含成語、電影影視、食物、台灣日常、動作職業；題目 SHALL 不空白且不重複。同一個頻道出過的題目 SHALL NOT 重複，跨局也一樣：新的一局 (`new` 或再來一局) SHALL 接著上一局剩下的題目發，剩下的不夠時先發完剩下的，再把全部題目重新洗牌 (排除這局已經發的) 補足；剩下的題目只記在記憶體，bot 重啟後重新洗牌。

#### Scenario: 題庫格式
- **WHEN** 檢查題庫
- **THEN** 至少 150 題，題目不重複，每題 2～12 字

#### Scenario: 連續幾局也不重複
- **WHEN** 同一個頻道上一局 4 人發過 4 題，接著開新的一局
- **THEN** 新的一局不會發到上一局發過的題目，直到全部發完才重新洗牌

#### Scenario: 剩下的題目不夠
- **WHEN** 題庫只剩 2 題沒發，6 人開始遊戲
- **THEN** 先發這 2 題，其他 4 題從重新洗牌的題庫發，6 題互不重複

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
