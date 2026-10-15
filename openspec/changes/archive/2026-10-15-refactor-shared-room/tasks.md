## 1. 共用房間函式

- [x] 1.1 先寫失敗的測試：`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`、`runGame` 的各種情況（開始後不能加入、重複加入、房間已滿、房主離開取消、bot 命名和上限、非房主不能取消、取消附加文字、開房時頻道已有遊戲、再來一局的條件、已結束時忽略）
- [x] 1.2 在 `src/common.ts` 實作，讓 1.1 綠燈

## 2. 替換

- [x] 2.1 16 款遊戲的 `join`、`leave`、`addBot`、`removeBot` 改呼叫共用函式（心電感應（合作）除外）
- [x] 2.2 17 款遊戲的 `cancel` 和 `apply` 改用 `cancelGame`、`runGame`

## 3. 驗證

- [x] 3.1 跑全部測試、typecheck（含 `--noUnusedLocals`），snapshot 沒有變
