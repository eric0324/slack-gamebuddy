## Context

- 2026-10-15 重構後，房間邏輯 (`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`)、`runGame` (`afterChange: runBots`)、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`，骷髏與玫瑰、誰是牛頭王都這樣用。不要謝謝照抄這個結構。
- 誰是牛頭王已經有頻道 prompt 的 `ref` (同一個 `ref` 用 `chat.update` 更新同一則訊息)，不要謝謝用它讓同一張牌的輪流只佔一則訊息。
- 骷髏與玫瑰已經有「按鈕帶 step 擋掉過期操作」和「👀 我的牌」只讓自己看到、不改 state 的做法。
- 誰是牛頭王的 `endGame` 已經示範 `result` 事件 (同分並列都算 winners)。
- 不需要新的 GameEvent 種類，也不需要 modal。

## Goals / Non-Goals

**Goals:**
- 只用按鈕就能玩完 (不要謝謝／收下／我的籌碼)
- 照官方：籌碼數不公開，被拿掉的 9 張牌到結束才公布
- 節奏快：每次 60 秒，同一張牌只佔一則頻道訊息
- 支援 bot，1 位真人加 bot 也能玩完

**Non-Goals:**
- 不提供打字的遊戲中指令 (只有 new／addbot／removebot／start／cancel／help)
- 不做 2 人變體或其他官方以外的變體
- 不做同分的加賽或額外比較 (同分並列都贏)

## Decisions

1. **State** (`src/nothanks.ts`)：
   ```ts
   interface NTPlayer { id: string; chips: number; cards: number[] } // cards 由小到大
   interface NTState {
     game: 'nothanks'; channel: string; host: string; phase: 'lobby' | 'turn' | 'ended';
     players: NTPlayer[]; deck: number[]; removed: number[]; // deck[0] 是下一張要翻的
     card?: number; pot: number; // 目前翻開的牌、牌上籌碼
     turn: number; // 輪到的玩家 index
     step: number; // 每次不要謝謝／收下／超時行動就 +1，給過期按鈕判斷
     cardNo: number; // 第幾張牌 (1～24)，當作牌桌訊息的 ref
     winners?: string[]; timerSeq: number; timers: { phase?: number };
   }
   ```
2. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`pass { step }`、`take { step }`、`mine`、`timeout { id }`。
3. **按鈕 value** (kind 都是 `nothanks`)：`pass:<step>`、`take:<step>`、`mine`。房間按鈕沿用 `join`／`leave`／`start`／`rematch`。
4. **牌桌訊息**：`{ type: 'prompt', kind: 'nothanks', audience: 'channel', ref: 'nothanks:<cardNo>', options: [不要謝謝, 收下, 我的籌碼] }`。不要謝謝時用同一個 `ref` 更新；收下時先 `announce` 一行「收下」，再用新的 `cardNo` 發新 prompt。遊戲結束時最後一張牌的 prompt 用同一個 `ref` 送 `options: []`，按鈕消失。
5. **檢查順序**：不在遊戲 →「你不在這局遊戲裡」；step 不同 →「這個按鈕已經過期」；不是輪到的人 →「還沒輪到你」；沒籌碼按不要謝謝 →「你沒有籌碼了，只能收下」。全部回 `reply(...)` (state 不變)。
6. **我的籌碼**：`mine` 只產生 ephemeral，回傳 false，不觸發 bot、不重設計時器。
7. **計分**：`score(p) = Σ(每組連號的最小牌) − chips`，匯出成純函式方便測試；bot 的「代價」＝ `score(加了這張牌) − score(原本)` (籌碼不變的部分抵銷)。
8. **計時**：`TURN_MS = 60_000`，每次換人或翻新牌都 `startTimer`。超時：有籌碼 → pass，沒有 → take，公告帶「(超時)」。
9. **bot**：`nextBotAction` + `runBots` (上限 1000 次迴圈，和骷髏與玫瑰一樣)，收下後若仍輪到 bot 就繼續。策略寫在 bots spec，決定性 (不用 rng)，方便測試。
10. **結束**：`endGame` 依分數由低到高排名，`winners` 是所有最低分的人，公告每人牌、籌碼、分數、被拿掉的 9 張，送 `{ type: 'result', players, winners }`，`phase = 'ended'`；`finished(s)` 用 `!!s.winners`，取消的遊戲沒有 winners，所以沒有再來一局。
11. **籌碼私訊**：開局私訊規則和起始籌碼；之後籌碼變動不主動私訊 (避免洗私訊)，要看就按「👀 我的籌碼」。

## Risks / Trade-offs

- [籌碼不公開，但頻道每次公告「不要謝謝」，有心人可以自己算] → 官方實體桌遊也一樣，可以接受
- [超時一律不要謝謝，掛機的人會一直流失籌碼，最後被迫收牌] → 這是掛機的代價；也保證遊戲一定會結束
- [7 人每次 60 秒，一張牌轉一圈最多 7 分鐘] → 真人通常幾秒就按；房主隨時可以取消
- [沒有籌碼時仍顯示「🙅 不要謝謝」按鈕] → 按鈕是頻道公開的，隱藏它等於公開某人沒籌碼；按了只會被拒絕
