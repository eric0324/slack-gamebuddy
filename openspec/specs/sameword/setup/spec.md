# sameword/setup Specification

## Purpose
同詞相遇 (Same Word) 的房間、開局、大廳資訊、指令說明與語系：讓 3～10 位真人在 Slack 頻道開一局合作的詞語聯想遊戲。

## Requirements

### Requirement: 同詞相遇的房間
同詞相遇的房間 SHALL 和其他遊戲有相同的操作方式：`/game sameword new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game sameword start` 開始、`/game sameword cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～10 位真人之間；同詞相遇 SHALL NOT 支援 bot，房主輸入 `addbot` 或 `removebot` 時 SHALL 只讓房主看到「同詞相遇不支援 bot」，名單不變。房間公告 SHALL 標示這是同詞相遇。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 10 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game sameword addbot`
- **THEN** 系統拒絕並只讓房主看到「同詞相遇不支援 bot」，名單不變

#### Scenario: 非房主開始
- **WHEN** 不是房主的 B 按下開始
- **THEN** 系統拒絕並只讓 B 看到「只有房主可以開始遊戲」

#### Scenario: 開局
- **WHEN** 4 人開始遊戲
- **THEN** 頻道公告同詞相遇開始、玩家名單和規則 (各自寫詞一起揭曉、沿著上一輪的詞繼續聯想、出現過的詞不能再寫、所有人寫出同一個詞就相遇成功、房主可以判定意思一樣的詞算相同、最多 10 輪)，接著開始第 1 輪

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出同詞相遇的名稱 (💞 同詞相遇)、代號 `sameword`、人數 (3～10 人)、「不支援 bot」、一句介紹和開房方式，大廳分類是 🤝 合作。輸入 `/game sameword help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到同詞相遇的條列式指令說明 (含 `new`、`start`、`word`、`same`、`next`、`cancel`)。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game sameword help`
- **THEN** 只有這位使用者看到同詞相遇所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game sameword abc`
- **THEN** 只有這位使用者看到同詞相遇的指令說明

### Requirement: 同詞相遇的語系
同詞相遇 SHALL 有繁體中文和英文兩種翻譯：英文頻道開的局，大廳的名稱 (Same Word)、人數、介紹、指令說明、寫詞視窗和所有遊戲訊息 SHALL 用英文，不加「(中文)」標示；中文頻道一律用繁體中文。

#### Scenario: 英文頻道的大廳
- **WHEN** 英文頻道輸入 `/game` 並按「🤝 Co-op」
- **THEN** 列出 💞 Same Word (`sameword`) 和英文的人數、介紹，名稱後沒有「(中文)」

#### Scenario: 英文頻道玩一局
- **WHEN** 英文頻道開一局同詞相遇並開始
- **THEN** 開局公告、寫詞面板和揭曉訊息都是英文
