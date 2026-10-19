## Context

- 傳情畫意（Telestrations）：每人一本小冊子，第一頁寫題目，接著「畫 → 猜 → 畫 → 猜」輪流往下傳，傳一圈回來後翻開看題目怎麼走鐘；官方計分是大家投票選最好笑的圖和猜測。使用者選了**系統題庫發題＋投票計分**，把「畫圖」換成「只用 emoji 描述」。
- 架構照 2026-10-15 重構後的做法：engine 純函式 `applyEmoji(state, action, rng)`，房間用 `runGame` 等共用 helper；`src/games/emoji.ts` 匯出 `GameDef`（help、parse、button、modals）。視窗（猜猜看 `wagerAnswer`、梗圖大亂鬥 `memeWrite`）、私下按鈕選單（猜猜看押注）、`ref` 更新同一則頻道訊息的進度、`seq` 擋掉舊按鈕，都是現成做法。
- 匿名投票照梗圖大亂鬥：誰投了誰不公開、進度用同一則訊息更新、不能投自己、截止前可以改票。不同的是作品在公布鏈時就已經標了作者（傳話遊戲本來就要看是誰走鐘的），所以只有「票」匿名。
- 跨局不重複照禁語／猜猜看：`createLobby(prev)` 沿用 `prev.deck`。

## Goals / Non-Goals

**Goals:** 規則一句話講完（文字用 emoji 演、emoji 用文字猜，傳一圈看走鐘）；所有人同時進行，10 人局也在 20 分鐘內；有人掛機鏈也能繼續；emoji 驗證規則明確、可測試。

**Non-Goals:** 不支援 bot；不做多輪（一局就是一輪傳遞）；不驗證 `:shortcode:` 是否真的存在於 workspace（不呼叫 `emoji.list`）；不讓玩家自己出題或投稿題目；不做自訂秒數或步數；不判定最後猜測「答對」加分（只靠投票）。

## Decisions

### 1. 人數、步數與傳遞

- 人數 4～10。3 人時 K＝2，每條鏈只有「emoji → 猜一次」，沒有走鐘的樂趣，所以下限 4（4 人局 K＝4：emoji → 猜 → emoji → 猜）。
- 傳遞順序＝加入順序（玩家清單的順序），開局公告「A → B → C → D → A」。
- 第 i 條鏈的主人是第 i 位玩家，起點是他拿到的題目；第 k 步（1～K）由第 `(i + k − 1) mod N` 位玩家做。第 1 步是主人自己用 emoji 演自己的題目。
- K＝人數（偶數）或人數－1（奇數）：K ≤ N 所以同一條鏈不會有人做兩次；K 是偶數所以奇數步都是 emoji、偶數步都是猜測，最後一步一定是文字猜測。奇數人數時，主人的前一位不會碰到這條鏈。
- 每一步所有人同時做（每人手上剛好一條鏈），步驟類型是全局一致的，頻道訊息只要一則。

### 2. 作答流程

- 每一步頻道貼一則步驟訊息：「🔗 第 k／K 步：🎨 用 emoji 描述（90 秒）」或「🧠 猜猜這是什麼（60 秒）」，附「✍️ 作答」按鈕和「已交 N/M」（M 是這一步需要作答的人數，跳過的人不算）。
- 按「✍️ 作答」：先送一則只有自己看到的內容（「你拿到：珍珠奶茶，請只用 emoji 描述」或「你拿到：🧋🐻，請猜這是什麼」），再打開視窗 `emojiSend`；視窗打不開時提示 `/game emoji send <內容>`。
- `/game emoji send <內容>`：依目前步驟類型驗證。截止前可以重送覆蓋，作答者私下看到「已收到：…」。
- emoji 步驟拿到的文字不只是題目，也可能是上一位的猜測；猜測步驟只看得到 emoji，看不到這條鏈之前的任何文字。
- 頻道在公布鏈之前 SHALL NOT 出現任何作品內容。

