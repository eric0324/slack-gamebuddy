## Context

- 吹牛骰已經有：輪流喊數、`startTimer`／`timeout`、bot (`isBot`、`randomBotName`、`runBots` 迴圈)、`addBot`／`removeBot`。骷髏與玫瑰的喊數和 bot 結構照抄吹牛骰。
- 花火和截碼戰已經有：頻道按鈕 → `audience: 'ephemeral'` 的 prompt 當作「只有自己看得到的選單」，選單 value 帶回合數擋掉過期的按。骷髏與玫瑰的蓋牌和開始挑戰用一樣的方法。
- 不需要新的 GameEvent 種類，也不需要 modal。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字就能玩 (全部用按鈕)
- 頻道裡不洩漏任何人蓋了什麼、失去了什麼
- 支援 bot，1 位真人加 bot 也能玩完

**Non-Goals:**
- 不做官方「失去的牌由骷髏主人盲抽」的互動，直接由系統隨機 (結果的機率相同)
- 不做官方「挑戰者被自己的骷髏淘汰時由他指定下一輪起始玩家」，改成座位順序的下一位
- 不提供打字的遊戲中指令 (bid、flip 等)，只有 new／addbot／removebot／start／cancel／help

## Decisions

1. **State**：
   ```ts
   interface SPlayer { id: string; hand: Disc[]; stack: Disc[]; flipped: number; wins: number; } // Disc = 'rose' | 'skull'
   interface SState {
     game: 'skull'; channel; host; phase: 'lobby' | 'place' | 'turn' | 'bid' | 'flip' | 'ended';
     players: SPlayer[]; round: number; step: number; // step 每次換階段或換人就 +1，給過期選單判斷
     starter: number; turn: number; bid?: { n: number; by: string }; passed: string[];
     winner?: string; timerSeq; timers: { phase?: number };
   }
   ```
   出局 = `hand.length + stack.length === 0` (每輪開始時 stack 收回 hand)。`stack` 最後一個元素是最上面；`flipped` 是挑戰時這個牌疊從上面翻開了幾張。
2. **階段**：`place` (同時蓋第一張，所有人一個計時器)→ `turn` (還沒人喊，輪流蓋或挑戰)→ `bid` (輪流加注或放棄)→ `flip` (挑戰者選人翻)→ 下一輪 `place` 或 `ended`。
3. **按鈕 value** (kind 都是 `skull`)：
   - 頻道：`place` (開蓋牌選單)、`challenge` (開數字選單)、`mine` (我的牌)、`bid:<step>:<n>`、`pass:<step>`、`flip:<step>:<userId>`
   - 只有自己看得到的選單：`disc:<step>:rose|skull`、`bid:<step>:<n>`
   - 頻道上的喊數、放棄、翻牌按鈕也帶 `step`，和 ephemeral 選單用同一套過期判斷：`step` 和目前不同就回「這個選單已經過期」
4. **開選單不改 state**：`place`、`challenge`、`mine` 只產生 ephemeral prompt 或 ephemeral 訊息 (和花火的 `hintMenu` 一樣回傳 false)，不會觸發 bot 也不重設計時器。
5. **數字按鈕**：最多 6 人 × 4 張 = 24 張，數字按鈕用 `perRow: 6` 分列。
6. **挑戰者翻自己的牌**是自動的 (官方規定一定要先翻完自己的，沒有選擇)，所以進入 `flip` 時直接處理，只剩「選別人」需要按鈕；全部翻完前就達到喊數時直接成功。
7. **失去的牌**用 `rng` 從挑戰者 `hand` (收回後的全部牌) 挑一張移除，只私訊挑戰者。
8. **計時**：所有決策都是 2 分鐘 (`STEP_MS = 120_000`)，和花火的一個回合相同；超時行為寫在 spec，選「最不會害到玩家」的選項 (蓋玫瑰、放棄、最低喊數)。
9. **bot**：照吹牛骰的 `nextBotAction` + `runBots` (上限 1000 次迴圈)；`place` 階段 bot 在每輪一開始就全部蓋好。
10. **起始玩家**：成功或失敗都是挑戰者；挑戰者出局時是骷髏的主人；被自己的骷髏淘汰時是座位上的下一位還沒出局的玩家。

## Risks / Trade-offs

- [喊數階段每位都要等最多 2 分鐘，6 人一輪可能很久] → 真人通常很快按放棄；房主隨時可以取消。之後如果太慢可以把喊數改成 1 分鐘
- [超時一律蓋玫瑰，掛機的人牌疊很安全，可能被當成好翻的目標] → 這是掛機的代價，可以接受；也不會讓掛機的人意外淘汰別人
- [頻道訊息多 (每次蓋牌、喊數、翻牌都公告)] → 公告保持一行，按鈕只放在最新一則
