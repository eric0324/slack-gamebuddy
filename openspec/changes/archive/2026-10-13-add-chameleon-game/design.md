## Context

- 官方規則 (Big Potato《The Chameleon》)：主題卡 16 個詞公開；莊家擲一顆 6 面骰和一顆 8 面骰，查「代碼卡」得到座標；平民拿代碼卡、變色龍拿變色龍卡。從莊家開始順時針每人說一個詞，說完討論、同時指人投票，平手由莊家決定。沒抓到變色龍 → 變色龍 +2 分；抓到但變色龍猜中 → 變色龍 +1 分；抓到且猜錯 → 其他人各 +2 分。先到 5 分的人獲勝，3～8 人。
- 現有可以直接用的東西：
  - `modal` 事件 (單一欄位，心電感應在用)：按鈕 `trigger_id` → `views.open`，送出後 `index.ts` 呼叫 `host.modal(callbackId, channel, user, name, texts)`；`slack.ts` 的 `modal()` 依 callbackId 分派
  - 輪流發言加計時：誰是臥底 (`endSpeech`、40 秒)、間諜危機；投票按鈕、改票、全部投完提早結束：圈內人的 `vote`
  - `prompt` 的 `perRow` (截碼戰 24 組密碼用 `perRow: 6`)、`audience: 'ephemeral'`
  - `startTimer`／`timeout` 加 `timerSeq` 比對 (engine 沒有時鐘)
- 圈內人的流程 (問答 → 討論 2 分鐘 → 投票 2 分鐘 → 結束) 和變色龍很像，engine 結構照抄圈內人。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用記指令就能玩：說詞用視窗、投票和猜詞用按鈕；指令只是備用
- 每個決策都有時限和超時行為，有人掛機遊戲也會結束
- 頻道不洩漏祕密詞、變色龍和投票中的個別選擇

**Non-Goals:**
- 不做官方的累積分數 (先到 5 分)：一局一次投票直接分勝負，想再玩按「再來一局」(見決定 1)
- 不做官方的骰子＋代碼卡查表 (機率不均勻)：直接從 16 格均勻隨機，私訊時顯示「🎲」和座標保留味道
- 不支援 bot (見決定 5)
- 不做官方「說詞後自由發問、重說」的變體，每人只說一次
- 不讀頻道訊息：討論是自由聊天，系統不參與
- 不記錄戰績 (`gameRecord` 目前只給狼人殺)

## Decisions

### 1. 計分：單局勝負 (建議) vs 官方累積分數

**方案 A：單局勝負 (建議)**
一次投票就結束，勝方是「變色龍」或「其他人」。
- 優點：一局 5～8 分鐘，符合「等 AI 回應的空檔」；state 簡單；和圈內人、間諜危機一致
- 缺點：少了官方「誰先到 5 分」的個人競爭，以及「抓到但猜中只拿 1 分」的分數差別

**方案 B：官方計分，先到 5 分**
每局結束累計分數，自動開下一局 (換主題卡、換變色龍)，直到有人 5 分。
- 優點：忠於原作；變色龍「被抓到但猜中」和「完全沒被抓到」有分數差別
- 缺點：一場要 3～6 局、30 分鐘以上，Slack 非同步很容易有人中途離開；要處理中途離開、分數公告、局間節奏

**決定：A。** 結束公告仍然區分「變色龍沒被抓到」和「被抓到但猜中逃脫」兩種結果文字。之後要加 B 可以在 state 加 `scores` 和局數，不影響這次的流程。

### 2. 說詞怎麼輸入

**方案 1：按鈕開 Slack 視窗 (建議) ＋ `say` 指令備用**
輪到的人按「✍️ 說詞」→ engine 回 `modal` (kind `chameleonWord`、label「一個和祕密詞有關的詞 (1～20 字)」)→ 送出變成 `say` action。
- 優點：沿用心電感應的單一欄位視窗，engine／`index.ts` 都不用改；不用讀頻道訊息；輸入內容由 bot 統一公告，格式乾淨
- 缺點：要多按一次

**方案 2：直接在頻道打字 (像圈內人的 `chat()`)**
- 缺點：討論、閒聊的訊息會被誤當成說詞；輪到的人打錯字無法收回；要改 `chat()`

**決定：方案 1。** 只檢查長度 (1～20 字) 和「不能是主題卡上的詞」，不檢查是不是一個「詞」(中文斷詞判斷不可靠)。

### 3. 不能說主題卡上的詞
官方沒有明文規定，但說出主題卡上的詞等於幫變色龍縮小範圍或直接洩漏答案。只擋「祕密詞」會洩漏資訊 (變色龍說到祕密詞時被拒就知道答案)，所以**擋主題卡上全部 16 個詞**，所有人一樣。比對忽略前後空白和大小寫。

