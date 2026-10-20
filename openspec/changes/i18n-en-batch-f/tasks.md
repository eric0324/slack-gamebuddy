## 1. 心電感應 (wavelength)

- [x] 1.1 先寫失敗的英文測試：英文局的開局公告、出題 prompt 和按鈕、猜左右按鈕是英文，help 和 `locales.en` 是英文，光譜卡取英文版且數量和中文版相同
- [x] 1.2 新增 `src/i18n/games/wavelength.ts`、英文光譜卡，engine 和 GameDef 改用字典，讓 1.1 綠燈

## 2. 心電感應 (合作) (wavecoop)

- [x] 2.1 先寫失敗的英文測試：英文局的開局公告、出題 prompt 和按鈕是英文，help 和 `locales.en` 是英文，光譜卡取英文版
- [x] 2.2 新增 `src/i18n/games/wavecoop.ts`，engine 和 GameDef 改用字典，讓 2.1 綠燈

## 3. 從眾心理 (herd)

- [x] 3.1 先寫失敗的英文測試：英文局的主要公告、prompt 和按鈕是英文，help 和 `locales.en` 是英文，題目取英文版且數量和中文版相同
- [x] 3.2 新增 `src/i18n/games/herd.ts`、英文題庫，engine 和 GameDef 改用字典，讓 3.1 綠燈

## 4. 猜猜看 (wager)

- [ ] 4.1 先寫失敗的英文測試：英文局的主要公告、prompt 和按鈕是英文，help 和 `locales.en` 是英文，題目取英文版且數量和中文版相同
- [ ] 4.2 新增 `src/i18n/games/wager.ts`、英文題庫 (答案維持正確)，engine 和 GameDef 改用字典，讓 4.1 綠燈

## 5. 梗圖大亂鬥 (meme)

- [x] 5.1 先寫失敗的英文測試：英文局的主要公告、prompt 和按鈕是英文，help 和 `locales.en` 是英文，文字卡取英文版且數量和中文版相同
- [x] 5.2 新增 `src/i18n/games/meme.ts`、英文文字卡和梗圖名稱，engine 和 GameDef 改用字典，讓 5.1 綠燈

## 6. Emoji 傳話 (emoji)

- [ ] 6.1 先寫失敗的英文測試：英文局的主要公告、DM、prompt 和按鈕是英文，help 和 `locales.en` 是英文，題目取英文版且數量和中文版相同
- [ ] 6.2 新增 `src/i18n/games/emoji.ts`、英文題庫，engine 和 GameDef 改用字典，讓 6.1 綠燈

## 7. 妙語說書人 (dixit)

- [x] 7.1 先寫失敗的英文測試：英文局的主要公告、prompt 和按鈕是英文，help 和 `locales.en` 是英文
- [x] 7.2 新增 `src/i18n/games/dixit.ts`，engine 和 GameDef 改用字典，讓 7.1 綠燈

## 8. 收尾

- [ ] 8.1 每款遊戲寫 3 頁英文 wiki
- [ ] 8.2 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈、既有測試的預期值沒改
