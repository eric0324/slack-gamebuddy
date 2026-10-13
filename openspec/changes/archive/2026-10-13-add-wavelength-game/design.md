## Context

- 其他遊戲的模式：純邏輯 engine（`applyX(state, action, rng) → { state, events }`），adapter 在 `GameHost.defs` 註冊指令解析、按鈕轉換和說明。花火、機密代號是最接近的參考（不支援 bot、分隊、計時）。
- 目前的 adapter 只會發訊息和按鈕，沒有 Slack 視窗（modal）。開視窗要用按鈕點擊時拿到的 `trigger_id` 呼叫 `views.open`，`trigger_id` 只有 3 秒有效。
- 一個 actions block 的按鈕多了，Slack 會摺成「+ N more」（花火實際遇過）。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字就能玩（提示詞用視窗輸入）
- engine 仍然不碰 I/O，不知道 `trigger_id`

**Non-Goals:**
- 不做官方的「追分規則」（落後時正中目標可以再出一題），因為已經決定每人出一題
- 不做連續刻度（轉盤），用 0～10 整數
- 不支援 bot

## Decisions

1. **開視窗流程**：按「✍️ 寫提示」→ engine 收到 `openClue` action，檢查是出題者而且在出題階段後，送出 `{ type: 'modal', to, title, label, kind }` 事件；adapter 用這次按鈕點擊的 `trigger_id` 呼叫 `views.open`，`private_metadata` 放遊戲頻道。視窗送出時，`index.ts` 的 `app.view` handler 呼叫 `host.modal(channel, user, kind, text)`，轉成 `clue` action。
   - `GameHost.button()` 新增可選的 `triggerId` 參數，只在處理這次點擊時暫存，不存進 state。
   - 替代方案：用 `/game wavelength clue` 指令 → 會有花火那種看不懂指令的問題，所以只當備用。
   - 替代方案：出題者在頻道直接打字 → 容易把聊天內容誤當成提示。
2. **按鈕分列**：prompt 事件新增可選的 `perRow`，adapter 依這個數字把按鈕切成多個 actions block。0～10 用 `perRow: 6`（0～5、6～10）。不設 `perRow` 的其他遊戲不受影響。
3. **投票存在 state**：`guesses: Record<userId, number>`、`sides: Record<userId, 'left' | 'right'>`，每題開始時清空。改選就是覆蓋。
4. **計時沿用 `startTimer` / `timeout` 和 `timerSeq`**：出題、猜位置、猜左右三個階段各 3 分鐘；投完就提早進下一階段，舊的 timer id 對不上會被忽略。
5. **平均四捨五入用 `Math.round`**：7.5 → 8。
6. **私訊目標**：用既有的 `dm` 事件，私訊比 ephemeral 不容易漏看。
7. **光譜卡放在 `src/wavelengthCards.ts`**：格式和其他詞庫檔一樣，附一個檢查數量和格式的測試。

## Risks / Trade-offs

- [`trigger_id` 只有 3 秒有效] → engine 很快就回傳事件，正常情況下來得及；`views.open` 失敗時改成只讓出題者看到「請改用 `/game wavelength clue <提示>`」
- [視窗送出時遊戲已經換階段（例如超時）] → `clue` action 會檢查階段，拒絕並只讓他看到原因
- [人數多時一局很久（12 人 × 最多 9 分鐘）] → 每階段投完就提早結束，實際通常一題 1～2 分鐘；房主隨時可以取消
