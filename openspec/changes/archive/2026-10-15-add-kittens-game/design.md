## Context

- 房間邏輯（`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`）、`runGame`（`afterChange: runBots`）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`；壽司派對、蟑螂撲克都這樣用，炸彈貓照抄。
- 壽司派對示範了頻道牌桌訊息帶 `ref`（同回合用 `chat.update` 更新）、`audience: 'ephemeral'` 的手牌選單（`perRow`）、選單 value 帶序號擋舊選單。
- 政變（coup）示範了「出牌後等別人反應」的計時（`REACT_MS`）和頻道上的反應按鈕；炸彈貓的反對等待照這個做，只是改成 5 秒、可以連鎖。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 只用按鈕就能玩完（我的手牌、出牌、選對象、抽牌、反對、給牌、放炸彈）
- 頻道不洩漏手牌、牌堆順序、炸彈放回的位置、索取或偷到哪張、誰有反對
- 有人掛機也一定會推進；1 位真人 + bot 可以玩完整局

**Non-Goals:**
- 不做擴充包（Imploding Kittens 等）和後來版本的規則（攻擊累加）
- **不做三張相同貓咪的組合**（指名要一種牌）和五張不同牌的組合：多一層「選牌種」選單、規則說明也變長，玩起來差別不大；只做一對
- 只有貓咪卡能組成一對（原版允許任意兩張相同的牌，但功能牌拿來組對很少見，只做貓咪讓選單簡單）
- 不提供打字的遊戲中指令（只有 new／addbot／removebot／start／cancel／help）

## Decisions

1. **牌種代號**（按鈕 value 和 state 都用這個），順序就是選單排序：
   | 代號 | 顯示 | 張數 |
   |---|---|---|
   | `bomb` | 💣 炸彈貓 | 4（放入 人數−1） |
   | `defuse` | 🧯 拆解 | 6 |
   | `nope` | 🚫 反對 | 5 |
   | `attack` | ⚔️ 攻擊 | 4 |
   | `skip` | ⏭️ 跳過 | 4 |
   | `favor` | 🙏 索取 | 4 |
   | `shuffle` | 🔀 洗牌 | 4 |
   | `future` | 🔮 預見未來 | 5 |
   | `taco`／`melon`／`potato`／`beard`／`rainbow` | 🌮 塔可貓／🍉 西瓜貓／🥔 馬鈴薯貓／🧔 鬍子貓／🌈 彩虹貓 | 各 4 |
2. **State**（`src/kittens.ts`）：
   ```ts
   type Card = 'bomb' | 'defuse' | 'nope' | 'attack' | 'skip' | 'favor' | 'shuffle' | 'future' | Cat;
   interface KPlayer { id: string; hand: Card[]; out?: number; } // out：第幾個出局
   interface KState {
     game: 'kittens'; channel: string; host: string;
     phase: 'lobby' | 'play' | 'target' | 'nope' | 'favor' | 'place' | 'ended';
     players: KPlayer[]; deck: Card[]; // deck[0] 是最上面
     turn: number; // 輪到的玩家 index
     turnsLeft: number; // 這位還要進行幾回合（1 或 2）
     seq: number; // 每回合 +1，牌桌 ref 和選單過期判斷
     played: string[]; // 這回合出過的牌（顯示用）
     pending?: { card: Card | 'pair'; cat?: Cat; by: string; target?: string; nopes: number }; // 等反對的牌
     choosing?: { card: 'favor' | 'pair'; cat?: Cat }; // phase 'target'：選對象中
     favor?: { from: string; to: string }; // phase 'favor'
     botTop?: Record<string, Card | null>; // bot 記得的最上面那張
     winners?: string[]; timerSeq: number; timers: { phase?: number };
   }
   ```
3. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`hand`、`play { seq, card }`（card 是功能牌或 `pair:<cat>`）、`target { seq, user }`、`nope`、`draw { seq }`、`give { card }`、`place { pos }`、`timeout { id }`。
4. **按鈕 value**（kind 都是 `kittens`）：頻道 `hand`、`draw:<seq>`、`nope`；手牌選單 `play:<seq>:<card>`、`play:<seq>:pair:<cat>`；對象選單 `target:<seq>:<user>`；給牌選單 `give:<card>`；放炸彈選單 `place:top|2|3|bottom|random`。
5. **牌桌訊息**：`{ type: 'prompt', kind: 'kittens', audience: 'channel', ref: 'kittens:<seq>', options: [我的手牌, 抽牌] }`；回合內同一個 `ref` 更新，回合結束送 `options: []`。反對等待另發一則頻道 prompt（`ref: 'kittens:nope:<seq>:<n>'`），每次有人反對就更新它並重新計時 5 秒，結算時改成結果、移除按鈕。
6. **反對流程**：出牌 → `phase = 'nope'`、`pending.nopes = 0`、`startTimer(5s)`；按反對（有 nope、活著）→ `nopes++`、手牌移除、重新 `startTimer(5s)`；timeout → `nopes` 偶數就 `resolve(pending)`，奇數就公告失效；之後回到 `phase = 'play'` 並 `startTimer(60s)`（攻擊／跳過生效時改成結束回合）。反對按鈕不檢查是不是輪到他，只檢查活著和手上有反對。
7. **攻擊回合**：`turnsLeft` 記錄這位還要幾回合。攻擊生效 → 下一位 `turnsLeft = 2`（固定 2，不累加）；跳過或抽牌 → `turnsLeft--`，到 0 才換下一位（下一位 `turnsLeft = 1`）；出局 → 直接換下一位 `turnsLeft = 1`。
8. **炸彈放回位置**：`top` = index 0、`2` = index 1、`3` = index 2、`bottom` = 末端、`random` = 0～長度隨機；牌堆張數少於 2 時只列出最上面、最底下（牌堆空時只放回去）。
9. **私密資訊**：抽到的牌、預見未來、給牌／偷牌的內容一律用 `ephemeral` 或私訊給相關的人；頻道只公告動作。
10. **計時**：`PLAY_MS = 60_000`、`NOPE_MS = 5_000`、`FAVOR_MS = 30_000`、`PLACE_MS = 30_000`、選對象（phase `target`）沿用出牌的 60 秒（超時就取消選對象並自動抽牌）。同一時間只有一個 phase 計時器。
11. **bot**：`afterChange` 呼叫 `runBots`：輪到 bot 的 `play` phase 照 bot spec 決定；`nope` phase 開始時檢查受影響的 bot 要不要反對；`favor`／`place` 輪到 bot 時立刻處理。為了讓 5 秒窗口有意義，bot 的反對在窗口一開始就送出（真人仍有 5 秒可以反對回去）。

## Risks / Trade-offs

- 5 秒對 Slack 來說偏短（網路延遲、手機切換）→ 使用者已選定 5 秒；常數集中在 `NOPE_MS`，之後好調整
- 頻道訊息較多（每次出牌都有反對等待）→ 牌桌訊息用 `ref` 更新，反對等待只發一則並原地更新
