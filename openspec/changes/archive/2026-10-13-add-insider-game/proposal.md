## Why

推理類目前都是「發言 → 投票」的流程。圈內人 (Insider) 把猜詞和找內鬼合在一起：大家用是非題合力猜出答案，猜中後再回頭找出那個「知道答案卻裝不知道」的人。一局大約 10 分鐘，適合等 AI 回應的空檔；而且 bot 已經會讀頻道訊息 (狼人殺)，問問題可以直接在頻道打字，不用學指令。

## What Changes

- 新增遊戲「🕴️ 圈內人」(代號 `insider`)，4～8 位真人，不支援 bot，大廳分類 🔍 推理
- 角色：🎩 主持人 (公開身分，知道答案，只能回答)、🕴️ 圈內人 (祕密身分，知道答案，暗中引導)、其他人是平民；身分和答案用私訊告知
- **問答階段 (5 分鐘)**：主持人以外的玩家直接在頻道打字發問；每則訊息系統都只讓主持人看到一組按鈕「✅ 是」「❌ 否」「🤷 不知道」「🎯 猜中了」，主持人按了之後頻道公告這題的回答。也可以用 `/game insider ask <問題>` 發問
- **猜中**由主持人按「🎯 猜中了」判定，發問的人是「猜中的人」；5 分鐘內沒人猜中，所有人 (包含圈內人) 一起落敗
- **討論階段 (2 分鐘)**：猜中後大家在頻道討論誰是圈內人，房主可以用按鈕或 `/game insider vote` 提早投票
- **投票 (2 分鐘)**：所有人 (包含主持人) 投票選出圈內人，投完提早結束；得票最多的人是圈內人時主持人與平民獲勝，否則圈內人獲勝；平手由主持人的票決定
- 結束公告答案、圈內人、每個人的票，附「再來一局」
- 詞庫重用截碼戰的 `DECRYPTO_WORDS`
- `GameHost.chat()` 原本只把頻道訊息交給狼人殺，改成也交給進行中的圈內人

## Capabilities

### New Capabilities
- `insider/setup`：房間、角色分配、詞庫、遊戲清單與指令說明
- `insider/rounds`：問答、猜中、討論、投票、勝負與結束

### Modified Capabilities
- `game-commands`：遊戲大廳的 🔍 推理分類加入圈內人

## Impact

- Code：新增 `src/insider.ts`；`src/slack.ts` (註冊遊戲、指令、按鈕、help、GAME_LIST、CATALOG、`chat()` 交給圈內人)
- `src/index.ts`、`src/engine.ts` 不用改：`app.message` 已經把真人的頻道訊息交給 `host.chat()`；現有的 `prompt` (`audience: 'ephemeral'`)、`announce`、`dm`、`startTimer` 事件就夠用
- Slack 設定不用改：manifest 已經有 `channels:history`、`groups:history` 和 `message.channels`、`message.groups`
- Tests：新增 `test/insider.test.ts`；`test/slack.test.ts`
- Docs：README (遊戲列表、manifest description／usage_hint、讀取頻道訊息的說明)、wiki 新增圈內人頁面

> 註：這次 5 款遊戲一起合併。大廳分類的 `game-commands` 修改統一寫在 `add-loveletter-game` 的 delta (最後歸檔)，這個 change 不另外修改 `game-commands`，避免依序歸檔時互相覆蓋。
