## Why

花火的「給提示」只能打 `/game hanabi hint @某人 <紅|黃|綠|藍|白|1～5>`，玩家看不懂這行格式 (以為要打 `< >` 和 `|`)，也不熟用 @ 選人，實際玩的時候幾乎沒人給得出提示；在手機上打指令更困難。

## What Changes

- 輪到的玩家的按鈕列新增「💡 給提示」，放在「👀 看牌」後面、出牌按鈕前面 (避免被 Slack 摺進「+ N more」)
- 按「給提示」→ 只讓自己看到一則訊息，列出可以提示的玩家按鈕
- 選人 → 只讓自己看到對方的手牌，以及對方手上「實際有」的顏色和數字按鈕 (不會選到無效的提示)
- 按顏色或數字 → 執行提示 (規則不變：花 1 個標記、公告第幾張是什麼)
- 輪到時的公告不再顯示指令格式；`/game hanabi hint` 指令保留可用，說明裡改成具體範例

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
- `hanabi/turns`：「給提示」改成主要用按鈕操作，指令保留為備用

## Impact

- Specs：`hanabi/turns`
- Code：`src/hanabi.ts` (新增選人、選內容兩個步驟)、`src/engine.ts` (prompt 新增只讓某人看到的 audience)、`src/slack.ts` (送出帶按鈕的 ephemeral 訊息、按鈕路由、說明文字)
- Tests：`test/hanabi.test.ts`、`test/slack.test.ts`
