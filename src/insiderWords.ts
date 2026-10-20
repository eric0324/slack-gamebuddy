// 圈內人的題目詞庫：中文沿用截碼戰的祕密詞，英文是一對一的翻譯 (數量和順序相同)
import { DECRYPTO_WORDS } from './decryptoWords.js';
import type { Lang } from './i18n/index.js';

const EN: string[] = [
  // 動物
  'Cat', 'Dog', 'Tiger', 'Lion', 'Elephant', 'Giraffe', 'Penguin', 'Panda', 'Shark', 'Dolphin', 'Eagle', 'Snake', 'Frog', 'Rabbit', 'Turtle', 'Bee', 'Butterfly', 'Octopus', 'Camel', 'Monkey',
  // 食物
  'Hot pot', 'Bubble tea', 'Noodle soup', 'Pizza', 'Sushi', 'Cake', 'Chocolate', 'Watermelon', 'Banana', 'Fried chicken', 'Dumpling', 'Coffee', 'Cheese', 'Popcorn', 'Instant noodles', 'Pineapple', 'Lemon', 'Chili pepper', 'Egg', 'Ice cream',
  // 地點
  'Beach', 'Desert', 'Forest', 'Volcano', 'Hospital', 'School', 'Airport', 'Night market', 'Library', 'Prison', 'Castle', 'Church', 'Museum', 'Amusement park', 'Zoo', 'Convenience store', 'Space station', 'Antarctica', 'Basement', 'Movie theater',
  // 物品
  'Mirror', 'Umbrella', 'Key', 'Watch', 'Glasses', 'Pillow', 'Candle', 'Scissors', 'Telephone', 'Camera', 'Map', 'Wallet', 'Balloon', 'Bell', 'Ladder', 'Ring', 'Book', 'Guitar', 'Piano', 'Hat',
  // 自然
  'Sun', 'Moon', 'Star', 'Rainbow', 'Typhoon', 'Lightning', 'Snow', 'Ice', 'Fire', 'Cloud', 'River', 'Mountain', 'Island', 'Wave', 'Rock', 'Tree', 'Flower', 'Earthquake', 'Black hole', 'Diamond',
  // 人物職業
  'Doctor', 'Police officer', 'Teacher', 'Chef', 'Pirate', 'Ninja', 'King', 'Princess', 'Magician', 'Astronaut', 'Clown', 'Detective', 'Firefighter', 'Farmer', 'Robot', 'Vampire', 'Zombie', 'Witch', 'Angel', 'Dinosaur',
  // 交通與科技
  'Airplane', 'Train', 'Bicycle', 'Submarine', 'Rocket', 'Taxi', 'Computer', 'Cell phone', 'Internet', 'Battery', 'Satellite', 'Laser', 'Magnet', 'Gear', 'Bomb', 'Fireworks', 'Ticket', 'Traffic light', 'Elevator', 'Wheel',
  // 抽象與活動
  'Dream', 'Time', 'Music', 'War', 'Wedding', 'Birthday', 'Exam', 'Vacation', 'Secret', 'Luck', 'Magic', 'Ghost', 'Heart', 'Bone', 'Blood', 'Tears', 'Smile', 'Shadow', 'Sound', 'Money',
];

export const INSIDER_WORDS: Record<Lang, string[]> = { 'zh-TW': DECRYPTO_WORDS, en: EN };
