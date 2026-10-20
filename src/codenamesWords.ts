// 機密代號的詞庫：每局隨機抽 25 個。詞要不重複、沒有空白、1～4 個字 (有測試檢查)。
// 挑選原則：意思多、容易聯想到別的東西的詞，隊長才好串提示。
import type { Lang } from './i18n/index.js';

export const CODENAMES_WORDS = [
  // 動物
  '老虎', '獅子', '熊貓', '企鵝', '海豚', '鯊魚', '老鼠', '貓', '狗', '兔子',
  '猴子', '大象', '長頸鹿', '蛇', '烏龜', '青蛙', '蝴蝶', '蜜蜂', '螞蟻', '蜘蛛',
  '老鷹', '鴿子', '公雞', '恐龍', '獨角獸', '龍', '鳳凰', '狐狸', '狼', '章魚',
  // 食物
  '蘋果', '香蕉', '西瓜', '鳳梨', '檸檬', '草莓', '珍珠奶茶', '咖啡', '牛奶', '巧克力',
  '蛋糕', '麵包', '雞蛋', '米飯', '泡麵', '火鍋', '臭豆腐', '滷肉飯', '披薩', '漢堡',
  '壽司', '餃子', '月餅', '粽子', '湯圓', '辣椒', '大蒜', '蜂蜜', '糖果', '冰淇淋',
  // 地方
  '學校', '醫院', '銀行', '機場', '車站', '公園', '海灘', '沙漠', '森林', '火山',
  '月球', '太陽', '星星', '地球', '南極', '金字塔', '長城', '夜市', '廟', '教堂',
  '城堡', '監獄', '博物館', '動物園', '游泳池', '電梯', '廁所', '廚房', '地下室', '屋頂',
  // 物品
  '手機', '電腦', '鍵盤', '滑鼠', '耳機', '相機', '電視', '冰箱', '雨傘', '鑰匙',
  '鎖', '錢包', '眼鏡', '手錶', '戒指', '皇冠', '帽子', '鞋子', '襪子', '領帶',
  '枕頭', '鏡子', '蠟燭', '氣球', '風箏', '地圖', '書', '報紙', '信', '郵票',
  '剪刀', '鉛筆', '橡皮擦', '尺', '膠帶', '電池', '燈泡', '炸彈', '槍', '刀',
  '劍', '盾牌', '弓', '箭', '炮', '旗子', '鈴鐺', '鼓', '吉他', '鋼琴',
  // 交通
  '汽車', '公車', '捷運', '火車', '飛機', '輪船', '腳踏車', '機車', '火箭', '潛水艇',
  '直升機', '計程車', '救護車', '消防車', '熱氣球', '馬車', '滑板', '纜車', '坦克', '帆船',
  // 人物與職業
  '醫生', '老師', '警察', '小偷', '廚師', '律師', '歌手', '演員', '總統', '國王',
  '公主', '騎士', '海盜', '忍者', '巫師', '天使', '惡魔', '鬼', '殭屍', '吸血鬼',
  '外星人', '機器人', '超人', '間諜', '偵探', '魔術師', '小丑', '牛仔', '太空人', '老闆',
  // 自然與天氣
  '雨', '雪', '風', '雷', '彩虹', '颱風', '地震', '海浪', '冰', '火',
  '水', '石頭', '鑽石', '黃金', '樹', '花', '草', '玫瑰', '竹子', '仙人掌',
  // 身體
  '眼睛', '耳朵', '鼻子', '嘴巴', '手', '腳', '心', '頭髮', '牙齒', '骨頭',
  // 抽象與其他
  '夢', '時間', '音樂', '電影', '遊戲', '足球', '籃球', '棒球', '網球', '拳擊',
  '婚禮', '生日', '聖誕節', '過年', '鬼月', '考試', '加班', '放假', '戀愛', '分手',
  '網路', '病毒', '密碼', '紅包', '發票', '彩券', '鞭炮', '烤肉', '泡泡', '影子',
];

