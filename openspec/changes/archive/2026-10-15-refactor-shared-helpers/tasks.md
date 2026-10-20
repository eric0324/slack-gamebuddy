## 1. 共用函式

- [x] 1.1 先寫失敗的測試 `test/common.test.ts`：`shuffle` 不改原陣列、固定 rng 時結果固定且和原本寫法相同；`reply` 送出 ephemeral 並回傳 false；`startTimer` 遞增 timerSeq、設定 timers.phase、送出 startTimer 事件；`lobbyEvent` 的欄位
- [x] 1.2 新增 `src/common.ts`，讓 1.1 綠燈

## 2. 替換

- [x] 2.1 18 個 engine 刪掉相同的 `reply`、`shuffle`、`startTimer`、`lobbyEvent`，改 import 共用版本 (行為不同的照 proposal 保留)
- [x] 2.2 寫死時間的 `startTimer(c)` 改成 `startTimer(c, 常數)`

## 3. 驗證

- [x] 3.1 跑全部測試、typecheck (含 `--noUnusedLocals`)，snapshot 沒有變
