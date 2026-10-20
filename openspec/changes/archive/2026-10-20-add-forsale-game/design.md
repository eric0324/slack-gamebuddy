## Context

動機見 proposal.md。規則細節見 `specs/forsale/*`。

### 原版規則查證（For Sale，Stefan Dorra；Eagle-Gryphon 2017 英文規則書）

查了 Eagle-Gryphon 2017 版英文規則書（PDF 全文）和 Zatu 的玩法整理，確認如下：

- **人數** 3～6，約 20～30 分鐘。
- **配件**：房產卡 30 張（1～30）；支票（Currency Cards）30 張，面額 $0～$15,000、跳過 $1,000、每種兩張（$0 ×2、$2,000～$15,000 各 ×2）；金幣 $1,000 ×60、$2,000 ×12。
- **起始金幣**：3～4 人每人 $2,000 ×2＋$1,000 ×14 = **$18,000**；5～6 人每人 $2,000 ×2＋$1,000 ×10 = **$14,000**。
- **移除張數**：3 人局不看牌移除 **6 張房產和 6 張支票**；4 人局移除 **2 張房產和 2 張支票**；5～6 人全用。所以每階段的輪數是 3 人 8 輪、4 人 7 輪、5 人 6 輪、6 人 5 輪。
- **第一階段（買房產）**：每輪翻開和人數相同張數的房產。「住最大房子的人」先出價，順時針輪流，每個人出價（要比前一個出價高）或放棄，一直輪到大家都放棄為止。**放棄的人拿走桌上最小的房產，拿回自己出價的一半（rounded down，無條件捨去）**，其餘付給銀行；只剩一人時，他拿走最大的房產並付全額。不出價直接放棄也可以，等於免費拿最小的。**拿到最大房產的人翻下一組並先出價**。房產賣完，剩下的金幣保留到最後計分。
- **第二階段（賣房產）**：每輪翻開和人數相同張數的支票，每個人把一張房產蓋著出在面前，全員出好同時翻開；最大的房產拿最大的支票、第二大拿第二大，依此類推；房產出完遊戲結束。
- **計分**：支票＋剩下的金幣，最多的人贏；**同分時剩下金幣多的人贏**。規則書沒有寫再同分怎麼辦。
- **拿回一半的捨入**：Zatu 的整理提到各版本曾經有「無條件進位」的寫法，但設計者 Stefan Dorra 偏好的規則是無條件捨去；2017 規則書也寫 rounded down，採無條件捨去。
- IELLO 版（2020 後）的金錢配件面額不同，但折算後的規則一樣；這裡照 Eagle-Gryphon 版的數字。

來源：
- Eagle-Gryphon 2017 規則書：https://nastol.io/storage/games/files/for_sale/933425/FOR_SALE_RULES2017_LOWRES.pdf
- Zatu「How to play For Sale」：https://zatu.com/blogs/how-to-play/how-to-play-for-sale
- IELLO 規則書（對照用）：https://iellogames.com/wp-content/uploads/2020/07/For-Sale_Rulebook_EN_V2.pdf

### 程式架構

