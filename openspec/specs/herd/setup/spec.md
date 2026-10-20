# herd/setup Specification

## Purpose
TBD - created by archiving change add-herd-game. Update Purpose after archive.

## Requirements

### Requirement: 從眾心理的房間
從眾心理的房間 SHALL 和其他遊戲有相同的操作方式：`/game herd new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game herd start` 開始、`/game herd cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～12 位真人之間；從眾心理 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「從眾心理不支援 bot」。房間公告 SHALL 標示這是從眾心理。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 12 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game herd addbot`
- **THEN** 系統拒絕並只讓房主看到「從眾心理不支援 bot」

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道裡有一局進行中的禁語，有人輸入 `/game herd new`
- **THEN** 系統拒絕並只讓他看到「這個頻道已經有遊戲了」

#### Scenario: 開局
- **WHEN** 5 人開始遊戲
- **THEN** 頻道公告從眾心理開始、玩家名單和規則 (跟多數人一樣得 1 分、唯一單獨答案拿🐮粉紅牛、先到 8 分且沒有粉紅牛獲勝、最多 15 題)，接著出第 1 題

### Requirement: 題庫
題目 SHALL 放在獨立的檔案，至少 150 題，都是台灣日常、開放式、容易有主流答案的問題 (例如「最好吃的夜市小吃？」)。每題 SHALL 不空白、去掉前後空白後不變；所有題目 SHALL 不重複。同一個頻道抽到的題目 SHALL NOT 重複，跨局也一樣：新的一局 (`new` 或再來一局) SHALL 接著上一局剩下的題目抽，全部抽完才重新洗牌。剩下的題目只記在記憶體，bot 重啟後重新洗牌。

#### Scenario: 題庫格式
- **WHEN** 檢查題庫
- **THEN** 至少 150 題，每題不空白、前後沒有空白，題目不重複

#### Scenario: 連續幾局也不重複
- **WHEN** 同一個頻道上一局出過一些題目，接著開新的一局
- **THEN** 新的一局不會出現上一局出過的題目，直到全部抽完才重新洗牌

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出從眾心理的名稱 (🐑 從眾心理)、代號 `herd`、人數 (4～12 人)、「不支援 bot」和開房方式，大廳分類是 🎲 心理戰。輸入 `/game herd help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到從眾心理的條列式指令說明 (含 `answer`、`merge`、`done`)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game herd help`
- **THEN** 只有這位使用者看到從眾心理所有指令的條列說明

#### Scenario: 大廳心理戰分類
- **WHEN** 使用者在大廳看 🎲 心理戰
- **THEN** 列表有 🐑 從眾心理 (`herd`) 4～12 人和「開房」按鈕，其他分類沒有從眾心理
