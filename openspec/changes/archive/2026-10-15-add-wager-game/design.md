## Context

- 官方 Wits & Wagers：每題大家寫一個數字答案，排序後放到有賠率的押注板上 (中間 2:1、越邊邊賠率越高，另有「比最小的答案還小」6:1 的格子)，玩家用籌碼押注，最接近但不超過正解的答案贏。使用者選了**簡化版**：沒有賠率、沒有籌碼，每人每題 2 個標記，押中 +1、寫出贏格答案 +1 (接近官方 Party 版)。
- 架構照 2026-10-15 重構後的做法：engine 純函式 `applyWager(state, action, rng)`，房間用 `runGame` 等共用 helper；`src/games/wager.ts` 匯出 `GameDef` (help、parse、button、modals)。視窗 (梗圖大亂鬥 `memeWrite`)、私下按鈕選單 (壽司派對手牌)、`ref` 更新同一則頻道訊息 (壽司派對牌桌) 都是現成做法。
- 跨局不重複照禁語：`createLobby(prev)` 沿用 `prev.deck`。

## Goals / Non-Goals

**Goals:** 規則一句話講完；不會答的人靠押注也能贏；一局 7 題約 15 分鐘；題目正確、不會過時。

**Non-Goals:** 不做官方賠率和籌碼；不支援 bot；不接受「萬」「億」等中文數字 (用題目單位讓數字保持好打)；不做負數答案；不做自訂題數或秒數；不讓玩家投稿題目。

## Decisions

### 1. 答案格式：只接受阿拉伯數字

- 先 NFKC (全形轉半形)，去掉空白和逗號，必須符合 `^\d+(\.\d+)?$`；不符合時只讓作答者看到「請輸入數字，例如 1200 或 3.5」。
- 不接受「2300萬」：解析規則和錯誤情況會變多。改由**題目的單位**讓數字好打：例如「台灣人口約多少萬人？」單位「萬人」，答案 2340。題庫測試檢查答案 < 1,000,000。
- 截止前可以重送覆蓋；作答者私下看到「已收到：1,200 萬人」。

### 2. 押注板

- 相同數值合併成一格，格子內列出所有作者；格子由小到大，最前面固定一格「🔺 全部太大」(所有答案都超過正解時，這格贏)。
- 頻道公告押注板 (標示作者)，作答結果不再保密。
- 「🎯 押注」按鈕 → 私下的按鈕選單 (每格一顆，最多 11 顆，`perRow` 自動換行)，按一顆放一個標記；已放 2 個後再按會被拒絕，選單附「↩️ 重押」清空自己的標記。押注結果在揭曉前不公開，頻道訊息用 `ref` 只更新「已押 N/M」。
- 沒寫答案的人也可以押注；沒押完的標記作廢。

### 3. 揭曉與計分

- 贏格：所有答案中 ≤ 正解的最大值那格；沒有就是「全部太大」。
- 每個押在贏格的標記 +1 (兩個都押中 +2)；贏格的每位作者另外 +1 (「全部太大」沒有作者)。
- 公告：正解 (含單位和補充說明)、贏格、每個人本題得分 (只列有得分的人)、目前總分排名。

### 4. 例外

- 沒有人作答：公告「沒有人作答」和正解，不押注、不計分，直接下一題。
- 作答階段時間到但只有部分人作答：照常進押注。
- 押注時間到：沒押的標記作廢，照常揭曉。

### 5. 題庫

`src/wagerQuestions.ts` 匯出 `WAGER_QUESTIONS: { q: string; answer: number; unit: string; note: string }[]`：
- 至少 120 題，`q` 不重複；`answer` 是 ≥ 0 且 < 1,000,000 的有限數字；`unit` 和 `note` 不空白。
- 選題原則：穩定、有公認數字的事實 (地理、歷史年份、生物、太空、運動規則、台灣常識)，避免人口統計年年變動以外的爭議數字；會變動的數字題目要寫明基準 (例如「2020 年人口普查」)。`note` 一句話說明或出處，揭曉時顯示。
- 分類大致平均：台灣、地理、歷史、自然生物、太空科學、人體、運動、生活。

### 6. State (草稿)

```ts
interface WState {
  game: 'wager'; channel: string; host: string;
  phase: 'lobby' | 'answer' | 'bet' | 'ended';
  players: { id: string; score: number }[];
  deck: number[]; q?: number; round: number;          // round：第幾題 (0～6)
  answers: Record<string, number>;                      // user → 答案
  slots: { value: number | null; by: string[] }[];      // value null = 全部太大
  bets: Record<string, number[]>;                       // user → slot index (最多 2)
  winners?: string[]; timerSeq: number; timers: { phase?: number };
}
```

### 7. Action 與指令、按鈕

- `answer { user, text }`：視窗 `wagerAnswer` 或 `/game wager answer <數字>`
- `bet { user, slot }`：按鈕 value `bet:<slot>`；`rebet { user }`：按鈕 `rebet`；`betMenu { user }`：按「🎯 押注」打開私下選單
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot` (拒絕)、`rematch`、`timeout`

## Risks / Trade-offs

- [題目事實錯誤] → 只選穩定事實，每題附 `note`；實作時逐題核對，不確定的題目不收
- [大數字難打] → 題目單位設計 (萬人、公里、年)，答案 < 1,000,000
- [3 人局押注板只有 4 格以內，押注太容易] → 規則照常，3 人局本來就輕鬆
- [視窗打不開] → `fallback` 提示改用 `/game wager answer <數字>`
