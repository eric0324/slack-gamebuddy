// 星際探險隊的自編關卡表 (40 關)：名稱、劇情、任務數、順序標記和特殊規則全部自編，只沿用原版的通用機制
export type Token = '1' | '2' | '3' | '4' | '5' | '>' | '>>' | '>>>' | '>>>>' | 'Ω';
export type Rule = 'deadZone' | `delay:${number}` | 'silence' | 'commanderPick' | 'solo' | 'sick';

export interface Mission {
  name: string;
  story: string;
  tasks: number;
  tokens: Token[]; // 依序配給抽出的第 1、2、3… 張任務
  rules: Rule[];
}

const m = (name: string, story: string, tasks: number, tokens: Token[] = [], rules: Rule[] = []): Mission => ({ name, story, tasks, tokens, rules });

// 索引 0 是第 1 關
export const CREW_MISSIONS: Mission[] = [
  m('點火測試', '新組員第一次坐上駕駛艙，先確認大家會合作。', 1),
  m('脫離大氣層', '引擎全開，衝出雲層。', 2),
  m('繞地軌道', '依序校正兩組推進器。', 2, ['1', '2']),
  m('太空站對接', '對準三個對接環。', 3),
  m('補給艙回收', '先抓住補給艙，再處理其他事。', 3, ['1']),
  m('月面著陸', '著陸腳最後才能放下。', 3, ['Ω']),
  m('月背通訊站', '月球背面訊號斷斷續續。', 3, [], ['deadZone']),
  m('小行星帶前哨', '在碎石之間穿梭。', 4),
  m('隕石雨', '先關防護罩、再開主引擎。', 4, ['1', '2']),
  m('失聯的探測器', '只派一個人出艙找回探測器。', 2, [], ['solo']),
  m('火星氣象站', '先架天線，再開氣象儀。', 4, ['>', '>>']),
  m('沙塵暴', '沙塵蓋住天線，過一陣子才收得到訊號。', 4, [], ['delay:3']),
  m('火衛一採樣', '三個採樣點要照順序挖。', 4, ['1', '2', '3']),
  m('冷凍艙故障', '一位組員被困在冷凍艙裡。', 4, [], ['sick']),
  m('木星重力彈弓', '借木星的重力加速。', 5),
  m('歐羅巴冰層', '先鑽孔，最後才放下潛水機。', 5, ['1', 'Ω']),
  m('太陽閃焰', '閃焰燒掉了所有天線。', 4, [], ['silence']),
  m('補給分配', '指揮官親自分配維修工作。', 5, [], ['commanderPick']),
  m('土星環穿越', '一層一層穿過光環。', 5, ['>', '>>', '>>>']),
  m('泰坦湖畔', '濃霧裡只看得到彼此的手勢。', 5, ['1', '2'], ['deadZone']),
  m('天王星偏轉', '船身被磁場扭轉，要同時修六個地方。', 6),
  m('艙外維修', '只有一個人穿得下維修衣。', 3, [], ['solo']),
  m('海王星風暴', '依序關閉三道艙門。', 6, ['1', '2', '3']),
  m('冥王星邊界', '訊號延遲，最後才回報基地。', 6, ['Ω'], ['delay:4']),
  m('古柏帶迷航', '四段航道要照順序走。', 6, ['>', '>>', '>>>', '>>>>']),
  m('醫療艙隔離', '一位組員發燒隔離，第一件事是送藥。', 5, ['1'], ['sick']),
  m('星際塵雲', '塵雲干擾通訊，指揮官只好親自派工。', 6, [], ['deadZone', 'commanderPick']),
  m('歐特雲信標', '沿途點亮七座信標。', 7),
  m('彗星追逐', '四個動作一氣呵成。', 7, ['1', '2', '3', '4']),
  m('第九行星訊號', '為了聽清楚微弱的訊號，全艦關閉無線電。', 5, [], ['silence']),
  m('引力異常', '先穩住船身，最後才敢關引擎。', 7, ['1', 'Ω'], ['deadZone']),
  m('指揮官的抉擇', '只能派一個人去，而且通訊不穩。', 4, [], ['solo', 'deadZone']),
  m('暗物質', '看不見的阻力，一步一步推進。', 7, ['>', '>>', '>>>'], ['delay:3']),
  m('星門前哨', '指揮官分配八項開門程序。', 8, [], ['commanderPick']),
  m('時空裂縫', '裂縫裡的訊號會失真。', 8, ['1', '2', '3'], ['deadZone']),
  m('孤軍深入', '一個人進入裂縫，通訊要等一下才接得上。', 5, ['1'], ['solo', 'delay:2']),
  m('黑洞邊緣', '依序點火逃離，最後收回帆板。', 8, ['>', '>>', '>>>', 'Ω']),
  m('第九行星軌道', '五段入軌程序一步都不能錯。', 8, ['1', '2', '3', '4', '5']),
  m('降落準備', '大氣層干擾通訊，最後才打開降落傘。', 9, ['Ω'], ['deadZone']),
  m('抵達第九行星', '最後的降落。', 10, ['1', '2', '3', 'Ω'], ['deadZone']),
];