### 3. Emoji 驗證規則

`isEmojiOnly(text)`（純函式，單獨測試）：

1. 去掉所有空白（`\s`，包含全形空白 U+3000）後不得為空。
2. 剩下的字串必須完全由以下 token 組成：
   - **Slack shortcode**：`:[a-z0-9_+'-]+:`（Slack 送來的格式，含膚色 `:skin-tone-2:`，`::` 相連也可以，例如 `:wave::skin-tone-3:`）。只接受 ASCII 小寫，不驗證這個 shortcode 是否存在。
   - **Unicode emoji**：`\p{RGI_Emoji}`（Node 22 的 `v` flag，涵蓋 ZWJ 組合、膚色、國旗、keycap `1️⃣`），另外接受單一 `\p{Extended_Pictographic}` 字元後面可接 U+FE0F（例如沒有變體選擇符的 `❤`、`☺`）。
3. token 數量 1～20（一個 ZWJ 組合或一個 shortcode 算 1 個；膚色 shortcode 也算 1 個，簡單起見）。
4. 不接受：一般文字（中英文、注音）、單獨的數字或 `#`、標點符號、`<3`、沒閉合的 `:abc`、`:中文:`。
5. 錯誤提示（只讓作答者看到）：「只能用 emoji 喔！可以直接貼 emoji 或打 `:shortcode:`，可以有空白，最多 20 個」。
6. 存的是原始字串（`trim` 後），公布時照原樣貼到頻道，Slack 會把 shortcode 顯示成圖。

猜測驗證：`trim` 後 1～30 字（以字元計，`Array.from`），沒有其他限制。

### 4. 逾時處理

- 時間到：沒交的人這一步這條鏈留白（記為 `missing`），步驟照常往下走。
- 下一步的輸入＝這條鏈「最近一則需要的類型」：emoji 步驟拿最近一則文字（起點題目一定存在，所以永遠有輸入）；猜測步驟拿最近一則 emoji。
- 猜測步驟找不到任何 emoji（前面的 emoji 步全部沒交）：這位玩家這一步**跳過**，按「✍️ 作答」只看到「上一位沒交，這一步你休息」，`send` 被拒絕，不算進「已交 N/M」的分母。
- 整步沒有任何人交（需要作答的人全部沒交）：判定大家都不在，公告「⌛ 這一步沒有人交，遊戲中止」，結束遊戲，不送 `result`、不貼「再來一局」。避免掛機局空跑 10 步。
- 公布鏈時沒交的步驟顯示「⌛ @某人 沒交」，跳過的步驟不顯示。

### 5. 公布鏈

- 所有步驟結束後，頻道先公告「🔗 傳話結束，來看看大家怎麼走鐘」，接著依鏈的順序一條一則訊息：

```
🔗 第 2 條鏈（@B 的題目）
📝 題目：珍珠奶茶
`2-1` 🎨 @B：🧋⚫⚫
`2-2` 🧠 @C：黑糖珍奶
`2-3` 🎨 @D：🍬🟤🥛
`2-4` 🧠 @A：咖啡牛奶
```

- 編號 `鏈-步` 是投票用的代號；沒交的步驟沒有編號。

### 6. 投票

- 公布完貼一則投票訊息，附「🎨 投最佳 emoji」「🧠 投最神猜測」兩顆按鈕，顯示「已投完 N/M」（兩票都投了才算投完），投票 90 秒。
- 按其中一顆：只讓自己看到該類別所有作品編號的按鈕（`perRow` 5，10 人局最多 50 顆，在 Slack 的 50 blocks 限制內），**自己的作品不列出**；按一顆就是投這一票，私下看到「你的最佳 emoji 投給 `2-3`」。
- 每人每類別 1 票，截止前可以改票（改票不改進度）；投自己的作品（舊按鈕或手動 value）SHALL 被拒絕。
- 某類別沒有可以投的作品（全是自己的或都沒交），這一類別視為已投。
- 全員投完提前揭曉；90 秒到時沒投的票作廢。誰投了誰 SHALL NOT 公開，揭曉只公布票數。

