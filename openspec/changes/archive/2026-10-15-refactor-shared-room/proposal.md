## Why

17 個遊戲 engine 的房間邏輯 (加入、離開、加 bot、移除 bot、取消，以及處理開房和再來一局的 `apply` 外殼) 各自複製一份，每份 60～90 行，差別只在幾個參數：人數上限、新玩家長什麼樣、怎樣算正常結束、要不要跑 bot。改一個房間規則 (例如房主離開時的訊息) 就要改 17 個檔案。

## What Changes

三階段重構的第三階段 (③)，**不改任何遊戲行為**：

- `src/common.ts` 新增房間函式：
  - `joinRoom(c, user, max, newPlayer)`：遊戲開始了、已經在房間、房間已滿都拒絕
  - `leaveRoom(c, user, title)`：房主離開就取消房間
  - `addBots(c, user, count, max, newPlayer, title)`、`removeBots(c, user, count, title)`
  - `cancelGame(c, user, extra?)`：只有房主能取消；`extra` 是取消時附加的文字 (變色龍公布祕密詞、圈內人公布答案)
  - `runGame(state, action, rng, opts)`：處理開房、再來一局、遊戲已結束時忽略，以及 `structuredClone` 和執行 `handle`；`opts` 帶 `finished(s)` (正常結束才能再來一局)、`isPlayer(s, user)`、`createLobby`、`handle`、可選的 `afterChange` (跑 bot) 和 `ctx` (間諜危機的額外欄位)
- 各 engine 的 `join`、`leave`、`addBot`、`removeBot`、`cancel` 和 `apply` 改呼叫共用函式
- 不支援 bot 的遊戲，`addBot`／`removeBot` 維持「X不支援 bot。」
- **保留原樣**：
  - 每款遊戲的 `start` (每款都不一樣) 和 `createLobby` (state 形狀不同)
  - 心電感應 (合作) 的 `join`／`leave` (玩家是字串陣列)，它只用 `runGame` 和 `cancelGame`
  - 狼人殺整個 engine

## Capabilities

### New Capabilities
(無)

### Modified Capabilities
(無：純重構，`skip_specs: true`)

## Impact

- Code：`src/common.ts` 增加約 100 行；17 個 engine 各減少 40～70 行
- Tests：新增房間函式的單元測試到 `test/common.test.ts`；現有 991 個測試 (含 characterization snapshot) 維持綠燈
