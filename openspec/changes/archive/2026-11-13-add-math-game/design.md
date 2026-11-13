## Context

流程跟默契問答 (`src/sync.ts`) 幾乎一樣：開始 → 房主設定 → 每題按鈕作答 → 揭曉 → 結算。差別是題目由程式產生、有正解、要計分排名，還有「答對的順序」。架構照舊：純邏輯 engine + `runGame` + `gameText` + `GameDef`，不需要新的 GameEvent 種類，也不用改 `src/slack.ts`。這個 change 疊在 `add-sync-game` 上面 (見 proposal Impact)。

## Goals / Non-Goals

**Goals:**
- 出題是純函式 (吃 `rng`)，可以直接測試範圍和選項
- 單一檔案 `src/math.ts` (出題 + engine)

**Non-Goals:**
- 不用真實時間計算速度 (見 Decision 1)
- 不支援 bot
- 不做混合模式、括號或多個運算子的題目

## Decisions

### 1. 速度分用「答對順序」，不用時間戳
engine 是純邏輯，action 沒有時間。Slack 送到 bot 的順序本來就是大家按的先後，用 `picks` 陣列的順序算名次就能表達「越快越多分」，結果可以重現、測試也簡單。
替代方案：在 action 帶 `at` 時間戳，用剩餘秒數算分。要改 Slack adapter 和所有測試的 action，而且 Slack 的延遲本來就讓毫秒差距沒意義，所以不採用。

### 2. 出題函式
```ts
export function makeQuestion(mode: 'fraction' | 'arith', level: 'easy' | 'normal' | 'hard' | 'hell', rng: Rng): Question
interface Question { mode: Mode; text: string; options: string[]; answer: string }
// text 不分語系，例如 "12 × 7"、"f(x) = 3x⁴ + 2x² + 5, f′(2)"、"3/4 ? 2/3"；options / answer 是按鈕上的文字 (數字或 < = >)
```
- 四則運算的錯誤選項：從 `answer ± (1..10)` 和 `answer ± 10k` 的候選裡隨機挑 3 個不重複、非負、不等於正解的數字；選項 shuffle
- 分數比大小：用交叉相乘 `a1*b2` vs `b1*a2` 判斷大小 (不用浮點數)；等值題目是把一個分數的分子分母同乘 2～4
- 符號用 `×`、`÷`、`−` (Unicode)，分數用 `a/b` 純文字
- 地獄四則：先用 rng 選題型 (微分／積分／極限／混合)，再用整數算出答案，不用浮點數；次方用上標字元 `⁰¹²³⁴⁵⁶⁷⁸⁹`、下標 `₀`；多項式各項用「 + 」連接，係數 1 省略
- 地獄分數：先隨機產生 a/b，再在分母 11～50 裡找出跟它差小於 0.05、寫法不同、不等值的 c/d (用整數比較 `|a·d − c·b| < 0.05·b·d`)

### 3. State 與階段
```ts
phase: 'lobby' | 'setup' | 'question' | 'reveal' | 'ended';
mode; level; total: 10 | 15 | 20;
round; current?: Question;
picks: { user: string; value: string }[];  // 依作答順序，value 是選項文字
players: { id; score; correct }[];
winners?: string[];
seq; timerSeq; timers; lang;
```
- `setup` 60 秒；`question` 10 秒 (地獄 20 秒)；`reveal` 3 秒 (計時到就出下一題或結束)
- `reveal` 階段收到作答回「現在不是作答的時間」

### 4. 訊息與按鈕
- 設定面板：channel `prompt`、`ref: math:setup:${seq}`，按鈕 value `mode:${seq}:fraction`、`level:${seq}:hard`、`total:${seq}:15`、`go:${seq}`；選到的 label 前面加 ✅
- 題目面板：channel `prompt`、`ref: math:${seq}`，按鈕 value `ans:${seq}:<選項>`，作答後原地更新已作答人數
- seq 不符的按鈕 → 忽略
- 指令：`set <字>…`、`go`、`answer <選項>`；`set` 依這局語系比對 (中文：分數／四則／簡單／普通／困難／地獄／10／15／20；英文：fractions／arithmetic／easy／normal／hard／hell／10／15／20)

### 5. 排名
依總分高到低，同分同名次 (1、1、3)。`winners` 是最高分且 > 0 的玩家。

## Risks / Trade-offs

- [按鈕延遲讓網路慢的人吃虧] → 速度分最多只差 5 分，答對的 10 分才是主體
- [地獄的微積分題對沒學過的人太難] → 地獄是房主主動選的，預設是普通
- [困難的乘法 (例如 87 × 6) 10 秒可能太趕] → 有 4 個選項可以估算排除；之後若太難再調範圍
- [分數比大小在簡單難度太容易猜] → 簡單本來就是暖身；普通、困難有等值題目讓「=」也有機會
