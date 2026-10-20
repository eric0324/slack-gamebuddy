## ADDED Requirements

### Requirement: 指令說明依語系
輸入 `/game <遊戲> help` (或不認識的子指令) 時，系統 SHALL 用頻道目前的語系顯示這款遊戲的指令說明；遊戲還沒有該語系的翻譯時顯示繁體中文的說明。

#### Scenario: 英文頻道看已翻譯遊戲的說明
- **WHEN** 英文頻道輸入 `/game liarsdice help`，吹牛骰已經有英文翻譯
- **THEN** 只有輸入的人看到英文的指令說明

#### Scenario: 英文頻道看還沒翻譯的遊戲說明
- **WHEN** 英文頻道輸入 `/game coup help`，政變還沒有英文翻譯
- **THEN** 只有輸入的人看到繁體中文的指令說明

### Requirement: 規則連結依語系
房間公告的規則連結 SHALL 指向這局語系的 wiki 頁面：繁體中文是「<中文名稱>-遊戲規則」，英文是「<英文名稱>-Rules」(名稱裡的空白換成 `-`)。遊戲還沒有英文翻譯時，英文房間的規則連結 SHALL 指向繁體中文的頁面。

#### Scenario: 英文房間的規則連結
- **WHEN** 英文頻道開了一局已翻譯的吹牛骰 (英文名稱 Liar's Dice)
- **THEN** 房間公告的規則連結指向 wiki 的「Liar's-Dice-Rules」頁面

#### Scenario: 還沒翻譯的遊戲
- **WHEN** 英文頻道開了一局還沒翻譯的政變
- **THEN** 房間公告的規則連結指向「政變-遊戲規則」