- 房間邏輯、`runGame`（`afterChange` 讓 bot 行動）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`，照印加寶藏和矮人礦坑的用法。
- 印加寶藏和壽司派對示範了「同時選、同時揭曉」：每一步一則頻道 prompt 帶 `ref`，同一個 ref 更新「已選 N/M」，選擇私下確認、揭曉前可以改，按鈕 value 帶 `seq` 擋舊按鈕。
- 富饒之城和矮人礦坑示範了「頻道面板按鈕開私人選單」：`audience: 'ephemeral'` 的 prompt，私人選單上的按鈕用 `replace: true` 原地換內容。
- `src/slack.ts` 的 prompt 只有按鈕（沒有 select），`perRow` 控制每列幾顆；Slack 一則訊息最多 50 個 block、每個 actions block 最多 25 顆按鈕。這款遊戲最多的一則是「🔢 其他金額」：最多 18 種金額＋放棄 = 19 顆，`perRow: 6` 共 4 列，遠低於上限。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 不用打字，所有操作都靠按鈕；常見的加價一鍵完成
- 第二階段的選擇揭曉前不公開
- 1 位真人 + bot 可以玩完整局；有人掛機也一定會推進

**Non-Goals:**
- 不做 2 人變體、不做 IELLO 版或其他版本的規則差異
- 不做遊戲中的打字指令、不做自訂秒數
- 不追蹤「誰記得別人花了多少錢」：出價和拿回的金額照原版公開，剩下金幣只顯示給本人

## Decisions

1. **單一檔案**：`src/forsale.ts` 放全部 engine（state／action／事件／bot），規模和 `src/incan.ts` 差不多（預估 350～400 行），不需要像矮人礦坑那樣拆牌表檔。

2. **金額用千為單位的整數**：房產 1～30、支票 0、2～15、金幣、出價都存整數（1 = $1,000）。顯示時一律經過 `money(n)` → `$0`、`$4,000`、`$15,000`。拿回一半 = `Math.floor(bid / 2)`，天然就是「以 $1,000 為單位無條件捨去」。

3. **第一階段流程**：
   - 開輪：`table = propDeck.splice(0, n).sort()`；每人 `bid = 0`、`passed = false`；`turn = starter`；`seq++`；開始 30 秒計時。
   - 出價：檢查輪到、`seq`、`amount > high`、`amount ≤ money`；記 `bid`、`high = amount`、`highBy = user`；換到下一位沒放棄的人（`seq++`、重設計時器）。
   - 放棄：`props.push(table.shift())`、`money -= bid - floor(bid / 2)`、`passed = true`；只剩一人 → 他拿 `table.pop()`（此時 table 只剩一張）、`money -= bid`、`starter = 他`、結束這一輪；否則換下一位。
   - 錢在這一輪結算時才扣（出價期間不先扣），所以「錢不夠」檢查直接比 `amount ≤ money`。
   - 房產牌庫空了 → 第一階段結束，私下告知每位真人房產和金幣，進入第二階段。

4. **喊價按鈕**：頻道面板固定 6 顆，`perRow: 5`：
   - 「出 $X（+1）」「出 $X（+2）」「出 $X（+5）」：value 是絕對金額，不是加多少，避免兩人前後按到時語意跑掉；三顆一律顯示（隱藏出不起的金額會洩漏輪到的人剩多少錢），出不起時私下拒絕並告知上限。
   - 「🔢 其他金額」：私下選單，列出 `high + 1` 到自己 `money` 的每一種金額＋「🙅 放棄」，`perRow: 6`。
   - 「🙅 放棄」「💰 我的狀態」。
   - 考慮過「只有 +1 和放棄」：最簡單但想跳價得連按好幾輪；考慮過「全部金額都放頻道」：會洩漏錢、而且最多 18 顆太擠。現在的組合常見情況一鍵、特殊情況兩鍵。

5. **第二階段流程**：
   - 開輪：`checks = checkDeck.splice(0, n).sort(desc)`；`seq++`；每人 `choice = undefined`；bot 立刻選；手上都只剩一間時直接揭曉（不開計時器）；否則開始 45 秒計時。
   - 選擇：私下選單 value 帶 `seq`；記 `choice`；全員選好立刻揭曉。
   - 揭曉：依 `choice` 由大到小排序，第 i 名拿 `checks[i]`；從 `props` 移除出掉的房產；面板改成結果並拿掉按鈕（`options: []`）；支票牌庫空了 → 計分，否則下一輪。

6. **按鈕 value**（kind `forsale`，都帶 `seq` 擋過期）：
   | 位置 | value | 說明 |
   |---|---|---|
   | 喊價面板 | `bid:<seq>:<amount>` | 出價（+1／+2／+5） |
   | 喊價面板 | `bidMenu:<seq>` | 開「🔢 其他金額」私人選單 |
   | 喊價面板／其他金額選單 | `pass:<seq>` | 放棄 |
   | 其他金額選單 | `bid:<seq>:<amount>` | 出價 |
   | 賣房產面板 | `sellMenu:<seq>` | 開「🏠 選房產」私人選單 |
   | 選房產選單 | `sell:<seq>:<prop>` | 選這一間（`replace: true` 換成確認文字） |
   | 兩種面板 | `status` | 💰 我的狀態（不帶 seq，任何時候都能看） |
   - 頻道面板 `ref`：第一階段 `forsale:bid:<round>`、第二階段 `forsale:sell:<round>`，同一輪原地更新，下一輪發新的一則。
   - `seq`：第一階段每換一位出價者 +1，第二階段每輪 +1。

7. **逾時**：`BID_MS = 30_000`，真人逾時視為放棄（和原版「不想出就放棄」一致，而且放棄一定讓這一輪往前推進）。`SELL_MS = 45_000`，真人逾時自動出最小的房產（可預期、不需要策略；用 bot 策略代打會讓人覺得被亂出牌）。舊的計時器（`timerSeq` 不符）忽略。

8. **bot 決策**（細節見 `forsale/bots`）：純規則、不需要 rng。
   - 喊價上限 `min(money, floor((max(table) - min(table)) / 5))`：桌上落差越大越值得搶最大的；剩下的房產越接近，上限越低、越早放棄，自然不會把錢花光。
   - 賣房產：最大支票 ≥ 12 出最大的房產，否則出最小的（大支票時搶、小支票時丟爛房產）。

9. **公開與保密**：
   | 資訊 | 誰看得到 |
   |---|---|
   | 每次出價金額、放棄時拿走哪間和拿回多少、最後一人付多少 | 頻道（原版就是公開動作） |
   | 剩下的金幣 | 只有本人（「💰 我的狀態」；原版 tip「Keep your money secret!」） |
   | 手上的房產 | 只有本人；第二階段面板只顯示每人還有幾間 |
   | 第二階段的選擇 | 揭曉前只有本人 |
   | 每輪拿到的支票 | 揭曉時頻道公開；累計總額只在「💰 我的狀態」和結束時公開 |

10. **State（草稿，`src/forsale.ts`）**：
    ```ts
    interface FPlayer {
      id: string;
      money: number;          // 剩下的金幣（千）
      props: number[];        // 手上的房產
      checks: number[];       // 拿到的支票（千）
      bid: number;            // 這一輪出價（第一階段）
      passed: boolean;        // 這一輪已放棄（第一階段）
      choice?: number;        // 這一輪選的房產（第二階段）
      auto?: boolean;         // 這一步是逾時代打
    }
    interface FState {
      game: 'forsale'; channel: string; host: string;
      phase: 'lobby' | 'bid' | 'sell' | 'ended';
      players: FPlayer[];
      rounds: number;         // 每階段輪數（3 人 8 …… 6 人 5）
      round: number;          // 目前這一階段第幾輪
      seq: number;
      propDeck: number[]; checkDeck: number[];
      table: number[];        // 第一階段桌上的房產（由小到大）
      checks: number[];       // 第二階段這輪的支票（由大到小）
      high: number; highBy?: string;
      turn: number; starter: number;   // players 的 index
      log: string[];          // 這一輪的動作（面板「上一步」和結果用）
      winners?: string[]; timerSeq: number; timers: { phase?: number };
    }
    ```

11. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`bid { user, seq, amount }`、`bidMenu { user, seq }`、`pass { user, seq }`、`sellMenu { user, seq }`、`sell { user, seq, prop }`、`status { user }`、`timeout { id }`。

12. **和原版不同、需要使用者確認的地方**：
    - 起始玩家第 1 輪隨機（原版是「住最大房子的人」）。
    - 總分同分、剩下金幣也同分時並列獲勝（原版沒寫）。
    - 第二階段最後一輪每人只剩一間時自動揭曉（結果和原版相同，省一次等待）。
    - 逾時預設：喊價 30 秒視為放棄、賣房產 45 秒出最小的房產。
    - 剩下金幣只給本人看（原版是 tip，實體桌上別人瞄得到）；手上的房產也只給本人看（原版是蓋著放）。
    - 移除的房產和支票不公開（照原版「不看牌移除」）。

## Risks / Trade-offs

- [喊價期間頻道訊息很多] → 同一輪的出價、放棄都改同一則面板（`ref`），每輪只有一則；只有階段切換和結束另外公告
- [三顆加價按鈕永遠顯示，常常按了才知道出不起] → 私下拒絕訊息直接告訴他上限，並提示用「🔢 其他金額」；換來的是不洩漏剩下的金幣
- [30 秒對想算錢的人偏短] → 打開「🔢 其他金額」不重設計時器是為了防拖延；常數集中在 `BID_MS`，上線後可調
- [bot 喊價很保守（上限通常 ≤ 5），真人容易便宜買到大房產] → 規則簡單可測試是優先；之後要加強只改上限公式
- [第二階段私人選單在換輪後還留在畫面上] → 按鈕帶 `seq`，舊的一律回「按鈕已過期」
