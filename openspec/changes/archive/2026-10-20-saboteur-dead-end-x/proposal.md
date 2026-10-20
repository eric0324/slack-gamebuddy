## Why

死路牌現在畫成「形狀＋x」(例如 `╋x`)，看起來跟一般通道幾乎一樣，`x` 又小又擠在旁邊，玩家看不出路在那裡斷了，也就不懂為什麼死路後面不能放牌。

## What Changes

- 地圖上的死路牌整格畫成 `X` (加一個空白)，不再畫線條，一眼就跟通道分開
- 落石的目標按鈕跟著地圖，死路格寫成「E6 X」
- 開局規則摘要改成「地圖上的 X 是死路，路到那裡就斷了，不能接在後面」
- 手牌裡的死路牌照舊顯示形狀加「死路」(例如「┃ 死路」)，出牌時才知道開口方向

## Capabilities

### Modified Capabilities

- `saboteur/map`：修改「地圖顯示」

## Impact

- `src/saboteurCards.ts`：`drawCell()`
- `src/saboteur.ts`：落石目標按鈕
- `src/i18n/games/saboteur.ts`：規則摘要中英文
- 測試：`test/saboteur.test.ts`、`test/saboteur.en.test.ts`
- wiki：中英文規則頁的地圖說明
