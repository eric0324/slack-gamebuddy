## Context

- 骷髏與玫瑰已經有：`step` 擋過期選單、`menu()` 產生 `audience: 'ephemeral'` 的 prompt、「👀 我的牌」這種不改 state 的查看按鈕、`startTimer`／`timeout`、bot 的 `runBots` 迴圈。
- 情書已經有：多步驟選單（選牌 → 選目標 → 猜角色）全部編在按鈕 value 裡，最後一步才送出 action，engine 不記「選到一半」。
- 政變、吹牛骰已經有：宣稱／質疑的公告格式、`isBot`、`randomBotName`、`addBot`／`removeBot`。
- 蟑螂撲克每一步只有一個人要決定（出牌的人、收到牌的人），沒有同時行動，一個 phase 計時器就夠。不需要新的 GameEvent 種類，也不需要 modal。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字就能玩（全部用按鈕）
- 頻道裡不洩漏任何人的手牌和傳遞中的牌；只公開官方規則裡本來就公開的資訊（手牌張數、面前朝上的牌、宣稱）
- 2～6 人，支援 bot，1 位真人加 bot 也能玩完

**Non-Goals:**
- 不做蟑螂撲克皇家版（Royal）的皇家牌和其他擴充規則
- 不做「輸家下一局先出牌」之類的跨局規則；再來一局一樣隨機先手
- 不提供打字的遊戲中指令，只有 new／addbot／removebot／start／cancel／help
- 不做計分或多局累計，一局分出一位輸家就結束

## Decisions

1. **檔案**：全部放在 `src/cockroach.ts`，介面和其他遊戲一樣 `applyCockroach(state, action, rng) → { state, events }`。害蟲表 `BUGS: { bug, emoji, name }[]` 一個陣列。
2. **State**：
   ```ts
   type Bug = 'cockroach' | 'rat' | 'fly' | 'scorpion' | 'stinkbug' | 'spider' | 'toad' | 'bat';
   interface CPlayer { id: string; hand: Bug[]; front: Bug[] } // front：面前朝上的牌
   interface CState {
     game: 'cockroach'; channel: string; host: string;
     phase: 'lobby' | 'give' | 'respond' | 'pass' | 'ended';
     players: CPlayer[]; turn: number; // 輪到出牌的人
     step: number; // 每次換人或換步驟就 +1，給過期選單判斷
     card?: { bug: Bug; claim: Bug; from: string; to: string; seen: string[] }; // 傳遞中的牌
     loser?: string; reason?: { kind: 'four'; bug: Bug } | { kind: 'empty' };
     cancelled?: boolean; timerSeq: number; timers: { phase?: number };
   }
   ```
   `give`：輪到 `turn` 出牌；`respond`：`card.to` 要回答或偷看；`pass`：`card.to` 已偷看、要傳下去（`seen` 已包含他）。
3. **Action**：`play`（開選牌選單）、`hand`、`give { step, bug, target, claim }`、`answer { step, yes }`、`peek { step }`、`passMenu`、`pass { step, target, claim }`、`timeout`，加上共通的 new／join／leave／start／cancel／addBot／removeBot／rematch。
4. **按鈕 value**（kind 都是 `cockroach`；bot 的 id 含冒號，所以 userId 一律放最後）：
   - 頻道：`play`、`hand`、`yes:<step>`、`no:<step>`、`peek:<step>`、`passmenu`
   - 出牌選單（ephemeral）：`card:<step>:<bug>` → `tgt:<step>:<bug>:<userId>` → `claim:<step>:<bug>:<claim>:<userId>`（最後這一步才送 `give`）
   - 偷看後選單（ephemeral）：`to:<step>:<userId>` → `say:<step>:<claim>:<userId>`（最後這一步才送 `pass`）
   - 中間步驟（`card`、`tgt`、`to`）只檢查 step 和身分、產生下一層 ephemeral 選單，不改 state；`give`／`pass` 送出時 engine 重新檢查全部規則（輪到誰、step、手上有沒有這種牌、目標不是自己、目標還沒看過）。
5. **偷看是 state 變化**：`peek` 把 phase 改成 `pass`、`seen` 加上自己、step +1、重設計時器，並用 ephemeral 告訴他真正的牌和目標選單。因為 step 變了，舊訊息上的「是／不是」自然過期。頻道按鈕列換成 `passmenu`，ephemeral 消失時可以重開。
6. **可以偷看再傳的條件**：`players.some(p => p.id !== card.to && !card.seen.includes(p.id))`。`seen` 一開始是 `[from]`，每次偷看加上偷看的人；收到的人還沒偷看前不在 `seen`，所以要另外排除 `card.to`。
7. **判定**：`correct = (yes === (card.bug === card.claim))`；`correct` 時牌給 `card.from`（最後一位傳牌的人，`pass` 時會更新 `from`），否則給 `card.to`。放牌後檢查 4 張 → 輸；否則 `turn` 設成拿到牌的人，他 `hand.length === 0` → 輸；否則進入 `give`。64 張每回合一定有一張朝上，所以遊戲一定會結束。
8. **發牌**：洗牌後依座位輪流發（`i % n`），自然達成「前面的人多 1 張」。手牌顯示時依 `BUGS` 順序分組計數。
9. **私人資訊**：開始時的手牌用 `dm`（之後回去翻得到）；選單、偷看結果、「🃏 我的手牌」用 ephemeral。手牌只會變少，不需要額外私訊。bot 不送 DM。
10. **計時**：所有決策都是 2 分鐘（`STEP_MS = 120_000`）。超時行為選擇「最簡單、可預測」的：出牌隨機一張隨機目標照實宣稱、回答當作「不是」、傳牌隨機目標沿用宣稱。超時和 bot 共用 `autoGive`、`autoPass` 輔助函式（bot 多了策略參數）。
11. **bot**：照骷髏與玫瑰的 `nextBotAction` + `runBots`（上限 1000 次迴圈）。bot 的策略只看自己合法看得到的資訊（自己的手牌、面前的牌、偷看過的牌）。
12. **公告格式**：每則一行，例如「📨 A 傳了一張牌給 B：「這是 🪳 蟑螂」」、「👀 B 偷看了這張牌」、「🃏 翻開是 🦇 蝙蝠！B 猜對了，牌放在 A 面前」。每回合的狀態列：「A 手牌 12｜面前 🪳×2 🦇×1」。

## Risks / Trade-offs

- [6 人局一路偷看再傳，一張牌最多要等 5 個人 × 2 分鐘] → 平常真人很快回答；房主隨時可以取消
- [回答超時一律「不是」，可能被利用：對掛機的人照實宣稱就穩贏] → 這是掛機的代價，可以接受；也讓結果可預測、好測試
- [64 張全部發完，2 人局每人 32 張、一局可能很長] → 官方規則就是全部發完；輸的條件是 4 張同種，實際上大約 10～20 回合就結束
- [出牌要按 3 次按鈕] → 每一步都是 ephemeral，按錯可以重按「🪳 出牌」重開；舊選單用 step 擋掉
