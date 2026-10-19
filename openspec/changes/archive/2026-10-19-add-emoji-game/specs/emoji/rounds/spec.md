## ADDED Requirements

### Requirement: 鏈的傳遞
每位玩家有一條鏈，第 i 位玩家的鏈起點是他拿到的題目。第 k 步（1～K）這條鏈 SHALL 由傳遞順序上第 i 位往後數 k－1 位的玩家作答，所以第 1 步是鏈的主人自己，同一條鏈 SHALL NOT 讓同一位玩家作答兩次。奇數步 SHALL 是「🎨 emoji 步」：拿到文字，只能用 emoji 描述；偶數步 SHALL 是「🧠 猜測步」：拿到 emoji，用文字猜那是什麼；最後一步一定是猜測步。每一步所有玩家 SHALL 同時作答（每人手上剛好一條鏈）。emoji 步拿到的文字 SHALL 是這條鏈最近一則文字（起點題目或上一位的猜測）；猜測步拿到的 SHALL 是這條鏈最近一則 emoji，看不到這條鏈的任何文字。

#### Scenario: 4 人的第 1 條鏈
- **WHEN** 傳遞順序是 A → B → C → D，A 的題目是「珍珠奶茶」
- **THEN** 第 1 步 A 用 emoji 描述「珍珠奶茶」，第 2 步 B 看 A 的 emoji 猜，第 3 步 C 看 B 的猜測用 emoji 描述，第 4 步 D 看 C 的 emoji 猜

#### Scenario: 5 人不會傳回自己
- **WHEN** 傳遞順序是 A → B → C → D → E
- **THEN** A 的鏈依序由 A、B、C、D 作答，E 不會碰到 A 的鏈，沒有人作答同一條鏈兩次

### Requirement: 作答
每一步開始時，頻道 SHALL 公告「第 k／K 步」、這步的類型、作答時間（emoji 步 90 秒、猜測步 60 秒）和「✍️ 作答」按鈕，並顯示「已交 N/M」（M 是這一步需要作答的人數）。按「✍️ 作答」SHALL 只讓這位玩家看到他這一步拿到的內容，並打開視窗讓他輸入；視窗打不開時提示改用 `/game emoji send <內容>`。玩家也 SHALL 可以用 `/game emoji send <內容>` 作答。送出後作答者 SHALL 私下看到「已收到」和內容；截止前 SHALL 可以重新送出覆蓋。頻道的步驟訊息 SHALL 用同一則訊息更新「已交 N/M」，在公布鏈之前頻道 SHALL NOT 出現任何題目或作品。全部需要作答的玩家都交了 SHALL 提前進下一步；時間到 SHALL 進下一步。不是這局玩家的人、不在作答時間作答 SHALL 被拒絕。

#### Scenario: 看拿到的內容
- **WHEN** 第 2 步 B 按「✍️ 作答」，A 第 1 步交了「🧋⚫⚫」
- **THEN** 只有 B 看到「你拿到：🧋⚫⚫，請猜這是什麼」，並打開作答視窗

#### Scenario: 交 emoji
- **WHEN** 第 1 步 A 輸入 `/game emoji send 🧋 ⚫⚫`
- **THEN** A 私下看到「已收到」和內容，頻道訊息更新為「已交 1/4」，頻道沒有出現 A 的內容

#### Scenario: 改答案
- **WHEN** A 先交「🧋」，截止前又交「🧋⚫⚫」
- **THEN** A 這一步的作品是「🧋⚫⚫」，「已交」人數不變

#### Scenario: 全員交完提前結束
- **WHEN** 4 位玩家都交了第 1 步
- **THEN** 第 1 步立刻結束，開始第 2 步

#### Scenario: 不是玩家
- **WHEN** 不在這局的 Z 作答
- **THEN** 系統拒絕並只讓 Z 看到自己不在遊戲中

### Requirement: Emoji 格式
emoji 步的作品去掉所有空白（包含全形空白）後 SHALL 完全由 emoji 組成，可以是 Unicode emoji（含 ZWJ 組合、膚色、國旗、keycap，以及沒有變體選擇符的單一 emoji 字元）或 Slack shortcode（`:` 包住的英文小寫、數字、`_`、`+`、`-`、`'`，例如 `:bubble_tea:`、`:wave::skin-tone-3:`），兩種可以混用，emoji 之間可以有空白。emoji 數量 SHALL 是 1～20 個（一個 ZWJ 組合或一個 shortcode 算 1 個）。含有一般文字（中英文、注音）、單獨的數字或符號、標點、沒閉合的 `:abc` 或非英文的 shortcode SHALL 被拒絕，並只讓作答者看到「只能用 emoji」的提示（可以直接貼 emoji 或打 `:shortcode:`，可以有空白，最多 20 個），作品不變。系統 SHALL NOT 檢查 shortcode 是否存在於 workspace。作品 SHALL 照原樣（去掉前後空白）保存和公布。

