## Why

富饒之城牌桌和場上一覽目前只顯示純文字名字，玩家希望改回 Slack 的 @ 標記，看起來比較清楚、也能點開對方資訊。接受每則牌桌訊息會通知被列到的玩家。

## What Changes

- 牌桌訊息的王冠、已翻開、玩家清單、回合結束那行改用 @ 標記
- 「🏰 我的回合」選單和「📜 我的狀態」的「👥 場上：」一覽改用 @ 標記
- 等墓地的提示維持只顯示名字 (不在這次範圍)

## Capabilities

### Modified Capabilities

- `citadels/turns`：修改「牌桌訊息」「回合選單」
- `citadels/setup`：修改「我的狀態」

## Impact

- `src/citadels.ts`：`board()`、`playerLine`、`overview` 改用 `mention()`
- 測試：`test/citadels.test.ts`
