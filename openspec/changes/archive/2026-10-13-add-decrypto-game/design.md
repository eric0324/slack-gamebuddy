## Context

- 心電感應已經有：分隊、`modal` 事件 (按鈕 `trigger_id` → `views.open`)、`perRow` 分列按鈕、ephemeral 帶按鈕的 prompt、`startTimer`／`timeout`。截碼戰盡量沿用。
- 目前 `modal` 事件只有一個輸入欄 (block_id／action_id 都是 `text`)，`index.ts` 只讀這一欄。截碼戰要 3 欄。

## Goals / Non-Goals

**Goals:**
- 從頭到尾不用打字就能玩 (提示用視窗、投票用按鈕)
- 頻道裡不洩漏個別投票和祕密詞

**Non-Goals:**
- 不做官方的「平手猜對方祕密詞」加賽，同分直接平手
- 不做隊內私下討論頻道 (決定各自投票取多數)
- 不支援 bot

## Decisions

1. **多欄位視窗**：`modal` 事件新增可選的 `fields?: string[]` (每欄的標籤)。有 `fields` 時 adapter 建立 `f0`、`f1`、`f2` 三個 input block；沒有時維持現在的單一 `text` 欄 (心電感應不受影響)。`index.ts` 依序讀出所有欄位，`host.modal()` 改收 `texts: string[]`，心電感應取第一個。
2. **投票選單是 ephemeral prompt**：頻道上只有「🔓 解我們的密碼」「🕵️ 攔截對方密碼」「📜 提示紀錄」少數按鈕；按了之後送 `audience: 'ephemeral'` 的 prompt，24 組密碼用 `perRow: 6` 分 4 列。value 格式 `decode:413`、`intercept:413`。舊的選單在下一回合被按到時，用回合數檢查擋掉 (value 帶回合數：`decode:3:413`)。
3. **State**：`teams: Record<Team, { words: string[]; order: string[]; codes?: number[]; clues?: string[]; history: string[][]; miss: number; intercept: number }>`、`decodeVotes`、`interceptVotes: Record<userId, string>`。`history[i]` 是編號 i+1 下的提示。
4. **該投的票**：解碼 = 每隊非加密者；攔截 = 所有人 (第 2 回合起)。全部投完就提早揭曉。
5. **多數決平手用 rng 從最高票中挑一組**；沒人投解碼 → 視為解錯。
6. **詞庫放在 `src/decryptoWords.ts`**，附一個檢查數量和格式的測試。
7. **指令備用**：`/game decrypto clue 海 / 火 / 鐘`，用 `/` 切成剛好 3 個並去掉前後空白。

## Risks / Trade-offs

- [Slack ephemeral 訊息帶 24 個按鈕很長] → `perRow: 6` 分 4 列，訊息只有按的人看得到，不會洗版
- [各自投票沒有討論，解碼比較難] → 3 碼都由同一位加密者出，隊友想法通常接近；提示紀錄隨時可查
- [一回合最多 6 分鐘、最多 8 回合] → 投完就提早進下一階段；房主隨時可以取消
