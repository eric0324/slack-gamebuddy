## Context

動機見 proposal.md。規則細節見 `specs/machikoro/*`。

### 原版規則查證（Machi Koro 基本版＋港口擴充，Masao Suganuma／Grounding、英文版 IDW Games）

查了 Wikipedia、GeekDad 和 Dad's Gaming Addiction 的港口擴充介紹、一份含擴充的社群郵寄規則整理（variablepig），以及 Zatu、3rd-strike 的評論。Machi Koro 粉絲 wiki（fandom）的卡表頁面擋爬蟲（HTTP 402），沒能直接讀到，只從搜尋摘要交叉比對。

- **人數**：基本版 2～4 人，港口擴充加入第 5 位玩家的起始牌、地標和多一套紫色建築，變成 2～5 人。
- **起始**：每人 3 元、麥田、麵包店；港口版另外每人一張市政廳（開局就蓋好，不算在勝利條件裡）。
- **一般建築**（費用／骰點／效果）：
  - 基本版 15 種：麥田 1／1／銀行 1、牧場 1／2／銀行 1、麵包店（綠）1／2～3／銀行 1、咖啡館（紅）2／3／向擲骰者收 1、便利商店（綠）2／4／銀行 3、森林 3／5／銀行 1、體育館（紫）6／6／每人收 2、電視台（紫）7／6／指定一人收 5、商業中心（紫）8／6／和一人交換一張非紫色建築、起司工廠（綠）5／7／每張牛類 3、家具工廠（綠）3／8／每張齒輪類 3、礦場 6／9／銀行 5、家庭餐廳（紅）3／9～10／向擲骰者收 2、蘋果園 3／10／銀行 3、蔬果市場（綠）2／11～12／每張麥穗類 2。
  - 港口版 10 種：壽司店（紅）4／1／有港口才向擲骰者收 3、花田（藍）2／4／銀行 1、花店（綠）1／6／每張花田 1、披薩店（紅）1／7／收 1、漢堡店（紅）1／8／收 1、鯖魚船（藍）2／8／有港口才拿 3、鮪魚船（藍）5／12～14／有港口才拿「擲骰者另外擲 2 顆的點數」、食品倉庫（綠）2／12～13／每張杯子類 2、出版社（紫）5／7／每人依他的杯子和麵包類張數收、稅務局（紫）4／8～9／向 10 元以上的人收一半（捨去）。
- **張數**：基本版 84 張一般建築＝12 種非紫色各 6 張＋3 種紫色各 4 張。港口擴充 82 張卡裡有 48 張新建築（8 種非紫色各 6 張）、10 張新紫色（出版社、稅務局各 5 張）、3 張基本版紫色（第 5 位玩家用，所以基本紫色也各變 5 張），其餘是起始牌和地標。每種紫色建築每人最多 1 張。
- **地標**：基本版 4 個——火車站 4（可擲 2 顆）、購物中心 10（杯子和麵包類每張 +1）、遊樂園 16（擲出相同點數再一回合）、廣播塔 22（每回合重擲一次）。港口版加港口 2（擲出 10 以上可 +2）、機場 30（這回合沒蓋任何東西拿 10 元），以及開局就有的市政廳（買東西前 0 元拿 1 元）。
- **結算順序**：紅色（從擲骰者逆時針、也就是座位往回結算，擲骰者付不出來就付到 0 為止）→ 藍色和綠色 → 紫色。
- **港口版市場**：所有一般建築洗在一起，翻牌直到市場有 10 種不同的建築，重複的疊在同一堆；某一種被買完就翻牌補到 10 種。一般建築和紫色建築一起洗進去。
- **勝利條件**：基本版先蓋好 4 個地標的人立刻獲勝；港口版要蓋好 6 個（港口、火車站、購物中心、遊樂園、廣播塔、機場）。

來源：
- https://en.wikipedia.org/wiki/Machi_Koro
- https://geekdad.com/2015/04/machi-koro-harbor/
- https://www.dadsgamingaddiction.com/machi-koro-harbor-expansion/
- http://variablepig.org/rules/machikoroexp.html
- https://3rd-strike.com/machi-koro-harbor-millionaires-row-card-game-expansions-review/
- https://zatu.com/machi-koro-and-harbour-expansion/
- https://yattatachi.com/zekes-board-game-machi-koro-habor

查不到第一手來源、依記憶和社群資料判斷的地方（只影響常數，不影響架構）：
- 花田的類別是「麥穗」（所以蔬果市場會算到）、花店是「麵包」類（所以購物中心和出版社會算到）。
- 鮪魚船「一次結算只擲一次，所有鮪魚船共用」。
- 紫色建築同一次擲 6 有多張時的結算順序，原版沒有明文，這裡固定體育館 → 電視台 → 商業中心。

### 程式架構

