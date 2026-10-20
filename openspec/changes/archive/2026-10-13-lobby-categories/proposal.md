## Why

`/game` 大廳現在每款遊戲佔一個區塊 (名稱、人數、介紹、開房按鈕)，遊戲已經 11 款，整則訊息很長，要一直往下捲才找得到想玩的。

## What Changes

- 大廳上方加一排分類按鈕：🔍 推理、⚔️ 團隊對抗、🤝 合作、🎲 心理戰
- 一次只顯示一個分類的遊戲 (保留名稱、代號、人數、介紹和「開房」按鈕)，預設顯示第一類「推理」
- 按分類按鈕時，**原本那則大廳訊息直接換內容** (不會多一則新訊息)；目前所在的分類按鈕會標成藍色
- 分類：
  - 🔍 推理：狼人殺、誰是臥底、間諜危機、阿瓦隆
  - ⚔️ 團隊對抗：機密代號、心電感應、截碼戰
  - 🤝 合作：一字千金、花火
  - 🎲 心理戰：吹牛骰、政變
- wiki 連結和「`/game <代號> help` 看指令」的提示保留在最下面

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的大廳改成分類顯示

## Impact

- Code：`src/slack.ts` (大廳 blocks、分類按鈕、用 `response_url` 換掉原本的 ephemeral 訊息)、`src/index.ts` (按鈕 handler 傳入 `response_url`)
- Tests：`test/slack.test.ts`
- Docs：wiki 首頁「開始玩」