#### Scenario: Unicode emoji 和空白
- **WHEN** 玩家輸入「🧋 ⚫ ⚫」
- **THEN** 系統接受

#### Scenario: shortcode 混用
- **WHEN** 玩家輸入「:bubble_tea: 🐻 :wave::skin-tone-3:」
- **THEN** 系統接受

#### Scenario: ZWJ 組合和國旗
- **WHEN** 玩家輸入「👨‍👩‍👧 🇹🇼 1️⃣」
- **THEN** 系統接受，算 3 個 emoji

#### Scenario: 夾雜文字
- **WHEN** 玩家輸入「🧋奶茶」、「boba 🧋」、「1 🧋」、「<3」或「:珍奶:」
- **THEN** 系統拒絕並只讓他看到「只能用 emoji」的提示

#### Scenario: 只有空白
- **WHEN** 玩家輸入只有空白的內容
- **THEN** 系統拒絕並只讓他看到「只能用 emoji」的提示

#### Scenario: 太多 emoji
- **WHEN** 玩家輸入 21 個 emoji
- **THEN** 系統拒絕並只讓他看到最多 20 個的提示

### Requirement: 猜測格式
猜測步的作品 SHALL 去掉前後空白後是 1～30 字的文字，沒有其他限制。空白或超過 30 字 SHALL 被拒絕，並只讓作答者看到字數限制，作品不變。

#### Scenario: 猜測
- **WHEN** 第 2 步 B 輸入 `/game emoji send 黑糖珍奶`
- **THEN** 系統接受，B 私下看到「已收到：黑糖珍奶」

#### Scenario: 字數太多
- **WHEN** 玩家猜了 31 個字
- **THEN** 系統拒絕並只讓他看到字數限制

### Requirement: 沒交與跳過
時間到還沒交的玩家，這一步在這條鏈 SHALL 記為「沒交」，遊戲照常進下一步；下一位 SHALL 依「鏈的傳遞」拿到這條鏈最近一則需要的類型（emoji 步拿最近的文字，猜測步拿最近的 emoji）。猜測步時這條鏈還沒有任何 emoji，這位玩家這一步 SHALL 跳過：按「✍️ 作答」只讓他看到「上一位沒交，這一步你休息」，送出 SHALL 被拒絕，也 SHALL NOT 算進「已交 N/M」的 M。一整步需要作答的玩家都沒交時，系統 SHALL 公告「這一步沒有人交，遊戲中止」並結束遊戲，SHALL NOT 送出 `result`，也 SHALL NOT 貼「再來一局」。

#### Scenario: emoji 步沒交
- **WHEN** 第 3 步 C 沒交，第 2 步 B 猜了「黑糖珍奶」、第 1 步 A 交了「🧋⚫⚫」
- **THEN** 第 4 步 D 拿到 A 的「🧋⚫⚫」來猜

#### Scenario: 猜測步沒交
- **WHEN** 第 2 步 B 沒交
- **THEN** 第 3 步 C 拿到最近的文字（起點題目）來用 emoji 描述

#### Scenario: 第 1 步就沒交
- **WHEN** 第 1 步 A 沒交自己題目的 emoji
- **THEN** 第 2 步 B 在 A 的鏈上跳過，B 按「✍️ 作答」只看到這一步休息，第 2 步的「已交」分母少 1

#### Scenario: 整步沒有人交
- **WHEN** 第 3 步 60 秒到，需要作答的玩家都沒交
- **THEN** 頻道公告遊戲中止，沒有 `result`，沒有「再來一局」

### Requirement: 公布鏈
最後一步結束後，頻道 SHALL 依鏈的順序公布每一條鏈，每條一則訊息：主人、起點題目，接著依步驟列出每則作品的編號（`鏈-步`，例如 `2-3`）、類型（🎨／🧠）、作者和內容；沒交的步驟 SHALL 顯示「⌛ 某人 沒交」而且沒有編號，跳過的步驟 SHALL NOT 顯示。

#### Scenario: 公布
- **WHEN** 4 人局第 4 步結束
- **THEN** 頻道依序貼 4 則訊息，第 2 條鏈顯示「@B 的題目：珍珠奶茶」，接著 `2-1` 🎨 @B、`2-2` 🧠 @C、`2-3` 🎨 @D、`2-4` 🧠 @A 和各自的內容

