## Why

上次只把矮人礦坑的手牌名稱改成文字，回合面板、頻道公告、私下訊息和「🎒 我的手牌」裡的工具還是用 ⛏️🔦🛒 表示，Slack 有時顯示成 `:pick:` 這類代碼，玩家看不懂是哪項工具。

## What Changes

- 工具一律用文字「鎬子」「礦燈」「礦車」，不再用 emoji
  - 回合面板每位玩家一行：`❌⛏️🛒` → `壞了：鎬子、礦車`
  - 頻道公告和上一步：「@A 弄壞了 @B 的 ⛏️ 鎬子」→「@A 弄壞了 @B 的鎬子」；修理同理
  - 出牌後的私下確認、「🎒 我的手牌」的壞掉工具：同樣只寫文字
- spec 裡描述牌組和情境的工具 emoji 一起改成文字（只是寫法，行為不變）
- 不改：身分名稱（⛏️ 金礦工、💣 破壞者）、按鈕（⛏️ 行動、🎒 我的手牌、🗑️ 蓋掉一張牌）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `saboteur/turns`：「回合面板」加上工具只用文字的規則和情境；「回合選單」「破壞工具」「修理工具」的情境寫法
- `saboteur/setup`：「牌庫與發牌」的牌組表寫法
- `saboteur/bots`：情境寫法

## Impact

- Code：`src/saboteur.ts`、`src/saboteurCards.ts`（移除工具 emoji 對照表）
- Tests：`test/saboteur.test.ts`
- Docs：wiki 矮人礦坑-遊戲規則若有工具 emoji 一併檢查
