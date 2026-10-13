## Context

- 官方規則（Oink Games《Insider》）：主持人公開身分、知道答案，只能回答「是／否／不知道」；圈內人祕密知道答案，要引導大家猜到又不被發現。5 分鐘內猜中才進入找圈內人的階段；沒猜中全體落敗。
- 現有可以直接用的東西：
  - `src/index.ts` 的 `app.message` 已經把頻道裡真人的訊息（排除 bot 和有 subtype 的訊息）交給 `GameHost.chat(channel, user, text)`；manifest 也已經有 `channels:history`、`groups:history`、`message.channels`、`message.groups`。
  - `GameHost.chat()` 目前只在狼人殺進行中才轉給 engine（`{ type: 'chat', user, text }`），其他遊戲的頻道訊息直接忽略。
  - `prompt` 事件 `audience: 'ephemeral'` 可以只讓某人看到一則帶按鈕的訊息（花火、截碼戰在用）；`startTimer`／`timeout`；`dm`；投票按鈕和結果公告可以照間諜危機的 `openVote`／`endVote`。
  - 詞庫：`DECRYPTO_WORDS`（160 個具體名詞，有分類）、`CODENAMES_WORDS`（一字千金也在用）。
- engine 是純函式、沒有時鐘（沒有任何遊戲用 `Date.now()`），計時全靠 `startTimer`。

## Goals / Non-Goals

**Goals:**
- 平民發問不用學指令：直接在頻道打字
- 主持人回答不用打字：每題都有按鈕
- 「猜中」由人判斷，不會被系統誤判
- 頻道不洩漏答案、圈內人和投票中的個別選擇

**Non-Goals:**
- 不支援 bot（bot 不會發問，也沒辦法當主持人）
- 不做官方的兩階段投票（先投「猜中的人是不是圈內人」再投全部人），只做一次投票
- 討論時間不做官方的「翻沙漏＝已經用掉的時間」，固定 2 分鐘（engine 沒有時鐘）
- 不做主持人自己選詞或換詞
- 不把主持人已回答的按鈕訊息換掉或刪掉（舊按鈕按了會被 engine 擋）
- 不記錄戰績（`gameRecord` 目前只給狼人殺）

## Decisions

### 1. 問答怎麼進行

**方案 A：頻道打字 + 每題只讓主持人看到一組按鈕（建議）**
平民直接在頻道打字，`chat()` 轉給 engine，engine 送一則 `prompt`（`audience: 'ephemeral'`, `user: 主持人`）帶「是／否／不知道／猜中了」。主持人按了之後 engine 在頻道公告「❓ B：問題 → ✅ 是」。
- 優點：發問最自然；頻道只多一則回答公告；按鈕綁定題目 id，多人同時問也不會答錯題；engine／adapter 都不用新事件
- 缺點：主持人那邊的 ephemeral 會一直累積（已回答的不會消失）；需要 bot 已經在頻道裡才收得到訊息事件；閒聊也會變成一題（主持人不理就好）

**方案 B：頻道打字 + bot 在頻道對每題貼一則帶按鈕的訊息**
- 優點：大家都看得到「這題還沒回答」
- 缺點：頻道訊息量翻倍；所有人都看得到回答按鈕（engine 要擋非主持人）；回答後要把按鈕換成結果，需要新的「更新某則 prompt」機制（現在只有 lobby、board 會 update）

**方案 C：固定一組「回答面板」，主持人回答「最新一題」**
- 優點：主持人只有一組按鈕
- 缺點：兩人幾乎同時問就會答錯題，主持人沒辦法挑題回答

**方案 D：只用 `/game insider ask <問題>` 發問**
- 優點：不依賴訊息事件
- 缺點：slash command 的內容別人看不到，bot 要轉貼；每題都要打指令，很不自然

**決定：A 為主，D 當備用**（`ask` 指令發問時 engine 先在頻道公告問題）。值得注意的取捨：不過濾「像不像問題」（例如以「？」或「嗎」結尾），每則訊息都算一題，避免中文問句判斷的誤差；主持人不回答閒聊即可。

### 2. 怎麼判定猜中

