## ADDED Requirements

### Requirement: 蟑螂撲克的英文版
英文房間的蟑螂撲克 SHALL 顯示英文名稱「Cockroach Poker」，輪到誰出牌、收到牌的提問、偷看再傳、結算等公告和 prompt，以及出牌、是／不是、偷看再傳、我的手牌等按鈕 SHALL 是英文，卡牌用原版英文名稱 (Cockroach、Rat、Fly、Scorpion、Stink Bug、Spider、Toad、Bat)；指令說明 SHALL 是英文。

#### Scenario: 英文局出牌
- **WHEN** 英文頻道的蟑螂撲克開始遊戲
- **THEN** 輪到誰出牌的公告和出牌、我的手牌按鈕是英文

#### Scenario: 英文指令說明
- **WHEN** 英文頻道輸入 `/game cockroach help`
- **THEN** 只有輸入的人看到英文的指令說明

### Requirement: 炸彈貓的英文版
英文房間的炸彈貓 SHALL 顯示英文名稱「Exploding Kittens」，輪到誰、出牌、抽牌、爆炸與拆除等公告和 prompt，以及出牌、抽牌、我的手牌等按鈕 SHALL 是英文，卡牌用原版英文名稱 (Exploding Kitten、Defuse、Nope、Attack、Skip、Favor、Shuffle、See the Future 等)；指令說明 SHALL 是英文。

#### Scenario: 英文局輪到出牌
- **WHEN** 英文頻道的炸彈貓開始遊戲
- **THEN** 輪到誰的公告、按鈕和私下看到的手牌都是英文

### Requirement: 壽司派對的英文版
英文房間的壽司派對 SHALL 顯示英文名稱「Sushi Go!」，選牌的 prompt、每回合和遊戲結束的計分公告，以及選牌按鈕 SHALL 是英文，卡牌用原版英文名稱 (Tempura、Sashimi、Dumpling、Maki Roll、Nigiri、Wasabi、Pudding、Chopsticks)；指令說明 SHALL 是英文。

#### Scenario: 英文局選牌
- **WHEN** 英文頻道的壽司派對開始遊戲
- **THEN** 選牌的 prompt 和按鈕是英文，卡牌顯示英文名稱

### Requirement: 印加寶藏的英文版
英文房間的印加寶藏 SHALL 顯示英文名稱「Incan Gold」，翻開的卡、繼續探險或回營地的選擇、危險和神器、回合與遊戲結束等公告和按鈕 SHALL 是英文；指令說明 SHALL 是英文。

#### Scenario: 英文局探險
- **WHEN** 英文頻道的印加寶藏開始遊戲
- **THEN** 翻牌公告和繼續探險、回營地的按鈕是英文

### Requirement: 地產大亨的英文版
英文房間的地產大亨 SHALL 顯示英文名稱「For Sale」，買房階段的出價和放棄、賣房階段的出牌、結算等公告、prompt 和按鈕 SHALL 是英文；指令說明 SHALL 是英文。

#### Scenario: 英文局出價
- **WHEN** 英文頻道的地產大亨開始遊戲
- **THEN** 買房階段的公告和出價、放棄按鈕是英文

### Requirement: 犯人在跳舞的英文版
英文房間的犯人在跳舞 SHALL 顯示英文名稱「Criminal Dance」，輪到誰出牌、卡牌效果、結算等公告和 prompt，以及出牌和選人按鈕 SHALL 是英文，卡牌用原版英文名稱 (First Discoverer、Culprit、Detective、Alibi、Accomplice、Witness 等)；指令說明 SHALL 是英文。

#### Scenario: 英文局出牌
- **WHEN** 英文頻道的犯人在跳舞開始遊戲
- **THEN** 輪到誰出牌的公告、出牌按鈕和私下看到的手牌是英文
