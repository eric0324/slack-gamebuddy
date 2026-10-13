## Why

心理戰分類目前有吹牛骰、政變、骷髏與玫瑰，都是「喊數／宣稱 → 質疑」的結構。蟑螂撲克（Cockroach Poker）更直接：把一張蓋著的牌傳給別人並說「這是蟑螂」，對方只要判斷「是」或「不是」，規則一句話就講完、2～6 人都能玩，每一步只有一個人要做決定，很適合 Slack 非同步。手牌只讓自己看到、選目標、帶 step 擋過期選單都可以沿用骷髏與玫瑰、情書的寫法。

## What Changes

- 新增遊戲「🪳 蟑螂撲克」（代號 `cockroach`），2～6 人，支援 bot 補位（bot 也算人數）
- 64 張牌：8 種害蟲（🪳 蟑螂、🐀 老鼠、🪰 蒼蠅、🦂 蠍子、🪲 臭蟲、🕷️ 蜘蛛、🐸 青蛙、🦇 蝙蝠）各 8 張，洗牌後全部發完（除不盡時座位前面的人多 1 張）
- 輪到的人用只有自己看得到的選單選一張手牌、選要傳給誰、宣稱「這是 X」（可以說謊），頻道公告「A 傳了一張牌給 B：這是 🪳 蟑螂」
- 收到的人三選一：「✅ 是」「❌ 不是」，或「👀 偷看再傳」（偷看後只有自己看得到牌，再傳給還沒看過這張牌的人並重新宣稱）；所有其他人都看過時只能回答是／不是
- 猜對：上一個傳牌的人把牌面朝上放在自己面前；猜錯：回答的人放在自己面前。拿到牌的人開始下一回合
- 面前同一種害蟲 4 張、或輪到他開始回合時手上沒牌，這個人就輸，遊戲結束
- 每個決策 2 分鐘，超時自動行動（出牌→隨機一張傳給隨機一人並照實宣稱、回答→「不是」、偷看後→傳給隨機一位還沒看過的人並沿用原本的宣稱）
- 「🃏 我的手牌」按鈕：遊戲中的玩家隨時看自己的手牌（每種幾張）
- 遊戲大廳「🎲 心理戰」分類加入蟑螂撲克

## Capabilities

### New Capabilities
- `cockroach/setup`：房間、bot 加減、牌堆與發牌、我的手牌、遊戲清單與說明
- `cockroach/rounds`：出牌與宣稱、回答是／不是、偷看再傳、牌面朝上、輸家判定、計時與超時、過期選單、結束與再來一局
- `cockroach/bots`：bot 的出牌、宣稱、回答、偷看再傳策略，一個真人也能玩完

### Modified Capabilities
- （大廳分類由主控統一修改）

## Impact

- Code：新增 `src/cockroach.ts`；`src/slack.ts`（Kind、GameHost.defs 註冊、`parseCockroachCommand`、`cockroachButton`、`COCKROACH_HELP`、`GAME_LIST`、`CATALOG` 加 `category: 'bluff'`）
- Tests：新增 `test/cockroach.test.ts`；`test/slack.test.ts`（KINDS、大廳心理戰分類、指令和按鈕路由）
- Docs：README（遊戲列表、wiki 連結、manifest description／usage_hint）、wiki 新增「蟑螂撲克」「蟑螂撲克-遊戲規則」「蟑螂撲克-指令」三頁

> 註：變色龍和蟑螂撲克一起合併，`game-commands` 的大廳分類修改（兩款都加入）統一寫在 `add-cockroach-game` 的 delta。
