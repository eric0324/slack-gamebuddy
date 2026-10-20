# i18n Specification

## Purpose
讓 bot 可以用不同語言跟玩家互動：每個頻道設定一種語系，大廳、房間和共用訊息照語系顯示；各遊戲翻譯好之後才切換成該語言，還沒翻譯的遊戲照樣可以玩 (用中文)。

## Requirements

### Requirement: 支援的語系
系統 SHALL 支援這些語系：`zh-TW` (繁體中文，預設) 和 `en` (英文)。沒有設定過語系的頻道 SHALL 使用 `zh-TW`。其他 spec 描述的訊息文字是 `zh-TW` 頻道的樣子；`en` 頻道顯示對應的英文。某段文字沒有英文翻譯時 SHALL 退回 `zh-TW`，SHALL NOT 顯示翻譯用的代號或空白。

#### Scenario: 沒設定過的頻道
- **WHEN** 一個從沒設定過語系的頻道輸入 `/game`
- **THEN** 大廳用繁體中文顯示，和現在一樣

#### Scenario: 缺少翻譯時退回中文
- **WHEN** 英文頻道裡某段文字還沒有英文翻譯
- **THEN** 那段文字顯示繁體中文，不會出現翻譯代號

### Requirement: 頻道語系指令
任何人 SHALL 可以在頻道輸入 `/game lang` 查看這個頻道目前的語系和所有可選的語系 (只讓輸入的人看到)。輸入 `/game lang <語系>` (例如 `/game lang en`、`/game lang zh-TW`，不分大小寫) 時，系統 SHALL 把這個頻道的語系改成指定的語系，並在頻道公告「@某人 把這個頻道的語言改成 English」(公告用新的語系)。輸入不支援的語系時 SHALL 拒絕，只讓輸入的人看到可選的語系。

#### Scenario: 查看語系
- **WHEN** 使用者在沒設定過的頻道輸入 `/game lang`
- **THEN** 只有他看到目前是繁體中文，以及可選的 `zh-TW`、`en`

#### Scenario: 改成英文
- **WHEN** 使用者 A 輸入 `/game lang en`
- **THEN** 這個頻道的語系變成英文，頻道公告 A 把語言改成 English (用英文)

#### Scenario: 不支援的語系
- **WHEN** 使用者輸入 `/game lang fr`
- **THEN** 系統拒絕，只讓他看到可選的 `zh-TW`、`en`，頻道語系不變

### Requirement: 語系保存
頻道語系 SHALL 保存在檔案中，bot 重新啟動後仍然有效。

#### Scenario: 重新啟動之後
- **WHEN** 頻道設成英文之後 bot 重新啟動
- **THEN** 這個頻道輸入 `/game` 仍然顯示英文大廳

### Requirement: 開房時決定這局的語系
每一局 SHALL 在開房時採用當下的頻道語系，整局都用這個語系 (包括再來一局開的新房間，採用按下當下的頻道語系)。遊戲進行中改頻道語系 SHALL NOT 影響進行中的這一局，從下一次開房開始套用。

#### Scenario: 玩到一半改語系
- **WHEN** 頻道正在玩吹牛骰 (中文開房)，有人輸入 `/game lang en`
- **THEN** 這一局繼續用中文，下一次開房才是英文

### Requirement: 遊戲的翻譯狀態
每款遊戲 SHALL 標示它有哪些語系的翻譯。遊戲還沒有頻道語系的翻譯時，這款遊戲 SHALL 照樣列在大廳、照樣可以開房，名稱、人數和介紹顯示繁體中文並在名稱後面標示「(中文)」，遊戲中的訊息也用繁體中文。翻譯好的遊戲顯示該語系的名稱、人數和介紹，不加標示。

#### Scenario: 英文頻道的大廳
- **WHEN** 英文頻道輸入 `/game`，政變還沒有英文翻譯
- **THEN** 大廳列出「👑 政變 (中文)」和中文的人數、介紹，可以按開房

