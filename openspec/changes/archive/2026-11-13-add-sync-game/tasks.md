## 1. 題庫 (src/syncQuestions.ts、src/syncQuestionsEn.ts)

- [x] 1.1 先寫失敗的測試 (`test/syncQuestions.test.ts`)：13 個主題 key 和中英文名稱；12 個實際主題各至少 30 題；每題 2～4 個選項、題目和選項不空白、前後沒空白、選項 1～20 字且同題不重複；同主題題目不重複；英文題庫題數和每題選項數與中文相同
- [x] 1.2 撰寫中文題庫 (日常偏好、朋友日常、吃喝美食、旅行出遊、電影、音樂、遊戲、足球、原神、心動與戀愛、家人之間、同事同學)，避免會過時的說法
- [x] 1.3 撰寫一對一的英文題庫，讓 1.1 綠燈 (`npx vitest run test/syncQuestions.test.ts`)

## 2. Engine：房間、選主題、牌堆 (src/sync.ts、src/i18n/games/sync.ts)

- [x] 2.1 先寫失敗的測試 (`test/sync.test.ts`)：房間 (2～8 人、加入、離開、房主離開取消、已滿、人數不足「至少需要 2 人」、非房主開始、頻道已經有遊戲)；addbot／removebot 回「默契問答不支援 bot」
- [x] 2.2 先寫失敗的測試：開始後公告規則摘要和 13 個主題按鈕；房主按鈕選主題、`theme <名稱>` 指令、名稱不對列出清單；非房主被拒；30 秒逾時用通用隨機；選好後公告主題並出第 1 題
- [x] 2.3 先寫失敗的測試：牌堆 (選的主題出題；通用隨機 10 題都來自四個日常主題；同頻道同主題下一局不重複、抽完才重洗)
- [x] 2.4 實作 engine 和 zh-TW 字典，讓 2.1～2.3 綠燈

## 3. Engine：作答、揭曉

- [x] 3.1 先寫失敗的測試：題目面板 (N/10、題目、選項按鈕 `pick:<seq>:<i>`、`ref`、60 秒)；作答 (已選「X」、選了不能改、`pick <編號>`、編號不存在被拒、局外人被拒、面板原地更新已作答 N/M 和還沒作答的人且不洩漏答案)
- [x] 3.2 先寫失敗的測試：揭曉 (全員作答立刻揭曉、60 秒逾時用已作答的、依選項順序列出選的人含沒人選的選項、沒作答另列、全員同選標示並 +1、有人沒作答不算同選、揭曉後直接出下一題)；舊題目的按鈕和舊計時器被忽略
- [x] 3.3 實作，讓 3.1～3.2 綠燈

## 4. Engine：結算、取消、再來一局

- [x] 4.1 先寫失敗的測試：10 題後結算 (全員同選 N/10、每一對的次數依多到少、答題記錄每題一行)、`result` 是 `{ players, winners: [], score: N }`、附再來一局；8 人局每則結算訊息少於 3000 字
- [x] 4.2 先寫失敗的測試：房主取消 (沒有 result、沒有再來一局)、非房主取消被拒、再來一局 (上一局玩家、新的空房間、按的人當房主、牌堆接續)、結束後按鈕被忽略
- [x] 4.3 實作，讓 4.1～4.2 綠燈

## 5. 英文版

- [x] 5.1 先寫失敗的測試 (`test/sync.en.test.ts`)：英文局的規則、主題按鈕、題目、選項、作答回覆、揭曉、結算都是英文 (不含中文字)；`theme genshin impact` 不分大小寫可以選
- [x] 5.2 補上 en 字典與英文主題比對，讓 5.1 綠燈

## 6. Slack 設定 (src/games/sync.ts)

- [x] 6.1 先寫失敗的測試：GameDef 大廳資訊 (`kind: 'sync'`、`emoji: '🎯'`、`name: '默契問答'`、`players: '2～8 人'`、`category: 'coop'`、`noBots: true`、`locales.en`)；help 含 new／start／theme／pick／cancel；指令解析 (`theme <有空白的名稱>`、`pick 2`、help 和不認識的回 null)；按鈕路由 (join、leave、start、rematch、`theme:<seq>:<key>`、`pick:<seq>:<i>`)
- [x] 6.2 實作 `GameDef`，`src/games/index.ts` 的 `GAMES` 最後加一行，讓 6.1 綠燈
- [x] 6.3 `test/slack.test.ts`：KINDS、合作分類加 `sync`；大廳列出 🎯 默契問答 2～8 人；遊戲清單「不支援 bot」；從大廳開房、按主題和選項按鈕能玩；戰績記成合作遊戲分數
- [x] 6.4 `test/i18n.test.ts`：英文頻道 🤝 Co-op 列出 🎯 In Sync，沒有「(中文)」
- [x] 6.5 `test/characterization.test.ts` 的 KINDS 加 `'sync'`，更新 snapshot，確認差異只有多一款遊戲
- [x] 6.6 README：遊戲列表、manifest `description`／`usage_hint`

## 7. 整合驗證

- [x] 7.1 跑 `npm test` 和 `npm run typecheck`，全部綠燈
- [x] 7.2 印出一局 3 人範例 (主題按鈕、題目面板、揭曉、結算) 給使用者在真的 Slack 確認 (不用真 token 啟動 bot)
