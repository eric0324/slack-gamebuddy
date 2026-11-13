## Context

同詞相遇的流程跟從眾心理 (`src/herd.ts`) 很像：私下寫字 → 一起揭曉 → 房主在 30 秒內做決定。所以整個架構照從眾心理的寫法：純邏輯 engine + `runGame` 共用房間流程 + `gameText` 中英字典 + `GameDef` 接 Slack。不需要新的 GameEvent 種類，也不用改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 單一 engine 檔 (`src/sameword.ts`)，結構和 `src/herd.ts` 對齊，方便維護
- 跟從眾心理用同一套比對規則 (正規化)

**Non-Goals:**
- 不支援 bot (bot 沒辦法做語意聯想)
- 不做全員投票判定，只有房主可以判定
- 不做同義詞或語意自動比對

## Decisions

### 1. State 與階段
```ts
interface SamewordState {
  game: 'sameword'; channel; host;
  phase: 'lobby' | 'write' | 'judge' | 'ended';
  players: string[];
  round: number;                                   // 1 起算
  words: { user: string; text: string }[];         // 這一輪的詞，依送出順序
  history: { user: string; text: string | null }[][]; // 已揭曉的輪次 (依玩家順序，沒寫是 null)
  used: string[];                                  // 揭曉過的詞正規化後的結果
  seq: number;                                     // 面板 ref 和按鈕過期判斷
  score?: number;                                  // 正常結束才有 → runGame 的 finished
  timerSeq; timers: { phase?: number }; lang?;
}
```
- `write`：90 秒 (`WRITE_MS`)；`judge`：30 秒 (`JUDGE_MS`)
- 「有人沒寫」或「自動相遇」都不會進入 `judge`，揭曉後直接進下一輪或結束

### 2. 正規化共用
把 `src/herd.ts` 裡的 `normalize` 改成 export，`src/sameword.ts` 直接 import。不用搬到 `common.ts`，改動最小。從眾心理的行為不變 (現有測試保護)。

### 3. 訊息與按鈕
- 寫詞面板：`prompt`、`audience: 'channel'`、`ref: sameword:${seq}`，按鈕 value `write`；有人送出就用同一個 ref 原地更新 (同從眾心理的 answerBoard)
- 揭曉：`announce` 列出每人的詞；需要判定時再送一則 `prompt` (channel)，按鈕 value `same:${seq}`、`next:${seq}`。房主以外的人按 → `reply` 拒絕；seq 不符或遊戲已結束 → 忽略 (不送任何訊息、state 不變)
- 寫詞視窗：modal kind `samewordWord`，fallback 提示改用 `/game sameword word <詞>`
- 指令：`word <詞>` (詞可以有空白)、`same`、`next`，其他交給 `parseRoomCommand`

### 4. 計分
`score = 11 - round` (相遇)、`0` (10 輪失敗)。戰績的合作遊戲排行榜是依最高分排，所以越早相遇分數越高，跟現有 `recordMatch(…, score)` 相容，不用改 `src/stats.ts`。

### 5. 大廳
`kind: 'sameword'`、`emoji: '💞'` (🔗 已被其他遊戲使用)、`name: '同詞相遇'`、`players: '3～10 人'`、`category: 'coop'`、`noBots: true`、`locales.en` (Same Word / 3-10 players)。`GAMES` 加在最後一行 (大廳合作分類的順序就是一字千金、花火、心電感應 (合作)、星際探險隊、同詞相遇)。

## Risks / Trade-offs

- [10 人局很難所有人寫出一樣的詞] → 房主可以判定「算相同」；最多 10 輪就結束，不會拖太久
- [有人掛機一直沒寫，那幾輪都不能相遇] → 計時到就揭曉照樣前進；房主可以取消重開
- [揭曉訊息加聯想路線在 10 人 × 10 輪時偏長] → 路線每輪一行、只列詞不加 @ 名字 (依玩家順序，沒寫顯示「—」)，10 人 × 20 字約 220 字一行；測試確認 10 人 10 輪的結束訊息少於 3000 字
