## 1. 題庫 (src/wagerQuestions.ts)

- [x] 1.1 先寫失敗的測試 (`test/wagerQuestions.test.ts`)：至少 120 題；`q` 不重複、不空白；`answer` 是 ≥ 0 且 < 1,000,000 的有限數字；`unit`、`note` 不空白
- [x] 1.2 新增 `src/wagerQuestions.ts` (依分類分段，逐題核對事實)，讓 1.1 綠燈

## 2. Engine：房間與開局 (src/wager.ts)

- [x] 2.1 先寫失敗的測試 (`test/wager.test.ts`)：房間 (3～10 人、人數不足、房間已滿、不支援 bot、頻道已經有遊戲)、開局公告 (7 題、規則)、第 1 題公告
- [x] 2.2 先寫失敗的測試：同一局題目不重複；新的一局 (`new`、再來一局) 接著上一局剩下的題目
- [x] 2.3 實作房間、開局、抽題，讓 2.1～2.2 綠燈

## 3. Engine：作答

- [x] 3.1 先寫失敗的測試：答案格式 (逗號、小數、全形可以；中文數字、負數、空白、非數字被拒)；截止前可以改；「已答 N/M」用 `ref` 更新；全員答完提前進押注；60 秒到進押注；沒有人作答 → 公告正解、下一題；非玩家被拒
- [x] 3.2 實作作答，讓 3.1 綠燈

## 4. Engine：押注、揭曉、計分

- [x] 4.1 先寫失敗的測試：押注板 (相同數字合併、由小到大、作者、「全部太大」在最前面)；每人 2 個標記、可以押同一格、第 3 個被拒、重押；「已押 N/M」；全員押完提前揭曉；45 秒到揭曉
- [x] 4.2 先寫失敗的測試：贏格 (最接近但不超過；全部太大；剛好等於正解)；押中每個標記 +1、贏格作者 +1、合併格的每位作者都 +1；揭曉公告正解、說明、得分、總分；舊計時器被忽略
- [x] 4.3 實作押注、揭曉、計分，讓 4.1～4.2 綠燈

## 5. Engine：勝負與結束

- [x] 5.1 先寫失敗的測試：7 題後最高分獲勝、同分並列 (含全員 0 分)；結束公告排名；`result` 事件；再來一局；房主取消 (公告目前分數、沒有 `result`、沒有再來一局)、非房主取消被拒
- [x] 5.2 實作，讓 5.1 綠燈

## 6. Slack 設定 (src/games/wager.ts)

- [x] 6.1 先寫失敗的測試 (實作時放在 `test/wager.test.ts`，直接測 GameDef 的 parse／button／modals)：指令解析 (new、start、cancel、addbot、answer、help 與不認識的子指令)；按鈕路由 (`answer` 開視窗、`betMenu`、`bet:<n>`、`rebet`、join／leave／start／rematch)；視窗送出交給 engine
- [x] 6.2 (主控整合時做) 先寫失敗的測試：`KINDS` 加 `wager`；遊戲清單和大廳 🎲 心理戰分類有 💰 猜猜看 (`wager`) 3～10 人 (不支援 bot)
- [x] 6.3 (`src/games/wager.ts` 已完成；`GAMES` 註冊留給主控整合) 實作 `src/games/wager.ts` (`GameDef`：kind `wager`、emoji 💰、name 猜猜看、players 3～10 人、category `bluff`、`noBots`、help、apply、parse、button、modals)，`GAMES` 加一行，讓 6.1～6.2 綠燈
- [x] 6.4 (主控整合時做)`test/characterization.test.ts` 的 KINDS 加 `wager`，確認 snapshot 只多出猜猜看的文字後更新

## 7. 文件與驗證

- [x] 7.1 README：遊戲列表、wiki 連結、manifest description／usage_hint
- [x] 7.2 wiki 三頁草稿：猜猜看、猜猜看-遊戲規則、猜猜看-指令 (由主控 push)
- [x] 7.3 跑全部測試和 typecheck
