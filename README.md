# Slack GameBuddy

在 Slack 頻道裡玩桌遊，由 bot 擔任主持人。

目前支援的遊戲：

- **狼人殺** (`/game werewolf`，或 `/werewolf`)：6～12 人，角色有狼人、狼王、村民、預言家、女巫、騎士，採用屠邊規則；人不夠時可以加 bot 補位
- **誰是臥底** (`/game undercover`)：4～12 人，身分有平民、臥底、白板；輪流描述自己拿到的詞，投票找出臥底；人不夠時可以加 bot 補位
- **間諜危機** (`/game spyfall`)：4～10 人，大家知道同一個地點，只有間諜不知道；接力互相提問，時間到投票抓間諜，間諜也可以隨時猜地點；人不夠時可以加 bot 補位
- **阿瓦隆** (`/game avalon`)：5～10 人，好人 (梅林、派西維爾、忠臣) 對壞人 (刺客、莫甘娜、爪牙)；輪流發言、隊長組隊、投票、出任務，沒有人會出局；人不夠時可以加 bot 補位
- **機密代號** (`/game codenames`)：4～12 位真人，紅藍兩隊比賽，隊長用一個詞當提示，隊員翻 5×5 牌桌上的字卡，避開刺客
- **吹牛骰** (`/game liarsdice`)：2～8 人，每人 5 顆骰子，輪流喊「全場至少 N 個 X 點」或開，輸的人少一顆骰子，最後剩骰子的人贏；可以加 bot
- **一字千金** (`/game justone`)：3～7 位真人的合作遊戲，一人猜詞，其他人私下各給一個提示，重複的提示會被刪掉，13 張牌看能猜對幾張
- **政變** (`/game coup`)：3～6 人的虛張聲勢遊戲，每人 2 張暗牌，可以宣稱任何角色的能力，別人可以質疑或阻擋，最後還有影響力的人贏；可以加 bot
- **花火** (`/game hanabi`)：2～5 位真人的合作遊戲，看得到別人的牌、看不到自己的，靠提示合力依序打出五種顏色的煙火
- **心電感應** (`/game wavelength`)：4～12 位真人分兩隊，出題者用一個詞讓隊友猜光譜上的位置，有空就按、不用輪流
- **截碼戰** (`/game decrypto`)：4～12 位真人分黑白兩隊，加密者用 3 個提示把密碼傳給隊友，同時試著攔截對方的密碼
- **心電感應 (合作)** (`/game wavecoop`)：2～12 位真人同一隊，輪流出題、其他人一起猜光譜上的位置，7 題拚總分 (正中加一題)，最後給評價
- **圈內人** (`/game insider`)：4～8 位真人，大家在頻道打是非題問主持人、5 分鐘內猜出答案，再投票找出知道答案卻裝不知道的圈內人
- **骷髏與玫瑰** (`/game skull`)：3～6 人的虛張聲勢遊戲，每人 3 朵玫瑰 1 個骷髏，蓋牌後喊「能翻開幾朵玫瑰」，挑戰成功 2 次或最後還有牌的人贏；可以加 bot
- **誰是牛頭王** (`/game nimmt`)：2～10 人，每回合大家同時出一張牌，第 6 張或比所有列都小的牌要收走整列牛頭，有人累積 66 個牛頭時牛頭最少的人贏；可以加 bot
- **情書** (`/game loveletter`)：2～6 人的推理小品 (2019 版 21 張)，每人一張手牌，輪到時抽一張、出一張發動角色能力，先拿到目標數量好感標記的人贏；可以加 bot
- **蟑螂撲克** (`/game cockroach`)：2～6 人的虛張聲勢遊戲，64 張害蟲牌全部發完，蓋著傳一張牌說「這是蟑螂」，對方猜「是」「不是」或偷看再傳，猜錯的人收下，面前同一種 4 張就輸；可以加 bot
- **變色龍** (`/game chameleon`)：3～8 位真人，大家看同一張 16 個詞的主題卡，除了變色龍都知道祕密詞；每人說一個相關的詞，投票抓出變色龍，被抓到的變色龍猜中祕密詞還能逃脫
- **不要謝謝** (`/game nothanks`)：3～7 人，翻開一張牌，輪到的人付 1 個籌碼說「不要謝謝」，或收下這張牌和牌上的籌碼；連號只算最小那張，扣掉籌碼後分數最低的人贏；可以加 bot
- **禁語** (`/game taboo`)：4～12 位真人分紅藍兩隊，描述者在頻道打字描述題目詞讓隊友猜，說到題目詞或卡上的禁語就犯規，系統自動判斷
- **壽司派對** (`/game sushigo`)：2～5 人，每回合大家同時從手牌選一張壽司，再把手牌傳給下一位；湊天婦羅、生魚片、煎餃、壽司捲、握壽司配芥末拿分，布丁留到最後比，3 輪後總分最高的人贏；可以加 bot
- **梗圖大亂鬥** (`/game meme`)：3～8 人，每輪看一張梗圖，從 7 張文字卡挑一句或自己寫一句配上去，匿名投票、每得 1 票 +1 分，6 輪後總分最高的人贏；可以加 bot。也可以用 `/game meme add <圖片網址> [名稱]` 投稿頻道自己的梗圖 (`list` 看清單、`remove <編號>` 刪除)，每局最多 2 輪會用到
- **從眾心理** (`/game herd`)：4～12 位真人，每題大家私下寫一個答案，系統把一樣的答案分組、房主可以合併意思一樣的組；跟最多人一樣的那組每人 +1，唯一一個單獨答案的人拿到粉紅牛，先到 8 分且沒有粉紅牛的人贏 (最多 15 題)
- **炸彈貓** (`/game kittens`)：2～5 人 (Exploding Kittens 原版)，輪流出功能牌、最後抽一張牌，抽到炸彈貓又沒有拆解就出局；別人出牌後 5 秒內可以按「反對」讓它失效，最後活下來的人贏；可以加 bot
- **犯人在跳舞** (`/game criminal`)：3～8 人的推理小卡牌遊戲，每人 4 張牌輪流出一張發動效果，犯人想撐到最後一張打出逃跑，偵探、神犬要把他抓出來；可以加 bot
- **猜猜看** (`/game wager`)：3～10 位真人，每題寫一個數字答案，再用 2 個標記押注最接近但不超過正解的答案，押中和寫出贏的答案都得分，7 題後總分最高的人贏
- **印加寶藏** (`/game incan`)：3～8 人，一張張翻探險卡，大家同時決定繼續挖寶還是帶寶石回營地，同種危險出現兩次就空手而回，5 座神殿後寶石最多的人贏；可以加 bot
- **妙語說書人** (`/game dixit`)：3～8 位真人，用梗圖庫 (含頻道投稿) 當圖卡，說書人選一張給一句提示，其他人出牌混淆，大家猜哪張是說書人的，先到 20 分的人贏
- **富饒之城** (`/game citadels`)：4～7 人 (經典版 8 個角色＋紫色建築)，每輪祕密選角色、拿金幣蓋建築，有人蓋滿 8 棟後計分，分數最高的人贏；可以加 bot
- **Emoji 傳話** (`/game emoji`)：4～10 位真人，每人從題目出發，接力把文字翻成 emoji、再把 emoji 猜回文字，最後公布每條鏈，投票選最佳 emoji 和最神猜測
- **星際探險隊** (`/game crew`)：3～5 位真人的合作吃墩遊戲，不能討論手牌，靠出牌和一次通訊讓指定的人吃下任務牌；自編 40 關，頻道會記住打到第幾關
- **矮人礦坑** (`/game saboteur`)：3～10 人 (Saboteur 第一代)，輪流出通道牌從起點往金礦挖，藏在隊友裡的破壞者暗中鋪死路、弄壞工具；3 回合後金塊最多的人贏；可以加 bot
- **地產大亨** (`/game forsale`)：3～6 人 (For Sale 原版)，先輪流喊價買房產，放棄的人拿最小的那間、只賠一半；再同時私下出房產換支票，支票加剩下金幣最多的人贏；可以加 bot
- **骰子街** (`/game machikoro`)：2～5 人 (Machi Koro 基本版＋港口擴充)，擲骰子讓建築收錢、買建築和地標，最先蓋完 6 個地標的人贏；可以加 bot
- **璀璨寶石** (`/game splendor`)：2～4 人 (Splendor 基本版)，拿寶石籌碼、買發展卡累積折扣、吸引貴族來訪，有人到 15 分後打完這一輪，分數最高的人贏；可以加 bot
- **詭影神探** (`/game deception`)：4～12 位真人 (Deception: Murder in Hong Kong)，鑑識官只能用提示板給線索，大家從每人 4 張手段和 4 張線索裡找出兇手和答案，每人只有一次破案機會

