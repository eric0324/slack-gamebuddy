## Context

- 心電感應（`src/wavelength.ts`）已經有：光譜卡（`src/wavelengthCards.ts`）、私訊目標、`openClue` → `modal` 事件 → `views.open`、`clue` action、0～10 按鈕（`perRow: 6`）、`startTimer`／`timeout` 和 `timerSeq`、平均四捨五入。合作版的流程是「出題 → 猜位置 → 揭曉」，等於對抗版拿掉分隊和「對手猜左右」。
- 大廳規則：每款遊戲**剛好在一個分類**（`CATALOG` 每列一個 `category`，`test/slack.test.ts` 有測試檢查）。心電感應目前在 `team`（⚔️ 團隊對抗）。
- 按鈕路由：`GameHost` 依頻道「目前那局」的 Kind 把按鈕交給該遊戲的 `button()`；視窗送出靠 `callback_id`（`ww:wavelengthClue`）。
- 官方合作模式：一副 7 張牌，依距離得分，正中目標多抽一張牌，結束時依總分查評價表。

## Goals / Non-Goals

**Goals:**
- 2 人也能玩，大家一起拚分數
- 從頭到尾不用打字（提示用視窗、猜位置用按鈕）
- 不改動現有心電感應（兩隊對抗）的行為和測試

**Non-Goals:**
- 不做官方合作模式的「多張牌同時出題」或卡牌升級等進階變體
- 不做連續刻度，維持 0～10 整數
- 不支援 bot
- 不把評價寫進戰績

## Decisions

1. **做成獨立遊戲 `wavecoop`，不在 `wavelength` 加模式**

   | | (a) 獨立遊戲 `wavecoop` | (b) `wavelength` 加模式 |
   |---|---|---|
   | 大廳分類 | 自然放進 🤝 合作，符合「每款剛好一個分類」 | 一款遊戲同時是對抗和合作，要改分類規則（允許多分類或新增「混合」），或合作版在大廳找不到 |
   | 人數 | 2～12，獨立常數 | 同一個 `start` 要依模式檢查 4 人或 2 人，房間公告的人數也要依模式變 |
   | 對現有遊戲的風險 | `wavelength.ts` 一行不改，既有測試不動 | `WState` 加 `mode`、`team` 變可選、`reveal`／`endGame`／`rematch`（看 `winner`）都要分支，容易改壞對抗版 |
   | 開房操作 | `/game wavecoop new`、大廳一個按鈕 | 要多一個選模式的步驟（房間公告上選、或 `new coop` 參數），大廳「開房」按鈕還得再選一次 |
   | 重複程式碼 | `shuffle`、`startTimer`、`dial` 等十幾行小工具重複（其他遊戲檔也都各自有一份） | 少 |

   選 (a)。重複的部分是專案既有的模式（每款遊戲一個獨立 engine 檔），換來對抗版零風險和大廳分類一致。光譜卡直接 `import { SPECTRUMS } from './wavelengthCards.js'` 共用，不另做卡庫。
   - 名稱「心電感應（合作）」、emoji 🧠（和對抗版的 📡 區分）、代號 `wavecoop`。

2. **State**：`players: string[]`、`order: string[]`（隨機出題順序）、`round`（第幾題，0 起算）、`total`（目前總題數，初始 7，正中 +1）、`used`、`spectrum`、`target`、`clue`、`guesses: Record<userId, number>`、`answer`、`score`、`finished?: boolean`（正常結束才有，`rematch` 用它判斷，取消的遊戲沒有）、`timerSeq`、`timers`。
   - 出題者 = `order[round % order.length]`。
   - 猜的人 = 所有玩家扣掉出題者。

3. **階段**：`lobby → clue → guess → (reveal) → clue … → ended`。沒有 `side` 階段。猜完立刻揭曉、算分、判斷加題、進下一題或結束。

4. **計分**：和對抗版同一張表（0／1／2 → 4／3／2，其餘 0）。正中時 `total++`，公告「🎯 正中！加一題」。加題沒有上限；光譜卡至少 60 張，同一局要連續正中超過 50 次才會用完，實務上不會發生，所以不另外處理。

5. **出題超時**：這題 0 分、`round++`（用掉一題），和對抗版「跳過」一致；不然一個人不出題，局永遠結束不了。

6. **評價表**：放在 `src/wavecoop.ts` 的常數陣列 `[min, text][]`，從高到低找第一個 `score >= min`。門檻沿用官方 7 張牌的級距（每 3 分一級）。

7. **Slack 整合**：
   - prompt `kind: 'wavecoop'`，按鈕 value 沿用 `clue`、`guess:<n>`；`wavecoopButton()` 轉成 `openClue`／`guess`。
   - modal `kind: 'wavecoopClue'` → `callback_id` `ww:wavecoopClue`，`GameHost.modal()` 轉成 `clue` action；`views.open` 失敗時的備用提示是 `/game wavecoop clue <提示>`。
   - `parseWavecoopCommand`：`clue <提示>` 以及 new／start／cancel／addBot／removeBot（和 `parseWavelengthCommand` 相同）。
   - `CATALOG` 加 `{ kind: 'wavecoop', category: 'coop', emoji: '🧠', name: '心電感應（合作）', players: '2～12 人', desc: '全員合作，輪流出題、大家一起猜光譜上的位置拚總分' }`。

## Risks / Trade-offs

- [9 人以上時有人這局不出題] → 官方合作模式本來就是固定牌數；出題順序隨機，再來一局會重新洗。若使用者希望每人都出題，可改成「題數 = max(7, 人數)」（待使用者決定）
- [`shuffle` 等小工具重複] → 跟其他遊戲一致；之後要抽共用模組可另開 refactor change
- [0～10 整數刻度差 1 就有 3 分，比官方寬鬆] → 和對抗版一致，評價門檻照官方，分數會偏高一點；可接受，之後依實際遊玩調整門檻
- [加題沒有上限，局可能變長] → 每階段最多 3 分鐘、全部猜完提早結束；房主隨時可以取消
