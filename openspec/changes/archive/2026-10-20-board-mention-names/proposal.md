## Why

矮人礦坑、骰子街、璀璨寶石的回合面板裡，玩家清單只顯示純文字名字，跟標題的 @ 標記不一致，看起來不像玩家。富饒之城之前已經改成 @ 標記，這三款跟著改。接受每則回合面板會通知被列到的玩家。

## What Changes

- 回合面板每位玩家那一行改用 @ 標記 (bot 照常顯示「🤖<名字>」)
- 回合結束時面板收成的那一行改用 @ 標記
- 上一步、結算明細、公告、城鎮一覽等其他地方維持只顯示名字 (不在這次範圍)

## Capabilities

### Modified Capabilities

- `saboteur/turns`：新增「回合面板以 @ 標記顯示玩家」
- `machikoro/turns`：新增「回合面板以 @ 標記顯示玩家」
- `splendor/setup`：新增「回合面板以 @ 標記顯示玩家」

## Impact

- `src/saboteur.ts`、`src/machikoro.ts`、`src/splendor.ts`：`playerLine` 和回合結束那行改用 `mention()`
- 測試：三款遊戲的測試檔
