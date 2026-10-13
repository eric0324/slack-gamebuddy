# decrypto/setup Specification

## Purpose
TBD - created by archiving change add-decrypto-game. Update Purpose after archive.

## Requirements

### Requirement: 截碼戰的房間
截碼戰的房間 SHALL 和其他遊戲有相同的操作方式：`/game decrypto new` 開房（開房者為房主並自動加入）、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game decrypto start` 開始、`/game decrypto cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～12 位真人之間；截碼戰 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「截碼戰不支援 bot」。房間公告 SHALL 標示這是截碼戰。一個頻道同時只能有一局遊戲（不分遊戲種類）。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 12 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game decrypto addbot`
- **THEN** 系統拒絕並只讓房主看到「截碼戰不支援 bot」

### Requirement: 分隊與祕密詞
遊戲開始時，系統 SHALL 把玩家隨機分成⚫黑隊和⚪白隊（人數相差最多 1 人），並為每隊抽 4 個祕密詞（編號 1～4），兩隊共 8 個詞不重複。系統 SHALL 私訊每位玩家自己隊的 4 個詞和編號，SHALL NOT 讓他看到對方隊的詞。每隊內的加密者順序 SHALL 隨機決定，每回合換下一位，輪完再從頭開始。頻道 SHALL 公告兩隊成員。

#### Scenario: 5 人分隊
- **WHEN** 5 人開始遊戲
- **THEN** 一隊 3 人、一隊 2 人，每人私訊收到自己隊的 4 個詞

#### Scenario: 祕密詞不外洩
- **WHEN** 遊戲開始
- **THEN** 頻道公告和對方隊的私訊都不包含這隊的祕密詞

#### Scenario: 加密者輪替
- **WHEN** 黑隊有 A、B 兩人，第 1 回合 A 加密
- **THEN** 第 2 回合 B 加密，第 3 回合又是 A

### Requirement: 詞庫
祕密詞 SHALL 從詞庫隨機抽。詞庫 SHALL 至少有 120 個詞，每個詞都是不空白、不重複的中文名詞。

#### Scenario: 格式
- **WHEN** 檢查詞庫
- **THEN** 至少 120 個詞，沒有空白和重複

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出截碼戰的名稱、代號 `decrypto`、人數（4～12 人）和開房方式。輸入 `/game decrypto help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到截碼戰的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game decrypto help`
- **THEN** 只有這位使用者看到截碼戰所有指令的條列說明
