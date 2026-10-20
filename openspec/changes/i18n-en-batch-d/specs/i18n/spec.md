## ADDED Requirements

### Requirement: 富饒之城的英文版
富饒之城 SHALL 有英文翻譯：英文名稱 Citadels，人數「4-7 players」。英文局的公告、prompt、按鈕、私下訊息和指令說明 SHALL 是英文；角色 SHALL 用原版英文名稱 (Assassin、Thief、Magician、King、Bishop、Merchant、Architect、Warlord)，地區卡 SHALL 用原版英文名稱 (例如 Manor、Castle、Thieves' Guild)。中文局 SHALL 和原本完全一樣。

#### Scenario: 英文局選角色
- **WHEN** 英文頻道開一局富饒之城並開始
- **THEN** 公告和選角色的 prompt 是英文，角色按鈕顯示 Assassin、Thief 等英文名稱

#### Scenario: 英文指令說明
- **WHEN** 英文頻道輸入 `/game citadels help`
- **THEN** 只有輸入的人看到英文的指令說明

### Requirement: 骰子街的英文版
骰子街 SHALL 有英文翻譯：英文名稱 Machi Koro，人數「2-5 players」。英文局的公告、prompt、按鈕、私下訊息和指令說明 SHALL 是英文；建築和地標 SHALL 用原版英文名稱 (例如 Wheat Field、Bakery、Train Station、Radio Tower)。中文局 SHALL 和原本完全一樣。

#### Scenario: 英文局擲骰
- **WHEN** 英文頻道開一局骰子街並開始
- **THEN** 輪到誰、擲骰的 prompt 和按鈕是英文，建築和地標用英文名稱

### Requirement: 璀璨寶石的英文版
璀璨寶石 SHALL 有英文翻譯：英文名稱 Splendor，人數「2-4 players」。英文局的公告、prompt、按鈕、私下訊息和指令說明 SHALL 是英文；寶石顏色 SHALL 用英文 (White、Blue、Green、Red、Black、Gold)。中文局 SHALL 和原本完全一樣。

#### Scenario: 英文局的行動選單
- **WHEN** 英文頻道開一局璀璨寶石，輪到某位玩家按行動
- **THEN** 行動選單的文字和按鈕是英文，寶石顏色用英文

### Requirement: 詭影神探的英文版
詭影神探 SHALL 有英文翻譯：英文名稱 Deception，人數「4-12 players」。英文局的公告、prompt、按鈕、私下訊息和指令說明 SHALL 是英文；手段卡、線索卡詞庫和提示板 SHALL 取英文版，英文版的數量和中文版相同。

#### Scenario: 英文局發牌
- **WHEN** 英文頻道開一局詭影神探並開始
- **THEN** 每位玩家的手段卡和線索卡是英文詞，公告和按鈕是英文

#### Scenario: 中文局不受影響
- **WHEN** 中文頻道開一局詭影神探
- **THEN** 詞庫、訊息和按鈕都和原本一樣是繁體中文
