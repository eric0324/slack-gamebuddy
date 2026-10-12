## Why

大家常在等 AI 回應的空檔想玩一下。現有遊戲大多要全員同時在線、輪流行動，一局十幾分鐘。心電感應（Wavelength）每題只要出題者給一個詞，隊友各自按一個數字，不用照順序輪流；空檔回來按一下就能參與，很適合團隊頻道。

## What Changes

- 新增「心電感應」（`/game wavelength`）：4～12 位真人（不支援 bot），隨機分成兩隊，照官方規則對抗
- 每位玩家輪流出一題：出題者私下看到光譜（例如「冷 ↔ 熱」）和目標位置，按「✍️ 寫提示」跳出 Slack 視窗輸入提示詞
- 出題者的隊友各自按 0～10 猜位置，取平均當全隊答案；對手隊投票猜目標在答案的左邊還是右邊
- 每個階段在「該投的人都投完」或「3 分鐘」時結束
- 依離目標的距離得 4／3／2／0 分，對手猜對左右得 1 分；每個人都出過題後，總分高的隊伍獲勝
- **新增 adapter 能力**：按鈕可以開 Slack 視窗（modal），送出後轉成遊戲 action；prompt 按鈕可以分成多列
- `/game` 遊戲清單、遊戲大廳、README manifest usage hint、wiki 規則頁加入心電感應

## Capabilities

### New Capabilities
- `wavelength/setup`：房間、人數、分隊、出題順序、光譜卡、遊戲清單與指令說明
- `wavelength/rounds`：出題（寫提示）、隊友猜位置、對手猜左右、計分、結束

### Modified Capabilities
（無）

## Impact

- 新增 `src/wavelength.ts`（engine）、`src/wavelengthCards.ts`（光譜卡）
- `src/engine.ts`：新增 `modal` 事件；prompt 新增可選的每列按鈕數
- `src/slack.ts`：註冊心電感應、開視窗、處理送出、按鈕分列
- `src/index.ts`：把按鈕的 `trigger_id` 傳給 host、新增視窗送出的 handler
- README、wiki
