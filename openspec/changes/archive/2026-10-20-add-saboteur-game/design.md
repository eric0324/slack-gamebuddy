## Context

動機見 proposal.md。規則細節見 `specs/saboteur/*`。

### 原版規則查證（Saboteur 第一代，AMIGO／Z-Man）

查了 Wikipedia、Board Game Arena 說明頁和 Order of Gamers 規則摘要：

- **人數** 3～10；身分表照 Wikipedia／BGA（3 人 1+3 …… 10 人 4+7），一律多準備 1 張不用。
- **手牌**：3～5 人 6 張、6～7 人 5 張、8～10 人 4 張。
- **牌組**：通道牌 44 張（含 1 起點、3 終點，所以可抽的是 40 張），行動牌 27 張。行動牌的組成（破壞 3×3、修理 2×3、雙用修理 1×3、藏寶圖 6、落石 3）各來源一致。
- **通道牌形狀分布**：查到的來源都沒列出每種形狀的張數。spec 的表（31 通道＋9 死路，死路每種形狀 1 張）是依社群整理的牌表；總張數 40 和死路 9 張確定，個別形狀張數如有出入，只影響牌庫組成常數，不影響規則或架構。
- **金塊**：28 張（1 金 16、2 金 8、3 金 4）。金礦工贏時抽玩家人數張、從挖到的人開始輪流挑；破壞者贏時 1 人 4 金、2～3 人各 3 金、4 人各 2 金（Order of Gamers）。
- **終點**：起點和中間終點相隔 7 張牌，三張終點上下各隔一格。

### 程式架構

