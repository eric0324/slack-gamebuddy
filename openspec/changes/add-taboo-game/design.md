## Context

- 官方規則（Hasbro《Taboo》）：兩隊輪流，每輪一隊派一位描述者，在沙漏時間（約 1 分鐘）內描述卡上的題目詞讓隊友猜；不能說出題目詞和卡上的禁語（5 個）、不能比手畫腳或說「聽起來像」。對手隊有人看著卡，描述者犯規時按蜂鳴器。描述者可以跳過（pass）；犯規和跳過的卡都算對手隊的分數。輪數或目標分數由玩家約定。
- 2026-10-15 重構後的架構：
  - engine 是純函式 `applyTaboo(state, action, rng) → { state, events }`，房間邏輯用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`startTimer`、`reply`、`shuffle`、`lobbyEvent`（和 `src/wavelength.ts`、`src/insider.ts` 一樣）
  - Slack 設定是 `src/games/taboo.ts` 的一個 `GameDef`；`GAMES` 加一行，大廳、遊戲清單、help、按鈕路由、`chat()` 轉發都自動接上
  - `GameHost.chat()` 已經依 `DEFS[active].chat` 把頻道裡真人的訊息交給進行中的遊戲（`src/index.ts` 已排除 bot 和有 subtype 的訊息）
  - 戰績：正常結束送 `{ type: 'result', players, winners }`，平手 winners 為空（照 `src/wavelength.ts` 的 `endGame`）
- engine 沒有時鐘，計時全靠 `startTimer`／`timeout`，舊計時器用 `timerSeq` 比對忽略。

## Goals / Non-Goals

**Goals:**
- 描述和猜詞都直接在頻道打字，不用學指令
- 猜中、犯規由系統自動判斷，不需要對手隊當裁判
- 題目卡只有描述者看得到，頻道在卡結束前不洩漏
- 一局長度可預期（固定輪數）

**Non-Goals:**
- 不支援 bot（bot 不會描述也不會猜）
- 不處理同音字、注音、拼音、英文翻譯、拆字等規避方式，也不做對手隊的「🚨 犯規」按鈕（只靠字面比對；規避靠玩家自律）
- 不處理比手畫腳類規則（Slack 上沒有）
- 不做目標分數模式、不做自訂輪數或時間
- 不讓對手隊看到題目卡（官方對手隊會看卡，是為了監督；這裡由系統監督）
- 不刪除或改寫描述者的頻道訊息

## Decisions

### 1. 描述與猜詞怎麼進行

**方案 A：頻道打字 + 系統自動比對（建議，採用）**
描述者和隊友都在頻道打字，`chat()` 轉給 engine：隊友的訊息包含題目詞 → 猜中；描述者的訊息包含題目詞或禁語 → 犯規。
- 優點：最接近面對面玩法；不用裁判；節奏快
- 缺點：字面比對有誤判和漏判（見決定 2）；需要 bot 在頻道裡才收得到訊息

**方案 B：描述者按「✅ 猜中」按鈕判定**
- 優點：同義詞、錯字都能人工判斷
- 缺點：描述者要一邊打字一邊按按鈕，Slack 上更慢；描述者可以作弊；犯規還是需要比對或對手隊裁判

**方案 C：對手隊按「🚨 犯規」裁判**
- 缺點：要處理裁判爭議和惡意按；對手隊要一直盯著；Slack 上反應慢

### 2. 中文比對方式

正規化：`text.normalize('NFKC').toLowerCase()`，再去掉 `\s`、`\p{P}`（標點）、`\p{S}`（符號、emoji），然後用 `includes` 比對子字串。

- 子字串比對而不是分詞：中文沒有空白分詞，「是西瓜嗎」要能猜中「西瓜」；代價是「火車站」也算猜中「火車」、描述者說「熊貓」也算說到「貓」。
- 為了降低誤判，**詞庫規定題目詞和禁語都至少 2 個字**（單字禁語像「紅」「水」幾乎每句話都會碰到）。詞庫測試檢查。
- 去空白和標點：防止「西 瓜」「西.瓜」這種規避，也讓「珍珠 奶茶」猜得中。
- NFKC + 小寫：全形英數和大小寫不同都算一樣（「ＩＰＨＯＮＥ」＝「iphone」）。
- 不處理：同音字、注音、拼音、簡繁轉換、Slack 自訂 emoji 代碼。規避方式交給玩家自律，wiki 寫清楚。

### 3. 準備階段

輪到某人時不直接開始計時，而是先貼「▶️ 開始」按鈕，描述者按了才開始 90 秒。
- 理由：Slack 上大家可能不在畫面前；直接開始會讓描述者一回來時間已經過一半。
- 60 秒沒按 → 這輪跳過、不計分（避免有人離開讓整局卡住）。
- 準備階段的頻道訊息全部忽略（描述者還沒看到卡，不會犯規）。

### 4. 時間：90 秒