- 房間邏輯、`runGame`（`afterChange` 讓 bot 行動）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`，照富饒之城和矮人礦坑的用法。
- 富饒之城示範了：頻道回合面板用 `ref` 原地更新、「行動」按鈕開 `audience: 'ephemeral'` 的私人選單並用 `replace: true` 原地換內容、按鈕 value 帶 `seq` 擋過期選單。骰子街整套照抄。
- `src/slack.ts` 的 prompt 只有按鈕（沒有 select），`perRow` 控制每列幾顆；Slack 一則訊息最多 50 個 block、每個 actions block 最多 25 顆按鈕。
- engine 拿到的 `rng` 用來洗牌堆、選起始玩家和擲骰；測試用固定序列的 rng 就能控制點數。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 只用按鈕就能玩完；每一步的按鈕數量不超過 Slack 限制
- 規則和數值照基本版＋港口擴充；結算明細清楚寫在面板上，看得懂錢是怎麼來的
- 1 位真人 + bot 可以玩完整局；有人掛機也一定會推進，而且整局有明確的上限

**Non-Goals:**
- 不做豪宅區（Millionaire's Row）、Sharp／Green Valley 等其他擴充，不做新版（5 週年版）的改動
- 不做「全部建築都開放」的基本版市場（見 Decisions 1）
- 不做遊戲中的打字指令、不做自訂秒數或輪數
- 不做骰子圖片或動畫

## Decisions

1. **採用港口版的 10 種市場**（需要使用者確認）：
   - 原版港口規則就是 10 種市場，每局能買的建築不同，重玩性高。
   - 介面上也比較好：全開時一般建築 25 種＋地標 6 個，買建築選單最多 31 顆按鈕，選單文字還要列每張的效果，會很長；10 種市場最多 10＋6＋1＝17 顆。
   - 替代方案：全開（基本版做法）。如果使用者偏好全開，只要把「翻到 10 種」改成「全部翻開」，其他規則不變。

2. **紫色建築的張數＝玩家人數**：原版基本版每種 4 張、港口版 5 張，但每人每種最多 1 張。在 10 種市場裡，2 人局如果有 4 張電視台，兩人都買過之後剩下 2 張會永遠佔住一格市場。改成「玩家人數」張，人人買一張剛好買完、讓出位置。和原版的差別只在少人數時紫色比較少出現。

3. **檔案拆分**：`src/machikoro.ts`（engine：state／action／回合流程／面板／bot）＋ `src/machikoroCards.ts`（建築與地標資料表、`income(state, roller, total)` 之類結算的純函式、市場翻牌與補充）。結算是這款遊戲最大、最好單獨測的部分；和 `citadelsCards.ts`、`saboteurCards.ts` 的拆法相同。

4. **建築資料表**：
   ```ts
   type Color = 'blue' | 'green' | 'red' | 'purple';
   type Tag = 'wheat' | 'cow' | 'gear' | 'boat' | 'bread' | 'factory' | 'fruit' | 'cup' | 'major';
   interface Card { name: string; color: Color; cost: number; rolls: number[]; tag: Tag; count: number | 'players'; text: string }
   const CARDS: Record<string, Card> = { wheat: { name: '麥田', color: 'blue', cost: 1, rolls: [1], tag: 'wheat', count: 6, text: '任何人擲 1：收 1 元' }, ... };
   const LANDMARKS = ['harbor', 'station', 'mall', 'park', 'radio', 'airport'] as const;  // 依費用排序
   ```
   一般建築的效果用 `switch (code)` 寫在結算函式裡，不做通用的效果 DSL（25 種，直接寫最好讀）。

5. **結算的資料流**：結算函式回傳「明細行」陣列（例如 `{ from?: id, to: id, amount, card }`），engine 照順序套用並把文字放進面板。紅色要一筆一筆套用（擲骰者的錢會變少），所以紅色逐筆計算、即時扣款；藍綠一次算完；紫色裡體育館、出版社、稅務局自動算，電視台和商業中心停下來等選擇（`turn.step = 'tv' | 'bizGive' | 'bizPlayer' | 'bizTake'`）。
   - bot 和逾時要用的「這次點數對自己的收入」用同一個函式，在 state 的複本上試算，不會改到真正的 state。

6. **回合步驟**：`turn.step` 是 `'roll' | 'reroll' | 'harbor' | 'tv' | 'bizGive' | 'bizPlayer' | 'bizTake' | 'buy'`。每一步只接受對應的 action；其他 action 一律當成過期選單拒絕。步驟之間沒有選擇可做時（例如沒有廣播塔）自動往下走，不需要玩家按。

7. **按鈕 value**（kind `machikoro`，都帶 `seq` 擋過期）：
   | 步驟 | value | 說明 |
   |---|---|---|
   | 頻道面板 | `turnMenu:<seq>`、`town` | 開私人選單／城鎮一覽 |
   | 擲骰 | `roll:<seq>:<1\|2>` | |
   | 廣播塔 | `keep:<seq>`、`reroll:<seq>:<1\|2>` | |
   | 港口 | `harbor:<seq>:<yes\|no>` | |
   | 電視台 | `tv:<seq>:<target>` | target 放最後（bot id 含冒號） |
   | 商業中心 | `bizGive:<seq>:<card>`、`bizPlayer:<seq>:<give>:<target>`、`bizTake:<seq>:<give>:<take>:<target>`、`bizSkip:<seq>` | 三步，每步有「不換」 |
   | 買建築 | `buy:<seq>:<code>`、`pass:<seq>` | code 是建築或地標代號 |
   - `seq`：每次開始新的回合（包括遊樂園的額外回合）+1；頻道面板 `ref: machikoro:turn:<seq>`。
   - 私人選單 `perRow: 4`。最多的一步是買建築（17 顆）或商業中心選建築（最多 20 種非紫色＋「不換」），都在單一 actions block 25 顆以內，不會碰到 50 block 上限。

8. **逾時**：`TURN_MS = 60_000`，整個回合一個計時器（富饒之城的做法），進入下一步不重設。逾時從目前的步驟用「逾時策略」一路做完：擲骰和港口用 bot 的規則（不會比真人自己亂按差）、不重擲（省時間、不需要判斷）、電視台拿錢最多的人（對自己只有好處）、商業中心不換（交換牽涉策略，不替人決定）、不買建築（買什麼牽涉策略；有機場時照規則拿 10 元）。和矮人礦坑不同，骰子街沒有隱藏身分，借用 bot 規則不會洩漏或扭曲資訊。

9. **輪數上限 30 輪**（需要使用者確認）：原版沒有上限。港口版 6 個地標共 84 元，一般 4 人局約 15～25 輪；bot 規則簡單、會先買 10 張建築再存錢，30 輪留足餘裕。到上限時比地標數、再比現金；這是唯一能用公開資訊直接比的指標。`round` 在輪回第一位玩家時 +1，額外回合不算。

10. **bot 決策**（細節見 `machikoro/bots`）：純規則、不需要 rng，方便測試。「買用得到、費用最高的建築，買滿 10 張就專心存錢蓋地標」是最簡單又保證會往勝利條件前進的規則；先蓋買得起的最便宜地標讓港口（2 元）、火車站（4 元）很早就出現，之後才有大骰點建築可買。

11. **State（草稿，`src/machikoro.ts`）**：
    ```ts
    interface MPlayer { id: string; coins: number; cards: Record<string, number>; landmarks: string[] }
    interface MState {
      game: 'machikoro'; channel: string; host: string;
      phase: 'lobby' | 'play' | 'ended';
      players: MPlayer[];
      deck: string[];                          // 市場還沒翻的牌，deck[0] 是最上面
      market: Record<string, number>;          // 代號 → 剩幾張，最多 10 種
      first: number; current: number; round: number;
      seq: number;
      turn?: { step: Step; dice: number[]; rerolled: boolean; total: number; harbor: boolean;
               log: string[]; give?: string; bought: boolean };
      winners?: string[]; reason?: 'landmarks' | 'limit';
      timerSeq: number; timers: { phase?: number };
    }
    ```

12. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`turnMenu`、`town`、`roll`、`keep`、`reroll`、`harbor`、`tv`、`bizGive`、`bizPlayer`、`bizTake`、`bizSkip`、`buy`、`pass`、`timeout`。

13. **文字風格**：頻道和選單只用文字表示建築、顏色和金額，例如「咖啡館（紅｜2 元｜骰 3）」「@A 7 元｜地標：港口、火車站｜建築 6 張」。emoji 只用在遊戲圖示 🏘️、按鈕（🏘️ 行動、📋 城鎮一覽）和「👉 輪到」，不用 emoji 代表建築、骰子或錢。

## Risks / Trade-offs

- [10 種市場和使用者預期（全開）不同] → 回報時請使用者確認；改成全開只是市場翻牌的常數，選單會變長但仍在 25 顆內（25 種＋6 地標要分兩個 block，`perRow` 照樣處理）
- [30 輪上限不是原版規則] → 只為了保證結束，正常對局碰不到；需要使用者確認
- [花田類別、花店類別、鮪魚船共用一次擲骰沒有第一手來源] → 集中在 `machikoroCards.ts` 的資料表和結算函式，查到正確資料只改一處
- [紫色張數改成玩家人數] → 少人數時紫色比原版少見；寫在 wiki 規則頁
- [1 真人＋bot 時，真人一直逾時會拖很久（每回合 60 秒）] → 30 輪上限保證結束；bot 立刻行動，只有真人的回合要等
- [一局訊息多（每回合一則面板）] → 面板原地更新、結算明細合併在面板裡，不另外發公告；只有遊樂園再一回合、到達上限、遊戲結束另外公告
- [bot 太弱讓遊戲拖長] → bot 會優先蓋買得起的地標、買滿 10 張就存錢；測試用 1 真人＋3 bot 模擬整局，確認在上限內結束