// 英文版的關卡名稱和劇情，和 CREW_MISSIONS 一對一 (任務數、標記、規則共用)
export const MISSIONS_EN: { name: string; story: string }[] = [
  { name: 'Ignition Test', story: "The new crew's first time in the cockpit. Let's make sure everyone can work together." },
  { name: 'Leaving the Atmosphere', story: 'Engines at full power, bursting through the clouds.' },
  { name: 'Earth Orbit', story: 'Calibrate two sets of thrusters in order.' },
  { name: 'Space Station Docking', story: 'Line up the three docking rings.' },
  { name: 'Supply Pod Recovery', story: 'Grab the supply pod first, then deal with everything else.' },
  { name: 'Moon Landing', story: 'The landing legs go down last.' },
  { name: 'Far Side Relay', story: 'The signal keeps cutting out on the far side of the Moon.' },
  { name: 'Asteroid Belt Outpost', story: 'Weaving through the debris.' },
  { name: 'Meteor Shower', story: 'Shields off first, then the main engine.' },
  { name: 'The Lost Probe', story: 'Send just one person out of the airlock to bring the probe back.' },
  { name: 'Mars Weather Station', story: 'Set up the antenna first, then switch on the weather instruments.' },
  { name: 'Dust Storm', story: 'Dust covers the antenna; the signal only comes back after a while.' },
  { name: 'Phobos Samples', story: 'Dig the three sample sites in order.' },
  { name: 'Cryo Pod Failure', story: 'A crew member is trapped in a cryo pod.' },
  { name: 'Jupiter Slingshot', story: "Use Jupiter's gravity to pick up speed." },
  { name: 'Europa Ice Shelf', story: 'Drill the hole first, and lower the submersible last.' },
  { name: 'Solar Flare', story: 'The flare burned out every antenna.' },
  { name: 'Repair Duty', story: 'The commander hands out the repair jobs personally.' },
  { name: "Through Saturn's Rings", story: 'Pass through the rings one layer at a time.' },
  { name: 'Titan Lakeshore', story: "In the thick fog, all you can see are each other's gestures." },
  { name: 'Uranus Deflection', story: 'The magnetic field twisted the hull; six spots need fixing at once.' },
  { name: 'Spacewalk Repair', story: 'Only one person fits in the repair suit.' },
  { name: 'Neptune Storm', story: 'Close the three hatches in order.' },
  { name: 'Edge of Pluto', story: 'The signal lags; report back to base last.' },
  { name: 'Lost in the Kuiper Belt', story: 'Follow the four flight paths in order.' },
  { name: 'Medical Quarantine', story: 'A crew member is quarantined with a fever; the first job is delivering medicine.' },
  { name: 'Stardust Cloud', story: 'The dust cloud jams communications, so the commander assigns the work.' },
  { name: 'Oort Cloud Beacons', story: 'Light up seven beacons along the way.' },
  { name: 'Comet Chase', story: 'Four moves in one smooth sequence.' },
  { name: 'Signal from Planet Nine', story: 'To hear the faint signal, the whole ship shuts off its radios.' },
  { name: 'Gravity Anomaly', story: 'Steady the ship first; only then dare to cut the engines.' },
  { name: "The Commander's Choice", story: 'Only one person can go, and the comms are unstable.' },
  { name: 'Dark Matter', story: 'An invisible drag. Push forward one step at a time.' },
  { name: 'Stargate Outpost', story: 'The commander assigns the eight gate-opening procedures.' },
  { name: 'Spacetime Rift', story: 'Signals get distorted inside the rift.' },
  { name: 'Going In Alone', story: 'One person enters the rift; comms take a while to connect.' },
  { name: 'Edge of the Black Hole', story: 'Fire the engines in sequence to escape, and retract the solar sails last.' },
  { name: 'Planet Nine Orbit', story: 'Five orbital insertion steps, and not one can go wrong.' },
  { name: 'Landing Prep', story: 'The atmosphere jams comms; the parachute opens last.' },
  { name: 'Arrival at Planet Nine', story: 'The final landing.' },
];
