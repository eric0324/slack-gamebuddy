// 富饒之城 (Citadels 經典版) 的牌組資料：8 個角色、66 張建築牌 (含 12 張紫卡)
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/citadels.js';

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Color = 'noble' | 'religious' | 'trade' | 'military' | 'special';

export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const COLORS: Color[] = ['noble', 'religious', 'trade', 'military', 'special'];
export const COLOR_EMOJI: Record<Color, string> = { noble: '🟡', religious: '🔵', trade: '🟢', military: '🔴', special: '🟣' };

export const CHARS: Record<Rank, { name: string; tax?: Color; desc: string }> = {
  1: { name: '🗡️ 刺客', desc: '刺殺一個角色，他這輪整個回合跳過' },
  2: { name: '🦹 盜賊', desc: '指定一個角色，他翻開時拿走他全部金幣' },
  3: { name: '🔮 魔術師', desc: '和一位玩家交換全部手牌，或棄任意張手牌重抽' },
  4: { name: '👑 國王', tax: 'noble', desc: '拿到王冠，下一輪先選角；每棟🟡收 1 金' },
  5: { name: '⛪ 主教', tax: 'religious', desc: '這輪建築不會被軍閥破壞；每棟🔵收 1 金' },
  6: { name: '💰 商人', tax: 'trade', desc: '收集資源後多拿 1 金；每棟🟢收 1 金' },
  7: { name: '📐 建築師', desc: '收集資源後多抽 2 張；這回合最多建 3 棟' },
  8: { name: '⚔️ 軍閥', tax: 'military', desc: '付「費用 − 1」破壞一棟建築；每棟🔴收 1 金' },
};

type District = { name: string; color: Color; cost: number; copies: number; desc?: string };
const d = (name: string, color: Color, cost: number, copies = 1, desc?: string): District => ({ name, color, cost, copies, ...(desc ? { desc } : {}) });

export const DISTRICTS: Record<string, District> = {
  manor: d('莊園', 'noble', 3, 5),
  castle: d('城堡', 'noble', 4, 4),
  palace: d('宮殿', 'noble', 5, 3),
  temple: d('神殿', 'religious', 1, 3),
  church: d('教堂', 'religious', 2, 3),
  monastery: d('修道院', 'religious', 3, 3),
  cathedral: d('大教堂', 'religious', 5, 2),
  tavern: d('酒館', 'trade', 1, 5),
  market: d('市集', 'trade', 2, 4),
  tradingPost: d('貿易站', 'trade', 2, 3),
  docks: d('碼頭', 'trade', 3, 3),
  harbor: d('港口', 'trade', 4, 3),
  townHall: d('市政廳', 'trade', 5, 2),
  watchtower: d('瞭望塔', 'military', 1, 3),
  prison: d('監獄', 'military', 2, 3),
  battlefield: d('戰場', 'military', 3, 3),
  fortress: d('堡壘', 'military', 5, 2),
  hauntedCity: d('鬼城', 'special', 2, 1, '結束時算五色可以當任何一種顏色 (最後一輪建的不行)'),
  keep: d('要塞', 'special', 3, 2, '不會被軍閥破壞'),
  laboratory: d('實驗室', 'special', 5, 1, '自己的回合一次：棄 1 張手牌拿 1 金'),
  smithy: d('鐵匠鋪', 'special', 5, 1, '自己的回合一次：付 2 金抽 3 張'),
  observatory: d('天文台', 'special', 5, 1, '抽牌時抽 3 張留 1 張'),
  graveyard: d('墓地', 'special', 5, 1, '軍閥破壞別人的建築時，可以付 1 金把它收回手上'),
  schoolOfMagic: d('魔法學校', 'special', 6, 1, '收稅時算成該角色的顏色'),
  library: d('圖書館', 'special', 6, 1, '抽牌時全部留下'),
  greatWall: d('城牆', 'special', 6, 1, '軍閥破壞你其他建築的費用 +1'),
  university: d('大學', 'special', 6, 1, '計分算 8 分'),
  dragonGate: d('龍門', 'special', 6, 1, '計分算 8 分'),
};

export const DECK: string[] = Object.entries(DISTRICTS).flatMap(([id, x]) => Array<string>(x.copies).fill(id));

