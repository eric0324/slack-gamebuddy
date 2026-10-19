## Context

game engine 是純邏輯、不知道玩家的顯示名稱，文字裡的人名一律用 `mention(id)`（真人 `<@id>`、bot `🤖Name`）。Slack adapter 有一張 `names` 對照表（玩家每次下指令、按按鈕、送 modal 時記下 `userName`），目前只用在按鈕文字（`label()`，因為按鈕不能放 `<@id>`）。

## Goals / Non-Goals

**Goals:** 牌桌訊息只 @ 輪到的人，其他人顯示名字。

**Non-Goals:** 不改各種動作公告（拿金、建造…）裡的 @，那些幾乎都是 @ 正在行動的人本身；不改其他遊戲；不加私訊提醒。

## Decisions

- **engine 用標記代表「不通知的名字」**：新增 `quiet(id)`，真人回傳 `{{name:U123}}`、bot 回傳 `mention(id)`。engine 仍然不碰 I/O，測試直接比對標記。
  - 替代方案：engine 輸出純 id，adapter 用 `label()` 逐字替換 → 文字裡的 id 前後常接全形標點（「、」「：」），用空白切不出來，放棄。
- **adapter 在 `send()` 統一替換**：和 `slackText()` 同一處處理 `text`，`{{name:id}}` → `names.get(id) ?? <@id>`。所有 event 都經過這裡，其他遊戲沒有這個標記所以不受影響。
- **粗體用 `*...*`**：Slack mrkdwn 沒有大字，粗體加 👉 已經夠醒目；`slackText()` 會處理粗體旁邊的全形字元。
- 每回合第一次發牌桌時會 @ 輪到的人一次；後續原地 `chat.update` Slack 不會再通知，不需要特別處理。

## Risks / Trade-offs

- [bot 重開後 `names` 是空的] → 退回 `<@id>`，會通知但至少看得出是誰；玩家操作一次後就記住名字。
- [名字和 Slack 顯示名稱不同步（改名）] → 只影響顯示，可接受。
