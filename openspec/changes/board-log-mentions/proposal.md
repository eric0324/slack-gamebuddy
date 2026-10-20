## Why

上一個 change 把回合面板的玩家清單改成 @ 標記，但面板裡的「上一步」(骰子街是結算明細) 還是純文字名字，同一則面板裡有的 @、有的沒有，看起來不一致。

## What Changes

- 矮人礦坑、璀璨寶石面板的「上一步」，骰子街面板的這回合紀錄 (擲骰結算、買了什麼)，提到的玩家改用 @ 標記
- 璀璨寶石回合結束收成的那一行「@A 的回合結束：<做了什麼>」，做了什麼裡的玩家也是 @
- 面板以外的頻道公告、私下訊息、城鎮一覽維持只顯示名字

## Capabilities

### Modified Capabilities

- `saboteur/turns`、`machikoro/turns`、`splendor/setup`：修改「回合面板以 @ 標記顯示玩家」

## Impact

- `src/engine.ts`：新增把不通知的名字換成 @ 標記的小工具
- `src/saboteur.ts`、`src/machikoro.ts`、`src/splendor.ts`：`board()` 的紀錄文字套用
- 測試：三款遊戲的測試檔
