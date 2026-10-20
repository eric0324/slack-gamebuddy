## 1. 光譜卡

- [x] 1.1 先寫失敗的測試：至少 60 張、兩端不空白、不重複
- [x] 1.2 新增 `src/wavelengthCards.ts`，讓測試綠燈

## 2. Engine：房間與分隊 (src/wavelength.ts)

- [x] 2.1 先寫失敗的測試：房間 (4～12 人、不支援 bot、加入、離開、取消、房間已滿)
- [x] 2.2 先寫失敗的測試：隨機分隊 (相差最多 1 人)、出題順序兩隊輪流、每人一題、公告兩隊成員
- [x] 2.3 實作房間和分隊，讓 2.1～2.2 綠燈

## 3. Engine：回合

- [x] 3.1 先寫失敗的測試：出題 (私訊目標、寫提示按鈕、`openClue` 產生 modal 事件、非出題者被拒、`clue` 送出、出題超時跳過)
- [x] 3.2 先寫失敗的測試：隊友猜位置 (只有隊友能按、改選、全部猜完提早結束、平均四捨五入、沒人猜就 0 分、超時)
- [x] 3.3 先寫失敗的測試：對手猜左右 (只有對手能按、多數決、平手視為沒猜、超時)
- [x] 3.4 先寫失敗的測試：計分 (4／3／2／0、對手 1 分、正中時對手不得分)、結束 (獲勝、平手、再來一局、取消後沒有再來一局)
- [x] 3.5 實作回合、計分、結束，讓 3.1～3.4 綠燈

## 4. Adapter (src/slack.ts、src/engine.ts、src/index.ts)

- [x] 4.1 先寫失敗的測試：prompt 的 `perRow` 把按鈕分成多個 actions block；沒設時不變
- [x] 4.2 先寫失敗的測試：`modal` 事件用按鈕的 `trigger_id` 呼叫 `views.open`；送出後轉成 `clue` action；`views.open` 失敗時提示改用指令
- [x] 4.3 先寫失敗的測試：`/game wavelength` 指令解析 (new、start、cancel、clue、help)、遊戲清單和大廳有心電感應、按鈕路由
- [x] 4.4 實作 adapter 和 `index.ts` 的 `trigger_id`、`app.view` handler，讓 4.1～4.3 綠燈

## 5. 文件與驗證

- [x] 5.1 README manifest usage hint、wiki 新增「心電感應-遊戲規則」頁
- [x] 5.2 跑全部測試和 typecheck，確認綠燈
