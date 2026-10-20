## Context

- ② 已經把 `reply`、`lobbyEvent`、`startTimer`、`shuffle` 抽到 `src/common.ts`。
- 比對結果：`join` 有 9 種寫法，但只差在上限常數和新玩家物件；`leave` 14 份完全相同 (骷髏與玫瑰、蟑螂撲克只是用 `find()` 找玩家)；`addBot`／`removeBot` 只差上限和新玩家物件；`cancel` 15 份相同，變色龍、圈內人多一段文字；`apply` 外殼 11 種寫法，差在「正常結束」的判斷欄位 (`winner`、`winners`、`finished`、`loser`、`score`)、要不要 `runBots`、間諜危機的 `botChain`。

## Decisions

1. **房間函式吃最小的介面**：`c: { s: { host; phase; players: P[]; timers }, events, rng }`，`P extends { id: string }`，泛型保留各遊戲自己的玩家型別。
2. **`runGame` 用 options 物件**而不是繼承或 class，和現在函式式的 engine 一致。
3. **每款遊戲的 `handle` 裡，房間的 case 改成一行**，例如 `case 'join': return joinRoom(c, action.user, MAX_SKULL_PLAYERS, newPlayer);`。保留 switch 結構，讀的人一眼看得到這款遊戲支援哪些操作。
4. **不改任何訊息文字**；照 ① 的作法，用 characterization snapshot 和現有測試把關。另外在 `test/common.test.ts` 為每個房間函式補單元測試。
5. **一次改一款遊戲、每改完跑全部測試**，用腳本替換逐字相同的區塊，替換不了的手動改。

## Risks / Trade-offs

- [行為微小差異，例如 addBot 時 rng 的呼叫順序] → 共用版本照現有寫法逐行搬，bot 命名的 rng 呼叫順序不變；固定 rng 的測試會抓到差異
- [泛型讓函式簽名變複雜] → 只在 `common.ts` 裡，呼叫端還是一行
