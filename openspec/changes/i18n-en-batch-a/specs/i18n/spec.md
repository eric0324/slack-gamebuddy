## ADDED Requirements

### Requirement: 吹牛骰的英文版
吹牛骰 SHALL 有英文翻譯：英文名稱是「Liar's Dice」，人數「2-8 players」。英文房間的回合公告、骰子 DM、喊數提示、喊數與開的公告、錯誤回覆和勝負公告 SHALL 是英文，「開！」按鈕 SHALL 顯示「Liar!」，`/game liarsdice help` SHALL 顯示英文指令說明。

#### Scenario: 英文局喊數
- **WHEN** 英文房間的吹牛骰開始，輪到的人喊「2 個 3」
- **THEN** 頻道用英文公告回合和喊數 (例如「bids "2 × 3"」)，下一位看到英文的提示和「Liar!」按鈕，每個人收到英文的骰子 DM

### Requirement: 政變的英文版
政變 SHALL 有英文翻譯：英文名稱是「Coup」，人數「3-6 players」。角色名稱 SHALL 用官方英文名 (Duke、Assassin、Captain、Ambassador、Contessa)。英文房間的開局公告、手牌 DM、行動按鈕 (例如「💰 Income +1」「👑 Tax +3 (Duke)」)、宣稱、質疑 (Challenge)、阻擋 (Block with …)、翻牌 (Reveal …) 和勝負公告 SHALL 是英文，`/game coup help` SHALL 顯示英文指令說明。

#### Scenario: 英文局宣稱角色
- **WHEN** 英文房間的政變輪到某人，他選擇收稅
- **THEN** 頻道用英文公告他宣稱 Duke，其他人看到英文的「Challenge」按鈕

### Requirement: 骷髏與玫瑰的英文版
骷髏與玫瑰 SHALL 有英文翻譯：英文名稱是「Skull」，人數「3-6 players」。英文房間的開局公告、規則 DM、蓋牌按鈕 (例如「🌹 Place a Rose」「💀 Place the Skull」)、喊數 (「📢 Challenge」)、放棄 (「🙅 Pass」)、翻牌、挑戰成功或失敗、失去一張牌的 DM 和勝負公告 SHALL 是英文，`/game skull help` SHALL 顯示英文指令說明。

#### Scenario: 英文局挑戰失敗
- **WHEN** 英文房間的骷髏與玫瑰有人挑戰時翻到骷髏
- **THEN** 頻道用英文公告挑戰失敗，挑戰的人收到英文 DM 說明失去了哪一張牌和剩下的牌

### Requirement: 誰是牛頭王的英文版
誰是牛頭王 SHALL 有英文翻譯：英文名稱是「6 nimmt!」，人數「2-10 players」。英文房間的開局公告、牌桌、手牌 DM、選牌按鈕 (「🃏 Pick a card」)、揭曉、選列按鈕 (例如「Row 1」)、收牌公告和勝負公告 SHALL 是英文，`/game nimmt help` SHALL 顯示英文指令說明。

#### Scenario: 英文局收牌
- **WHEN** 英文房間的誰是牛頭王揭曉後，有人出的牌比每一列的尾牌都小
- **THEN** 他看到英文的選列提示和選列按鈕，頻道用英文公告他收走哪一列和幾個牛頭

### Requirement: 不要謝謝的英文版
不要謝謝 SHALL 有英文翻譯：英文名稱是「No Thanks!」，人數「3-7 players」。英文房間的開場公告、規則 DM、牌桌訊息、按鈕 (「🙅 No thanks!」「✋ Take」「👀 My chips」)、收牌公告、錯誤回覆和結算 SHALL 是英文，`/game nothanks help` SHALL 顯示英文指令說明。

#### Scenario: 英文局的牌桌
- **WHEN** 英文房間的不要謝謝開始
- **THEN** 頻道用英文公告開場和牌桌 (例如「🃏 Card 1: …」)，牌桌按鈕是「🙅 No thanks!」「✋ Take」「👀 My chips」

### Requirement: 情書的英文版
情書 SHALL 有英文翻譯：英文名稱是「Love Letter」，人數「2-6 players」。卡牌名稱 SHALL 用官方英文名 (Spy、Guard、Priest、Baron、Handmaid、Prince、Chancellor、King、Countess、Princess)。英文房間的回合公告、手牌 DM (含卡牌說明)、按鈕 (「🃏 Play」「👀 My hand」「📜 Discards」)、出牌選單、衛兵猜牌、出牌效果、棄牌紀錄、錯誤回覆和勝負公告 SHALL 是英文，`/game loveletter help` SHALL 顯示英文指令說明。

#### Scenario: 英文局出牌
- **WHEN** 英文房間的情書輪到某人，他按「🃏 Play」並打出衛兵猜中對方
- **THEN** 他看到英文的出牌選單 (例如「1 Guard」)，頻道用英文公告「plays 1 Guard」和猜中的結果
