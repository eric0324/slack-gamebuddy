## Context

流程跟從眾心理 (`src/herd.ts`) 很像：出題 → 私下作答 → 一起揭曉。差別是作答改成選項按鈕 (不用 modal)、選了不能改，而且沒有房主合併階段。架構照舊：純邏輯 engine + `runGame` + `gameText` + `GameDef`，不需要新的 GameEvent 種類，也不用改 `src/slack.ts`。這個 change 疊在 `add-sameword-game` 上面 (見 proposal Impact)。

## Goals / Non-Goals

**Goals:**
- 單一 engine 檔 `src/sync.ts`，結構對齊 `src/herd.ts`
- 題庫資料和程式分開，中英文一對一

**Non-Goals:**
- 不支援 bot
- 不做 30 / 60 秒切換 (固定 60 秒)
- 不做自訂題目

## Decisions

### 1. 題庫資料結構
```ts
// src/syncQuestions.ts
export const SYNC_THEMES = ['mix', 'daily', 'friends', 'food', 'travel', 'movies', 'music', 'games', 'football', 'genshin', 'love', 'family', 'work'] as const;
export const MIX_THEMES = ['daily', 'friends', 'food', 'travel'];
export const SYNC_QUESTIONS: { theme: Exclude<ThemeKey, 'mix'>; q: string; options: string[] }[]; // 依主題分段
export const THEME_NAMES: Record<ThemeKey, string>;
// src/syncQuestionsEn.ts
export const SYNC_QUESTIONS_EN: { q: string; options: string[] }[]; // 和 SYNC_QUESTIONS 一對一、同順序
export const THEME_NAMES_EN: Record<ThemeKey, string>;
export function syncQuestion(lang, id) // 依語系取題
```
題目用全域 index 當 id。主題名稱英文：General Mix、Daily Preferences、Friends、Food & Drink、Travel、Movies、Music、Games、Football、Genshin Impact、Romance、Family、Coworkers & Classmates。

替代方案：每個主題一個陣列。不採用，因為通用隨機要跨主題抽，全域 id 比較好處理。

### 2. 牌堆
`decks: Partial<Record<ThemeKey, number[]>>` 記在 state，新局 (`new`、再來一局) 從上一局 state 接過來 (同從眾心理的 `deck`)。抽題時該主題的牌堆空了就用該主題的所有 id 洗牌重建；`mix` 的牌堆是四個日常主題的所有 id。`mix` 和單一主題的牌堆各自獨立 (spec 只要求同主題不重複)。

### 3. State 與階段
```ts
phase: 'lobby' | 'theme' | 'answer' | 'ended';
theme?: ThemeKey; round: number; question?: number;
picks: { user: string; option: number }[];               // 這一題，依作答順序
history: { question: number; picks: { user; option }[] }[]; // 已揭曉的 10 題
same: number;  // 全員同選題數
score?: number; // 正常結束才有
seq; timerSeq; timers; decks; lang;
```
- `theme` 階段 30 秒 (`THEME_MS`)；`answer` 60 秒 (`ANSWER_MS`)

### 4. 訊息與按鈕
- 主題選擇：channel `prompt`，13 顆按鈕 value `theme:${seq}:${key}`
- 題目面板：channel `prompt`、`ref: sync:${seq}`，選項按鈕 value `pick:${seq}:${i}`，label 是選項文字；作答後用同一個 ref 原地更新 (保留按鈕)
- seq 不符的按鈕 → 忽略 (不送訊息、state 不變)
- 指令：`theme <名稱>` (依這局語系比對主題名稱，英文不分大小寫)、`pick <編號>`

### 5. 結算
- 每一對 (i < j)：兩人都有作答且選同一個的題數，依次數多到少，同次數照玩家順序
- 答題記錄每題一行：`N. 題目：選項 @a @b / 選項 @c`，只列有人選的選項
- 兩則 announce：①全員同選 + 每對默契 ②答題記錄 (8 人 × 10 題估計約 1500 字，在 3000 以內)

## Risks / Trade-offs

- [題庫量大：12 主題 × 30 題 × 中英兩份] → 實作時分主題撰寫，測試檢查數量、格式、一對一
- [原神、足球等定向題有時效性 (角色、球員)] → 題目偏向喜好和經典，避免「最新」「目前」之類會過時的說法
- [8 人很難全員同選] → 結算另外列每一對的默契次數，讓人多時也有東西可以看
