## ADDED Requirements

### Requirement: 梗圖庫指令依頻道語系
`/game meme add`、`/game meme list`、`/game meme remove` 的回覆和公告 SHALL 用頻道目前的語系 (梗圖庫和進行中的遊戲無關)，包括用法說明、投稿清單、各種錯誤訊息、投稿和刪除的公告；沒填名稱時的預設名稱也依語系 (英文是「My meme」)。bot 沒有設定梗圖庫時的提示也依頻道語系。

#### Scenario: 英文頻道看投稿清單
- **WHEN** 英文頻道輸入 `/game meme list`，還沒有投稿
- **THEN** 只有輸入的人看到英文的「還沒有投稿」和英文的用法說明

#### Scenario: 英文頻道投稿
- **WHEN** 英文頻道輸入 `/game meme add https://i.imgur.com/a.png`，圖片網址有效
- **THEN** 頻道用英文公告投稿，名稱是「My meme」

### Requirement: 視窗打不開的提示依語系
遊戲的文字視窗上的「送出」「取消」按鈕 SHALL 用這局的語系。視窗打不開時，只讓那位玩家看到的提示 SHALL 用這局的語系；遊戲沒有該語系的提示時用繁體中文。

#### Scenario: 英文局視窗打不開
- **WHEN** 英文局的從眾心理要開作答視窗，但視窗打不開
- **THEN** 那位玩家看到英文的提示，告訴他改用 `/game herd answer <answer>`

#### Scenario: 英文局的視窗按鈕
- **WHEN** 英文局的從眾心理打開作答視窗
- **THEN** 視窗的按鈕是 Submit 和 Cancel

### Requirement: 星際探險隊的關卡指令依頻道語系
頻道沒有進行中的星際探險隊房間時，`/game crew level` 和 `/game crew reset` 的回覆 SHALL 用頻道目前的語系 (不是上一局的語系)。

#### Scenario: 英文頻道從沒開過房
- **WHEN** 從沒開過星際探險隊的英文頻道輸入 `/game crew level`
- **THEN** 只有輸入的人看到英文的已解鎖關卡清單
