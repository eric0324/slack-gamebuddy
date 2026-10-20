## Why

矮人礦坑地圖上的死路用細線、通道用粗線，但 Slack 的等寬字型粗細線幾乎一樣，玩家看不出哪格是死路。

## What Changes

- 死路牌改成和通道相同的線條字元畫形狀，格子第二個字元一律放 `x` 標記（例如 `┃x`、`╋x`）
- 通道牌不變；右邊有開口的死路不再畫橫線延伸，改顯示 `x`
- 手牌和落石選單裡的死路牌也用同一組字元（例如「┃ 死路」、落石目標「E5 ━x」），和地圖一致

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `saboteur/map`：「地圖顯示」的死路畫法

## Impact

- Code：`src/saboteurCards.ts`（繪圖字元表）、`src/saboteur.ts`（落石目標按鈕文字）
- Tests：`test/saboteur.test.ts`
- Docs：wiki 矮人礦坑-遊戲規則的地圖說明與範例
- 和 `action-button-plain-cards` 放在同一個 PR：那邊「手牌只用文字」的牌名範例「│ 死路」一起改成「┃ 死路」
