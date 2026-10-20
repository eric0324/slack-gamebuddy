// 詭影神探的卡表：手段詞庫、線索詞庫和鑑識官的提示板 (死因、地點、場景)，純資料。文字都是自己寫的，沒有照抄原版牌表。
import type { Lang } from './i18n/index.js';

export interface Board {
  title: string;
  options: string[]; // 6 個選項
}

// 手段 (凶器或行兇方法)，120 個
export const MEANS: string[] = [
  '菜刀', '水果刀', '剪刀', '美工刀', '匕首', '武士刀', '手術刀', '斧頭', '鋸子', '電鋸', '螺絲起子', '鐵鎚',
  '扳手', '鐵撬', '球棒', '高爾夫球桿', '曲棍球桿', '拐杖', '雨傘', '擀麵棍', '平底鍋', '炒菜鍋', '磚頭', '石頭',
  '花瓶', '菸灰缸', '酒瓶', '檯燈', '獎盃', '啞鈴', '保齡球', '鐵鍊', '繩子', '領帶', '絲巾', '電線',
  '塑膠袋', '枕頭', '毛巾', '膠帶', '皮帶', '毒藥', '安眠藥', '農藥', '毒蘑菇', '河豚', '老鼠藥', '過量咖啡',
  '烈酒', '注射針筒', '毒蛇', '毒蜘蛛', '虎頭蜂', '惡犬', '鱷魚', '弓箭', '十字弓', '手槍', '獵槍', '飛鏢',
  '彈弓', '魚叉', '冰錐', '冰塊', '熨斗', '吹風機', '電鑽', '割草機', '推下樓梯', '推下懸崖', '推落月台', '汽車撞擊',
  '機車撞擊', '溺水', '浴缸', '游泳池', '冷凍庫', '瓦斯外洩', '一氧化碳', '縱火', '炸彈', '鞭炮', '電擊', '高壓電',
  '花盆掉落', '吊燈掉落', '書櫃倒塌', '捕獸夾', '烤箱', '滾燙熱水', '強酸', '漂白水', '殺蟲劑', '縫衣針', '鉛筆', '筷子',
  '叉子', '拳頭', '勒頸', '悶死', '餓死', '驚嚇', '鐵絲', '釘槍', '鏟子', '鋤頭', '鐮刀', '魚線',
  '鐵管', '木棍', '滅火器', '保溫瓶', '行李箱撞擊', '電梯故障', '過敏食物', '撞球桿', '化學藥劑', '針灸針', '跳繩', '鐵板',
];

// 線索 (現場可能留下的物品或痕跡)，144 個
export const CLUES: string[] = [
  '鑰匙', '手機', '錢包', '身分證', '名片', '照片', '日記', '信件', '情書', '收據', '發票', '車票',
  '電影票', '機票', '護照', '地圖', '筆記本', '便利貼', '報紙', '雜誌', '字典', '行事曆', '相簿', '明信片',
  '手錶', '戒指', '項鍊', '耳環', '手環', '眼鏡', '太陽眼鏡', '帽子', '手套', '圍巾', '外套', '襯衫',
  '領結', '鞋子', '高跟鞋', '拖鞋', '襪子', '口罩', '雨衣', '背包', '公事包', '購物袋', '紙箱', '鈕扣',
  '髮夾', '梳子', '口紅', '香水', '粉餅', '牙刷', '衛生紙', 'OK繃', '藥盒', '體溫計', '馬克杯', '茶包',
  '便當', '珍珠奶茶', '蛋糕', '巧克力', '糖果', '口香糖', '香蕉皮', '蘋果核', '麵包屑', '泡麵', '啤酒罐', '紅酒杯',
  '打火機', '火柴', '蠟燭', '菸蒂', '玩偶', '積木', '遊戲機', '撲克牌', '骰子', '硬幣', '鈔票', '存摺',
  '信用卡', '悠遊卡', '門禁卡', '隨身碟', '筆電', '耳機', '充電線', '遙控器', '計算機', '相機', '錄音筆', '鬧鐘',
  '月曆', '盆栽', '玫瑰花', '羽毛', '頭髮', '指甲', '血跡', '泥土', '沙子', '樹葉', '碎玻璃', '油漆',
  '墨水', '粉筆', '膠水', '紙飛機', '氣球', '緞帶', '貓毛', '狗鍊', '鳥籠', '魚缸', '獎狀', '遺囑',
  '保險單', '合約', '支票', '樂透彩券', '收音機', '唱片', '吉他', '畫筆', '蠟筆', '橡皮擦', '尺', '釘書機',
  '迴紋針', '信封', '郵票', '包裹', '指紋', '腳印', '唇印', '咖啡漬', '藥丸', '假髮', '面具', '雨鞋',
];

