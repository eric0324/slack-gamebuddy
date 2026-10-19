# incan/setup Specification

## Purpose
TBD - created by archiving change add-incan-game. Update Purpose after archive.

## Requirements

### Requirement: 印加寶藏的房間
印加寶藏的房間 SHALL 和其他遊戲有相同的操作方式：`/game incan new` 開房（開房者為房主並自動加入）、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game incan start` 開始、`/game incan cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 3～8 人之間（bot 也算）。房間公告 SHALL 標示這是印加寶藏。一個頻道同時只能有一局遊戲（不分遊戲種類）。

#### Scenario: 人數不足
- **WHEN** 房間只有 2 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 3 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 8 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 房主開始前離開
- **WHEN** 房主在開始前按「離開」
- **THEN** 房間被取消，頻道公告遊戲已取消

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道正在玩炸彈貓，有人輸入 `/game incan new`
- **THEN** 系統拒絕，只讓這位使用者看到「這個頻道已經有遊戲了」

### Requirement: 加入與移除 bot
房主 SHALL 可以在開始前用 `/game incan addbot [數量]` 加入 bot、`/game incan removebot [數量]` 移除 bot（沒寫數量就是 1，從最後加入的移除）。bot 的名字和顯示方式 SHALL 和其他遊戲相同（「🤖<名字>」、同房間不重複）。加 bot 超過 8 人時 SHALL 只加到 8 人並只讓房主看到「房間已滿」。非房主或遊戲開始後使用 SHALL 被拒絕。

#### Scenario: 一個人加 bot
- **WHEN** 房間有 1 位真人，房主輸入 `/game incan addbot 2`
- **THEN** 名單變成 3 人，其中 2 位是「🤖<名字>」，房主可以開始遊戲

#### Scenario: 加 bot 超過上限
- **WHEN** 房間已有 7 人，房主輸入 `/game incan addbot 3`
- **THEN** 只加入 1 個 bot，只讓房主看到「房間已滿」

#### Scenario: 非房主加 bot
- **WHEN** 不是房主的玩家輸入 `/game incan addbot`
- **THEN** 系統拒絕，只讓他看到「只有房主可以加入 bot」

### Requirement: 牌庫與神器
遊戲開始時，探險牌庫 SHALL 有 30 張：寶藏卡 15 張（寶石數 1、2、3、4、5、5、7、7、9、11、11、13、14、15、17）和危險卡 5 種各 3 張（🕷️ 蜘蛛、🐍 毒蛇、🔥 火焰、🪨 落石、🧟 木乃伊）。🏺 神器共 5 張，開局 SHALL NOT 在牌庫裡；每座神殿開始時 SHALL 加入 1 張神器再洗牌。被移出這局的牌（造成失敗的危險、路上沒被拿走的神器、已被帶回營地的神器）SHALL NOT 回到牌庫；沒翻到的神器 SHALL 留在牌庫。

#### Scenario: 第一座神殿的牌庫
- **WHEN** 遊戲開始，第一座神殿洗牌
- **THEN** 牌庫有 31 張：15 張寶藏、15 張危險、1 張神器

#### Scenario: 沒翻到的神器留下來
- **WHEN** 第一座神殿結束時神器還沒被翻到，而且沒有危險被移除
- **THEN** 第二座神殿的牌庫有 32 張，其中 2 張神器

#### Scenario: 移除的牌不回來
- **WHEN** 第一座神殿因為第二張🐍 毒蛇失敗，路上有 1 張沒被拿走的神器
- **THEN** 第二座神殿的牌庫有 15 張寶藏、14 張危險（毒蛇 2 張）、1 張神器（新加的），共 30 張

### Requirement: 開局公告
遊戲開始時，頻道 SHALL 公告玩家、5 座神殿和規則摘要（每一步翻一張牌，大家同時選繼續探險或回營地；寶藏平分、餘數留在路上；回營的人平分路上剩下的寶石，恰好一人回營才拿到神器；同種危險出現第二張，洞裡的人失去這座神殿的寶石；5 座後帳篷寶石加神器分數最高的人贏），每位玩家從 0 分開始，接著 SHALL 開始第一座神殿。

#### Scenario: 開始遊戲
- **WHEN** 4 人開始遊戲
- **THEN** 頻道公告玩家、5 座神殿和規則摘要，然後開始第 1/5 座神殿並翻出第一張牌

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出印加寶藏的名稱（💎 印加寶藏）、代號 `incan`、人數（3～8 人）和開房方式，大廳分類是 🎲 心理戰。輸入 `/game incan help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到印加寶藏的條列式指令說明（new、addbot、removebot、start、cancel，以及遊戲中用步驟訊息上的「🔦 繼續探險」「⛺ 回營地」按鈕選擇）。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game incan help`
- **THEN** 只有這位使用者看到印加寶藏所有指令的條列說明

#### Scenario: 不認識的子指令
- **WHEN** 使用者輸入 `/game incan dig`
- **THEN** 只有這位使用者看到印加寶藏的指令說明

#### Scenario: 大廳心理戰分類
- **WHEN** 使用者在大廳看 🎲 心理戰
- **THEN** 列表有 💎 印加寶藏（`incan`）3～8 人和「開房」按鈕
