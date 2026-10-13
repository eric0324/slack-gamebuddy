## ADDED Requirements

### Requirement: 變色龍的房間
變色龍的房間 SHALL 和其他遊戲有相同的操作方式：`/game chameleon new` 開房（開房者為房主並自動加入）、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game chameleon start` 開始、`/game chameleon cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～8 位真人之間；變色龍 SHALL NOT 支援 bot，房主輸入 `addbot` 或 `removebot` 時 SHALL 只讓房主看到「變色龍不支援 bot」。房間公告 SHALL 標示這是變色龍。一個頻道同時只能有一局遊戲（不分遊戲種類）。

#### Scenario: 開房
- **WHEN** 使用者 A 輸入 `/game chameleon new`
- **THEN** 頻道出現「變色龍房間（房主 A）」的公告，名單只有 A，並有「加入」「離開」「開始遊戲」按鈕

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「目前 2 人，至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game chameleon addbot`
- **THEN** 系統拒絕並只讓房主看到「變色龍不支援 bot」

#### Scenario: 非房主不能開始
- **WHEN** 房主以外的 B 按「開始遊戲」
- **THEN** 系統拒絕並只讓 B 看到「只有房主可以開始遊戲」

#### Scenario: 取消
- **WHEN** 遊戲進行中房主輸入 `/game chameleon cancel`
- **THEN** 遊戲結束，頻道公告已取消、這局的祕密詞和變色龍是誰，沒有「再來一局」

### Requirement: 主題卡與祕密詞
遊戲開始時，系統 SHALL 從主題卡詞庫隨機抽 1 張主題卡，把 16 個詞依序排成 4×4 格：橫列是 A～D、直行是 1～4（第 1～4 個詞是 A1～A4，第 5～8 個是 B1～B4，依此類推）。系統 SHALL 模擬擲骰，從 16 格中隨機選 1 格當祕密詞。頻道 SHALL 公告主題名稱和完整的 4×4 格（每格顯示座標和詞），讓所有人（包含變色龍）都看得到；SHALL NOT 公告祕密詞或座標。

#### Scenario: 公開主題卡
- **WHEN** 遊戲開始，抽到主題卡「水果」
- **THEN** 頻道公告主題「水果」和 16 個詞的 4×4 格，每格標示 A1～D4 的座標

#### Scenario: 祕密詞在主題卡上
- **WHEN** 遊戲開始
- **THEN** 祕密詞是這張主題卡的 16 個詞之一

### Requirement: 身分
遊戲開始時，系統 SHALL 從玩家中隨機選 1 位🦎變色龍，其他人都是平民。系統 SHALL 私訊每位玩家：平民 SHALL 收到祕密詞和座標（例如「🎲 祕密詞是 B3「香蕉」」）；變色龍 SHALL 收到「你是🦎變色龍，不知道祕密詞」，SHALL NOT 收到祕密詞或座標。頻道 SHALL 公告人數、變色龍有 1 位、說詞的順序和規則，提醒大家查看私訊，SHALL NOT 公告誰是變色龍。

#### Scenario: 分配身分
- **WHEN** 5 人開始遊戲
- **THEN** 剛好 1 位變色龍、4 位平民，每人都收到身分私訊

#### Scenario: 只有平民知道祕密詞
- **WHEN** 遊戲開始，祕密詞是 B3「香蕉」
- **THEN** 平民的私訊有「B3」和「香蕉」，變色龍的私訊和頻道公告都沒有指出祕密詞

### Requirement: 主題卡詞庫
主題卡詞庫 SHALL 放在獨立的檔案，至少有 30 張主題卡。每張主題卡 SHALL 有主題名稱和剛好 16 個詞；詞 SHALL NOT 是空白，同一張主題卡裡的詞 SHALL NOT 重複；主題名稱 SHALL NOT 重複。

#### Scenario: 詞庫格式
- **WHEN** 檢查詞庫
- **THEN** 至少 30 張主題卡，每張剛好 16 個不空白、不重複的詞，主題名稱都不同

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出變色龍的名稱、代號 `chameleon`、人數（3～8 人）和開房方式，大廳分類是 🔍 推理。輸入 `/game chameleon help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到變色龍的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game chameleon help`
- **THEN** 只有這位使用者看到變色龍所有指令的條列說明

#### Scenario: 大廳推理分類
- **WHEN** 使用者在大廳看 🔍 推理
- **THEN** 列表有 🦎 變色龍（`chameleon`）3～8 人和「開房」按鈕
