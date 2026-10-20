## Why

心電感應 (兩隊對抗) 需要 4 人以上，而且人少時分隊不好玩。同一群人常常只有 2～3 個人有空，想要一款不用分隊、大家一起拚分數的版本；官方本來就有合作模式 (一副固定數量的牌、依距離得分、最後依總分給評價)，可以沿用現有的光譜卡、寫提示視窗和 0～10 按鈕。

## What Changes

- 新增遊戲「🧠 心電感應 (合作)」(代號 `wavecoop`)，2～12 位真人，不支援 bot；大廳放在「🤝 合作」分類
- 全員同一隊：隨機決定出題順序，輪流出題；出題者以外的**所有人**一起按 0～10 猜位置，全隊答案取平均四捨五入
- 官方合作模式：一副 7 題；距離 0／1／2 得 4／3／2 分；**正中目標 (4 分) 時加一題**
- 沒有對手猜左右的階段
- 每個階段 3 分鐘，全部猜完提早結束；出題超時這題跳過 (0 分，仍然用掉一題)
- 結束時公告總分和評價文字 (例如「🧠 你們是不是共用一顆腦？」)，附「再來一局」
- 現有的 `/game wavelength` (兩隊對抗)**行為完全不變**

## Capabilities

### New Capabilities
- `wavecoop/setup`：房間、出題順序、題數、光譜卡、遊戲清單與說明
- `wavecoop/rounds`：出題、全員猜位置、計分與加題、結束與評價

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的「🤝 合作」分類多了心電感應 (合作)

## Impact

- Code：新增 `src/wavecoop.ts` (沿用 `src/wavelengthCards.ts` 的光譜卡，不改 `src/wavelength.ts`)；`src/slack.ts` (Kind、GameHost.defs 註冊、`parseWavecoopCommand`、`wavecoopButton`、`WAVECOOP_HELP`、`GAME_LIST`、`CATALOG`、`modal()` 處理 `ww:wavecoopClue`、視窗失敗時的備用指令提示)
- Tests：新增 `test/wavecoop.test.ts`；`test/slack.test.ts` (KINDS、合作分類、指令解析、按鈕路由)
- Docs：README (遊戲列表、manifest usage hint)、wiki 新增心電感應 (合作) 頁面

> 註：這次 5 款遊戲一起合併。大廳分類的 `game-commands` 修改統一寫在 `add-loveletter-game` 的 delta (最後歸檔)，這個 change 不另外修改 `game-commands`，避免依序歸檔時互相覆蓋。
