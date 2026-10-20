## Why

矮人礦坑「勝負與結束」寫「按下後用上一局的玩家開新房間」，容易讓人以為整份名單會帶到新房間；實際行為和其他遊戲一樣，只有按的人進新房間當房主。

## What Changes

- 只改 spec 文字，寫清楚：只有上一局的玩家可以按，按的人當房主並自動加入，其他人要重新按「加入」；加一個情境
- 程式行為不變

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `saboteur/scoring`：「勝負與結束」的再來一局寫法

## Impact

- 只有 spec；`test/saboteur.test.ts` 已經測過這個行為（「再來一局只有上一局玩家可以開」）
