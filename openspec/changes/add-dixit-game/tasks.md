## 1. 帶圖片的 prompt（src/engine.ts、src/slack.ts）

- [ ] 1.1 先寫失敗的測試（`test/slack.test.ts`）：`prompt` 帶 `images` 時 blocks 依序是 section、每張一個 image block（title 是編號、alt_text 同 title）、actions；ephemeral 和頻道 `ref` 更新都帶圖片；Slack 拒絕帶圖片的訊息時改發文字版（依編號列網址、按鈕照常）；沒有 `images` 的 prompt 輸出不變
- [ ] 1.2 `GameEvent` 的 `prompt` 加 `images?: { url: string; title: string }[]`，`src/slack.ts` 實作圖片與備案，讓 1.1 綠燈

## 2. Engine：房間、牌庫、開局（src/dixit.ts）

- [ ] 2.1 先寫失敗的測試（`test/dixit.test.ts`）：房間（3～8 人、人數不足、房間已滿、不支援 bot、頻道已經有遊戲、房主開始前離開）
- [ ] 2.2 先寫失敗的測試：牌庫（內建 + `custom` 投稿、網址重複只算一張、沒有投稿只有內建）；發牌（4～8 人 6 張、3 人 7 張、不重複）；開局公告（玩家、說書人順序、規則摘要、3 人局出 2 張的說明）；第 1 輪說書人是房主
- [ ] 2.3 實作房間、牌庫、發牌、開局，讓 2.1～2.2 綠燈

## 3. Engine：手牌與說書

- [ ] 3.1 先寫失敗的測試：「🃏 我的手牌」（只有本人看到、圖片編號、說書人在說書階段有按鈕、其他人只有圖片、不顯示名稱、非玩家被拒、舊選單被拒）
- [ ] 3.2 先寫失敗的測試：說書（`pick` 開 `dixitClue` 視窗、改選以最後為準、`clue` 指令帶編號、編號不存在、不是說書人、空白和超過 50 字被拒、公告提示不洩漏牌、進入出牌）
- [ ] 3.3 先寫失敗的測試：說書逾時（公告跳過、不計分、手牌不變、換下一位）；連續一整圈逾時自動結束（沒有 `result`、沒有再來一局）；成功出提示後跳過次數歸零
- [ ] 3.4 實作手牌選單、說書、說書逾時，讓 3.1～3.3 綠燈

## 4. Engine：出牌與投票

- [ ] 4.1 先寫失敗的測試：出牌（「已出 N/M」用 `ref` 更新、出了不能改、3 人局出 2 張與「再出一張」、說書人和出完的人被拒、全部出完提前進投票）；出牌逾時（隨機補出、3 人局補到 2 張、公告）
- [ ] 4.2 先寫失敗的測試：匿名投票（打亂、圖片編號、不顯示出牌者和名稱、4 人局 4 張、3 人局 5 張、8 人局 8 張）；不能投自己的牌、說書人不投票、改票不改進度、「已投 N/M」、全部投完提前揭曉、60 秒到棄權
- [ ] 4.3 實作出牌與投票，讓 4.1～4.2 綠燈

## 5. Engine：計分、補牌、結束

- [ ] 5.1 先寫失敗的測試：計分（部分猜對、全部猜對、全部沒猜對、全員棄權、票數分、3 人局兩張分開算、說書人的牌得票不加分）；揭曉公告（說書人的牌、出牌者、投票者、本輪得分、總分）；投票訊息改成已結束
- [ ] 5.2 先寫失敗的測試：補牌回上限、換下一位說書人；達到 20 分結束；牌庫不夠補滿結束；最高分獲勝、同分並列；`result` 事件；再來一局；房主取消（公告目前分數、沒有 `result`、沒有再來一局）、非房主取消被拒；舊計時器被忽略
- [ ] 5.3 實作，讓 5.1～5.2 綠燈

## 6. Slack 設定（src/games/dixit.ts）

- [ ] 6.1 先寫失敗的測試（放在 `test/dixit.test.ts`，直接測 GameDef 的 parse／button／modals）：指令解析（new、start、cancel、addbot、`clue <編號> <提示>`、help 與不認識的子指令）；按鈕路由（`hand`、`pick:<seq>:<i>`、`play:<seq>:<i>`、`vote:<seq>:<i>`、join／leave／start／rematch）；`dixitClue` 視窗送出交給 engine，fallback 提示 `/game dixit clue <編號> <提示>`
- [ ] 6.2 先寫失敗的測試（`test/slack.test.ts`）：`dixit` 的 `start` 帶入這個頻道的投稿梗圖（`custom`），其他頻道的不會帶入
- [ ] 6.3 實作 `src/games/dixit.ts`（`GameDef`：kind `dixit`、emoji 🎨、name 妙語說書人、players 3～8 人、category `bluff`、`noBots`、help、apply、parse、button、modals），`src/slack.ts` 的開局帶入 `custom` 加上 `dixit`，讓 6.1～6.2 綠燈
- [ ] 6.4 （主控整合時做）先寫失敗的測試：`KINDS` 加 `dixit`；遊戲清單和大廳 🎲 心理戰分類有 🎨 妙語說書人（`dixit`）3～8 人（不支援 bot）；`GAMES` 加一行讓它綠燈
- [ ] 6.5 （主控整合時做）`test/characterization.test.ts` 的 KINDS 加 `dixit`，確認 snapshot 只多出妙語說書人的文字後更新

## 7. 文件與驗證

- [ ] 7.1 README：遊戲列表、wiki 連結、manifest description／usage_hint
- [ ] 7.2 wiki 三頁草稿：妙語說書人、妙語說書人-遊戲規則、妙語說書人-指令（由主控 push）
- [ ] 7.3 跑全部測試和 typecheck
