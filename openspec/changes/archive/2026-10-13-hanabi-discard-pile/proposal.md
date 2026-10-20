## Why

花火的棄牌堆現在看不到：棄掉或失誤的牌只在當下公告一次，訊息一被洗掉，大家就不知道哪些牌已經沒了。這對判斷「這張是不是最後一張、不能棄」很重要 (例如紅 5 只有一張、2～4 各兩張)。

## What Changes

- 輪到時的按鈕列新增「🗑️ 棄牌堆」，排在「👀 看牌」後面、「💡 給提示」前面 (避免被 Slack 摺進「+ N more」)
- 任何人按都可以 (棄牌堆是公開資訊，觀眾也能看)，只讓按的人看到
- 內容依顏色分行 (紅、黃、綠、藍、白)，每行數字由小到大；沒有牌的顏色不列出；整個棄牌堆是空的時候顯示「棄牌堆是空的」

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
- `hanabi/turns`：新增「查看棄牌堆」requirement

## Impact

- Specs：`hanabi/turns`
- Code：`src/hanabi.ts` (新增 `discards` action 和按鈕)、`src/slack.ts` (按鈕路由、說明文字)
- Tests：`test/hanabi.test.ts`、`test/slack.test.ts`
