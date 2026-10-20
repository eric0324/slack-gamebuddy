## Why

心理戰分類已經有梗圖大亂鬥 (看圖配文字)，但還沒有「看文字猜圖」的遊戲。妙語說書人 (Dixit) 是經典派對遊戲：說書人看自己的一張圖給一句提示，其他人拿自己手上的圖來混淆，大家再猜哪張是說書人的。提示要「有人猜得到、但不能所有人都猜到」，好玩在拿捏。梗圖大亂鬥已經有 188 張內建梗圖和頻道投稿，可以直接當牌；手牌用只有自己看得到的訊息、投票用頻道按鈕，都是現成做法，只需要讓按鈕選單可以帶圖片。

## What Changes

- 新增遊戲「🎨 妙語說書人」(代號 `dixit`)，3～8 位真人，不支援 bot，大廳分類 🎲 心理戰
- 牌庫：梗圖大亂鬥的內建梗圖 (`src/memeImages.ts`) 加上這個頻道的投稿梗圖 (`MemeStore`)，網址相同的只算一張，開局洗牌。牌上只顯示圖片和編號，不顯示梗圖名稱
- 每人 6 張手牌 (3 人局 7 張)；說書人照加入順序輪流 (房主先)
- 每輪三個階段：
  - **說書 (120 秒)**：說書人按「🃏 我的手牌」私下看到手牌圖片，選一張再在視窗輸入提示 (1～50 字)；也可以 `/game dixit clue <編號> <提示>`
  - **出牌 (90 秒)**：頻道公告提示，其他人從手牌挑一張最符合的 (3 人局每人 2 張)，出了不能改；時間到系統幫沒出的人隨機出
  - **投票 (60 秒)**：所有出的牌打亂後在頻道用編號 1、2、3… 公開圖片，不顯示是誰的；非說書人投一票猜說書人的牌，不能投自己的牌，截止前可以改票
- 計分照原版：全部猜對或全部沒猜對時說書人 0 分、其他人各 2 分；否則說書人和猜對的人各 3 分；非說書人的牌每得 1 票 +1 分。接著每人補滿手牌，換下一位說書人
- 有人達到 20 分，或牌庫不夠補滿手牌時，在這輪結束後遊戲結束，總分最高者獲勝，同分並列
- 說書人 120 秒沒出提示時這輪跳過、不計分；連續一整圈都跳過時遊戲自動結束 (不算戰績)
- 讓按鈕選單 (`prompt`) 可以帶圖片 (Slack image block)，圖片壞掉時改發文字和網址
- 結束送出 `result` 事件；附「再來一局」；房主可取消

### 誰算贏 (戰績)

遊戲正常結束 (有人達到 20 分，或牌庫不夠補牌) 時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是總分最高的玩家；同分**全部都算贏**。房主取消、或因為連續一整圈沒人出提示而自動結束的遊戲不送 `result`。

## Capabilities

### New Capabilities
- `dixit/setup`：房間、牌庫、發牌、說書人順序、開局、遊戲清單與指令說明
- `dixit/rounds`：說書、出牌、匿名投票、揭曉與計分、補牌、勝負與結束、帶圖片的訊息

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上妙語說書人 (由主控統一寫 delta)
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上妙語說書人 (由主控統一寫 delta)

## Impact

- Code：新增 `src/dixit.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)、`src/games/dixit.ts` (`GameDef`，含 `modals.dixitClue`)；`src/games/index.ts` 的 `GAMES` 加一行
- `src/engine.ts`：`prompt` 事件加選填的 `images?: { url: string; title: string }[]`
- `src/slack.ts`：`prompt` 有 `images` 時在文字和按鈕之間放 image block，發送失敗時改成文字附網址；`dixit` 的 `start` 和梗圖大亂鬥一樣帶入頻道投稿梗圖 (`custom`)
- 不改 `src/memeImages.ts`、`src/memeStore.ts` (只讀)
- Tests：新增 `test/dixit.test.ts`；`test/slack.test.ts` (prompt 圖片、KINDS、大廳心理戰分類)；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 三頁 (妙語說書人、妙語說書人-遊戲規則、妙語說書人-指令)
