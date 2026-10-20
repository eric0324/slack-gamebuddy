## Why

17 個遊戲 engine 和狼人殺各自複製了同樣的小工具：`reply` 18 份、`shuffle` 15 份、`lobbyEvent` 18 份、`startTimer` 18 份。內容幾乎一樣，改一個地方 (例如洗牌方式) 就要改十幾個檔案，也容易漏。

## What Changes

三階段重構的第二階段 (②)，**不改任何遊戲行為**：

- 新增 `src/common.ts`，放四個共用函式：
  - `shuffle(items, rng)`：回傳洗好的新陣列 (Fisher–Yates，和現在 14 份寫法相同)
  - `reply(c, to, text)`：只讓某人看到的訊息，回傳 `false`
  - `startTimer(c, ms)`：開一個新的階段計時器 (`timers.phase`)
  - `lobbyEvent(title, s)`：房間公告事件
- 各 engine 刪掉自己的那份，改 import 共用的
- 寫法不同、行為也不同的保留原樣：
  - 狼人殺的 `startTimer` (有多種計時器) 和 `lobbyEvent` (沒有標題)
  - 誰是臥底的 `startTimer` (會清掉其他計時器)、間諜危機的 `startTimer` (回傳 id、不設 phase)
  - 心電感應 (合作) 的 `lobbyEvent` (玩家是字串陣列)
- 骷髏與玫瑰、蟑螂撲克、情書、心電感應 (合作) 原本的 `startTimer(c)` 寫死時間，改成呼叫共用的 `startTimer(c, 常數)`
- 蟑螂撲克原本的 `shuffle` 是就地洗牌；它只用回傳值，換成共用版本結果相同 (同樣的演算法、同樣的亂數次數)

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
(無：純重構，`skip_specs: true`)

## Impact

- Code：新增 `src/common.ts`；18 個 engine 檔案各刪掉 10～25 行
- Tests：新增 `test/common.test.ts`；現有 987 個測試 (含 characterization snapshot) 維持綠燈