#### Scenario: 玩還沒翻譯的遊戲
- **WHEN** 英文頻道開了一局還沒有英文翻譯的政變
- **THEN** 政變的遊戲訊息用繁體中文

### Requirement: 共用文字的英文翻譯
英文頻道 SHALL 用英文顯示這些共用的文字，不論遊戲本身有沒有翻譯：
- 遊戲大廳：標題、分類按鈕 (🔍 Hidden Roles、🎭 Bluffing、😂 Party、⚔️ Team vs Team、🤝 Co-op、🧩 Strategy)、「開房」按鈕 (Start a room)、底部提示 (指令、wiki、社群討論)
- `/game help` 的遊戲清單文字
- 房間公告：標題、房主、玩家人數、規則連結的文字，以及「加入」「離開」「開始遊戲」按鈕 (Join、Leave、Start)
- 共用的房間回覆：遊戲已經開始、已經在房間裡、房間已滿、只有房主可以加入／移除 bot、房間裡沒有 bot、只有房主可以取消、房主離開遊戲取消、這個頻道已經有遊戲了、只有上一局的玩家可以開新的一局、房主取消遊戲的公告、「再來一局」按鈕
- `/game stats`、`/game rank` 的輸出
- `/game lang` 的回覆和公告

狼人殺的房間邏輯是獨立的，它的房間回覆 (不含房間公告) 跟著狼人殺本身翻譯時一起處理。

#### Scenario: 英文大廳
- **WHEN** 英文頻道輸入 `/game`
- **THEN** 大廳的標題、六個分類按鈕、「Start a room」按鈕和底部提示都是英文

#### Scenario: 英文房間公告
- **WHEN** 英文頻道開了一局還沒翻譯的政變
- **THEN** 房間公告的標題、房主、人數和 Join／Leave／Start 按鈕是英文，遊戲名稱顯示「政變 (中文)」

#### Scenario: 英文的房間回覆
- **WHEN** 英文頻道的房間已滿，又有人按 Join
- **THEN** 只有他看到英文的「房間已滿」訊息

### Requirement: 指令說明依語系
輸入 `/game <遊戲> help` (或不認識的子指令) 時，系統 SHALL 用頻道目前的語系顯示這款遊戲的指令說明；遊戲還沒有該語系的翻譯時顯示繁體中文的說明。

#### Scenario: 英文頻道看已翻譯遊戲的說明
- **WHEN** 英文頻道輸入 `/game liarsdice help`，吹牛骰已經有英文翻譯
- **THEN** 只有輸入的人看到英文的指令說明

#### Scenario: 英文頻道看還沒翻譯的遊戲說明
- **WHEN** 英文頻道輸入 `/game coup help`，政變還沒有英文翻譯
- **THEN** 只有輸入的人看到繁體中文的指令說明

### Requirement: 規則連結依語系
房間公告的規則連結 SHALL 指向這局語系的 wiki 頁面：繁體中文是「<中文名稱>-遊戲規則」，英文是「<英文名稱>-Rules」(名稱裡的空白換成 `-`)。遊戲還沒有英文翻譯時，英文房間的規則連結 SHALL 指向繁體中文的頁面。

#### Scenario: 英文房間的規則連結
- **WHEN** 英文頻道開了一局已翻譯的吹牛骰 (英文名稱 Liar's Dice)
- **THEN** 房間公告的規則連結指向 wiki 的「Liar's-Dice-Rules」頁面

#### Scenario: 還沒翻譯的遊戲
- **WHEN** 英文頻道開了一局還沒翻譯的政變
- **THEN** 房間公告的規則連結指向「政變-遊戲規則」

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

### Requirement: 富饒之城的英文版
富饒之城 SHALL 有英文翻譯：英文名稱 Citadels，人數「4-7 players」。英文局的公告、prompt、按鈕、私下訊息和指令說明 SHALL 是英文；角色 SHALL 用原版英文名稱 (Assassin、Thief、Magician、King、Bishop、Merchant、Architect、Warlord)，地區卡 SHALL 用原版英文名稱 (例如 Manor、Castle、Great Wall)。中文局 SHALL 和原本完全一樣。

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
