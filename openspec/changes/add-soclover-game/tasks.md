## 1. 詞庫（src/socloverWords.ts）

- [ ] 1.1 先寫失敗的測試（`test/socloverWords.test.ts`）：至少 200 個詞、不空白、不含空白字元、不重複
- [ ] 1.2 新增 `src/socloverWords.ts`（`SOCLOVER_WORDS`，具體名詞，約 240 個），讓測試綠燈

## 2. Engine：房間與發卡（src/soclover.ts）

- [ ] 2.1 先寫失敗的測試（`test/soclover.test.ts`）：房間（3～6 人、2 人不能開始、3 人可以開始、房間已滿、不支援 bot（addbot／removebot）、加入、離開、房主離開取消、只有房主能開始、取消、頻道已有遊戲）
- [ ] 2.2 先寫失敗的測試：卡片方向與葉子（`[海, 火, 鐘, 山]` 轉 1 次後上山右海下火左鐘；4 格朝外的邊；4 片葉子的詞對）
- [ ] 2.3 先寫失敗的測試：發卡（每人 4 張 + 1 張干擾卡、6 人局 120 個詞全不重複、隨機格子與方向、座位順序公告）
- [ ] 2.4 實作房間、卡片方向、葉子、發卡，讓 2.1～2.3 綠燈

## 3. Engine：寫提示

- [ ] 3.1 先寫失敗的測試：私訊四葉草（4 片葉子詞對、4 格朝外的詞）、頻道「✍️ 寫提示」按鈕、`openClue` 產生 `socloverClue` modal（4 個 `fields`，標籤是葉子的詞對）、不在遊戲中的人被拒
- [ ] 3.2 先寫失敗的測試：`clue` 送出（剛好 4 個、1～15 字、和自己卡上的詞相同被拒、送出後不能改、頻道公告進度但不公開內容）、全部送出提早進排卡、5 分鐘超時跳過沒送出的人、沒有人送出直接結束（總分 0、仍送 result）
- [ ] 3.3 實作寫提示，讓 3.1～3.2 綠燈

## 4. Engine：一起排卡

- [ ] 4.1 先寫失敗的測試：開盤（排卡順序只含有送出的人、5 張卡 A～E 含干擾卡、隨機方向、4 格空、選格1、prompt 帶 `ref` 和 `perRow: 5`、盤面文字含提示和葉子詞對「？」）
- [ ] 4.2 先寫失敗的測試：擺放者（作者的下一位、C→A 繞回、非擺放者被拒、「🙋 換我排」換人、作者按任何按鈕被拒、不在遊戲中的人被拒）
- [ ] 4.3 先寫失敗的測試：操作（選格、放卡後跳到下一個空格、兩格交換、換掉格裡的卡回手上、旋轉、空格旋轉被拒、拿回手上、未滿 4 格不能送出、舊 `seq` 盤面被拒、每次操作用同一個 `ref` 更新）
- [ ] 4.4 實作排卡盤面與操作，讓 4.1～4.3 綠燈

## 5. Engine：計分、結束、戰績

- [ ] 5.1 先寫失敗的測試：計分（第 1 次全對 6 分；方向錯算錯；沒全對時公告對幾張、對的鎖住、錯的回手上、進第 2 次並換新 `seq`；鎖住的卡不能換／轉／拿回；第 2 次得盤面對的張數含鎖住的；第 1、2 次超時以目前盤面送出、空格算錯；每片公告正確擺法、干擾卡、得分、總分）
- [ ] 5.2 先寫失敗的測試：結束（滿分 6 × 玩家數含被跳過的、評價邊界 100／85／70／50／30／0%、再來一局只有上一局玩家）、**result 事件**（正常結束送 `{ type: 'result', players, winners: [], score: 總分 }`；取消不送 result、沒有再來一局；排卡中取消公布這片正確擺法）
- [ ] 5.3 實作計分、評價、結束、result，讓 5.1～5.2 綠燈

## 6. Slack 設定（src/games/soclover.ts）

- [ ] 6.1 先寫失敗的測試（`test/slack.test.ts`）：KINDS 加 `soclover`；大廳「🤝 合作」分類的開房按鈕依序是 justone、hanabi、wavecoop、soclover；從大廳開四葉草房間；`/game soclover` 指令解析（new、start、cancel、`clue a / b / c / d` 剛好 4 個、help、不認識的子指令）；按鈕路由（`clue`、`<seq>:slot:<n>`、`<seq>:card:<n>`、`rotate`、`back`、`submit`、`take`）；`ww:socloverClue` 4 欄視窗送出轉成 `clue`；視窗打不開時提示 `/game soclover clue …`
- [ ] 6.2 新增 `src/games/soclover.ts`（`GameDef`：🍀 四葉草、3～6 人、`coop`、`noBots`、help、parse、button、`modals.socloverClue`），`src/games/index.ts` 的 `GAMES` 最後加一行，讓 6.1 綠燈
- [ ] 6.3 `test/characterization.test.ts` 的 KINDS 加 `soclover`，更新 snapshot（預期多出四葉草在遊戲清單、合作分類、指令說明的文字；其他遊戲文字不變，逐行確認 diff）

## 7. 文件與驗證

- [ ] 7.1 README：遊戲列表加「🍀 四葉草（`/game soclover`）」一行、wiki 連結（四葉草-遊戲規則、四葉草-指令）、manifest 的 `/game` `description` 加「四葉草」、`usage_hint` 在 `help` 前面（遊戲清單最後面）加 `soclover new`
- [ ] 7.2 wiki 三頁草稿：「四葉草」（入口）、「四葉草-遊戲規則」（流程、四葉草結構、旋轉、擺放者、計分、評價）、「四葉草-指令」（指令和按鈕）；由主控 push wiki
- [ ] 7.3 跑全部測試和 typecheck，確認綠燈
