## Context

- 房間邏輯、`runGame`（`afterChange: runBots`）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`，新遊戲照抄這個結構。
- 情書（`src/loveletter.ts`）已經有「輪流出牌 → 選牌 → 選對象」的完整做法：頻道牌桌 prompt、「我的手牌」按鈕打開 ephemeral 選單、選單 value 帶回合序號 `seq` 擋掉舊選單、私下顯示偷看結果、超時自動出牌、bot 在 `afterChange` 行動。犯人在跳舞沿用同一套。
- 誰是牛頭王／壽司派對有「所有人同時選一張」的做法（全部選好就結算、bot 立刻選、超時替人選），情報交換、交易沿用。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 只用按鈕就能玩完；頻道不洩漏任何人的手牌，偷看和少年的結果只給本人
- 有人掛機也一定會推進；1 位真人 + bot 可以玩完整局
- 一局 5 分鐘左右

**Non-Goals:**
- 不做多局累積分數的變體（官方有「計分玩法」，這次一次遊戲＝一局）
- 不做擴充牌（例如「大魔王」「魔法少女」等追加卡）
- 不提供打字的遊戲中指令（只有 new／addbot／removebot／start／cancel／help）

## Decisions

1. **牌種代號**（按鈕 value 和 state 都用這個）：
   | 代號 | 顯示 | 總張數 |
   |---|---|---|
   | `first` | 🔎 第一發現者 | 1 |
   | `culprit` | 🔪 犯人 | 1 |
   | `detective` | 🕵️ 偵探 | 4 |
   | `alibi` | 🛡️ 不在場證明 | 5 |
   | `accomplice` | 🤝 共犯 | 2 |
   | `witness` | 👀 目擊者 | 3 |
   | `exchange` | 🔄 情報交換 | 3 |
   | `trade` | 💱 交易 | 5 |
   | `rumor` | 🗣️ 謠言 | 4 |
   | `citizen` | 🧍 普通人 | 2 |
   | `boy` | 👦 少年 | 1 |
   | `dog` | 🐕 神犬 | 1 |
2. **依人數組牌組**（官方人數表；必放的牌以外，從剩下的牌隨機補到 人數×4 張）：
   | 人數 | 張數 | 必放 |
   |---|---|---|
   | 3 | 12 | 第一發現者、犯人、偵探 1、不在場證明 1 |
   | 4 | 16 | 第一發現者、犯人、偵探 1、不在場證明 1、共犯 1 |
   | 5 | 20 | 第一發現者、犯人、偵探 1、不在場證明 2、共犯 1 |
   | 6 | 24 | 第一發現者、犯人、偵探 2、不在場證明 2、共犯 2 |
   | 7 | 28 | 第一發現者、犯人、偵探 2、不在場證明 3、共犯 2 |
   | 8 | 32 | 全部 |
   「剩下的牌」是 32 張扣掉必放之後的牌（包含沒放進必放的偵探、不在場證明、共犯）。
3. **State**（`src/criminal.ts`）：
   ```ts
   type Card = 'first' | 'culprit' | 'detective' | 'alibi' | 'accomplice' | 'witness' | 'exchange' | 'trade' | 'rumor' | 'citizen' | 'boy' | 'dog';
   interface CPlayer { id: string; hand: Card[]; played: Card[]; accomplice: boolean; }
   interface CState {
     game: 'criminal'; channel: string; host: string;
     phase: 'lobby' | 'turn' | 'target' | 'choose' | 'dog' | 'ended';
     players: CPlayer[]; turn: number; lap: number; // lap：第幾圈（第一發現者那一圈是 1）
     seq: number; // 每個決策點 +1，選單帶著它擋掉舊選單
     pending?: { card: Card; index: number }; // 選了需要對象的牌、還沒選對象
     choose?: { kind: 'exchange' | 'trade'; by: string; target?: string; picks: Record<string, number | undefined> };
     dog?: { by: string; target: string; order: number[] }; // 神犬盲抽：對象手牌 index 的隨機排列，第 slot 張 = hand[order[slot]]
     knows: Record<string, string>; // bot 用：bot id → 它知道拿著犯人的玩家；任何牌移動（情報交換、謠言、交易、神犬）後清空
     outcome?: { side: 'culprit' | 'detective' | 'dog'; by: string; culprit: string }; winners?: string[];
     timerSeq: number; timers: { phase?: number };
   }
   ```
4. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`hand`、`play { seq, index }`、`target { seq, target }`、`give { seq, index }`（情報交換／交易時選手上一張）、`draw { seq, slot }`（神犬盲抽第幾張）、`timeout { id }`。
5. **按鈕 value**（kind 都是 `criminal`）：頻道「🃏 我的手牌」→ `hand`；手牌選單 → `play:<seq>:<index>`；對象選單 → `target:<seq>:<userId>`；同時選牌選單 → `give:<seq>:<index>`；神犬盲抽選單 → `draw:<seq>:<slot>`。房間按鈕沿用 `join`／`leave`／`start`／`rematch`。
6. **第一發現者自動出**：開局時系統直接替持有者出第一發現者並公告（官方也只能出這張，沒有選擇），輪到他的下一位。為了讓第一圈規則好判斷，`lap` 從這時開始算 1，每次輪回第一發現者的持有者時 +1。
7. **合法出牌**：犯人只有手上剩 1 張時能出；偵探在 `lap === 1` 時不能出；第一發現者已經出過，不會再出現。手上只剩犯人以外不能出的牌時（例如第一圈手上只有偵探和犯人），偵探 SHALL 例外可以出，避免卡死。手牌選單只列合法的牌（每張一顆按鈕，相同的牌也分開顯示，value 用 index），不能出的牌列在文字裡並說明原因。
8. **需要對象的牌**：偵探、目擊者、交易、神犬。選牌後 `phase = 'target'`，只讓出牌的人看到對象選單（其他有手牌的玩家，不含自己）。偵探、目擊者可以選沒有手牌的人嗎？→ 不行，只列手上還有牌的人；沒有合法對象時這張牌直接無效果打出。
9. **同時選牌（`phase = 'choose'`）**：
   - 情報交換：所有手上有牌的人各選一張，全部選好後同時把選的牌傳給座位下一位手上有牌的人（跳過沒牌的人）。
   - 交易：出牌的人和對象各選一張，選好後交換。出牌的人打出交易後手上沒牌時，交易沒有效果。
   - 每人只看到自己的選單（`give:<seq>:<index>`），全部選好立刻結算；bot 立刻選好；60 秒超時沒選的人隨機選一張。
10. **謠言不用選**：所有手上有牌的人，同時從座位上一位手上有牌的人那裡隨機抽一張（以抽之前的手牌為準），用 rng 決定。
11. **計時**：`CHOOSE_MS = 60_000`，每個決策點（輪到誰出牌、選對象、同時選牌）重新 `startTimer`。超時：出牌隨機選合法的牌，選對象隨機選合法對象，同時選牌隨機選一張；公告標示「（超時自動）」。
12. **勝負**：
    - 犯人被打出 → `outcome = { side: 'culprit' }`，`winners` = 打出犯人的人 + `accomplice` 為 true 的人。
    - 偵探指到手上有犯人、沒有不在場證明的人 → `outcome = { side: 'detective' }`，`winners` = [打出偵探的人]；神犬抽到犯人 → `outcome = { side: 'dog' }`，`winners` = [打出神犬的人]。共犯優先：打出偵探／神犬的人 `accomplice` 為 true 時，`winners = []`（沒有人獲勝）。
    - 只要有一位玩家手上有牌，遊戲就繼續；犯人一定會在某個人手上剩最後一張時被出（或被抓），所以一定會結束。
    - 結束公告勝方、抓到的方式、每人最後的手牌和身分，送 `{ type: 'result', players, winners }`，貼「再來一局」；`finished(s)` 用 `!!s.winners`。
13. **神犬盲抽（`phase = 'dog'`）**：選對象後，系統用 rng 把對象手牌排成隨機順序存在 `dog.order`，只讓打出神犬的人看到「第 1 張／第 2 張……」按鈕（不顯示內容，也不是手牌原本的順序）。抽到的牌在頻道公開；是犯人就抓到（不看不在場證明）；不是的話那張牌回到對象手上，神犬也放進對象手牌（對象手牌 +1）。bot 隨機選位置；60 秒超時隨機選。
14. **私下資訊**：開局私訊每位真人他的 4 張手牌和規則摘要；目擊者結果、少年結果、情報交換／謠言／交易／神犬後拿到的牌，都只用 ephemeral 告訴本人。

## Risks / Trade-offs

- [官方規則來源] → 張數、勝方、神犬照官方卡牌介紹（kumakumax.hatenablog.jp）；人數必放表照日文規則書
- [抓到犯人只有一人贏] → 照官方：偵探／神犬只有出牌的人贏，其他人都算輸；出牌的人是共犯時沒有人贏（`result` 的 `winners` 是空的，戰績照既有規則記錄全部人沒贏）
- [第一發現者自動出，玩家少一次操作] → 官方規定這張一定要第一個出，沒有選擇，自動出讓開局更快
- [同時選牌要等最慢的人] → 全部選好立刻結算、bot 立刻選、60 秒超時隨機選
- [ephemeral 選單按過不會消失] → 靠 `seq` 擋掉舊選單