### 7. 計分與揭曉

- 每則作品每得 1 票，作者 +1 分（兩個類別合計）。
- 揭曉公告：🎨 最佳 emoji（最高票的作品，同票全列，0 票就不列）、🧠 最神猜測（同上），以及每位玩家的總分排名；總分最高者獲勝，同分並列（包括全員 0 分）。
- 送出 `result`，貼「再來一局」（只有上一局的玩家可以按，按的人成為新房主）。

### 8. 題庫

`src/emojiPrompts.ts` 匯出 `EMOJI_PROMPTS: string[]`，依分類分段註解：
- 至少 150 題，不重複、不空白，每題 2～12 字。
- 分類大致平均：成語（例：畫蛇添足、對牛彈琴）、電影影視（例：鐵達尼號、冰雪奇緣）、食物（例：珍珠奶茶、臭豆腐）、台灣日常（例：倒垃圾追垃圾車、颱風假）、動作職業（例：打瞌睡、消防員）。
- 選題原則：大家都知道、能拆成具體物件或動作的詞；避免抽象概念、冷僻專有名詞和敏感題材。
- 發題：開局從 `deck` 依序發 N 題；`deck` 不夠時先把剩下的發完，再重洗全部題目（排除這局已發的）補足。

### 9. State（草稿）

```ts
interface EState {
  game: 'emoji'; channel: string; host: string;
  phase: 'lobby' | 'play' | 'vote' | 'ended';
  players: { id: string; score: number }[];             // 順序＝傳遞順序
  deck: number[];                                       // 還沒發的題目（EMOJI_PROMPTS 的 index），跨局沿用
  chains: { owner: string; prompt: number;
            entries: { by: string; kind: 'emoji' | 'guess'; text?: string }[] }[]; // text 沒有＝沒交；跳過的不記
  step: number; steps: number;                          // 第幾步（1～K）、K
  pending: Record<string, string>;                      // 這一步 user → 已交的內容（截止才寫進 entries）
  votes: Record<string, { emoji?: string; guess?: string }>; // user → 作品編號 `鏈-步`
  seq: number;                                          // 步驟／投票訊息的 ref，也擋掉舊按鈕
  winners?: string[]; timerSeq: number; timers: { phase?: number };
}
```

### 10. Action 與指令、按鈕

- `openSend { user }`：按「✍️ 作答」（私下內容＋視窗）
- `send { user, text }`：視窗 `emojiSend` 或 `/game emoji send <內容>`
- `voteMenu { user, cat }`：按鈕 `voteMenu:emoji`／`voteMenu:guess`；`vote { user, seq, cat, tag }`：按鈕 `vote:<seq>:<cat>:<鏈-步>`
- 共通：`new`、`join`、`leave`、`start`、`cancel`、`addBot`／`removeBot`（拒絕）、`rematch`、`timeout`

## Risks / Trade-offs

- [不存在的 shortcode 會原樣顯示成文字，可能被拿來偷打字（例如 `:zhen_zhu_nai_cha:`）] → 規則說明寫明只能用 emoji；不驗證 workspace emoji 是本次 Non-Goal，靠玩家自律和投票制裁
- [Slack 送來的 Unicode emoji 可能被轉成 shortcode，或反過來] → 兩種都接受，原樣存、原樣貼
- [10 人局 10 步 × 最多 90 秒，加投票約 15～18 分鐘] → 全員交完提前進下一步；整步沒人交就中止
- [投票按鈕最多 50 顆] → 私下選單 `perRow` 5，自己的作品不列，剛好在 Slack 限制內
- [視窗打不開] → `fallback` 提示改用 `/game emoji send <內容>`，按鈕的私下訊息已經先顯示拿到的內容