**方案 1：主持人按「🎯 猜中了」（建議）**
每題的按鈕多一個「🎯 猜中了」，這題的發問者就是猜中的人。
- 優點：同義詞、錯字、「是不是企鵝？」各種問法都能正確判斷；符合官方「主持人宣布猜中」的做法；不用額外的比對程式
- 缺點：主持人按錯就直接進討論（沒有復原）

**方案 2：系統比對頻道訊息有沒有包含答案**
- 缺點：誤判（「比企鵝大嗎？」也包含答案）、漏判（「國王企鵝」、錯字、英文、注音）；圈內人可以故意把答案藏在長句裡；比對規則難寫清楚也難測

**方案 3：方案 1 + 系統提示**（訊息包含答案時在主持人的按鈕訊息上標「⚠️ 這題提到答案」）
- 可以之後再加，這次不做

**決定：方案 1。**

### 3. 計時與階段
- `phase`: `lobby` → `question`（5 分鐘）→ `discuss`（2 分鐘）→ `vote`（2 分鐘）→ `ended`
- 沿用 `timerSeq`／`timers` 的做法：換階段時舊計時器的 `timeout` 用 id 比對忽略
- 討論固定 2 分鐘；房主可以用「🗳️ 開始投票」按鈕或 `/game insider vote` 提早投票（和間諜危機的房主 `vote` 一樣）

### 4. State
```ts
interface IState {
  game: 'insider'; channel: string; host: string;
  phase: 'lobby' | 'question' | 'discuss' | 'vote' | 'ended';
  players: { id: string }[];
  master?: string; insider?: string; word?: string;
  questions: { id: number; user: string; text: string; answer?: 'yes' | 'no' | 'unknown' | 'correct' }[];
  guesser?: string;
  votes: Record<string, string>; // 投票者 → 被投的人
  finished?: boolean;            // 正常結束（取消沒有）→ 有再來一局
  timerSeq: number; timers: { phase?: number };
}
```

### 5. Action 與按鈕
- `chat`（頻道訊息，adapter 從 `chat()` 傳進來）、`ask`（指令，會先公告問題）
- `answer { user, question, answer }`：按鈕 value `answer:<題號>:yes|no|unknown|correct`
- `vote { user, target }`：按鈕 value `vote:<userId>`；`skip { user }`：value `skip`
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot`（拒絕）、`rematch`、`timeout`
- 所有遊戲按鈕的 prompt `kind` 用 `insider`（action_id `ww:insider:<i>`），和截碼戰一樣在 `insiderButton` 裡解析 value

### 6. Adapter 的 `chat()`
`chat()` 改成：頻道進行中的是狼人殺 → 照舊；是圈內人 → `dispatchGame('insider', channel, { type: 'chat', user, text })`；其他遊戲照舊忽略。engine 對不算問題的訊息回傳空的 events（不回應）。`index.ts` 不用改。

### 7. 投票平手
主持人有投票權而且是公開身分、不會是圈內人，所以用主持人的票決定平手是公平的 tie-breaker：主持人投的人在同票名單裡就指認他，否則沒有指認出人（圈內人獲勝）。

### 8. 詞庫
重用 `DECRYPTO_WORDS`：具體、大家都認識的名詞，適合是非題。最後一類「抽象與活動」（時間、運氣…）比較難猜，但 5 分鐘內還是可以，先不另外做詞庫。不新增詞庫檔案，也不用新的詞庫測試。

### 9. 主持人與圈內人
每局隨機抽，主持人和圈內人一定是不同人；再來一局重新隨機（不輪替）。

## Risks / Trade-offs

- [bot 沒被加進頻道就收不到訊息事件] → 開房要能在頻道發訊息本來就需要 bot 在頻道；另外有 `/game insider ask` 備用，help 和開局公告都寫
- [主持人的 ephemeral 越疊越多] → 每則都帶題目，主持人可以挑；舊按鈕被 engine 擋；之後可以用 `response_url` 換成「已回答」
- [閒聊也會跑出一組按鈕] → 主持人不按就好；開局公告提醒「問答期間在頻道打的字都會送給主持人」
- [主持人誤按「猜中了」] → 沒有復原；房主可以 cancel 再開一局
- [ephemeral 訊息在 Slack 重新整理後消失] → 主持人沒回答的題目就不見了，發問者可以再問一次
- [一題超長訊息] → 顯示時截到 200 字