export const CAUSE_BOARD: Board = { title: '死因', options: ['窒息', '鈍器重擊', '失血過多', '中毒', '急病發作', '意外事故'] };

// 地點板：鑑識官選 1 張使用
export const LOCATION_BOARDS: Board[] = [
  { title: '居家', options: ['客廳', '臥室', '廚房', '浴室', '書房', '陽台'] },
  { title: '公共場所', options: ['餐廳', '商場', '電影院', '醫院', '學校', '圖書館'] },
  { title: '戶外', options: ['公園', '海邊', '山上', '停車場', '巷弄', '河堤'] },
  { title: '工作與交通', options: ['辦公室', '工廠', '工地', '捷運站', '計程車', '倉庫'] },
];

// 場景板：洗成一疊，第 1 輪抽 4 張，第 2、3 輪各再抽 1 張
export const SCENE_BOARDS: Board[] = [
  { title: '案發時間', options: ['清晨', '上午', '中午', '下午', '傍晚', '深夜'] },
  { title: '天氣', options: ['晴天', '雨天', '颱風', '寒流', '悶熱', '起霧'] },
  { title: '兇手體型', options: ['高大', '瘦小', '壯碩', '普通', '矮胖', '纖細'] },
  { title: '兇手個性', options: ['冷靜', '衝動', '狡猾', '膽小', '自大', '細心'] },
  { title: '動機', options: ['金錢', '感情', '仇恨', '嫉妒', '滅口', '意外'] },
  { title: '受害者身分', options: ['老人', '小孩', '上班族', '學生', '名人', '陌生人'] },
  { title: '兩人關係', options: ['家人', '朋友', '同事', '情人', '鄰居', '不認識'] },
  { title: '行兇時間長短', options: ['一瞬間', '幾分鐘', '半小時', '幾小時', '一整天', '好幾天'] },
  { title: '事前徵兆', options: ['爭吵', '恐嚇信', '跟蹤', '借錢', '失眠', '毫無徵兆'] },
  { title: '現場環境', options: ['安靜', '吵雜', '黑暗', '明亮', '擁擠', '偏僻'] },
  { title: '現場狀態', options: ['凌亂', '整齊', '被翻找過', '門窗緊閉', '有打鬥痕跡', '被清理過'] },
  { title: '現場聲音', options: ['尖叫', '玻璃碎裂', '悶響', '音樂聲', '狗叫', '毫無聲音'] },
  { title: '現場氣味', options: ['香水味', '菸味', '燒焦味', '藥水味', '霉味', '沒有味道'] },
  { title: '受害者表情', options: ['驚恐', '平靜', '痛苦', '憤怒', '困惑', '微笑'] },
  { title: '受害者姿勢', options: ['躺著', '趴著', '坐著', '跪著', '蜷縮', '靠著牆'] },
  { title: '發現經過', options: ['路人報案', '家人發現', '同事發現', '監視器', '匿名電話', '清潔人員'] },
  { title: '證物材質', options: ['金屬', '木頭', '塑膠', '玻璃', '布料', '紙'] },
  { title: '證物大小', options: ['很小', '手掌大', '書本大', '包包大', '行李箱大', '比人還大'] },
  { title: '證物顏色', options: ['紅色', '黃色', '綠色', '藍色', '黑色', '白色'] },
  { title: '證物給人的感覺', options: ['危險', '日常', '昂貴', '便宜', '老舊', '新潮'] },
  { title: '證物使用場合', options: ['廚房', '辦公', '運動', '醫療', '娛樂', '工程'] },
  { title: '證物狀態', options: ['完好', '破損', '沾污', '潮濕', '燒焦', '被藏起來'] },
];

// ---------- 英文版：一對一翻譯中文詞庫 (順序和數量相同)，翻不通的換成意思接近的英文常用詞 ----------

