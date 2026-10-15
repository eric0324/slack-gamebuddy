## Why

團隊對抗類目前有機密代號、心電感應、截碼戰，都是「按按鈕」為主。禁語（Taboo）是大家最熟悉的派對遊戲之一：描述者在時間內讓隊友猜出題目詞，但不能說出卡上的禁語，節奏快、規則一句話就講得完。bot 已經會讀頻道訊息（狼人殺、圈內人），描述和猜詞都可以直接在頻道打字，系統自動判斷猜中和犯規，不用另外的裁判。

## What Changes

- 新增遊戲「🤐 禁語」（代號 `taboo`），4～12 位真人，不支援 bot，大廳分類 ⚔️ 團隊對抗
- 隨機分成🔴紅隊、🔵藍隊（人數相差最多 1 人）；兩隊輪流，每輪由一隊派一位描述者，每隊輪數 = 人數較多那隊的人數（每個人至少描述一次）
- **準備**：頻道公告輪到誰，描述者按「▶️ 開始」才開始計時（60 秒沒按，這輪跳過、不計分）
- **描述（90 秒）**：描述者私下（只有自己看得到）收到題目卡（1 個題目詞＋5 個禁語）和「⏭️ 跳過」按鈕，**在頻道打字描述**；隊友**在頻道打字猜**
- 系統自動判斷（比對前統一全形半形、英文大小寫，去掉空白和標點）：
  - 隊友的訊息包含題目詞 → 猜中，本隊 +1，換下一張
  - 描述者的訊息包含題目詞或任何禁語 → 犯規，對手隊 +1，換下一張
  - 描述者按「⏭️ 跳過」→ 對手隊 +1，換下一張
  - 對手隊、不在遊戲裡的人的訊息一律忽略
- 每輪結束公告這輪的猜中／犯規／跳過和比分；全部輪數結束分數高的隊伍獲勝，同分平手
- 新增題目卡詞庫 `src/tabooCards.ts`：至少 150 張，台灣日常熟悉的詞，每張 1 個題目詞＋5 個禁語
- 結束時送出 `result` 事件記錄戰績；附「再來一局」

## 誰算贏（給戰績規則表用）

| 遊戲 | 誰算贏 |
|---|---|
| 禁語 | 分數高的隊伍所有玩家；同分平手時沒有人贏 |

房主取消的遊戲不送 `result`（不記錄）。

## Capabilities

### New Capabilities
- `taboo/setup`：房間、分隊與輪次、題目卡詞庫、遊戲清單與指令說明
- `taboo/rounds`：準備、描述與猜詞、自動判斷猜中與犯規、跳過、計分、勝負與結束

### Modified Capabilities
（大廳分類和戰績規則由主控統一修改）

## Impact

- Code：新增 `src/taboo.ts`（engine）、`src/tabooCards.ts`（詞庫）、`src/games/taboo.ts`（`GameDef`，含 `chat`）；`src/games/index.ts` 的 `GAMES` 加一行
- `src/slack.ts`、`src/index.ts`、`src/engine.ts` 不用改：`chat()` 已經依 `GameDef.chat` 把頻道訊息交給進行中的遊戲；`prompt`（`audience: 'ephemeral'`）、`announce`、`startTimer`、`result` 事件都夠用
- Slack 設定不用改：manifest 已有 `channels:history`、`groups:history`、`message.channels`、`message.groups`
- Tests：新增 `test/taboo.test.ts`、`test/tabooCards.test.ts`；`test/slack.test.ts`（KINDS、大廳團隊對抗分類）、`test/characterization.test.ts`（KINDS 和 snapshot 會多一款遊戲的文字）
- Docs：README（遊戲列表、wiki 連結、manifest description／usage_hint、讀取頻道訊息的說明）、wiki 三頁（禁語、禁語-遊戲規則、禁語-指令）