#### Scenario: 沒交的步驟
- **WHEN** 第 3 步 C 在第 1 條鏈沒交
- **THEN** 第 1 條鏈第 3 步顯示「⌛ @C 沒交」，沒有 `1-3` 編號

### Requirement: 投票
公布完所有鏈後，頻道 SHALL 貼一則投票訊息，附「🎨 投最佳 emoji」和「🧠 投最神猜測」兩顆按鈕，顯示「已投完 N/M」（兩類都投了才算投完），投票時間 SHALL 是 90 秒。按其中一顆 SHALL 只讓這位玩家看到該類別所有作品編號的按鈕，SHALL NOT 列出他自己的作品；按一顆就是投這一票，SHALL 只讓本人看到「你投了 `2-3`」。每人每類別 1 票，截止前 SHALL 可以改票，改票不改進度；投自己的作品 SHALL 被拒絕，只讓本人看到「不能投自己」。某類別沒有可以投的作品時，這一類 SHALL 視為已投。誰投了誰 SHALL NOT 公開，投票訊息用同一則訊息更新進度。全部玩家都投完時 SHALL 立刻揭曉；90 秒到時沒投的票作廢，照常揭曉。不是這局玩家的人、不在投票時間投票 SHALL 被拒絕。

#### Scenario: 投最佳 emoji
- **WHEN** A 按「🎨 投最佳 emoji」再按 `2-3`（D 的作品）
- **THEN** 只有 A 看到「你投了 `2-3`」，頻道沒有顯示 A 投了誰

#### Scenario: 選單不列自己的作品
- **WHEN** B 按「🧠 投最神猜測」
- **THEN** B 看到的按鈕沒有 B 自己的猜測

#### Scenario: 投自己
- **WHEN** B 用舊按鈕投自己的作品 `2-1`
- **THEN** 系統拒絕，只讓 B 看到「不能投自己」

#### Scenario: 改票
- **WHEN** A 的最佳 emoji 已經投 `2-3`，又按 `3-1`
- **THEN** A 的最佳 emoji 改成 `3-1`，進度不變

#### Scenario: 全員投完提前揭曉
- **WHEN** 4 位玩家都投完兩類
- **THEN** 立刻揭曉

### Requirement: 揭曉與勝負
揭曉時，每則作品每得 1 票 SHALL 讓作者 +1 分（兩類合計）。頻道 SHALL 公告 🎨 最佳 emoji 和 🧠 最神猜測（各類最高票的作品、作者和票數，同票全列，最高票是 0 票時不列），以及所有玩家的總分排名；投票訊息 SHALL 改成已結束（沒有按鈕）。總分最高的玩家 SHALL 獲勝，同分 SHALL 並列獲勝（包括全員 0 分）。系統 SHALL 送出 `result` 事件（`players` 是所有玩家，`winners` 是獲勝的玩家），並貼「再來一局」按鈕；只有上一局的玩家可以按，按的人成為新房主。

#### Scenario: 揭曉
- **WHEN** 4 人局 D 的 `2-3` 得 3 票、A 的 `2-4` 得 2 票、其他作品共 3 票分給 B 和 C
- **THEN** 頻道公告最佳 emoji 是 `2-3` @D（3 票）、最神猜測是 `2-4` @A（2 票）和總分排名，每位作者的分數等於他得到的票數

#### Scenario: 最高分獲勝
- **WHEN** 揭曉後 D 4 分、A 2 分、B 1 分、C 1 分
- **THEN** 頻道公告 D 獲勝，`result` 的 winners 是 D，貼「再來一局」

#### Scenario: 同分並列
- **WHEN** 揭曉後 A、D 都是 3 分最高
- **THEN** A、D 並列獲勝，`result` 的 winners 是 A、D

### Requirement: 取消與計時器
房主在遊戲中取消時，頻道 SHALL 公告已取消，SHALL NOT 送出 `result`，也 SHALL NOT 貼「再來一局」；非房主取消 SHALL 被拒絕。舊的計時器和舊訊息的按鈕 SHALL 被忽略。

#### Scenario: 房主取消
- **WHEN** 遊戲進行中房主輸入 `/game emoji cancel`
- **THEN** 遊戲結束，頻道公告已取消，沒有 `result`，沒有「再來一局」

#### Scenario: 非房主取消
- **WHEN** 遊戲進行中非房主輸入 `/game emoji cancel`
- **THEN** 系統拒絕並只讓他看到只有房主可以取消

#### Scenario: 舊計時器
- **WHEN** 第 1 步全員提前交完進入第 2 步後，第 1 步的計時器才到
- **THEN** 系統忽略這個計時器，第 2 步照常進行