const MEANS_EN: string[] = [
  'Kitchen Knife', 'Paring Knife', 'Scissors', 'Box Cutter', 'Dagger', 'Katana', 'Scalpel', 'Axe', 'Saw', 'Chainsaw', 'Screwdriver', 'Hammer',
  'Wrench', 'Crowbar', 'Baseball Bat', 'Golf Club', 'Hockey Stick', 'Cane', 'Umbrella', 'Rolling Pin', 'Frying Pan', 'Wok', 'Brick', 'Rock',
  'Vase', 'Ashtray', 'Wine Bottle', 'Desk Lamp', 'Trophy', 'Dumbbell', 'Bowling Ball', 'Chain', 'Rope', 'Necktie', 'Silk Scarf', 'Electric Cord',
  'Plastic Bag', 'Pillow', 'Towel', 'Duct Tape', 'Belt', 'Poison', 'Sleeping Pills', 'Pesticide', 'Toxic Mushroom', 'Pufferfish', 'Rat Poison', 'Caffeine Overdose',
  'Hard Liquor', 'Syringe', 'Venomous Snake', 'Venomous Spider', 'Hornet', 'Vicious Dog', 'Crocodile', 'Bow and Arrow', 'Crossbow', 'Pistol', 'Shotgun', 'Dart',
  'Slingshot', 'Harpoon', 'Ice Pick', 'Ice Block', 'Iron', 'Hair Dryer', 'Power Drill', 'Lawn Mower', 'Pushed Down Stairs', 'Pushed Off a Cliff', 'Pushed onto Tracks', 'Hit by a Car',
  'Hit by a Scooter', 'Drowning', 'Bathtub', 'Swimming Pool', 'Freezer', 'Gas Leak', 'Carbon Monoxide', 'Arson', 'Bomb', 'Firecrackers', 'Electric Shock', 'High Voltage',
  'Falling Flowerpot', 'Falling Chandelier', 'Toppled Bookcase', 'Bear Trap', 'Oven', 'Scalding Water', 'Acid', 'Bleach', 'Insecticide', 'Sewing Needle', 'Pencil', 'Chopsticks',
  'Fork', 'Fists', 'Strangling', 'Smothering', 'Starvation', 'Fright', 'Wire', 'Nail Gun', 'Shovel', 'Hoe', 'Sickle', 'Fishing Line',
  'Steel Pipe', 'Wooden Stick', 'Fire Extinguisher', 'Thermos', 'Suitcase Blow', 'Elevator Failure', 'Allergen', 'Pool Cue', 'Chemicals', 'Acupuncture Needle', 'Jump Rope', 'Steel Plate',
];

const CLUES_EN: string[] = [
  'Key', 'Phone', 'Wallet', 'ID Card', 'Business Card', 'Photo', 'Diary', 'Letter', 'Love Letter', 'Receipt', 'Invoice', 'Train Ticket',
  'Movie Ticket', 'Plane Ticket', 'Passport', 'Map', 'Notebook', 'Sticky Note', 'Newspaper', 'Magazine', 'Dictionary', 'Planner', 'Photo Album', 'Postcard',
  'Watch', 'Ring', 'Necklace', 'Earrings', 'Bracelet', 'Glasses', 'Sunglasses', 'Hat', 'Gloves', 'Scarf', 'Jacket', 'Shirt',
  'Bow Tie', 'Shoes', 'High Heels', 'Slippers', 'Socks', 'Face Mask', 'Raincoat', 'Backpack', 'Briefcase', 'Shopping Bag', 'Cardboard Box', 'Button',
  'Hairpin', 'Comb', 'Lipstick', 'Perfume', 'Compact', 'Toothbrush', 'Tissues', 'Band-Aid', 'Pill Box', 'Thermometer', 'Mug', 'Tea Bag',
  'Lunch Box', 'Bubble Tea', 'Cake', 'Chocolate', 'Candy', 'Chewing Gum', 'Banana Peel', 'Apple Core', 'Breadcrumbs', 'Instant Noodles', 'Beer Can', 'Wine Glass',
  'Lighter', 'Matches', 'Candle', 'Cigarette Butt', 'Stuffed Toy', 'Building Blocks', 'Game Console', 'Playing Cards', 'Dice', 'Coin', 'Banknote', 'Bankbook',
  'Credit Card', 'Transit Card', 'Key Card', 'USB Drive', 'Laptop', 'Headphones', 'Charging Cable', 'Remote Control', 'Calculator', 'Camera', 'Voice Recorder', 'Alarm Clock',
  'Calendar', 'Potted Plant', 'Rose', 'Feather', 'Hair', 'Fingernail', 'Bloodstain', 'Mud', 'Sand', 'Leaf', 'Broken Glass', 'Paint',
  'Ink', 'Chalk', 'Glue', 'Paper Plane', 'Balloon', 'Ribbon', 'Cat Hair', 'Dog Leash', 'Birdcage', 'Fish Tank', 'Certificate', 'Will',
  'Insurance Policy', 'Contract', 'Check', 'Lottery Ticket', 'Radio', 'Vinyl Record', 'Guitar', 'Paintbrush', 'Crayon', 'Eraser', 'Ruler', 'Stapler',
  'Paper Clip', 'Envelope', 'Stamp', 'Package', 'Fingerprint', 'Footprint', 'Lipstick Mark', 'Coffee Stain', 'Pill', 'Wig', 'Mask', 'Rain Boots',
];

