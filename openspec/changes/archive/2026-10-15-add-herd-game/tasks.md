## 1. 題庫（src/herdQuestions.ts）

- [x] 1.1 先寫失敗的測試（`test/herdQuestions.test.ts`）：至少 150 題；不空白、去掉前後空白不變；題目不重複
- [x] 1.2 新增 `src/herdQuestions.ts`（`HERD_QUESTIONS`），讓 1.1 綠燈

## 2. Engine：房間與開局（src/herd.ts）

- [x] 2.1 先寫失敗的測試（`test/herd.test.ts`）：房間（4～12 人、人數不足、房間已滿、不支援 bot、頻道已經有遊戲、取消）；開局公告規則；跨局沿用牌堆
- [x] 2.2 實作房間與開局，讓 2.1 綠燈

## 3. Engine：作答

- [x] 3.1 先寫失敗的測試：公告題目和作答按鈕；`answer` 長度檢查（1～20 字、只有符號被拒）；改答案；非玩家被拒；作答狀態不洩漏答案；全部答完提前結束；60 秒超時
- [x] 3.2 實作作答，讓 3.1 綠燈

## 4. Engine：分組與合併

- [x] 4.1 先寫失敗的測試：正規化後完全相同同組、子字串不同組；公告分組；只有一組跳過合併；房主選組、合併（少於兩組被拒）、指令 `merge 1 3`、`done`；非房主被拒；30 秒超時計分
- [x] 4.2 實作分組與合併，讓 4.1 綠燈

## 5. Engine：計分、粉紅牛、勝負

- [x] 5.1 先寫失敗的測試：唯一最多組 +1；平手沒人得分；最多只有 1 人沒人得分；沒作答不得分；唯一單獨答案拿粉紅牛、轉移、兩個單獨答案不動
- [x] 5.2 先寫失敗的測試：8 分且沒粉紅牛獲勝、同題多人並列；持粉紅牛 8 分不算；15 題結束最高分（排除粉紅牛）獲勝、最高 0 分沒人贏；`result` 事件；再來一局；取消沒有 `result`
- [x] 5.3 實作計分與勝負，讓 5.1～5.2 綠燈

## 6. Slack 設定（src/games/herd.ts）

- [x] 6.1 先寫失敗的測試（GameDef 的指令、按鈕、視窗寫在 `test/herd.test.ts`；`test/slack.test.ts` 由主控整合）：指令解析（new、start、cancel、addbot、answer、merge、done、help 和不認識的子指令）；按鈕路由（join／leave／start／rematch、write 開視窗、`pick:<n>`、merge、done）；modal `herdAnswer`
- [x] 6.2 先寫失敗的測試：`KINDS` 加 `herd`；遊戲清單和大廳 🎲 心理戰分類有 🐑 從眾心理（4～12 人，不支援 bot）
- [x] 6.3 實作 `src/games/herd.ts`（已完成）、`GAMES` 加一行（主控整合），讓 6.1～6.2 綠燈
- [x] 6.4 更新 characterization KINDS 與 snapshot（只多出從眾心理相關文字）

## 7. 文件與驗證

- [x] 7.1 README：遊戲列表、wiki 連結、manifest description／usage_hint
- [x] 7.2 wiki 三頁草稿（由主控 push）
- [x] 7.3 跑全部測試和 typecheck，確認綠燈
