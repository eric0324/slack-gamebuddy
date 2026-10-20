# insider/setup Specification

## Purpose
TBD - created by archiving change add-insider-game. Update Purpose after archive.

## Requirements

### Requirement: 圈內人的房間
圈內人的房間 SHALL 和其他遊戲有相同的操作方式：`/game insider new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game insider start` 開始、`/game insider cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～8 位真人之間；圈內人 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「圈內人不支援 bot」。房間公告 SHALL 標示這是圈內人。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game insider addbot`
- **THEN** 系統拒絕並只讓房主看到「圈內人不支援 bot」

#### Scenario: 取消
- **WHEN** 遊戲進行中房主輸入 `/game insider cancel`
- **THEN** 遊戲結束，頻道公告已取消和這局的答案，沒有「再來一局」

### Requirement: 角色與答案
遊戲開始時，系統 SHALL 從玩家中隨機選 1 位🎩主持人、1 位🕴️圈內人 (不同人)，其他人是平民，並從詞庫隨機抽 1 個詞當答案。系統 SHALL 私訊每位玩家自己的身分：主持人和圈內人的私訊 SHALL 包含答案，平民的私訊 SHALL NOT 包含答案。頻道 SHALL 公告誰是主持人、問答時間 5 分鐘、怎麼發問 (直接在頻道打字，或 `/game insider ask <問題>`)，SHALL NOT 公告答案或誰是圈內人。

#### Scenario: 分配身分
- **WHEN** 5 人開始遊戲
- **THEN** 剛好 1 位主持人、1 位圈內人、3 位平民，每人都收到身分私訊

#### Scenario: 答案只有主持人和圈內人知道
- **WHEN** 遊戲開始，答案是「企鵝」
- **THEN** 主持人和圈內人的私訊有「企鵝」，平民的私訊和頻道公告都沒有

#### Scenario: 公告主持人
- **WHEN** 遊戲開始，主持人是 A
- **THEN** 頻道公告 A 是主持人，不公告誰是圈內人

### Requirement: 詞庫
答案 SHALL 從截碼戰的詞庫 (`DECRYPTO_WORDS`) 隨機抽。

#### Scenario: 答案來自詞庫
- **WHEN** 遊戲開始
- **THEN** 答案是 `DECRYPTO_WORDS` 裡的一個詞

### Requirement: 大廳與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出圈內人的名稱、代號 `insider`、人數 (4～8 人) 和開房方式，大廳分類是 🔍 身分推理。輸入 `/game insider help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到圈內人的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game insider help`
- **THEN** 只有這位使用者看到圈內人所有指令的條列說明

#### Scenario: 大廳身分推理分類
- **WHEN** 使用者在大廳看 🔍 身分推理
- **THEN** 列表有 🕴️ 圈內人 (`insider`) 4～8 人和「開房」按鈕
