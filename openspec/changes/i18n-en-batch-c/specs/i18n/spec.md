## ADDED Requirements

### Requirement: 花火的英文版
花火 SHALL 有英文翻譯：英文名稱 Hanabi、人數「2-5 players」。英文局的公告、輪到誰的提示、提示內容、看牌／出牌／棄牌和「Give a hint」等按鈕、私下訊息和指令說明 SHALL 是英文。英文局的 `hint` 指令 SHALL 接受英文顏色 (red、yellow、green、blue、white)。

#### Scenario: 英文局的花火
- **WHEN** 英文頻道開一局花火並開始
- **THEN** 公告、輪到誰的提示和按鈕都是英文，房間公告顯示 Hanabi

#### Scenario: 英文顏色的提示
- **WHEN** 英文局輪到的玩家輸入 `/game hanabi hint @某人 red`
- **THEN** 系統給對方紅色的提示，公告用英文

### Requirement: 星際探險隊的英文版
星際探險隊 SHALL 有英文翻譯：英文名稱 The Crew、人數「3-5 players」。英文局的公告、牌桌、出牌和通訊的按鈕、任務名稱和劇情、關卡規則、結束時「Keep going?」的按鈕和指令說明 SHALL 是英文。

#### Scenario: 英文局的任務
- **WHEN** 英文頻道開一局星際探險隊並開始
- **THEN** 任務名稱、劇情、牌桌和按鈕都是英文

### Requirement: 阿瓦隆的英文版
阿瓦隆 SHALL 有英文翻譯：英文名稱 Avalon、人數「5-10 players」，角色用原版英文名稱 (Merlin、Percival、Loyal Servant of Arthur、Assassin、Morgana、Minion of Mordred)。英文局的公告、身分私訊、組隊、投票、任務、刺殺的 prompt 和按鈕、bot 台詞和指令說明 SHALL 是英文。

#### Scenario: 英文局的阿瓦隆
- **WHEN** 英文頻道開一局阿瓦隆並開始
- **THEN** 每個人收到英文的身分私訊 (例如 Merlin)，組隊和投票的按鈕 (例如 👍 Approve／👎 Reject) 是英文

### Requirement: 矮人礦坑的英文版
矮人礦坑 SHALL 有英文翻譯：英文名稱 Saboteur、人數「3-10 players」，身分是 Gold-Digger 和 Saboteur。英文局的公告、身分私訊、回合面板和出牌按鈕、卡名 (例如 Break Pick、Map、Rockfall)、手牌和指令說明 SHALL 是英文。

#### Scenario: 英文局的手牌
- **WHEN** 英文局的玩家按「🎒 My hand」
- **THEN** 他看到英文的身分、卡名和壞掉的工具

### Requirement: 圈內人的英文版
圈內人 SHALL 有英文翻譯：英文名稱 Insider、人數「4-8 players」，角色是 Master、Insider、Commons。英文局的公告、身分私訊、主持人的回答按鈕、投票和指令說明 SHALL 是英文。題目詞庫 SHALL 有英文版，數量和中文版相同 (一對一翻譯，翻不通的換成意思接近的英文常用詞)，英文局 SHALL 從英文詞庫出題。

#### Scenario: 英文局的題目
- **WHEN** 英文頻道開一局圈內人並開始
- **THEN** 主持人和圈內人收到的題目是英文詞庫裡的詞，私訊和按鈕都是英文

### Requirement: 狼人殺的英文版
狼人殺 SHALL 有英文翻譯：英文名稱 Werewolf、人數「6-12 players」，角色是 Werewolf、Wolf King、Seer、Witch、Knight、Villager。狼人殺的每一局 SHALL 記住開房時的頻道語系。英文局的房間公告 (規則連結指向「Werewolf-Rules」)、房間回覆、開局公告、身分私訊、狼人私訊、夜晚和白天的 prompt 與按鈕、bot 的發言台詞和結算 SHALL 是英文；英文局 bot SHALL 用英文句型解讀真人在頻道的發言 (例如「I'm the seer」「@X is a wolf」)。英文頻道的 `/werewolf help`、`/game werewolf help` 和 `/werewolf stats` SHALL 是英文。

#### Scenario: 英文局的狼人殺
- **WHEN** 英文頻道開一局狼人殺並開始
- **THEN** 開局公告、身分私訊、夜晚的「Choose a player to kill tonight.」和「No kill」按鈕都是英文，房間公告顯示 Werewolf

#### Scenario: 和 bot 玩完英文局
- **WHEN** 英文局的狼人殺和 bot 一起玩到結束
- **THEN** 所有公告、prompt、按鈕和 bot 台詞都沒有中文，結束時出現「Play again」

#### Scenario: 英文頻道的狼人殺說明
- **WHEN** 英文頻道輸入 `/werewolf help`
- **THEN** 只有輸入的人看到英文的指令說明，附上 Werewolf-Commands 和 Werewolf-Rules 的連結
