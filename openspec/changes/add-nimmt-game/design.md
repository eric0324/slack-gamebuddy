## Context

- 現有遊戲已經有：ephemeral 帶按鈕的 prompt（花火的看牌、截碼戰的投票選單）、`perRow` 分列、`startTimer`／`timeout`、bot 機制（`randomBotName`、`isBot`，吹牛骰／政變的 addbot／removebot）、`lobby` 事件、再來一局。
- 誰是牛頭王的特點是**同時出牌**，和截碼戰的「全部投完或時間到」一樣，可以沿用同一套計時與提早結束的寫法。
- 不需要新的 GameEvent 種類，也不需要改 `engine.ts`、`index.ts`。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字（選牌、選列都是按鈕），`/game nimmt play <牌號>` 只是備用
- 頻道不洩漏任何人的手牌和揭曉前的選擇
- 有人掛機也一定會推進（超時自動出牌、自動選列）
- 1 位真人 + bot 可以玩完整局

**Non-Goals:**
- 不做官方變體（專家規則、戰術版、指定人數牌組等）
- 不在頻道顯示「誰還沒選」的即時進度（ephemeral 無法更新，頻道每次有人選就發訊息會洗版）
- 不記錄戰績（只有狼人殺有 stats）

## Decisions

1. **單一檔案 `src/nimmt.ts`**：`applyNimmt(state, action, rng) → { state, events }`，介面和吹牛骰相同。牛頭數用一個 `bullheads(card)` 純函式（55→7、11 倍數→5、10 倍數→3、5 倍數→2、其他→1）。
2. **State**：
   - `players: { id; hand: number[]; pick?: number; auto?: boolean; roundHeads: number; total: number }[]`
   - `rows: number[][]`（4 列）、`round`、`turn`（1～10）
   - `phase: 'lobby' | 'pick' | 'chooseRow' | 'ended'`
   - `pending?: { order: { id; card; auto }[]; index: number }`：揭曉後待擺的牌（已依牌號排序），選列時暫停在 `index`
   - `timerSeq`、`timers.phase`，舊計時器用 id 擋掉（和其他遊戲相同）
3. **按鈕與 value**：
   - 頻道 prompt `kind: 'nimmt'`：「🃏 選牌」value `hand`
   - 按下 → `audience: 'ephemeral'` 的 prompt，選項是手牌，`perRow: 5`，value `pick:<turn>:<card>`；label 例如 `37 🐮`、`55 🐮×7`
   - 選列 prompt（頻道）value `row:<turn>:<0~3>`
   - value 帶 `turn`（每輪每回合遞增的全域回合序號）以擋掉舊選單
4. **擺牌只有開頭可能暫停**：牌依序由小到大擺，只有本回合最小的那張可能比四列列尾都小；擺完後列尾至少等於它，後面的牌都比它大，所以一回合最多選列一次。實作上仍用 `pending.index` 迴圈，不依賴這個性質。
5. **自動選列**：選列 60 秒超時、bot、或這張牌本來就是超時自動出的 → 直接選牛頭最少（同分列號最小）的一列，不暫停。避免掛機的人讓大家多等 60 秒。
6. **bot 選牌**：回合開始時立刻依 spec 的風險規則選好（只看目前牌桌，不猜別人出什麼）。風險相同出最小的牌，邏輯簡單、可測、行為穩定。
7. **輪的結束判斷**：10 回合擺完才檢查 66（官方「達到 66 就結束」，大多數玩法是打完這一輪再算），這樣每輪資訊完整、公告也簡單。
8. **私訊手牌**：每輪開始私訊一次手牌當參考；實際選牌以「🃏 選牌」的即時選單為準。
9. **指令解析** `parseNimmtCommand`：`play <牌號>` 解析成 `{ type: 'pick', card }`（不帶 turn，視為目前回合），其他交給 `parseUndercoverCommand` 並只接受 new／start／cancel／addBot／removeBot。

## Risks / Trade-offs

- [玩到 66 可能要 3～6 輪、30 回合以上] → 全員選好就立刻揭曉，bot 立刻出牌，實際一回合通常幾十秒；房主隨時可以取消。只玩一輪（10 回合）是較短的替代方案
- [2 人局牛頭累積很慢，局數變長] → 每輪 24 張牌放進最多 20 格，每輪至少有人收列，一定會結束；接受較長的 2 人局
- [ephemeral 選單按過不會消失] → 再按別張就是改選，揭曉後舊選單靠 `turn` 擋掉
- [按鈕 label 有字數限制] → `37 🐮×3` 這種格式很短，不會超過
