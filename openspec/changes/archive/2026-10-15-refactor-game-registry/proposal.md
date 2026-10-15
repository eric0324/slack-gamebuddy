## Why

`src/slack.ts` 已經 1,232 行。每款遊戲的 Slack 設定（遊戲清單那一行、指令說明、指令解析、按鈕對應、大廳資訊、視窗、`GameHost` 的狀態欄位和 `defs`）散在檔案裡十幾個地方。每加一款遊戲都要改這十幾處，上次同時合併五款遊戲時，所有衝突都出在這裡。

## What Changes

這是三階段重構的第一階段（①），**不改任何遊戲行為**：

- 新增 `src/games/` 目錄，每款遊戲（狼人殺以外的 17 款）一個檔案，集中放這款遊戲的 Slack 設定：代號、emoji、名稱、人數、分類、介紹、是否支援 bot、指令說明、`apply`、指令解析、按鈕對應，以及視窗和頻道訊息的對應（有的話）
- 新增 `src/games/index.ts`：一個 `GAMES` 清單，依大廳順序列出 17 款遊戲
- `src/slack.ts` 的遊戲清單文字、大廳 `CATALOG`、`Kind`、`defs`、視窗對應、頻道訊息對應，都改成從 `GAMES` 產生
- `GameHost` 的 17 個 `xxxGames` 欄位改成統一的 `state(kind, channel)`（測試用的 `setState` 也一樣）
- 測試跟著改用 `host.state('skull', 'C1')`，指令解析函式改從 `src/games/<遊戲>.ts` import
- 之後新增遊戲：新增 `src/games/<遊戲>.ts`，在 `GAMES` 加一行

狼人殺維持原樣（它的 adapter 和其他遊戲不同，留在 `slack.ts`）。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
（無：純重構，對外行為不變，所以這個 change 設定 `skip_specs: true`）

## Impact

- Code：新增 `src/games/*.ts`（18 個檔案）；`src/slack.ts` 預計減少 600 行以上
- Tests：`test/slack.test.ts` 改用 `host.state()`、調整 import；新增一個 characterization test，在重構前記下所有使用者看得到的文字（遊戲清單、大廳、17 份指令說明），重構後必須完全一樣
- 後續：② 共用小工具抽到 `src/common.ts`、③ 房間邏輯共用，各自另開 change
