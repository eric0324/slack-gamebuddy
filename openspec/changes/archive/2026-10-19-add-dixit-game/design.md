## Context

- 官方 Dixit（Libellud，2008；2021 年新版）規則查證：
  - 基本版 84 張圖卡；新版支援 3～8 人（初版 3～6 人），每人 6 張手牌。
  - 說書人從手牌選一張，說一句話（也可以是一個字、一段聲音或動作）描述它，牌面朝下放出；其他人從自己手牌選一張最符合提示的牌交給說書人；說書人洗勻後翻開排成一列並編號。
  - 非說書人秘密投票猜哪張是說書人的牌，不能投自己的牌。
  - 計分：全部猜對或全部沒猜對時，說書人 0 分、其他人各 2 分；否則說書人和猜對的人各 3 分；除了說書人，每人的牌每得 1 票 +1 分。
  - 每輪結束後每人補到 6 張，說書人順時針輪替。
  - 結束：新版是牌庫最後一張牌抽出後（這輪打完）遊戲結束；初版是有人達到 20 分時結束。多數中英文規則整理寫成「牌庫抽完或有人達到 20 分」，最高分者獲勝。
  - 3 人變體：每人 7 張手牌，非說書人每輪出 2 張（共 5 張在桌上），非說書人補 2 張、說書人補 1 張；計分不變。
  - Dixit Odyssey 7 人以上可以投第二票、額外得分上限 3 分；基本版 7～8 人沒有這條。
  - 參考：[Wikipedia: Dixit](https://en.wikipedia.org/wiki/Dixit_(board_game))、[gamerules.com](https://gamerules.com/rules/dixit/)、[officialgamerules.org](https://officialgamerules.org/game-rules/dixit/)
- 圖庫：`src/memeImages.ts` 匯出 `MEME_IMAGES`，目前 188 張，全部是 Imgflip 熱門模板（`source: 'imgflip'`，網址 `https://i.imgflip.com/<id>`；型別保留 `tw` 但還沒有台灣梗圖），每張有中文名稱。頻道投稿存在 SQLite 的 `meme_images` 表（和戰績同一個檔案），`MemeStore.list(channel)` 回傳 `{ id, url, name, by }[]`，每個頻道各自一份、同頻道網址不重複；投稿時已經檢查過網址是 https 的圖片。梗圖大亂鬥開局時由 `src/slack.ts` 把 `memes.list(channel)` 塞進 `start` action 的 `custom`。
- 架構照 2026-10-15 重構後的做法：engine 純函式 `applyDixit(state, action, rng)`，房間用 `runGame` 等共用 helper；`src/games/dixit.ts` 匯出 `GameDef`（help、parse、button、modals）。私下按鈕選單（`prompt` audience `ephemeral`）、視窗（`modal`）、`ref` 更新同一則頻道訊息都是現成做法；目前只有 `announce` 能帶一張圖片，`prompt` 不能帶圖。
- Slack 限制：一則訊息最多 50 個 block；一個 actions block 最多 25 個元素；image block 有 `title`（純文字，會顯示在圖上方）和 `alt_text`；image block 的網址抓不到時 Slack 會拒絕整則訊息；ephemeral 訊息不能由 bot 更新，重新整理後會消失。

## Goals / Non-Goals

**Goals:** 照原版規則與計分；手牌只有本人看得到圖片；公開的牌匿名且有編號；一輪約 3～4 分鐘；沒人回應時遊戲會往下走，不會卡住。

**Non-Goals:** 不支援 bot（bot 無法看圖給提示）；不做 Odyssey 的第二票和大團體變體；不做投注籌碼版（Dixit 新版的「押注」變體）；不做自訂目標分數或秒數；不另做 dixit 專用圖庫或 dixit 專用投稿指令（沿用 `/game meme add`）；同一頻道跨局不記牌庫（每局重新洗）。

## Decisions

### 1. 牌庫：內建梗圖 + 頻道投稿，全部都用

- 開局時 adapter 帶入 `custom = memes.list(channel)`（和梗圖大亂鬥同一行邏輯）；engine 把 `MEME_IMAGES` 和 `custom` 合併，網址相同只留一張，洗牌成牌庫。
- **要用頻道投稿**：Dixit 牌越多樣越好玩，自家梗圖也有話題；投稿時已檢查過是圖片。和梗圖大亂鬥不同，不限每局張數（牌是一張張抽，不是固定 6 輪）。
- 卡片只存 `{ url, by? }`。**不顯示梗圖名稱**：名稱（例如「分心的男友」）等於現成提示，會讓說書太簡單；image block 的 `title` 只放編號，`alt_text` 也只寫「卡片 N」。
- 數量：188 張內建（加投稿）。8 人局開局發 48 張、每輪用 8 張，大約可以玩 17 輪；3 人局發 21 張、每輪 5 張，大約 33 輪。通常會先有人到 20 分。目標分數從原版 30 改成 20（使用者決定），一局約 20～30 分鐘。
- 出過的牌不洗回牌庫（原版牌庫抽完就結束）。

### 2. 人數、手牌、說書人順序

- 3～8 位真人；`addbot` 拒絕「妙語說書人不支援 bot」。
- 4～8 人每人 6 張；3 人每人 7 張，非說書人每輪出 2 張（原版 3 人變體）。
- 說書人照加入順序輪流，房主先；每輪換下一位，繞一圈再從頭。

### 3. 說書（120 秒）

- 頻道貼說書訊息（`ref`）：「第 N 輪，說書人是 @X」、「🃏 我的手牌」按鈕。任何玩家都可以按來看自己的手牌（非說書人可以先想），只有說書人的選單有「選這張」按鈕。
- 手牌選單：私下的 `prompt`（audience `ephemeral`），帶 6～7 張圖片（title「1」「2」…），下面一列按鈕「1」「2」…（value `pick:<seq>:<i>`）。
- 說書人按一張 → state 記 `pick`，開視窗 `dixitClue` 輸入提示（1～50 字，前後空白去掉）；送出後成立。視窗打不開時提示改用 `/game dixit clue <編號> <提示>`。按了別張再送出就以最後選的為準；送出後不能改。
- 提示成立：頻道公告「💬 @X 的提示：『……』」，進入出牌。

### 4. 出牌（90 秒）

- 頻道貼出牌訊息（`ref`）：提示、「🃏 我的手牌」、「已出 N/M」（M 是非說書人人數），列出還沒出完的人。
- 非說書人的手牌選單按鈕 value `play:<seq>:<i>`；按一張就出，SHALL NOT 能改。3 人局要出 2 張，出第一張後私下提示「再出一張」，出完 2 張才算完成；同一張不能出兩次（出了就離開手牌）。
- 說書人在出牌階段按「🃏 我的手牌」只看得到圖片，沒有按鈕。

### 5. 投票（60 秒）

- 桌上的牌（說書人 1 張 + 其他人的牌）打亂，頻道貼投票訊息（`ref`）：提示、每張圖片 title 依序「1」「2」…、一列按鈕「1」「2」…（value `vote:<seq>:<i>`）、「已投 N/M」。不顯示誰出的。
- 只有非說書人能投；不能投自己出的牌（3 人局兩張都不能投）；截止前可以改票，改票不改進度；私下回覆「你投了 N」。
- 全部非說書人都投了就提前揭曉；時間到沒投的人算棄權（沒猜對、也不給別人票）。

### 6. 揭曉與計分

- 「全部猜對」＝每位非說書人都投了說書人的牌；「全部沒猜對」＝沒有任何非說書人投說書人的牌（含全員棄權）。兩者之一：說書人 0、每位非說書人 +2；否則說書人 +3、猜對的人各 +3。
- 再加票數分：每張非說書人的牌每得 1 票，出牌的人 +1（3 人局兩張分開算）。說書人的牌得票不另外加分。
- 投票訊息改成已結束（圖片保留，沒有按鈕）；頻道公告：說書人的牌是第幾號、每張牌是誰出的和誰投了它、本輪每人得分、目前總分（由高到低）。
- 圖片 title 是純文字不能 @ 人，所以「誰出的」寫在公告文字裡、用編號對照。

### 7. 補牌、結束判斷

- 揭曉後：有人 ≥ 20 分 → 遊戲結束。否則補牌：每人補到手牌上限（6 或 7）；牌庫不夠補滿所有人 → 遊戲結束（不補）。都沒有就換下一位說書人開新的一輪。
- 結束：總分最高者獲勝，同分並列；公告最終排名、`result`、「再來一局」。

### 8. 逾時處理

| 階段 | 時間 | 逾時 |
| --- | --- | --- |
| 說書 | 120 秒 | 公告「⌛ @X 沒出提示，這輪跳過」，不計分、手牌不變，換下一位說書人；`skips + 1` |
| 出牌 | 90 秒 | 沒出完的人由系統從手牌隨機出（3 人局補到 2 張），公告「⌛ @某人 沒出牌，系統幫他出了」，進投票 |
| 投票 | 60 秒 | 沒投的人棄權，照常揭曉 |

- 說書人成功出提示時 `skips` 歸零；`skips` 達到玩家人數（一整圈都沒人出提示）時，遊戲自動結束：公告「大家好像都不在了，遊戲結束」和目前分數，SHALL NOT 送 `result`、不貼再來一局（避免沒人在時計時器一直跑）。
- 說書人選了牌但沒送出提示，也算沒出提示。

### 9. 帶圖片的 prompt（`src/engine.ts`、`src/slack.ts`）

- `prompt` 加選填 `images?: { url: string; title: string }[]`；adapter 排成 `section`（文字）→ 每張一個 `image` block（`title` 純文字、`alt_text` 同 title）→ actions。
- block 數：手牌最多 1 + 7 + 1 = 9；投票最多 1 + 8 + 1 = 10（8 人局 8 張；3 人局 5 張），都遠低於 50；按鈕最多 8 顆，一個 actions block 就夠。
- 圖片壞掉時 Slack 拒絕整則訊息：adapter 改發同一個 prompt 但不帶 image block，文字後面附「1. <網址>」清單，按鈕照常。照「圖片壞掉時的備案」的精神，遊戲照常進行。
- ephemeral 訊息不能更新，所以手牌選單每按一次「🃏 我的手牌」就重發一則；舊選單的按鈕用 `seq` 和手牌位置擋掉（牌已經不在手上就拒絕）。

### 10. State（草稿）

```ts
type Card = { url: string; by?: string };              // by：頻道投稿者
interface DPlayer { id: string; hand: Card[]; score: number; played: Card[]; vote?: number }
interface DixitState {
  game: 'dixit'; channel: string; host: string;
  phase: 'lobby' | 'clue' | 'play' | 'vote' | 'ended';
  players: DPlayer[];                                  // 加入順序 = 說書人順序
  deck: Card[];
  teller: number;                                      // 說書人在 players 的 index
  round: number; seq: number;                          // seq：訊息 ref，也擋舊按鈕
  pick?: number; clue?: string; tellerCard?: Card;
  table: { card: Card; by: string }[];                 // 投票時打亂後的牌
  skips: number;                                       // 連續沒出提示的輪數
  winners?: string[]; timerSeq: number; timers: { phase?: number };
}
```

### 11. Action 與指令、按鈕

- `hand { user }`：按「🃏 我的手牌」（value `hand`）
- `pick { user, seq, card }`：說書人按手牌（`pick:<seq>:<i>`），接著開 `dixitClue` 視窗
- `clue { user, text, card? }`：視窗送出（用 `pick`）或 `/game dixit clue <編號> <提示>`（編號是手牌 1～6／7）
- `play { user, seq, card }`：`play:<seq>:<i>`
- `vote { user, seq, n }`：`vote:<seq>:<i>`
- 共通：`new`、`join`、`leave`、`start { custom? }`、`cancel`、`addBot`／`removeBot`（拒絕）、`rematch`、`timeout`

## Risks / Trade-offs

- [梗圖是有名的模板，大家知道它的「梗」] → 提示可能變成直接講梗的意思、太好猜；但原版的圖也常有明顯主題，會自然傾向給模糊提示。不顯示名稱降低這個問題。需要使用者確認是否接受
- [有些模板圖上有字（例如告示牌）] → 只影響少數張，接受
- [8 張圖直排很長，要捲動] → Slack 沒有格狀排版；圖片 title 放大編號，按鈕在最下面。可以接受
- [ephemeral 重新整理後消失] → 隨時可以再按「🃏 我的手牌」
- [一局可能 30～45 分鐘] → 原版就是這個長度；房主可以隨時取消（取消不算戰績）
- [投稿的圖後來失效] → 備案改發網址文字；牌照常可以出、可以投
- [3 人局 5 張牌，猜中機率高] → 原版變體就是這樣
