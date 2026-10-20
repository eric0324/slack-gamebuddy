## Context

- 官方規則 (Herd Mentality)：每題大家私下寫答案，同時揭曉；人數最多的那組每人得 1 分 (最多平手則沒人得分)；如果剛好只有一個人的答案是獨一無二的，他拿到粉紅牛，粉紅牛會在之後轉給下一個「唯一單獨答案」的人；先拿到 8 分 (8 張牛卡) 且手上沒有粉紅牛的人獲勝。答案算不算同一個由大家討論決定。
- 架構：engine 是純函式 `applyHerd(state, action, rng) → { state, events }`，房間邏輯用 `src/common.ts` 的 `runGame` 等；Slack 設定是 `src/games/herd.ts` 的 `GameDef`，`GAMES` 加一行就接上大廳、清單、help、按鈕、視窗。
- 自由打字的輸入照梗圖大亂鬥：按鈕開 modal (`GameDef.modals`)，modal 打不開時提示改用指令。
- 跨局不重複照禁語：`createLobby(prev)` 沿用 `prev.deck`。

## Goals / Non-Goals

**Goals:**
- 規則一分鐘講完，全部用按鈕或一行指令
- 「意思一樣」由房主判斷，系統只處理字面完全相同
- 一局長度有上限 (最多 15 題)

**Non-Goals:**
- 不支援 bot (bot 寫不出「多數人會想到」的答案)
- 不做同義詞、錯字、簡繁自動判斷
- 不做拆組 (合併錯了不能拆開；房主自行負責)
- 不做玩家投票決定合併 (Slack 上太慢)
- 不做自訂目標分數或題數

## Decisions

### 1. 作答：60 秒，揭曉前可以改，全部答完提前結束
- 按「✍️ 作答」開 modal (`herdAnswer`)，或 `/game herd answer <答案>`；答案去掉前後空白後 1～20 字，超過或空白被拒。
- 改答案：再送一次就覆蓋 (只有自己看到「已更新答案」)。全部玩家都答過就立刻進入分組，所以「改」只在還有人沒答時有用。
- 頻道一則作答狀態訊息 (`ref` 更新) 顯示「已作答 N/M」和還沒答的人，不顯示答案。

### 2. 自動分組
- 正規化：`normalize('NFKC')`、`toLowerCase()`、去掉 `\s`、`\p{P}`、`\p{S}`；正規化後完全相同 (不是子字串) 才同一組。正規化後變成空字串的答案 (只有符號) 在作答時就被拒。
- 組的顯示文字用該組第一個送出的原始答案。
- 頻道公告：題目、每組編號、答案、作答者、人數，人數多的排前面。

### 3. 房主合併 (30 秒)
- 只有房主看得到的訊息：每組一顆按鈕 (按了切換「已選」)，「🔗 合併」(已選兩組以上才有效)、「✅ 完成」。合併後重新公告分組 (`ref` 更新同一則)，房主可以繼續合併。
- 指令備援：`/game herd merge <編號> <編號>…`、`/game herd done`。
- 合併後的組顯示文字用編號最小那組的文字，組重新編號。
- 30 秒到或按完成就計分。只有一組 (大家答案都一樣) 或沒人作答時跳過合併直接計分。
- 非房主按這些按鈕被拒：「只有房主可以合併答案」。

### 4. 計分與粉紅牛
- 只計有作答的玩家。
- 最多人數的組唯一且人數 ≥ 2 → 該組每人 +1。最多人數平手、或最多只有 1 人 → 沒人得分。
- 人數剛好 1 的組只有一組 → 那個人拿到粉紅牛 (原持有者失去)。0 組或 2 組以上單獨答案 → 粉紅牛不動。
- 公告：得分的人、粉紅牛轉移、目前分數表 (🐮 標在持有者旁)。

### 5. 勝負
- 每題計分後檢查：分數 ≥ 8 且沒有粉紅牛的玩家 → 遊戲結束，他們全部獲勝。
- 15 題計分後還沒人達成 → 沒有粉紅牛的玩家中最高分的全部獲勝；最高分是 0 → 沒有人獲勝。
- 15 題：每題約 1.5～2 分鐘，一局最多約 30 分鐘；通常 8～12 題就有人到 8 分。

### 6. 題庫
`src/herdQuestions.ts` 匯出 `HERD_QUESTIONS: string[]`，至少 150 題，台灣日常、開放式、答案有「大家都會想到」的傾向 (例如「最好吃的夜市小吃？」「颱風天最想做的事？」「說到紅色會想到什麼？」)。題目不重複、不空白。

### 7. State

```ts
interface HerdState {
  game: 'herd'; channel: string; host: string;
  phase: 'lobby' | 'answer' | 'merge' | 'ended';
  players: string[];
  deck: number[];           // 還沒抽的題目 (HERD_QUESTIONS 的 index)，跨局沿用
  question?: number; round: number;          // 第幾題 (1 起算)
  answers: Record<string, string>;           // 這題的原始答案
  groups: { text: string; members: string[] }[]; // 分組／合併後
  selected: number[];       // 房主已選的組
  scores: Record<string, number>; cow?: string;
  winners?: string[];       // 正常結束才有
  timerSeq: number; timers: { phase?: number };
}
```

### 8. Action 與指令、按鈕
- `answer { user, text }`：modal `herdAnswer` 或指令 `answer <文字>`
- `pick { user, group }`：按鈕 value `pick:<編號>`；`merge { user, groups? }`：按鈕 `merge` 或指令 `merge 1 3`；`done { user }`：按鈕 `done` 或指令 `done`
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot` (拒絕)、`rematch`、`timeout`
- 按鈕「✍️ 作答」value `write` → 開 modal (照梗圖大亂鬥的做法)

## Risks / Trade-offs

- [房主不公正或不在] → 30 秒自動計分；房主也是玩家，wiki 建議大家在頻道討論
- [合併錯了不能拆] → 這次不做拆組，wiki 說明；之後需要再加「↩️ 復原」
- [Slack ephemeral 按鈕在重新整理後消失] → `/game herd merge`、`/game herd done` 指令備援
- [題目太主觀導致每題都平手] → 題庫挑「有主流答案」的題目
