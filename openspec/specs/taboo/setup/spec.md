# taboo/setup Specification

## Purpose
TBD - created by archiving change add-taboo-game. Update Purpose after archive.

## Requirements

### Requirement: 禁語的房間
禁語的房間 SHALL 和其他遊戲有相同的操作方式：`/game taboo new` 開房 (開房者為房主並自動加入)、房間公告上有「加入」「離開」「開始遊戲」按鈕、`/game taboo start` 開始、`/game taboo cancel` 取消、房主開始前離開就取消房間。人數 SHALL 在 4～12 位真人之間；禁語 SHALL NOT 支援 bot，房主輸入 `addbot` 時 SHALL 只讓房主看到「禁語不支援 bot」。房間公告 SHALL 標示這是禁語。一個頻道同時只能有一局遊戲 (不分遊戲種類)。

#### Scenario: 人數不足
- **WHEN** 房間只有 3 人，房主按下開始
- **THEN** 系統拒絕並只讓房主看到「至少需要 4 人」

#### Scenario: 房間已滿
- **WHEN** 房間已有 12 人，又有人按加入
- **THEN** 系統拒絕並只讓這個人看到「房間已滿」

#### Scenario: 不支援 bot
- **WHEN** 房主輸入 `/game taboo addbot`
- **THEN** 系統拒絕並只讓房主看到「禁語不支援 bot」

#### Scenario: 頻道已經有遊戲
- **WHEN** 頻道裡有一局進行中的心電感應，有人輸入 `/game taboo new`
- **THEN** 系統拒絕並只讓他看到「這個頻道已經有遊戲了」

#### Scenario: 取消
- **WHEN** 遊戲進行中房主輸入 `/game taboo cancel`
- **THEN** 遊戲結束，頻道公告已取消和目前比分，沒有「再來一局」，也不記錄戰績

### Requirement: 分隊與描述順序
遊戲開始時，系統 SHALL 把玩家隨機分成🔴紅隊和🔵藍隊 (人數相差最多 1 人)，並隨機決定先描述的隊伍。兩隊 SHALL 輪流描述，每隊的輪數 SHALL 等於人數較多那隊的人數；各隊內依隨機順序輪流當描述者，人數較少的隊伍輪完一圈後從頭再輪。頻道 SHALL 公告兩隊成員、總輪數、每輪時間和玩法 (描述者在頻道打字描述、隊友在頻道打字猜、說到禁語算犯規)。

#### Scenario: 4 人分隊
- **WHEN** 4 人開始遊戲
- **THEN** 兩隊各 2 人，每隊 2 輪，總共 4 輪，每個人描述一次

#### Scenario: 5 人分隊
- **WHEN** 5 人開始遊戲，紅隊 A、B、C，藍隊 D、E
- **THEN** 每隊 3 輪，總共 6 輪；紅隊 A、B、C 各描述一次，藍隊 D、E 輪流，其中一人描述兩次

#### Scenario: 兩隊輪流
- **WHEN** 紅隊先描述
- **THEN** 描述順序是紅、藍、紅、藍……

### Requirement: 題目卡詞庫
題目卡 SHALL 放在獨立的檔案，至少 500 張。每張卡 SHALL 有 1 個題目詞和剛好 5 個禁語，都是台灣日常熟悉的詞。為了減少自動比對的誤判：題目詞和禁語 SHALL 都是 2 個字以上、去掉前後空白後不變、不空白；同一張卡的 5 個禁語 SHALL 不重複，也 SHALL NOT 等於題目詞；所有卡的題目詞 SHALL 不重複。同一個頻道抽到的卡 SHALL NOT 重複，跨局也一樣：新的一局 (`new` 或再來一局) SHALL 接著上一局剩下的牌堆抽，整副抽完才重新洗牌。牌堆只記在記憶體，bot 重啟後重新洗牌。

#### Scenario: 詞庫格式
- **WHEN** 檢查詞庫
- **THEN** 至少 500 張，每張 1 個題目詞和 5 個不重複的禁語，每個詞至少 2 個字，題目詞不重複

#### Scenario: 同一局不重複
- **WHEN** 一局抽了 40 張卡
- **THEN** 40 張的題目詞都不一樣

#### Scenario: 連續幾局也不重複
- **WHEN** 同一個頻道上一局抽過一些卡，接著開新的一局
- **THEN** 新的一局不會抽到上一局抽過的卡，直到整副抽完才重新洗牌

### Requirement: 遊戲清單與指令說明
`/game` 的遊戲清單和遊戲大廳 SHALL 列出禁語的名稱 (🤐 禁語)、代號 `taboo`、人數 (4～12 人)、「不支援 bot」和開房方式，大廳分類是 ⚔️ 團隊對抗。輸入 `/game taboo help` 或不認識的子指令時，系統 SHALL 只讓這位使用者看到禁語的條列式指令說明。

#### Scenario: 查看指令
- **WHEN** 使用者輸入 `/game taboo help`
- **THEN** 只有這位使用者看到禁語所有指令的條列說明

#### Scenario: 大廳團隊對抗分類
- **WHEN** 使用者在大廳看 ⚔️ 團隊對抗
- **THEN** 列表有 🤐 禁語 (`taboo`) 4～12 人和「開房」按鈕，其他分類沒有禁語