const CAUSE_BOARD_EN: Board = { title: 'Cause of Death', options: ['Suffocation', 'Blunt Force', 'Blood Loss', 'Poisoning', 'Sudden Illness', 'Accident'] };

const LOCATION_BOARDS_EN: Board[] = [
  { title: 'Home', options: ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Study', 'Balcony'] },
  { title: 'Public Place', options: ['Restaurant', 'Mall', 'Movie Theater', 'Hospital', 'School', 'Library'] },
  { title: 'Outdoors', options: ['Park', 'Beach', 'Mountain', 'Parking Lot', 'Alley', 'Riverbank'] },
  { title: 'Work & Transit', options: ['Office', 'Factory', 'Construction Site', 'Subway Station', 'Taxi', 'Warehouse'] },
];

const SCENE_BOARDS_EN: Board[] = [
  { title: 'Time of Crime', options: ['Dawn', 'Morning', 'Noon', 'Afternoon', 'Evening', 'Late Night'] },
  { title: 'Weather', options: ['Sunny', 'Rainy', 'Typhoon', 'Cold Snap', 'Muggy', 'Foggy'] },
  { title: "Murderer's Build", options: ['Tall', 'Small', 'Muscular', 'Average', 'Stocky', 'Slender'] },
  { title: "Murderer's Personality", options: ['Calm', 'Impulsive', 'Cunning', 'Timid', 'Arrogant', 'Meticulous'] },
  { title: 'Motive', options: ['Money', 'Love', 'Hatred', 'Jealousy', 'Silencing', 'Accident'] },
  { title: "Victim's Identity", options: ['Elderly', 'Child', 'Office Worker', 'Student', 'Celebrity', 'Stranger'] },
  { title: 'Relationship', options: ['Family', 'Friend', 'Coworker', 'Lover', 'Neighbor', 'Strangers'] },
  { title: 'Duration of Crime', options: ['Instant', 'Minutes', 'Half an Hour', 'Hours', 'All Day', 'Several Days'] },
  { title: 'Warning Signs', options: ['Argument', 'Threat Letter', 'Stalking', 'Borrowed Money', 'Insomnia', 'No Warning'] },
  { title: 'Surroundings', options: ['Quiet', 'Noisy', 'Dark', 'Bright', 'Crowded', 'Remote'] },
  { title: 'State of the Scene', options: ['Messy', 'Tidy', 'Ransacked', 'Locked Up', 'Signs of Struggle', 'Cleaned Up'] },
  { title: 'Sounds at the Scene', options: ['Scream', 'Shattering Glass', 'Thud', 'Music', 'Barking', 'Silence'] },
  { title: 'Smell at the Scene', options: ['Perfume', 'Smoke', 'Burning', 'Disinfectant', 'Mildew', 'No Smell'] },
  { title: "Victim's Expression", options: ['Terrified', 'Calm', 'Pained', 'Angry', 'Confused', 'Smiling'] },
  { title: "Victim's Position", options: ['Lying Face Up', 'Face Down', 'Sitting', 'Kneeling', 'Curled Up', 'Against a Wall'] },
  { title: 'How It Was Found', options: ['Passerby Report', 'Family Member', 'Coworker', 'Security Camera', 'Anonymous Call', 'Cleaning Staff'] },
  { title: 'Evidence Material', options: ['Metal', 'Wood', 'Plastic', 'Glass', 'Fabric', 'Paper'] },
  { title: 'Evidence Size', options: ['Tiny', 'Palm-Sized', 'Book-Sized', 'Bag-Sized', 'Suitcase-Sized', 'Bigger Than a Person'] },
  { title: 'Evidence Color', options: ['Red', 'Yellow', 'Green', 'Blue', 'Black', 'White'] },
  { title: 'Evidence Impression', options: ['Dangerous', 'Everyday', 'Expensive', 'Cheap', 'Old', 'Trendy'] },
  { title: 'Evidence Usage', options: ['Kitchen', 'Office', 'Sports', 'Medical', 'Entertainment', 'Engineering'] },
  { title: 'Evidence Condition', options: ['Intact', 'Broken', 'Stained', 'Wet', 'Burnt', 'Hidden'] },
];

export interface Deck {
  means: string[];
  clues: string[];
  cause: Board;
  locations: Board[];
  scenes: Board[];
}

// 依語系的詞庫和提示板：開局時依這局的語系取
export const DECKS: Record<Lang, Deck> = {
  'zh-TW': { means: MEANS, clues: CLUES, cause: CAUSE_BOARD, locations: LOCATION_BOARDS, scenes: SCENE_BOARDS },
  en: { means: MEANS_EN, clues: CLUES_EN, cause: CAUSE_BOARD_EN, locations: LOCATION_BOARDS_EN, scenes: SCENE_BOARDS_EN },
};
