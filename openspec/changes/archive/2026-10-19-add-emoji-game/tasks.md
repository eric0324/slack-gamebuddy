## 1. 題庫（src/emojiPrompts.ts）

- [x] 1.1 先寫失敗的測試（`test/emojiPrompts.test.ts`）：至少 150 題；不重複、不空白；每題 2～12 字
- [x] 1.2 新增 `src/emojiPrompts.ts`（依成語、電影影視、食物、台灣日常、動作職業分段，逐題確認能用 emoji 表達），讓 1.1 綠燈

## 2. Engine：emoji 驗證（src/emoji.ts）

- [x] 2.1 先寫失敗的測試（`test/emoji.test.ts`）：`isEmojiOnly` 接受 Unicode emoji、空白（含全形）、shortcode、膚色 shortcode 相連、ZWJ 組合、國旗、keycap、沒有變體選擇符的單一 emoji；拒絕空白、中英文、單獨數字、`<3`、標點、沒閉合的 `:abc`、`:中文:`、超過 20 個；ZWJ 組合和 shortcode 各算 1 個
- [x] 2.2 實作 `isEmojiOnly`，讓 2.1 綠燈

## 3. Engine：房間與開局

- [x] 3.1 先寫失敗的測試：房間（4～10 人、人數不足、房間已滿、不支援 bot、頻道已經有遊戲）；開局公告（傳遞順序、步數、規則摘要、沒有題目）；偶數人數 K＝人數、奇數 K＝人數－1
- [x] 3.2 先寫失敗的測試：同一局題目不重複；新的一局（`new`、再來一局）接著上一局剩下的題目；剩下的不夠時先發完再重洗補足，同一局仍不重複
- [x] 3.3 實作房間、開局、發題，讓 3.1～3.2 綠燈

## 4. Engine：步驟與傳遞

- [x] 4.1 先寫失敗的測試：第 k 步的作答者（第 1 步是主人、5 人局沒有人作答同一條鏈兩次）；步驟公告（類型、秒數、「已交 N/M」用 `ref` 更新）；「✍️ 作答」私下顯示拿到的內容並開視窗；emoji 步拿最近的文字、猜測步只拿 emoji；`send` 驗證（emoji 格式、猜測 1～30 字）、截止前可以改；全員交完提前進下一步；時間到進下一步；頻道在公布前沒有作品；非玩家、非作答時間被拒
- [x] 4.2 先寫失敗的測試：沒交記為「沒交」、下一位拿最近需要的類型；猜測步沒有 emoji 時跳過（私下提示、`send` 被拒、不算分母）；整步沒人交 → 中止，沒有 `result`、沒有再來一局；舊計時器被忽略
- [x] 4.3 實作步驟、作答、逾時，讓 4.1～4.2 綠燈

## 5. Engine：公布鏈、投票、計分

- [x] 5.1 先寫失敗的測試：公布每條鏈（主人、題目、編號 `鏈-步`、作者、內容；沒交顯示「⌛ 沒交」沒有編號；跳過不顯示）
- [x] 5.2 先寫失敗的測試：投票訊息兩顆按鈕、「已投完 N/M」；私下選單不列自己的作品；投票、改票不改進度、投自己被拒；沒有可投的類別視為已投；全員投完提前揭曉；90 秒到揭曉、沒投的作廢；舊按鈕被拒
- [x] 5.3 先寫失敗的測試：每票 +1；最佳 emoji、最神猜測（同票全列、0 票不列）；總分排名；最高分獲勝、同分並列（含全員 0 分）；`result` 事件；再來一局；房主取消（沒有 `result`、沒有再來一局）、非房主取消被拒
- [x] 5.4 實作，讓 5.1～5.3 綠燈

## 6. Slack 設定（src/games/emoji.ts）

- [x] 6.1 先寫失敗的測試（放在 `test/emoji.test.ts`，直接測 GameDef 的 parse／button／modals）：指令解析（new、start、cancel、addbot、`send <內容>`（內容可以有空白）、help 與不認識的子指令）；按鈕路由（「✍️ 作答」→ `openSend`、`voteMenu:emoji`／`voteMenu:guess`、`vote:<seq>:<cat>:<鏈-步>`、join／leave／start／rematch）；視窗 `emojiSend` 送出交給 engine
- [x] 6.2 （主控整合時做）先寫失敗的測試：`KINDS` 加 `emoji`；遊戲清單和大廳 🎲 心理戰分類有 🔗 Emoji 傳話（`emoji`）4～10 人（不支援 bot）
- [x] 6.3 實作 `src/games/emoji.ts`（`GameDef`：kind `emoji`、emoji 🔗、name Emoji 傳話、players 4～10 人、category `bluff`、`noBots`、help、apply、parse、button、modals），讓 6.1 綠燈；`GAMES` 註冊（主控整合時做），讓 6.2 綠燈
- [x] 6.4 （主控整合時做）`test/characterization.test.ts` 的 KINDS 加 `emoji`，確認 snapshot 只多出 Emoji 傳話的文字後更新

## 7. 文件與驗證

- [x] 7.1 README：遊戲列表、wiki 連結、manifest description／usage_hint
- [x] 7.2 wiki 三頁草稿：Emoji 傳話、Emoji 傳話-遊戲規則、Emoji 傳話-指令（由主控 push）
- [x] 7.3 跑全部測試和 typecheck