### 4. 平手與指認
官方由莊家決定平手。這裡的「起始玩家」就是莊家：起始玩家投的人在同票名單裡就指認他，否則沒有指認出人 (變色龍逃脫)。起始玩家是變色龍也照樣適用 (和官方一樣)。沒人投票 → 沒指認 → 變色龍逃脫。

### 5. 不支援 bot
bot 平民要說出「和祕密詞有關、但不是主題卡上的詞」的聯想詞，需要每張卡每個詞都準備聯想詞 (30 張 × 16 詞 = 480 組以上)，而且品質直接影響好不好玩；bot 變色龍更難。誰是臥底的 bot 是每組詞有描述句，成本已經不小。**這次不支援 bot**，`addbot`／`removebot` 回「變色龍不支援 bot」。3 人就能開，測試成本可以接受。

### 6. 階段與計時
- `phase`: `lobby` → `speak` (每人 2 分鐘)→ `discuss` (2 分鐘)→ `vote` (2 分鐘)→ `guess` (2 分鐘，只有抓到變色龍時)→ `ended`
- 沿用 `timerSeq`／`timers.phase`：換人、換階段都開新計時器，舊的 `timeout` 用 id 比對忽略
- 每人說詞 2 分鐘最多 8 人 = 16 分鐘，但送出就換下一位，平常 1～2 分鐘就說完；房主可以 `next` 跳過掛機的人

### 7. 猜祕密詞用頻道按鈕
抓到後頻道貼 16 個按鈕 (`perRow: 4`，標籤「A1 蘋果」)，value `guess:<格子編號 0～15>`。大家都看得到變色龍猜了什麼，不需要隱藏；非變色龍按了被擋。`/game chameleon guess <詞或座標>` 備用，座標用 `/^[A-D][1-4]$/i`，否則比對詞。

### 8. State
```ts
interface CState {
  game: 'chameleon'; channel: string; host: string;
  phase: 'lobby' | 'speak' | 'discuss' | 'vote' | 'guess' | 'ended';
  players: { id: string }[];
  topic?: string; words?: string[];   // 16 個，index 0～15 對應 A1～D4
  secret?: number;                    // 祕密詞的格子編號
  chameleon?: string;
  order: string[]; turn: number;      // 說詞順序 (order[0] 是起始玩家) 和目前輪到第幾位
  said: Record<string, string>;       // 玩家 → 說的詞；沒說的不在裡面
  votes: Record<string, string>;      // 投票者 → 被投的人
  accused?: string;
  guessed?: number;                   // 變色龍猜的格子編號
  finished?: boolean;                 // 正常結束 (取消沒有)→ 有再來一局
  timerSeq: number; timers: { phase?: number };
}
```

### 9. Action 與按鈕
- `openSay { user }` (按鈕「✍️ 說詞」，回 modal)、`say { user, text }` (視窗送出或指令)、`next { user }` (房主跳過)
- `startVote { user }` (按鈕「🗳️ 開始投票」或 `vote` 指令)、`vote { user, target }` (value `vote:<userId>`)
- `guess { user, text }` (指令)／`guess { user, cell }` (按鈕 value `guess:<0～15>`)
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot` (拒絕)、`rematch`、`timeout`
- 遊戲按鈕的 prompt `kind` 用 `chameleon` (action_id `ww:chameleon:<i>`)，在 `chameleonButton` 裡解析 value；視窗 callback_id `ww:chameleonWord`

### 10. 主題卡詞庫
`src/chameleonCards.ts` 匯出 `CHAMELEON_CARDS: { topic: string; words: string[] }[]`，至少 30 張、每張 16 個詞，題材選台灣日常熟悉的 (水果、夜市小吃、動物、職業、運動、交通工具、國家、樂器、廚房用品、超商商品、節日、天氣、顏色、童話故事、超級英雄、電影類型、甜點、飲料、家具、身體部位、學科、樂園設施、海洋生物、文具、服裝、星座、台灣景點、早餐店、3C 產品、昆蟲…)。附一個檢查數量和格式的測試。

## Risks / Trade-offs

- [3 人局變色龍太容易被抓] → 官方允許 3 人，不另外處理；房主想玩可以多找人
- [有人掛機] → 每步都有 2 分鐘時限，房主可以 `next` 跳過說詞、提早投票、`cancel`
- [Slack 視窗的 `trigger_id` 3 秒內要用] → 和心電感應一樣，按鈕直接回 `modal` 事件；開不了時還有 `say` 指令
- [說詞被擋的規則 (主題卡上的詞) 可能讓人困惑] → 開局公告和 help 都寫明；被擋時只讓本人看到原因
- [單局勝負少了官方的分數策略] → 列為待使用者決定的問題；結構上之後能加
