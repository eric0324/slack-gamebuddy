## Why

富饒之城和矮人礦坑的回合按鈕叫「我的回合」，但按下去是要做事，叫「行動」比較直接。矮人礦坑的手牌名稱每張都帶 emoji（🔨、🔧、⛏️、🗺️、🪨），一排按鈕看起來太花，用文字比較好讀。

## What Changes

- 富饒之城牌桌訊息的「🏰 我的回合」改成「🏰 行動」；說明文字、過期提示、墓地等待提示裡提到這顆按鈕的地方一起改
- 矮人礦坑回合面板的「⛏️ 我的回合」改成「⛏️ 行動」；`help` 和過期提示一起改
- 矮人礦坑的手牌名稱拿掉 emoji，只用文字：「破壞 鎬子」「修理 鎬子／礦燈」「藏寶圖」「落石」；通道牌照舊（「━ 通道」「┃ 死路」）。修理牌的目標按鈕從「@B ⛏️」改成「@B 鎬子」
- 不改的：按鈕的 value（`turnMenu:<seq>`）、其他按鈕（「📜 我的狀態」「🎒 我的手牌」「🗑️ 蓋掉一張牌」「↩️ 換一張」）、回合面板上壞掉工具的圖示（❌⛏️🛒）、頻道公告

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `citadels/setup`：「牌桌訊息」「遊戲清單與指令說明」的按鈕名稱
- `citadels/turns`：「回合選單」「回合面板」的按鈕名稱
- `saboteur/setup`：「遊戲清單與指令說明」的按鈕名稱
- `saboteur/turns`：「回合面板」「回合選單」的按鈕名稱；手牌名稱只用文字；「破壞工具」「修理工具」情境裡的牌名和修理目標按鈕
- `saboteur/bots`：情境裡的牌名改成文字

## Impact

- Code：`src/citadels.ts`、`src/games/citadels.ts`、`src/saboteur.ts`、`src/games/saboteur.ts`（只改顯示文字）
- Tests：`test/citadels.test.ts`、`test/saboteur.test.ts`；`test/characterization.test.ts` 的 snapshot（help 文字）
- Docs：wiki 富饒之城-指令、矮人礦坑、矮人礦坑-指令、矮人礦坑-遊戲規則
