# math/setup Specification

## Purpose
口算擂台 (Math Duel) 的房間、設定面板、大廳資訊、指令說明與語系：讓 2～8 位真人在 Slack 頻道比賽心算的速度和準確度。

## Requirements

### Requirement: 口算擂台的房間
口算擂台的房間 SHALL 和其他遊戲有相同的操作方式：`/game math new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game math start` 開始、`/game math cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 2～8 位真人之間；口算擂台 SHALL NOT 支援 bot，房主輸入 `addbot` 或 `removebot` 時 SHALL 只讓房主看到「口算擂台不支援 bot」，名單不變。房間公告 SHALL 標示這是口算擂台。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有房主 1 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 2 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game math addbot`
- **THEN** 系統拒絕並只讓房主看到「口算擂台不支援 bot」，名單不變

### Requirement: 設定面板
房主按開始後，頻道 SHALL 公告玩家名單和規則摘要 (每題 10 秒、地獄 20 秒、按了不能改、答對 10 分、越早答對加分越多)，並貼出設定面板：模式 (分數比大小、四則運算)、難度 (簡單、普通、困難、地獄)、題數 (10、15、20) 的按鈕，目前選到的項目 SHALL 標示 ✅，另有「▶️ 開始出題」按鈕。預設是四則運算、普通、10 題。房主按設定按鈕 SHALL 原地更新面板；房主也 SHALL 可以用 `/game math set <設定>…` 一次改多項 (例如 `set 分數 困難 20`，不認識的字 SHALL 只讓他看到可用的設定)。只有房主 SHALL 可以改設定和開始出題，其他人按 SHALL 被拒並只讓他看到「只有房主可以調整設定」。房主按「▶️ 開始出題」(或 `/game math go`) 或 60 秒到時 SHALL 用目前設定開始，頻道公告這局的設定並出第 1 題。

#### Scenario: 改設定
- **WHEN** 房主依序按「分數比大小」「困難」「15 題」
- **THEN** 面板原地更新，這三項標示 ✅

#### Scenario: 選地獄
- **WHEN** 房主按「地獄」
- **THEN** 面板原地更新，地獄標示 ✅，這局每題 20 秒

#### Scenario: 指令改設定
- **WHEN** 房主輸入 `/game math set 分數 困難 20`
- **THEN** 設定變成分數比大小、困難、20 題，面板原地更新

#### Scenario: 非房主改設定
- **WHEN** 不是房主的 B 按「困難」
- **THEN** 系統拒絕並只讓 B 看到「只有房主可以調整設定」，設定不變

#### Scenario: 設定逾時
- **WHEN** 60 秒內房主都沒按開始出題
- **THEN** 用目前的設定開始出第 1 題

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出口算擂台的名稱 (🧮 口算擂台)、代號 `math`、人數 (2～8 人)、「不支援 bot」、一句介紹和開房方式，大廳分類是 😂 派對創意。輸入 `/game math help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到口算擂台的條列式指令說明 (含 `new`、`start`、`set`、`go`、`answer`、`cancel`)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game math help`
- **THEN** 只有這位使用者看到口算擂台所有指令的條列說明

### Requirement: 口算擂台的語系
口算擂台 SHALL 有繁體中文和英文兩種翻譯：英文頻道開的局，大廳的名稱 (Math Duel)、人數、介紹、指令說明、設定面板和所有遊戲訊息 SHALL 用英文，不加「(中文)」標示。英文局的 `set` SHALL 接受英文設定名稱 (fractions、arithmetic、easy、normal、hard、hell、10、15、20，不分大小寫)。

#### Scenario: 英文頻道的大廳
- **WHEN** 英文頻道輸入 `/game` 並按「😂 Party」
- **THEN** 列出 🧮 Math Duel (`math`) 和英文的人數、介紹，名稱後沒有「(中文)」

#### Scenario: 英文頻道玩一局
- **WHEN** 英文頻道開一局口算擂台並開始
- **THEN** 設定面板、題目、揭曉和結算都是英文
