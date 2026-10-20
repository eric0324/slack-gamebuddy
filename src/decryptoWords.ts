// 截碼戰的祕密詞：每隊抽 4 個，同一局不重複 (有測試檢查數量和格式)。
// 挑選原則：具體、聯想多的名詞，加密者才有辦法從不同角度給提示。
import type { Lang } from './i18n/index.js';

export const DECRYPTO_WORDS: string[] = [
  // 動物
  '貓', '狗', '老虎', '獅子', '大象', '長頸鹿', '企鵝', '熊貓', '鯊魚', '海豚', '老鷹', '蛇', '青蛙', '兔子', '烏龜', '蜜蜂', '蝴蝶', '章魚', '駱駝', '猴子',
  // 食物
  '火鍋', '珍珠奶茶', '牛肉麵', '披薩', '壽司', '蛋糕', '巧克力', '西瓜', '香蕉', '雞排', '小籠包', '咖啡', '起司', '爆米花', '泡麵', '鳳梨', '檸檬', '辣椒', '蛋', '冰淇淋',
  // 地點
  '海灘', '沙漠', '森林', '火山', '醫院', '學校', '機場', '夜市', '圖書館', '監獄', '城堡', '教堂', '博物館', '遊樂園', '動物園', '便利商店', '太空站', '南極', '地下室', '電影院',
  // 物品
  '鏡子', '雨傘', '鑰匙', '手錶', '眼鏡', '枕頭', '蠟燭', '剪刀', '電話', '相機', '地圖', '錢包', '氣球', '鈴鐺', '梯子', '戒指', '書', '吉他', '鋼琴', '帽子',
  // 自然
  '太陽', '月亮', '星星', '彩虹', '颱風', '閃電', '雪', '冰', '火', '雲', '河', '山', '島', '海浪', '石頭', '樹', '花', '地震', '黑洞', '鑽石',
  // 人物職業
  '醫生', '警察', '老師', '廚師', '海盜', '忍者', '國王', '公主', '魔術師', '太空人', '小丑', '偵探', '消防員', '農夫', '機器人', '吸血鬼', '殭屍', '巫婆', '天使', '恐龍',
  // 交通與科技
  '飛機', '火車', '腳踏車', '潛水艇', '火箭', '計程車', '電腦', '手機', '網路', '電池', '衛星', '雷射', '磁鐵', '齒輪', '炸彈', '煙火', '車票', '紅綠燈', '電梯', '輪子',
  // 抽象與活動
  '夢', '時間', '音樂', '戰爭', '婚禮', '生日', '考試', '假期', '祕密', '運氣', '魔法', '鬼', '心臟', '骨頭', '血', '眼淚', '微笑', '影子', '聲音', '金錢',
];

// 英文詞庫：和上面一對一翻譯、順序相同，每個詞是一個英文單字；台灣在地的詞換成意思接近的常用詞
export const DECRYPTO_WORDS_EN: string[] = [
  // 動物
  'Cat', 'Dog', 'Tiger', 'Lion', 'Elephant', 'Giraffe', 'Penguin', 'Panda', 'Shark', 'Dolphin', 'Eagle', 'Snake', 'Frog', 'Rabbit', 'Turtle', 'Bee', 'Butterfly', 'Octopus', 'Camel', 'Monkey',
  // 食物
  'Hotpot', 'Boba', 'Noodles', 'Pizza', 'Sushi', 'Cake', 'Chocolate', 'Watermelon', 'Banana', 'Chicken', 'Dumpling', 'Coffee', 'Cheese', 'Popcorn', 'Ramen', 'Pineapple', 'Lemon', 'Chili', 'Egg', 'Sundae',
  // 地點
  'Beach', 'Desert', 'Forest', 'Volcano', 'Hospital', 'School', 'Airport', 'Market', 'Library', 'Prison', 'Castle', 'Church', 'Museum', 'Carnival', 'Zoo', 'Store', 'Spaceship', 'Antarctica', 'Basement', 'Cinema',
  // 物品
  'Mirror', 'Umbrella', 'Key', 'Watch', 'Glasses', 'Pillow', 'Candle', 'Scissors', 'Telephone', 'Camera', 'Map', 'Wallet', 'Balloon', 'Bell', 'Ladder', 'Ring', 'Book', 'Guitar', 'Piano', 'Hat',
  // 自然
  'Sun', 'Moon', 'Star', 'Rainbow', 'Typhoon', 'Lightning', 'Snow', 'Ice', 'Fire', 'Cloud', 'River', 'Mountain', 'Island', 'Wave', 'Stone', 'Tree', 'Flower', 'Earthquake', 'Galaxy', 'Diamond',
  // 人物職業
  'Doctor', 'Police', 'Teacher', 'Chef', 'Pirate', 'Ninja', 'King', 'Princess', 'Magician', 'Astronaut', 'Clown', 'Detective', 'Firefighter', 'Farmer', 'Robot', 'Vampire', 'Zombie', 'Witch', 'Angel', 'Dinosaur',
  // 交通與科技
  'Airplane', 'Train', 'Bicycle', 'Submarine', 'Rocket', 'Taxi', 'Computer', 'Smartphone', 'Internet', 'Battery', 'Satellite', 'Laser', 'Magnet', 'Gear', 'Bomb', 'Fireworks', 'Ticket', 'Stoplight', 'Elevator', 'Wheel',
  // 抽象與活動
  'Dream', 'Time', 'Music', 'War', 'Wedding', 'Birthday', 'Exam', 'Vacation', 'Secret', 'Luck', 'Magic', 'Ghost', 'Heart', 'Bone', 'Blood', 'Tears', 'Smile', 'Shadow', 'Sound', 'Money',
];

// 依語系取詞庫 (別的遊戲要英文詞也可以用這份)
export const DECRYPTO_WORDS_BY_LANG: Record<Lang, string[]> = { 'zh-TW': DECRYPTO_WORDS, en: DECRYPTO_WORDS_EN };