官方約 1 分鐘，但 Slack 打字比說話慢很多，而且每則訊息要送出、別人要讀；120 秒在 12 人局會讓一局拉到 30 分鐘以上。取 90 秒，準備階段另外最多 60 秒。

### 5. 輪數：每隊輪數 = 人數較多那隊的人數

- 每個人至少描述一次；兩隊輪數相同才公平（人數少的隊伍有人多描述一次）。
- 長度：4 人局 4 輪約 8 分鐘；12 人局 12 輪約 22 分鐘（含公告和準備）。
- 不用目標分數：Slack 上一張卡可能要很久，目標分數會讓長度不可預期。

### 6. 計分

| 事件 | 分數 |
|---|---|
| 隊友猜中 | 本隊 +1 |
| 描述者犯規 | 對手隊 +1 |
| 描述者跳過 | 對手隊 +1 |
| 時間到時進行中的卡 | 不計分 |

照官方「犯規和跳過的卡給對手」，分數永遠不會是負的，公告比較直觀。跳過和犯規同樣代價是官方做法；之後如果覺得太嚴可以改成「跳過不扣分但每輪限 N 次」。

### 7. 題目卡顯示

用 `prompt`（`audience: 'ephemeral'`, `user: 描述者`, `kind: 'taboo'`）顯示題目詞、禁語和「⏭️ 跳過」按鈕。每換一張卡就發一則新的 ephemeral。
- 跳過按鈕的 value 是 `skip:<卡的流水號>`，按到舊卡的按鈕會被拒絕，不會誤跳目前的卡。
- ephemeral 在 Slack 重新整理後會消失 → 提供 `/game taboo card` 再看一次、`/game taboo skip` 跳過。
- 頻道只在卡結束時公告題目詞（猜中／犯規／跳過）。

### 8. 不同人的訊息

| 誰 | 準備 | 描述中 |
|---|---|---|
| 描述者 | 忽略 | 檢查犯規（題目詞或禁語），不算猜詞 |
| 描述者的隊友 | 忽略 | 檢查猜中 |
| 對手隊 | 忽略 | 忽略（說出題目詞也不算） |
| 旁觀者 | 忽略 | 忽略 |

被忽略或沒有命中的訊息都不回應（events 為空），頻道不會被 bot 洗版。

### 9. State

```ts
type Team = 'red' | 'blue';
interface TState {
  game: 'taboo'; channel: string; host: string;
  phase: 'lobby' | 'ready' | 'describe' | 'ended';
  players: { id: string; team?: Team }[];
  order: string[];          // 每輪的描述者，兩隊輪流
  round: number;            // 目前是 order 的第幾個
  deck: number[];           // 洗好的卡（TABOO_CARDS 的 index），用完重洗
  card?: number;            // 目前的卡
  cardSeq: number;          // 卡的流水號，跳過按鈕用
  log: { word: string; result: 'correct' | 'foul' | 'skip'; by?: string }[]; // 這輪的紀錄
  scores: Record<Team, number>;
  winner?: Team | 'tie';
  timerSeq: number; timers: { phase?: number };
}
```

### 10. Action 與指令、按鈕

- `chat { user, text }`：頻道訊息（`GameDef.chat`）
- `go { user }`：按鈕 value `go`
- `skip { user, seq? }`：按鈕 value `skip:<seq>`；指令 `skip` 沒有 seq，跳目前的卡
- `card { user }`：指令 `card`
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot`（拒絕）、`rematch`、`timeout`
- 指令：`/game taboo new|start|cancel|skip|card|help`；房間的子指令沿用 `parseRoomCommand`

### 11. 詞庫

`src/tabooCards.ts` 匯出 `TABOO_CARDS: { word: string; taboo: string[] }[]`，至少 150 張，按類別分段（食物、地點、物品、動物、職業、活動、交通、節日與文化、科技、運動等），偏台灣日常（夜市、捷運、珍珠奶茶、悠遊卡、便利商店）。禁語選「最直覺會說出口的描述詞」，每個至少 2 個字。

## Risks / Trade-offs

- [子字串誤判：「火車站」算猜中「火車」、「熊貓」算說到「貓」] → 題目詞和禁語至少 2 個字；wiki 說明「包含就算」
- [同音字、注音、英文翻譯可以規避禁語] → 不處理，靠自律；wiki 寫明這類算犯規精神，房主可以取消重開
- [描述者的 ephemeral 卡片在重新整理後消失] → `/game taboo card` 再看一次
- [bot 沒有在頻道裡就收不到訊息] → 開房公告本來就要 bot 在頻道；開局公告提醒「直接在頻道打字」
- [兩人幾乎同時送出：隊友猜中和描述者犯規] → engine 依收到順序處理；第一則結束這張卡，第二則比對的是下一張卡
- [Slack 訊息有 mention、連結等 markup] → 正規化後一般不會剛好組出題目詞；不特別處理
- [12 人局約 22 分鐘偏長] → 之後可以加輪數設定，這次不做