- 房間邏輯、`runGame`（`afterChange` 讓 bot 行動）、`shuffle`、`reply`、`startTimer`、`lobbyEvent` 都在 `src/common.ts`，照印加寶藏和富饒之城的用法。
- 富饒之城示範了：頻道回合面板用 `ref` 原地更新、「我的回合」按鈕開 `audience: 'ephemeral'` 的私人選單並用 `replace: true` 原地換內容、按鈕 value 帶 `seq` 擋過期選單、`takeNotice` 之類的私下通知。矮人礦坑整套照抄。
- `src/slack.ts` 的 prompt 只有按鈕（沒有 select），`perRow` 控制每列幾顆；Slack 一則訊息最多 50 個 block、每個 actions block 最多 25 顆按鈕。
- 不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`。

## Goals / Non-Goals

**Goals:**
- 不用打字、不用自己輸入座標，所有操作都靠按鈕
- 地圖純文字、在 Slack 等寬字型下對齊
- 1 位真人 + bot 可以玩完整局；有人掛機也一定會推進

**Non-Goals:**
- 不做擴充（新角色、新行動牌、偷金塊等）
- 不做無邊界地圖（限制 13×9）
- 不做遊戲中的打字指令、不做自訂秒數或回合數
- 不做產生圖片

## Decisions

1. **檔案拆分**：`src/saboteur.ts`（engine，state／action／事件）＋ `src/saboteurCards.ts`（通道牌形狀、牌庫常數、繪圖字元表、連通／合法位置的純函式）。地圖邏輯是這款遊戲最大的部分，獨立出來比較好測；和 `citadelsCards.ts` 的拆法相同。

2. **開口用 bitmask**：上 1、右 2、下 4、左 8。轉 180° = `((e << 2) | (e >> 2)) & 15`。通道牌 `{ edges: number; dead: boolean }`。相鄰檢查用「我這邊的 bit」和「對面那格的反向 bit」比較。比起用字串或陣列，bitmask 讓旋轉、對邊、字元查表都是一行。

3. **地圖資料**：`grid: (Cell | null)[][]`，9 列 × 13 欄，`Cell = { kind: 'start' } | { kind: 'goal'; gold: boolean; edges: number; open: boolean } | { kind: 'path'; edges: number; dead: boolean }`。座標字串 `A1`～`M9` 只在顯示和按鈕 value 用。

4. **連通判斷**：從起點 BFS，只穿過「通道牌、起點、翻開的終點」，沿雙方都有開口的邊走。得到 `reached` 集合。
   - 合法位置：空格、四周已放的牌（略過蓋著的終點）邊都一致、至少一個開口朝向 `reached` 中某格、而那格朝這邊也有開口。
   - 翻開終點：放牌後重算 BFS，`reached` 中任一格有開口朝向蓋著的終點 → 翻開。石頭依連過來的方向選 0° 或 180°。
   - 每次需要時重算（最多 117 格），不做增量快取。

5. **地圖繪製**（每格 2 字元）：
   ```
     A B C D E F G H I J K L M
   1 . . . . . . . . . . . . .
   2 . . . . . . . . . . . . .
   3 . . . . . . . . . ┏━? . .
   4 . . . . . . . . . ┃ . . .
   5 . . S━━━━━┳━━━━━━━┻━? . .
   6 . . . . . ┃ . . . . . . .
   7 . . . . . │ . . . . ? . .
   8 . . . . . . . . . . . . .
   9 . . . . . . . . . . . . .
   ```
   字元表用 16 格陣列以 edges 查表（粗、細各一張）。起點和終點右邊有開口時第二字元也畫 `━`。全部用 ASCII 和 box-drawing（Slack 等寬字型裡是單寬）；**不放 emoji** 在 code block 裡，避免對齊跑掉。

6. **出牌流程與按鈕 value**（kind `saboteur`，都帶 `seq` 擋過期）：
   | 步驟 | value | 說明 |
   |---|---|---|
   | 頻道面板 | `turnMenu:<seq>`、`hand` | 開私人選單／看手牌 |
   | 手牌選單 | `card:<seq>:<i>`、`discardMenu:<seq>` | 選第 i 張手牌 |
   | 通道位置 | `place:<seq>:<i>:<cell>:<rot>` | rot 是 0 或 1 |
   | 破壞／修理 | `tool:<seq>:<i>:<target>:<tool>` | tool 是 `pick`／`lamp`／`cart` |
   | 藏寶圖 | `map:<seq>:<i>:<cell>` | |
   | 落石 | `rock:<seq>:<i>:<cell>` | |
   | 蓋牌 | `discard:<seq>:<i>` | |
   | 挑金塊 | `gold:<pickSeq>:<value>` | 頻道訊息 |

   選了手牌後私人選單原地換成目標清單（`replace: true`），清單最上面附「↩️ 換一張」回到手牌選單。位置按鈕 `perRow: 5`；13×9 的地圖合法位置實際上很少超過 30 個，不會碰到 Slack 上限。
   - `seq`：每次輪到新玩家 +1；頻道面板 `ref: saboteur:turn:<seq>`。

7. **逾時**：`TURN_MS = 60_000`，逾時蓋掉手牌第一張（不用 bot 策略代打，因為 bot 策略依身分行動，代打會讓金礦工的牌被當破壞者用，或反過來，不好預期）。挑金塊 `PICK_MS = 30_000`，逾時拿最大面額。

8. **金塊是公開挑的**：原版金塊牌蓋著保留，這裡挑的過程和累計在頻道公開，簡化介面（挑金塊訊息本來就列出剩下面額）。破壞者的固定金塊直接加數字，不從金塊牌扣（原版從剩下的牌湊）；10 人局連續三回合金礦工贏時金塊牌可能不夠，不夠就全抽。

9. **bot 決策**（細節見 `saboteur/bots`）：純規則、不需要 rng，方便測試。「距離」用曼哈頓距離，不算真正的路徑（不考慮死路擋路），夠簡單也夠像在挖。bot 用藏寶圖看到的結果記在自己的 player state（`peeked: Record<cell, boolean>`），和真人共用同一欄位。

10. **State（草稿，`src/saboteur.ts`）**：
    ```ts
    type Tool = 'pick' | 'lamp' | 'cart';
    type Card =
      | { kind: 'path'; edges: number; dead: boolean }
      | { kind: 'break'; tool: Tool }
      | { kind: 'fix'; tools: Tool[] }   // 1 或 2 項
      | { kind: 'map' }
      | { kind: 'rock' };
    interface SPlayer {
      id: string;
      role?: 'digger' | 'saboteur';
      hand: Card[];
      broken: Tool[];
      peeked: Record<string, boolean>;   // 終點格 → 是不是金礦
      gold: number;
    }
    interface SState {
      game: 'saboteur'; channel: string; host: string;
      phase: 'lobby' | 'play' | 'pickGold' | 'ended';
      players: SPlayer[];
      round: number;          // 1～3
      turn: number;           // players 的 index
      seq: number;
      deck: Card[];
      grid: (Cell | null)[][];
      goldDeck: number[];
      pick?: { cards: number[]; order: string[]; at: number; seq: number };
      last?: string;          // 上一步的公告文字（面板用）
      winners?: string[]; timerSeq: number; timers: { phase?: number };
    }
    ```

11. **Action**：`new`、`join`、`leave`、`start`、`cancel`、`addBot`、`removeBot`、`rematch`、`turnMenu`、`hand`、`card`、`discardMenu`、`place`、`tool`、`map`、`rock`、`discard`、`pickGold`、`timeout`。

## Risks / Trade-offs

- [box-drawing 在某些 Slack 字型下寬度不對] → 只用 ASCII 和 box-drawing、不放 emoji；上線後在 Slack 實際看一次，必要時換字元表（只改常數）
- [粗細線在手機上不容易分辨] → 死路另外在「我的手牌」和放牌公告裡寫出「死路」兩個字；地圖上的區分是輔助
- [13×9 邊界和原版不同] → 起點左邊留 2 欄、終點右邊留 2 欄、上下各留 2 列，正常玩很少碰到；寫在規則 wiki
- [通道牌形狀張數可能和實體牌不完全一樣] → 集中在 `saboteurCards.ts` 的常數，日後查到正確數字只改一處
- [一回合訊息很多（每輪到一人一則面板）] → 面板原地更新、上一步合併在面板裡，不另發公告；只有翻終點和回合結束另外公告
- [bot 用曼哈頓距離會被死路卡住，一直想往同一個方向挖] → 只在距離變小時放牌，否則改用藏寶圖或蓋牌，不會無限卡住；手牌和牌庫有限，回合一定會結束
