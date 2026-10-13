## Why

等 AI 回應的空檔適合玩短的團隊推理遊戲。心電感應玩起來不錯，同一群人想再多一款兩隊對抗、需要動腦的遊戲；截碼戰（Decrypto）的「寫提示 → 隊友解 → 對手攔截」可以沿用心電感應的寫提示視窗和分隊機制。

## What Changes

- 新增遊戲「🔐 截碼戰」（代號 `decrypto`），4～12 位真人，不支援 bot
- 隨機分成⚫黑隊、⚪白隊；每隊有 4 個祕密詞（編號 1～4），私訊給隊員
- 每回合兩隊**同時**進行：各隊輪一位加密者，私訊他一組 3 碼密碼（1～4 不重複），加密者按「✍️ 寫提示」開視窗寫 3 個提示
- 兩組提示一起公開後，每個人用按鈕**各自投票**：解自己隊的密碼（加密者不投）、攔截對方隊的密碼（第 1 回合不攔截），多數決，平手隨機
- 每個階段全部送出或 3 分鐘結束
- 官方勝負：攔截成功 2 次獲勝、自己解錯 2 次落敗；最多 8 回合，之後比（攔截數 − 解錯數），同分平手
- 「📜 提示紀錄」按鈕：任何人隨時看兩隊每個編號用過的提示
- Slack 視窗支援多個輸入欄（目前只有一個欄位）

## Capabilities

### New Capabilities
- `decrypto/setup`：房間、分隊、祕密詞、詞庫、遊戲清單與說明
- `decrypto/rounds`：寫提示、投票解碼與攔截、揭曉、提示紀錄、勝負與結束

### Modified Capabilities
（無：視窗多欄位是 adapter 的實作細節，心電感應的行為不變）

## Impact

- Code：新增 `src/decrypto.ts`、`src/decryptoWords.ts`；`src/engine.ts`（modal 事件可帶多個欄位）、`src/slack.ts`（註冊遊戲、指令、按鈕、多欄位視窗）、`src/index.ts`（讀取多個欄位）
- Tests：新增 `test/decrypto.test.ts`、`test/decryptoWords.test.ts`；`test/slack.test.ts`
- Docs：README manifest、wiki 新增截碼戰頁面
