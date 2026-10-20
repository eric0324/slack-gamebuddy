## Context

- engine 和 adapter 用 `GameEvent` 溝通。現在的 `prompt` 只能發到頻道、狼人私聊或私訊 (`audience: 'channel' | 'wolves' | 'user'`)；`ephemeral` 只能送純文字，不能帶按鈕。
- 按鈕的 value 是 `<遊戲頻道>|<選項值>`，由 `hanabiButton()` 轉成 `HAction`。
- 花火 engine 已經有 `giveHint()`，會檢查回合、標記數量、目標和是否至少指出一張牌。

## Goals / Non-Goals

**Goals:**
- 三次點擊就能完成提示，不用打字
- 不需要在 state 裡記錄「誰正在選提示」

**Non-Goals:**
- 不改提示規則本身
- 不刪除或更新已經用過的 ephemeral 選單訊息 (Slack 的 ephemeral 只能用 response_url 改，這次先不做)

## Decisions

1. **選單步驟不存在 state 裡**：「給提示」和「選人」都是唯讀 action (`hintMenu`、`hintTarget`)，只回傳 ephemeral 選單、不改 state。最後的顏色或數字按鈕把目標和內容寫在 value 裡 (`hint:<目標>:<red|…|1～5>`)，直接轉成既有的 `hint` action，再由 `giveHint()` 檢查。這樣就算之前留下的舊按鈕被按到，也會被回合檢查擋下來。
   - 替代方案：在 state 存 `pendingHint` → 還要處理超時、換人時清掉，比較複雜。
2. **`prompt` 新增 `audience: 'ephemeral'`** (配合 `user`)：adapter 用 `chat.postEphemeral` 加上 blocks 送出。比新增一種事件型別簡單，按鈕產生方式和其他 prompt 共用。
3. **選人時就把按鈕過濾成對方實際有的顏色和數字**：無效的提示根本不會出現；engine 的檢查仍然保留，指令輸入還是用得到。
4. **按鈕排序**：看牌 → 給提示 → 出第 N 張 → 棄第 N 張。Slack 只會先顯示前幾顆，把常用的放前面。
5. 2 人遊戲也照樣先選人 (只會有一個按鈕)，讓流程一致、程式簡單。

## Risks / Trade-offs

- [用過的選單訊息會留在畫面上] → 只有自己看得到，重新整理後就會消失；按舊按鈕會被回合檢查擋下
- [一個 actions block 最多 25 顆按鈕] → 選人最多 4 顆，選內容最多 5 色 + 5 數字 = 10 顆，不會超過
