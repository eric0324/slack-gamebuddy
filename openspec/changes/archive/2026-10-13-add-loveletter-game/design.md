## Context

- 政變已經有：暗牌、角色名稱表、選目標的按鈕、bot (`isBot`、`randomBotName`)、`addbot`／`removebot`、`startTimer`／`timeout`。花火已經有：ephemeral 帶按鈕的 prompt (`audience: 'ephemeral'`)、「👀 看牌」「🗑️ 棄牌堆」這種任何人都能按、不改狀態的查看按鈕。截碼戰的選單 value 帶回合數擋掉舊選單。情書盡量沿用這些寫法。
- 情書每回合只有「抽一張、出一張」，沒有反應視窗 (不像政變的質疑／阻擋)，所以一個 phase 計時器就夠。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字就能玩 (出牌、選目標、猜角色都用按鈕)
- 頻道裡不洩漏任何人的手牌；只公開官方規則裡本來就公開的資訊 (打出的牌、出局的牌、2 人局翻開的 3 張)
- 2～6 人，bot 可以補位，1 位真人也能玩完

**Non-Goals:**
- 不做 2019 版的 5～8 人擴充 (伯爵、女官、哨兵…)，只做基本盒 21 張
- 宰相放回牌堆底的順序不讓玩家選，改成隨機
- 不允許主動打出公主 (官方允許，但一定是自殺，只會是誤按)
- 不做官方「最近約會過的人先開始」這種趣味規則；同分的勝者中隨機一位先開始

## Decisions

1. **檔案**：全部放在 `src/loveletter.ts`，介面和其他遊戲一樣 `applyLoveLetter(state, action, rng) → { state, events }`。角色表 `ROLE_TABLE: { role, value, count, name, help }[]` 一個陣列就好。
2. **State**：
   ```ts
   interface LState {
     game: 'loveletter'; channel: string; host: string;
     phase: 'lobby' | 'turn' | 'chancellor' | 'ended';
     players: { id: string; hand: Role[]; discards: Role[]; out: boolean; protected: boolean; tokens: number }[];
     deck: Role[]; burned?: Role; faceUp: Role[]; // 蓋掉的 1 張、2 人局翻開的 3 張
     round: number; turn: number; turnSeq: number; // turnSeq 每個回合 +1，選單帶著它
     chancellor?: { pool: Role[] };               // 宰相：手上 + 抽到的牌
     winners?: string[]; cancelled?: boolean; timerSeq: number; timers: { phase?: number };
   }
   ```
3. **出牌選單不存中間狀態**：每一步的選擇都編在按鈕 value 裡，最後一步才送出 `play` action，engine 不需要記「選到一半」。
   - `menu` (按「🃏 出牌」)→ ephemeral：手牌按鈕 `pick:<seq>:<i>`
   - `pick` → 需要目標就回 ephemeral 目標按鈕 `tgt:<seq>:<i>:<userId>`；不需要目標 (或沒有可選目標) 就直接當作 `play`
   - 衛兵的 `tgt` → ephemeral 9 個角色按鈕 `guess:<seq>:<i>:<userId>:<role>`
   - `play`：`{ type: 'play', user, seq, index, target?, guess? }`，engine 重新檢查所有規則 (輪到誰、seq、伯爵夫人、目標是否保護中／出局、衛兵不能猜衛兵)
   - 宰相：`play` 之後進入 `chancellor` phase，私人選單 `keep:<seq>:<i>`
   `seq` 不符就只讓按的人看到「這個選單已經過期了」。
4. **私人資訊走 DM**：每輪開始的手牌、神父看到的牌、男爵比牌的結果、國王交換、王子重抽都用 `dm` (之後回去翻得到)。選單和「👀 我的手牌」「📜 棄牌紀錄」用 ephemeral。bot 不送 DM。
5. **一輪結束直接開下一輪**：在同一批 events 裡公告這輪結果、接著發下一輪的牌，不另外等按鈕，減少卡住的機會。
6. **超時**：`startTimer(TURN_MS = 120_000)`。超時的自動出牌和 bot 共用同一個 `autoPlay(c, player, smart)`：`smart=false` (超時) 出點數小的、隨機目標、隨機猜；`smart=true` (bot) 多了「有侍女先出侍女」「猜還沒公開出現的角色」「宰相留最大的」。
7. **bot**：輪到 bot 時在同一批 events 裡立刻 `autoPlay`，直到輪到真人或這輪結束 (和政變一樣)。用 loop 而不是遞迴，避免全 bot 的長鏈。
8. **好感目標**：`TOKENS_TO_WIN = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 }` (官方 2019 版)。
9. **指令**：`new`、`start`、`cancel`、`addbot [n]`、`removebot [n]`、`help`。出牌只用按鈕，不做文字指令 (選項多、打字容易錯)。
10. **按鈕 kind**：`ww:loveletter:<n>`，value `C1|menu`、`C1|hand`、`C1|log`、`C1|pick:3:0`… 和截碼戰相同。

## Risks / Trade-offs

- [2 人局要 6 個好感，一局可能 15～20 分鐘] → 房主可以隨時取消；每回合只有一個動作，平常很快
- [出牌要按 2～4 次按鈕] → 不需要目標的牌按一次就出；衛兵最多 4 次
- [ephemeral 選單在 Slack 重新整理後會消失] → 隨時可以再按「🃏 出牌」重開；舊選單用 `seq` 擋掉
- [bot 連續行動時一次送很多公告] → 和政變一樣照順序逐則公告，先不合併；玩過覺得洗版再調整
