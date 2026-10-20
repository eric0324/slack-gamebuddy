## Why

推理類的誰是臥底、間諜危機都要「描述一句話」或「接力提問」，一局要 10 分鐘以上。變色龍 (The Chameleon) 只要每人說**一個詞**、投一次票，一局大約 5～8 分鐘，3 個人就能玩，很適合等 AI 回應的空檔；主題卡的 16 個詞公開在頻道上，變色龍也有線索可以裝，新手容易上手。

## What Changes

- 新增遊戲「🦎 變色龍」(代號 `chameleon`)，3～8 位真人，不支援 bot，大廳分類 🔍 推理
- 每局隨機抽 1 張主題卡 (例如「水果」)，16 個詞排成 4×4 格 (座標 A1～D4)，**公開貼在頻道**
- 系統模擬擲骰隨機決定 1 格當祕密詞；隨機選 1 位🦎變色龍；變色龍以外的人私訊收到祕密詞和座標，變色龍私訊收到「你是變色龍」
- **說詞**：隨機選一位起始玩家，依加入順序輪流；輪到的人按「✍️ 說詞」開 Slack 視窗輸入一個和祕密詞有關的詞 (或 `/game chameleon say <詞>`)，頻道公告；每人 2 分鐘，超時跳過
- **討論 (2 分鐘)**：說完後頻道列出所有人說的詞，大家自由討論；房主可以用按鈕或 `/game chameleon vote` 提早投票
- **投票 (2 分鐘)**：每人投一位 (不能投自己)、可改票、只有自己看到、全部投完提早結束；平手由起始玩家的票決定
- **抓錯人或沒指認** → 變色龍逃脫獲勝；**抓到變色龍** → 變色龍有 2 分鐘從 16 個詞中猜祕密詞 (頻道按鈕或 `/game chameleon guess <詞或座標>`)，猜中逃脫獲勝、猜錯或超時其他人獲勝
- 單局勝負 (不做官方的累積分數)，結束公告祕密詞、變色龍、每個人說的詞和投的票，附「再來一局」
- 新增主題卡詞庫 `src/chameleonCards.ts`：至少 30 張，每張 16 個不重複的詞

## Capabilities

### New Capabilities
- `chameleon/setup`：房間、身分與祕密詞、主題卡詞庫、遊戲清單與指令說明
- `chameleon/rounds`：說詞、討論、投票、變色龍猜詞、勝負與結束

### Modified Capabilities
(大廳分類由主控統一修改)

## Impact

- Code：新增 `src/chameleon.ts`、`src/chameleonCards.ts`；`src/slack.ts` (註冊遊戲、指令、按鈕、`modal()` 加 `ww:chameleonWord`、help、GAME_LIST、CATALOG)
- `src/engine.ts`、`src/index.ts` 不用改：現有的 `announce`、`dm`、`ephemeral`、`prompt` (`perRow`)、`modal` (單一欄位)、`startTimer`／`timeout` 事件就夠用；`index.ts` 已經把視窗送出的內容交給 `host.modal()`
- Slack 設定不用改：不需要讀頻道訊息 (討論是自由聊天，系統不讀)
- Tests：新增 `test/chameleon.test.ts`、`test/chameleonCards.test.ts`；`test/slack.test.ts`
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 新增變色龍三頁

> 註：變色龍和蟑螂撲克一起合併，`game-commands` 的大廳分類修改 (兩款都加入) 統一寫在 `add-cockroach-game` 的 delta。
