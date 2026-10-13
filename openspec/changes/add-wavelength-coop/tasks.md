## 1. Engine：房間與出題順序（src/wavecoop.ts）

- [ ] 1.1 先寫失敗的測試（`test/wavecoop.test.ts`）：房間（2～12 人、1 人不能開始、2 人可以開始、不支援 bot、加入、離開、房主離開取消、取消、房間已滿、頻道已有遊戲）
- [ ] 1.2 先寫失敗的測試：隨機出題順序並循環（2 人 A、B、A…）、基本 7 題、9 人時後 2 位不出題、開局公告玩家和題數、光譜卡同一局不重複
- [ ] 1.3 實作房間和開局，讓 1.1～1.2 綠燈

## 2. Engine：出題與猜位置

- [ ] 2.1 先寫失敗的測試：出題（私訊目標、寫提示按鈕、`openClue` 產生 `wavecoopClue` modal、非出題者被拒、`clue` 1～30 字、超時跳過且用掉一題）
- [ ] 2.2 先寫失敗的測試：全員猜位置（出題者以外的人都能猜、出題者被拒、改選、只讓自己看到選了幾、全部猜完提早結束、平均四捨五入、超時只算有選的人、沒人猜 0 分、頻道不公告個人選擇）
- [ ] 2.3 實作出題和猜位置，讓 2.1～2.2 綠燈

## 3. Engine：計分、加題、結束

- [ ] 3.1 先寫失敗的測試：計分（距離 0／1／2／3+ → 4／3／2／0）、正中加一題（最後一題正中會多第 8 題）、揭曉公告目標／答案／得分／總分
- [ ] 3.2 先寫失敗的測試：結束評價（每個級距邊界：3／4、6／7…、21／22）、再來一局（只有上一局玩家、取消後沒有再來一局）
- [ ] 3.3 實作計分、加題、評價、再來一局，讓 3.1～3.2 綠燈

## 4. Adapter（src/slack.ts）

- [ ] 4.1 先寫失敗的測試（`test/slack.test.ts`）：KINDS 加 `wavecoop`、合作分類顯示一字千金／花火／心電感應（合作）、從大廳開房、`/game wavecoop` 指令解析（new、start、cancel、clue、help、不認識的子指令）、按鈕路由（`clue`、`guess:<n>`）、`ww:wavecoopClue` 視窗送出轉成 `clue`、視窗失敗時提示 `/game wavecoop clue <提示>`
- [ ] 4.2 實作 Kind、GameHost.defs 註冊、`parseWavecoopCommand`、`wavecoopButton`、`WAVECOOP_HELP`、`GAME_LIST`、`CATALOG`、`modal()`，讓 4.1 綠燈；確認既有心電感應測試不變

## 5. 文件與驗證

- [ ] 5.1 README（遊戲列表、manifest usage hint 加 `wavecoop new`）、wiki 新增「心電感應（合作）」頁面（由主控 push wiki）
- [ ] 5.2 跑全部測試和 typecheck，確認綠燈
