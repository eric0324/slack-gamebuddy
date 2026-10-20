## 1. Engine：房間與身分 (src/insider.ts)

- [x] 1.1 先寫失敗的測試 (`test/insider.test.ts`)：房間 (4～8 人、不支援 bot、加入、離開、房主離開取消房間、房間已滿、取消後公告答案且沒有再來一局)
- [x] 1.2 先寫失敗的測試：開始時剛好 1 位主持人、1 位圈內人 (不同人)、其他平民；答案來自 `DECRYPTO_WORDS`；主持人和圈內人的私訊有答案、平民沒有；頻道公告主持人和發問方式，不含答案和圈內人
- [x] 1.3 實作房間和身分分配，讓 1.1～1.2 綠燈

## 2. Engine：問答與猜中

- [x] 2.1 先寫失敗的測試：發問 (`chat` 產生只給主持人的 ephemeral prompt 和四個按鈕；`ask` 先在頻道公告問題；忽略主持人、旁觀者、空白訊息和問答階段以外的訊息且沒有任何 event；主持人或旁觀者用 `ask` 被拒；超過 200 字截斷)
- [x] 2.2 先寫失敗的測試：回答 (是／否／不知道的頻道公告、可以不照順序回答、重複回答被拒、問答結束後按舊按鈕被拒、非主持人被拒)
- [x] 2.3 先寫失敗的測試：猜中 (「猜中了」結束問答、記錄猜中的人、公告答案、進入討論；圈內人自己猜中也算)、5 分鐘超時全體落敗並公告答案和圈內人、有再來一局
- [x] 2.4 實作問答、猜中、問答計時，讓 2.1～2.3 綠燈

## 3. Engine：討論、投票、勝負

- [x] 3.1 先寫失敗的測試：討論 2 分鐘超時進入投票；房主按「開始投票」或 `vote` 提早投票；非房主被拒；舊計時器被忽略
- [x] 3.2 先寫失敗的測試：投票 (候選人是主持人以外的玩家、所有人含主持人可投、不能投自己、改票、只讓投票者看到、旁觀者被拒、全部投完提早結束、2 分鐘超時、結果公告每個人的票)
- [x] 3.3 先寫失敗的測試：指認 (最高票 1 人、平手由主持人的票決定、平手但主持人沒投其中一人、沒人投票) 與勝負 (找到圈內人 → 主持人和平民獲勝；找錯或沒指認 → 圈內人獲勝)；結束公告獲勝方、答案、圈內人、主持人、猜中的人；再來一局 (上一局玩家才能按、新房間房主是按的人)
- [x] 3.4 實作討論、投票、勝負、再來一局，讓 3.1～3.3 綠燈

## 4. Adapter (src/slack.ts)

- [x] 4.1 先寫失敗的測試 (`test/slack.test.ts`)：`/game insider` 指令解析 (new、start、cancel、addbot、ask <問題> (問題可以有空白、空白問題回 help)、vote、help 與不認識的子指令顯示 `INSIDER_HELP`)；按鈕路由 (join／leave／start／rematch、`answer:<題號>:<回答>`、`vote:<userId>`、`skip`)
- [x] 4.2 先寫失敗的測試：`chat()` 在圈內人進行中把訊息交給圈內人 engine (主持人收到 ephemeral 按鈕)；沒有遊戲或其他遊戲 (非狼人殺) 時不處理；狼人殺行為不變
- [x] 4.3 先寫失敗的測試：`KINDS` 加 `insider`；`GAME_LIST` 有 🕴️ 圈內人 (`insider`) 4～8 人；大廳 🔍 推理分類列出圈內人和「開房」按鈕、其他分類沒有；從大廳開房
- [x] 4.4 實作：`Kind` 加 `insider`、`GameHost.defs` 註冊 (states、`applyInsider`、`parseInsiderCommand`、`insiderButton`、`INSIDER_HELP`)、`GAME_LIST`、`CATALOG` 加 `{ kind: 'insider', category: 'deduction', emoji: '🕴️', name: '圈內人', players: '4～8 人', desc: … }`、`chat()` 轉給圈內人，讓 4.1～4.3 綠燈 (`src/index.ts` 不用改)

## 5. 文件與驗證

- [x] 5.1 README：遊戲列表加圈內人、wiki 規則／指令連結；manifest `/game` 的 description 加「圈內人」、usage_hint 加 `insider new`；「讀取頻道訊息」那段補上圈內人會把頻道裡的發問交給主持人 (不用新增 scope 或 event：已經有 `channels:history`、`groups:history`、`message.channels`、`message.groups`)
- [x] 5.2 wiki 新增「圈內人」、「圈內人-遊戲規則」、「圈內人-指令」三頁 (由主控處理 push)
- [x] 5.3 跑全部測試和 typecheck，確認綠燈