輸入 `/game` 會打開遊戲大廳 (只有你看得到)，用上面的分類按鈕切換 (身分推理、吹牛心機、派對創意、團隊對抗、合作、策略桌遊)，點遊戲旁邊的「開房」就能開一局，不用記指令；房間公告也會附上該遊戲的規則連結。支援 bot 的遊戲，房主可以直接按房間公告上的「🤖 +」「🤖 -」加減 bot。

輸入 `/game stats [@某人]` 查看這個頻道所有遊戲的戰績，`/game rank [遊戲代號]` 查看排行榜 (依勝場數；合作遊戲依最高分)。有 bot 參加的局和取消的局不記錄。

各遊戲的玩法和指令請看 [wiki](https://github.com/eric0324/slack-gamebuddy/wiki)。詭影神探：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/詭影神探-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/詭影神探-指令)。璀璨寶石：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/璀璨寶石-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/璀璨寶石-指令)。骰子街：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/骰子街-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/骰子街-指令)。地產大亨：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/地產大亨-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/地產大亨-指令)。矮人礦坑：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/矮人礦坑-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/矮人礦坑-指令)。星際探險隊：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/星際探險隊-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/星際探險隊-指令)。Emoji 傳話：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/Emoji-傳話-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/Emoji-傳話-指令)。富饒之城：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/富饒之城-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/富饒之城-指令)。妙語說書人：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/妙語說書人-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/妙語說書人-指令)。印加寶藏：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/印加寶藏-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/印加寶藏-指令)。猜猜看：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/猜猜看-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/猜猜看-指令)。犯人在跳舞：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/犯人在跳舞-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/犯人在跳舞-指令)。炸彈貓：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/炸彈貓-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/炸彈貓-指令)。從眾心理：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/從眾心理-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/從眾心理-指令)。梗圖大亂鬥：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/梗圖大亂鬥-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/梗圖大亂鬥-指令)。壽司派對：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/壽司派對-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/壽司派對-指令)。禁語：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/禁語-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/禁語-指令)。不要謝謝：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/不要謝謝-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/不要謝謝-指令)。變色龍：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/變色龍-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/變色龍-指令)。蟑螂撲克：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/蟑螂撲克-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/蟑螂撲克-指令)。情書：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/情書-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/情書-指令)。誰是牛頭王：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/誰是牛頭王-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/誰是牛頭王-指令)。圈內人：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/圈內人-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/圈內人-指令)。心電感應 (合作)：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/心電感應-(合作)-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/心電感應-(合作)-指令)。截碼戰：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/截碼戰-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/截碼戰-指令)。心電感應：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/心電感應-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/心電感應-指令)。花火：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/花火-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/花火-指令)。政變：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/政變-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/政變-指令)。一字千金：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/一字千金-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/一字千金-指令)。吹牛骰：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/吹牛骰-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/吹牛骰-指令)。機密代號：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/機密代號-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/機密代號-指令)。阿瓦隆：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/阿瓦隆-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/阿瓦隆-指令)。間諜危機：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/間諜危機-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/間諜危機-指令)。誰是臥底：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/誰是臥底-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/誰是臥底-指令)。狼人殺：[遊戲規則](https://github.com/eric0324/slack-gamebuddy/wiki/狼人殺-遊戲規則)、[指令](https://github.com/eric0324/slack-gamebuddy/wiki/狼人殺-指令)。

## 建立 Slack App

1. 到 <https://api.slack.com/apps> 按 **Create New App → From an app manifest**，選擇你的 workspace，貼上下面的 manifest：

   ```yaml
   display_information:
     name: GameBuddy
   features:
     bot_user:
       display_name: gamebuddy
       always_online: true
     slash_commands:
       - command: /game
         description: 桌遊 (狼人殺、誰是臥底、間諜危機、阿瓦隆、機密代號、吹牛骰、一字千金、政變、花火、心電感應、截碼戰、心電感應 (合作)、圈內人、骷髏與玫瑰、誰是牛頭王、情書、蟑螂撲克、變色龍、不要謝謝、禁語、壽司派對、梗圖大亂鬥、從眾心理、炸彈貓、犯人在跳舞、猜猜看、印加寶藏、妙語說書人、富饒之城、Emoji 傳話、星際探險隊、矮人礦坑、地產大亨、骰子街、璀璨寶石、詭影神探)
         usage_hint: werewolf new | undercover new | spyfall new | avalon new | codenames new | liarsdice new | justone new | coup new | hanabi new | wavelength new | decrypto new | wavecoop new | insider new | skull new | nimmt new | loveletter new | cockroach new | chameleon new | nothanks new | taboo new | sushigo new | meme new | herd new | kittens new | criminal new | wager new | incan new | dixit new | citadels new | emoji new | crew new | saboteur new | forsale new | machikoro new | splendor new | deception new | stats | rank | help
         should_escape: true
       - command: /werewolf
         description: 狼人殺
         usage_hint: new | addbot [n] | removebot [n] | start | next | vote | cancel | stats [@someone]
         should_escape: true
   oauth_config:
     scopes:
       bot:
         - commands
         - chat:write
         - im:write
         - mpim:write
         - channels:history
         - groups:history
   settings:
     event_subscriptions:
       bot_events:
         - message.channels
         - message.groups
     interactivity:
       is_enabled: true
     socket_mode_enabled: true
   ```

2. **Basic Information → App-Level Tokens**：按 **Generate Token and Scopes**，加入 `connections:write` scope，產生 `xapp-` 開頭的 token
3. **Install App**：安裝到 workspace，複製 `xoxb-` 開頭的 Bot User OAuth Token
4. 在專案根目錄建立 `.env`：

   ```sh
   cp .env.example .env
   # 填入 SLACK_BOT_TOKEN (xoxb-...) 和 SLACK_APP_TOKEN (xapp-...)
   ```

## 執行

```sh
npm install
npm start      # 用 Socket Mode 連上 Slack，不需要公開 URL
npm test       # 執行測試
```

bot 會讀取遊戲頻道裡真人打的字 (例如「我是預言家，查殺 @某人」)，讓 bot 玩家參考；所以需要 `channels:history`、`groups:history` 權限和 `message.*` event。圈內人也用同樣的權限：問答期間玩家在頻道打的字會被當成問題，只讓主持人看到回答按鈕；禁語也一樣，描述者和隊友在頻道打的字會被拿來比對猜中和犯規 (不需要另外加 scope 或 event)。訊息只在 bot 程式裡比對，不會送到任何外部服務。

戰績會存在 `data/stats.db` (SQLite)，可以用環境變數 `STATS_DB` 改位置；換電腦跑 bot 時記得一起搬過去。

最後把 bot 邀請進要玩的頻道 (`/invite @gamebuddy`)，輸入 `/game` 就能看到可以玩的遊戲。

## 部署到 Google Cloud (免費的 e2-micro)

bot 用 Socket Mode 主動連 Slack，不需要公開網址，只要一台一直開著的小主機。Google Cloud 的 Always Free 方案有一台 e2-micro 可以用。

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案並綁定帳單 (免費方案也需要信用卡)
2. **Compute Engine → VM 執行個體 → 建立執行個體**：
   - 區域：`us-west1`、`us-central1` 或 `us-east1` (只有這三個在免費範圍內)
   - 機器類型：`e2-micro`
   - 開機磁碟：Ubuntu 24.04 LTS (x86/64)，**標準永久磁碟** 30GB 以內
   - 防火牆：不用開 HTTP／HTTPS
3. 建好後按 **SSH** 連進主機，執行：

   ```sh
   curl -fsSL https://raw.githubusercontent.com/eric0324/slack-gamebuddy/main/deploy/setup.sh | bash
   ```

4. 填入 token 並啟動：

   ```sh
   sudo -u werewolf nano /opt/werewolf/app/.env
   sudo systemctl start werewolf
   sudo journalctl -u werewolf -f   # 看到 [werewolf] Bot is running 就成功了
   ```

之後要更新到最新版本：`sudo bash /opt/werewolf/app/deploy/update.sh`

⚠️ 主機上的 bot 跑起來後，**記得關掉自己電腦上的 bot**，兩個同時連著 Slack 會讓每個指令被處理兩次。戰績存在主機的 `/opt/werewolf/app/data/stats.db`。