// 英文詞庫：和上面一對一翻譯、順序相同，每個詞是一個英文單字；台灣在地的詞換成意思接近的常用詞
export const CODENAMES_WORDS_EN = [
  // 動物
  'Tiger', 'Lion', 'Panda', 'Penguin', 'Dolphin', 'Shark', 'Rat', 'Cat', 'Dog', 'Rabbit',
  'Monkey', 'Elephant', 'Giraffe', 'Snake', 'Turtle', 'Frog', 'Butterfly', 'Bee', 'Ant', 'Spider',
  'Eagle', 'Pigeon', 'Rooster', 'Dinosaur', 'Unicorn', 'Dragon', 'Phoenix', 'Fox', 'Wolf', 'Octopus',
  // 食物
  'Apple', 'Banana', 'Watermelon', 'Pineapple', 'Lemon', 'Strawberry', 'Boba', 'Coffee', 'Milk', 'Chocolate',
  'Cake', 'Bread', 'Egg', 'Rice', 'Noodle', 'Hotpot', 'Tofu', 'Stew', 'Pizza', 'Burger',
  'Sushi', 'Dumpling', 'Mooncake', 'Wrap', 'Mochi', 'Chili', 'Garlic', 'Honey', 'Candy', 'Sundae',
  // 地方
  'School', 'Hospital', 'Bank', 'Airport', 'Station', 'Park', 'Beach', 'Desert', 'Forest', 'Volcano',
  'Moon', 'Sun', 'Star', 'Earth', 'Pole', 'Pyramid', 'Wall', 'Market', 'Temple', 'Church',
  'Castle', 'Prison', 'Museum', 'Zoo', 'Pool', 'Elevator', 'Toilet', 'Kitchen', 'Basement', 'Roof',
  // 物品
  'Phone', 'Computer', 'Keyboard', 'Mouse', 'Headphones', 'Camera', 'Television', 'Fridge', 'Umbrella', 'Key',
  'Lock', 'Wallet', 'Glasses', 'Watch', 'Ring', 'Crown', 'Hat', 'Shoe', 'Sock', 'Tie',
  'Pillow', 'Mirror', 'Candle', 'Balloon', 'Kite', 'Map', 'Book', 'Newspaper', 'Letter', 'Stamp',
  'Scissors', 'Pencil', 'Eraser', 'Ruler', 'Tape', 'Battery', 'Lightbulb', 'Bomb', 'Gun', 'Knife',
  'Sword', 'Shield', 'Bow', 'Arrow', 'Cannon', 'Flag', 'Bell', 'Drum', 'Guitar', 'Piano',
  // 交通
  'Car', 'Bus', 'Subway', 'Train', 'Plane', 'Ship', 'Bicycle', 'Scooter', 'Rocket', 'Submarine',
  'Helicopter', 'Taxi', 'Ambulance', 'Firetruck', 'Airship', 'Carriage', 'Skateboard', 'Gondola', 'Tank', 'Sailboat',
  // 人物與職業
  'Doctor', 'Teacher', 'Police', 'Thief', 'Chef', 'Lawyer', 'Singer', 'Actor', 'President', 'King',
  'Princess', 'Knight', 'Pirate', 'Ninja', 'Wizard', 'Angel', 'Devil', 'Ghost', 'Zombie', 'Vampire',
  'Alien', 'Robot', 'Superhero', 'Spy', 'Detective', 'Magician', 'Clown', 'Cowboy', 'Astronaut', 'Boss',
  // 自然與天氣
  'Rain', 'Snow', 'Wind', 'Thunder', 'Rainbow', 'Typhoon', 'Earthquake', 'Wave', 'Ice', 'Fire',
  'Water', 'Stone', 'Diamond', 'Gold', 'Tree', 'Flower', 'Grass', 'Rose', 'Bamboo', 'Cactus',
  // 身體
  'Eye', 'Ear', 'Nose', 'Mouth', 'Hand', 'Foot', 'Heart', 'Hair', 'Tooth', 'Bone',
  // 抽象與其他
  'Dream', 'Time', 'Music', 'Movie', 'Game', 'Soccer', 'Basketball', 'Baseball', 'Tennis', 'Boxing',
  'Wedding', 'Birthday', 'Christmas', 'Holiday', 'Halloween', 'Exam', 'Overtime', 'Vacation', 'Love', 'Breakup',
  'Internet', 'Virus', 'Password', 'Envelope', 'Receipt', 'Lottery', 'Firecracker', 'Barbecue', 'Bubble', 'Shadow',
];

// 依語系取詞庫 (一字千金也用這份)
export const CODENAMES_WORDS_BY_LANG: Record<Lang, string[]> = { 'zh-TW': CODENAMES_WORDS, en: CODENAMES_WORDS_EN };
