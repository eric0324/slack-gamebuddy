## Context

- 2026-10-15 重構後，房間邏輯（`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`）、`runGame`（`afterChange: runBots`）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`；誰是牛頭王、不要謝謝都這樣用。壽司派對照抄這個結構。
- 誰是牛頭王已經有「同時選牌」的完整做法：頻道 prompt 帶 `ref`（同回合用 `chat.update` 更新同一則）、按鈕打開 `audience: 'ephemeral'` 的手牌選單（`perRow`）、選單 value 帶回合序號 `seq` 擋掉舊選單、全部選好提早揭曉、超時自動出牌、bot 在回合開始就選好。壽司派對沿用同一套。
- 不要謝謝的 `endGame` 示範了 `result` 事件和「再來一局」。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 只用按鈕就能玩完（我的手牌、選牌、筷子）
- 頻道不洩漏任何人的手牌和揭曉前的選擇；桌上已出的牌是公開資訊，一直顯示
- 每回合只發一則牌桌訊息（`ref` 更新進度）加一則揭曉公告，不洗版
- 有人掛機也一定會推進；1 位真人 + bot 可以玩完整局

**Non-Goals:**
- 不做 Sushi Go Party! 或其他擴充／變體（例如 2 人「假玩家」變體）
- 不提供打字的遊戲中指令（只有 new／addbot／removebot／start／cancel／help）
- bot 不使用筷子、不記憶別人的手牌

## Decisions

1. **牌種代號**（按鈕 value 和 state 都用這個）：
   | 代號 | 顯示 | 張數 |
   |---|---|---|
   | `tempura` | 🍤 天婦羅 | 14 |
   | `sashimi` | 🐟 生魚片 | 14 |
   | `dumpling` | 🥟 煎餃 | 14 |
   | `maki1`／`maki2`／`maki3` | 🌀 壽司捲①／②／③ | 6／12／8 |
   | `egg` | 🍳 玉子握壽司 | 5 |
   | `salmon` | 🍣 鮭魚握壽司 | 10 |
   | `squid` | 🦑 魷魚握壽司 | 5 |
   | `pudding` | 🍮 布丁 | 10 |
   | `wasabi` | 🟢 芥末 | 6 |
   | `chopsticks` | 🥢 筷子 | 4 |
   這個順序就是選單排序和 bot 同分時的優先順序。
2. **State**（`src/sushigo.ts`）：
   ```ts
   type Card = 'tempura' | 'sashimi' | 'dumpling' | 'maki1' | 'maki2' | 'maki3' | 'egg' | 'salmon' | 'squid' | 'pudding' | 'wasabi' | 'chopsticks';
   interface SGPlayer {
     id: string;
     hand: Card[];
     table: Card[]; // 這一輪出過的牌，依出牌順序（芥末配對看順序）；布丁也留著方便顯示
     puddings: number; // 前幾輪累積的布丁（不含這一輪桌上的）
     rounds: number[]; // 每輪分數
     pick?: Card; extra?: Card | null; // extra：undefined＝還沒回答筷子，null＝不用筷子
   }
   interface SGState {
     game: 'sushigo'; channel: string; host: string; phase: 'lobby' | 'pick' | 'ended';
     players: SGPlayer[]; deck: Card[]; round: number; turn: number; seq: number; // seq 每回合 +1，當 ref 和選單過期判斷
     winners?: string[]; timerSeq: number; timers: { phase?: number };
   }
   ```
3. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`hand`、`pick { seq, card }`、`extra { seq, card | 'none' }`、`timeout { id }`。
4. **按鈕 value**（kind 都是 `sushigo`）：頻道「🍣 我的手牌」→ `hand`；手牌選單 → `pick:<seq>:<card>`；筷子選單 → `extra:<seq>:<card>` 或 `extra:<seq>:none`。房間按鈕沿用 `join`／`leave`／`start`／`rematch`。
5. **牌桌訊息**：`{ type: 'prompt', kind: 'sushigo', audience: 'channel', ref: 'sushigo:<seq>', options: [我的手牌] }`。第一次選好（含回答筷子）時用同一個 `ref` 更新進度；揭曉時同一個 `ref` 送 `options: []` 改成已揭曉，接著 `announce` 揭曉內容；下一回合 `seq + 1` 發新的一則。
6. **手牌選單**：`{ type: 'prompt', audience: 'ephemeral', user, perRow: 4, options }`，相同牌種合併一顆按鈕（label `🍤 天婦羅 ×2`），文字列出自己桌上的牌和目前選擇。打開選單回傳 false（不改 state、不觸發 bot、不重設計時器）。
7. **筷子流程（兩段式）**：
   - 「可用筷子」＝ 桌上（這回合以前出的）有 `chopsticks` 而且手牌 ≥ 2 張。
   - 選第一張（`pick`）後：沒有可用筷子 → `extra = null`，直接算選好；有可用筷子 → `extra = undefined`，再送一個 ephemeral prompt「🥢 要用筷子再出一張嗎？」，選項是手牌扣掉第一張後的牌種（合併張數）加「不用筷子」，value `extra:<seq>:<card>`／`extra:<seq>:none`。
   - 改選第一張會清掉 `extra`（回到 `undefined`），重新送筷子選單。
   - 選好＝ `pick !== undefined && extra !== undefined`。這樣全部人選好才揭曉時，不會跳過還在想第二張的人。
   - 為什麼不在手牌選單直接放「用筷子」按鈕：兩段式每一步只有一組按鈕，不用處理「先按筷子再選兩張」的中間狀態，也不會誤觸；沒有筷子的人完全看不到額外步驟。
   - 揭曉時依序放 `pick`、`extra` 到桌上（所以「芥末＋握壽司」用筷子一起出時，握壽司會放在這張芥末上），從桌上拿掉一張 `chopsticks` 放回手牌，再傳牌。
8. **檢查順序**：不在遊戲 →「你不在這局遊戲裡」；`seq` 不同 →「這個選單已經過期，請重新按「🍣 我的手牌」」；手上沒有這張 →「你手上沒有 X」；`extra`：還沒選第一張 →「請先選第一張牌」、沒有可用筷子 →「你桌上沒有筷子」、扣掉第一張後沒有這張 →「你手上沒有第二張 X」。全部回 `reply(...)`（state 不變）。
9. **計分是純函式**，匯出方便測試：
   - `scoreRound(tables: Card[][]): { total: number; detail: Record<string, number> }[]`（壽司捲要比較所有人，所以一次算全部）
   - `scorePudding(counts: number[]): number[]`（人數 2 時不扣分；全部一樣時全 0；平分用 `Math.trunc`，讓 −6／4 得 −1，和官方「捨去餘數」一致）
   - 芥末配對：依 `table` 順序掃描，握壽司配最早一張還沒用的芥末。
10. **計時與超時**：`PICK_MS = 60_000`，每回合 `startTimer`。超時：沒選的人依 `botCard()` 出牌（不用筷子），選了第一張但沒回答筷子的人只出第一張；揭曉公告標「（超時自動出牌）」。選 60 秒是因為壽司派對每回合只要看一眼手牌，比誰是牛頭王（2 分鐘）簡單；3 輪最多 30 回合，太長會拖。
11. **bot**：`botCard(hand, table)` 依 bots spec 的價值表，決定性（不用 rng）。和誰是牛頭王一樣，在 `startTurn` 時 bot 直接設定 `pick` 和 `extra = null`，接著檢查全部選好就揭曉（全 bot 的回合不用等）；不需要另外的 `runBots` 迴圈。
12. **輪的流程**：`startRound` 從 `deck` 前面發牌（`HAND = {2:10, 3:9, 4:8, 5:7}`）→ `startTurn` → `reveal` → 傳牌（玩家 i 拿到玩家 i−1 的手牌）→ 手牌空了就 `endRound`：算分、公告、`puddings += 桌上布丁數`、清空 `table`；`round < 3` 開下一輪，否則 `endGame`。
13. **結束**：`endGame` 算布丁分、`total = sum(rounds) + pudding`；排名依總分由高到低、再依布丁由多到少；`winners` 是總分最高者中布丁最多的所有人。公告布丁加減分、每人每輪分數、布丁數、總分和名次，送 `{ type: 'result', players, winners }`，貼「再來一局」，`phase = 'ended'`；`finished(s)` 用 `!!s.winners`，取消的遊戲沒有 winners，所以沒有再來一局。
14. **私訊**：開局私訊規則摘要（各牌計分、筷子用法）；手牌不私訊（每回合都會變，以「🍣 我的手牌」為準）。

## Risks / Trade-offs

- [3 輪、最多 30 回合，每回合等最慢的人] → 全部選好就立刻揭曉、bot 立刻選；60 秒超時保證推進；房主隨時可以取消
- [ephemeral 選單按過不會消失] → 再按就是改選；揭曉後舊選單靠 `seq` 擋掉
- [有筷子的人要多按一次] → 只有桌上有筷子時才出現；超時時只出第一張，不會卡住
- [超時用 bot 規則替人出牌，可能比「隨便出」對掛機的人更有利] → 讓掛機不會讓整局分數失真，也讓計時器測試是決定性的；如果希望懲罰掛機，可改成出手牌第一張（實作只改一行）
- [壽司捲／布丁平分捨去小數] → 照官方規則
- [每回合兩則訊息（牌桌＋揭曉）] → 揭曉內容是重要資訊，獨立一則方便回看；牌桌進度用 `ref` 更新，不會一人一則