// 計分時的價值：大學、龍門算 8，其他照費用
export const districtScore = (id: string) => (id === 'university' || id === 'dragonGate' ? 8 : DISTRICTS[id].cost);

// ---------- 英文版：原版英文名稱 ----------
const CHARS_EN: Record<Rank, { name: string; desc: string }> = {
  1: { name: '🗡️ Assassin', desc: 'Kill one character; their whole turn is skipped this round' },
  2: { name: '🦹 Thief', desc: 'Name a character; when they are revealed, take all their gold' },
  3: { name: '🔮 Magician', desc: 'Swap your whole hand with a player, or discard any number of cards and draw that many' },
  4: { name: '👑 King', desc: 'Take the crown and pick first next round; 1 gold per 🟡' },
  5: { name: '⛪ Bishop', desc: 'Your districts are safe from the Warlord this round; 1 gold per 🔵' },
  6: { name: '💰 Merchant', desc: 'Take 1 extra gold after gathering; 1 gold per 🟢' },
  7: { name: '📐 Architect', desc: 'Draw 2 extra cards after gathering; build up to 3 districts this turn' },
  8: { name: '⚔️ Warlord', desc: 'Pay "cost − 1" to destroy a district; 1 gold per 🔴' },
};

const DISTRICTS_EN: Record<string, { name: string; desc?: string }> = {
  manor: { name: 'Manor' },
  castle: { name: 'Castle' },
  palace: { name: 'Palace' },
  temple: { name: 'Temple' },
  church: { name: 'Church' },
  monastery: { name: 'Monastery' },
  cathedral: { name: 'Cathedral' },
  tavern: { name: 'Tavern' },
  market: { name: 'Market' },
  tradingPost: { name: 'Trading Post' },
  docks: { name: 'Docks' },
  harbor: { name: 'Harbor' },
  townHall: { name: 'Town Hall' },
  watchtower: { name: 'Watchtower' },
  prison: { name: 'Prison' },
  battlefield: { name: 'Battlefield' },
  fortress: { name: 'Fortress' },
  hauntedCity: { name: 'Haunted City', desc: 'Counts as any color for the five-color bonus at game end (not if built in the last round)' },
  keep: { name: 'Keep', desc: 'Cannot be destroyed by the Warlord' },
  laboratory: { name: 'Laboratory', desc: 'Once per turn: discard 1 card to take 1 gold' },
  smithy: { name: 'Smithy', desc: 'Once per turn: pay 2 gold to draw 3 cards' },
  observatory: { name: 'Observatory', desc: 'When drawing, draw 3 and keep 1' },
  graveyard: { name: 'Graveyard', desc: "When the Warlord destroys another player's district, you may pay 1 gold to take it into your hand" },
  schoolOfMagic: { name: 'School of Magic', desc: "Counts as the character's color when collecting taxes" },
  library: { name: 'Library', desc: 'When drawing, keep all the cards' },
  greatWall: { name: 'Great Wall', desc: 'The Warlord pays 1 more to destroy your other districts' },
  university: { name: 'University', desc: 'Worth 8 points at scoring' },
  dragonGate: { name: 'Dragon Gate', desc: 'Worth 8 points at scoring' },
};

// 依語系的角色、建築名稱和說明；沒指定語系用中文
const en = (lang?: Lang) => lang === 'en';
export const charName = (r: Rank, lang?: Lang) => (en(lang) ? CHARS_EN[r].name : CHARS[r].name);
export const charDesc = (r: Rank, lang?: Lang) => (en(lang) ? CHARS_EN[r].desc : CHARS[r].desc);
const districtName = (id: string, lang?: Lang) => (en(lang) ? DISTRICTS_EN[id].name : DISTRICTS[id].name);
const districtDesc = (id: string, lang?: Lang) => (en(lang) ? DISTRICTS_EN[id].desc : DISTRICTS[id].desc);

// 顯示：「🟡 城堡 (4)」
export const districtLabel = (id: string, lang?: Lang) => `${COLOR_EMOJI[DISTRICTS[id].color]} ${districtName(id, lang)} (${DISTRICTS[id].cost})`;
// 附紫卡說明
export const districtInfo = (id: string, lang?: Lang) => {
  const desc = districtDesc(id, lang);
  return districtLabel(id, lang) + (desc ? `${tx(lang, 'infoSep')}${desc}` : '');
};

