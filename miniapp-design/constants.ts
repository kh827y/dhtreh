
import { User, UserLevel, MerchantConfig, Transaction, Promo } from './types';

export const MOCK_MERCHANT_CONFIG: MerchantConfig = {
  hasReferralProgram: true,
  referralDescription: "Приглашайте друзей в нашу кофейню! Как только ваш друг совершит первую покупку от 300₽, вы получите 500 бонусных баллов на свой счет. Друг получит повышенный кэшбэк 10% на первый месяц.",
  reviewTriggerThreshold: 4, // Оценка 4 или 5 вызовет предложение поделиться
  levels: [
    { name: UserLevel.BASE, threshold: 0, cashbackPercent: 3, writeOffPercent: 50 },
    { name: UserLevel.SILVER, threshold: 10000, cashbackPercent: 5, writeOffPercent: 40 },
    { name: UserLevel.GOLD, threshold: 50000, cashbackPercent: 10, writeOffPercent: 50 },
    { name: UserLevel.PLATINUM, threshold: 100000, cashbackPercent: 15, writeOffPercent: 100 },
  ]
};

const MOCK_TRANSACTIONS: Transaction[] = [
  { 
    id: '10', 
    title: 'Покупка', 
    date: '25 окт 14:30', 
    amount: 450, 
    cashback: 22, // Начислено
    pointsBurned: 150, // Списано в счет оплаты
    type: 'purchase' 
  },
  { 
    id: '9', 
    title: 'Сгорание баллов', 
    description: 'Истек срок действия',
    date: '24 окт 09:00', 
    amount: 0, 
    cashback: 150, 
    type: 'expiration' 
  },
  { 
    id: '8', 
    title: 'Возврат реферала', 
    description: 'Друг оформил возврат покупки',
    date: '23 окт 18:45', 
    amount: 0, 
    cashback: 500, 
    type: 'referral_refund' 
  },
  { 
    id: '7', 
    title: 'Реферальное начисление', 
    description: 'Бонус по реф. программе',
    date: '23 окт 12:00', 
    amount: 0, 
    cashback: 500, 
    type: 'referral' 
  },
  { 
    id: '6', 
    title: 'Акция', 
    description: 'Утренний кофе',
    date: '22 окт 08:15', 
    amount: 0, 
    cashback: 50, 
    type: 'campaign' 
  },
  { 
    id: '5', 
    title: 'Промокод', 
    description: 'AUTUMN23',
    date: '21 окт 10:00', 
    amount: 0, 
    cashback: 300, 
    type: 'promo' 
  },
  { 
    id: '4', 
    title: 'Возврат покупки', 
    description: 'Отмена заказа',
    date: '20 окт 16:20', 
    amount: 1200, 
    cashback: 60, // Изначально начислено (будет отображено как списание при возврате)
    pointsBurned: 100, // Изначально списано (будет отображено как возврат при возврате)
    type: 'refund' 
  },
  { 
    id: '3', 
    title: 'Подарок от заведения', 
    description: 'Извините за ожидание!',
    date: '18 окт 19:30', 
    amount: 0, 
    cashback: 200, 
    type: 'admin_bonus' 
  },
  { 
    id: '2', 
    title: 'День рождения', 
    description: 'Поздравляем с праздником!',
    date: '15 окт 09:00', 
    amount: 0, 
    cashback: 1000, 
    type: 'birthday' 
  },
  { 
    id: '1', 
    title: 'Регистрация в программе', 
    description: 'Приветственный бонус',
    date: '01 сен 10:00', 
    amount: 0, 
    cashback: 100, 
    type: 'signup' 
  },
];

export const MOCK_USER: User = {
  id: 'u123',
  name: 'Александр Петров',
  balance: 1452,
  currentLevel: UserLevel.SILVER,
  totalSpent: 24500,
  cashbackPercent: 5,
  transactions: MOCK_TRANSACTIONS,
  notificationConsent: true
};

export const PROMOS: Promo[] = [
  // --- БОНУСЫ ЗА УЧАСТИЕ (С ГРАДИЕНТАМИ) ---
  
  // 1. Фиолетовый
  { 
    id: 'bonus_loyal', 
    type: 'bonus', 
    title: 'Спасибо, что вы с нами', 
    bonusAmount: 500,
    color: 'from-violet-600 to-indigo-600',
    duration: 'бессрочно'
  },
  // 2. Желтый/Золотой (НОВЫЙ)
  { 
    id: 'bonus_sun', 
    type: 'bonus', 
    title: 'Солнечный бонус', 
    bonusAmount: 200,
    color: 'from-yellow-500 to-amber-500', 
    duration: 'до конца дня'
  },
  // 3. Лаймовый/Зеленый (НОВЫЙ)
  { 
    id: 'bonus_lime', 
    type: 'bonus', 
    title: 'Энергия свежести', 
    bonusAmount: 150,
    color: 'from-lime-500 to-green-600',
    duration: '1 час'
  },
  // 4. Ярко-красный (НОВЫЙ)
  { 
    id: 'bonus_fire', 
    type: 'bonus', 
    title: 'Огненное предложение', 
    bonusAmount: 333,
    color: 'from-red-500 to-rose-600',
    duration: 'горячее'
  },
  // 5. Розовый
  { 
    id: 'bonus_holiday', 
    type: 'bonus', 
    title: 'В честь открытия', 
    bonusAmount: 300,
    color: 'from-rose-500 to-pink-600',
    duration: 'до 10 ноября'
  },
  // 6. Оранжевый
  { 
    id: 'bonus_rainy', 
    type: 'bonus', 
    title: 'Согревающий бонус', 
    bonusAmount: 150,
    color: 'from-amber-500 to-orange-600',
    duration: '24 часа'
  },
  // 7. Изумрудный/Бирюзовый
  { 
    id: 'bonus_weekend', 
    type: 'bonus', 
    title: 'Пятничное настроение', 
    bonusAmount: 250,
    color: 'from-emerald-500 to-teal-600',
    duration: 'только в пятницу'
  },
  // 8. Черный/Графитовый (НОВЫЙ)
  { 
    id: 'bonus_secret', 
    type: 'bonus', 
    title: 'Секретная награда', 
    bonusAmount: 1000,
    color: 'from-gray-800 to-black',
    duration: 'до активации'
  },
  // 9. Голубой/Циан
  { 
    id: 'bonus_morning', 
    type: 'bonus', 
    title: 'Бодрое утро', 
    bonusAmount: 100,
    color: 'from-cyan-500 to-blue-600',
    duration: 'до 12:00'
  },
  // 10. Глубокий синий (НОВЫЙ)
  { 
    id: 'bonus_deep', 
    type: 'bonus', 
    title: 'Магия вечера', 
    bonusAmount: 450,
    color: 'from-blue-700 to-indigo-900',
    duration: 'вечер'
  },
  // 11. Фуксия
  { 
    id: 'bonus_sweet', 
    type: 'bonus', 
    title: 'Сладкая жизнь', 
    bonusAmount: 200,
    color: 'from-fuchsia-500 to-purple-600',
    duration: 'выходные'
  },
  // 12. Мятный (НОВЫЙ)
  { 
    id: 'bonus_mint', 
    type: 'bonus', 
    title: 'Мятная прохлада', 
    bonusAmount: 120,
    color: 'from-teal-400 to-cyan-500',
    duration: 'лето'
  },
  // 13. Оранжево-Красный
  { 
    id: 'bonus_hot', 
    type: 'bonus', 
    title: 'Жаркий полдень', 
    bonusAmount: 400,
    color: 'from-orange-500 to-red-600',
    duration: '2 часа'
  },
  // 14. Индиго
  { 
    id: 'bonus_night', 
    type: 'bonus', 
    title: 'Вечерний вайб', 
    bonusAmount: 300,
    color: 'from-indigo-500 to-violet-600',
    duration: 'после 20:00'
  },
  
  // --- ТОВАРЫ И ПРЕДЛОЖЕНИЯ ---

  // Тип 2: Товар со скидкой
  { 
    id: '3', 
    type: 'discount', 
    title: 'Круассан',
    description: 'Свежий, хрустящий, с нежным сливочным маслом.',
    price: 290,
    oldPrice: 450,
    color: 'bg-amber-100',
    duration: 'до 15 ноября'
  },

  // Тип 3: Множитель баллов
  { 
    id: '4', 
    type: 'multiplier', 
    title: 'Сезонное меню',
    description: 'Получайте в два раза больше баллов при заказе из осеннего меню.',
    multiplier: 2,
    color: 'bg-orange-100',
    duration: 'до 30 ноября'
  },

  // Тип 4: Комплект (2+1)
  { 
    id: '5', 
    type: 'bundle', 
    title: 'Пончики с начинкой',
    description: 'Платите за два, получайте три!',
    bundleLabel: '2 + 1',
    price: 300,
    color: 'bg-pink-100',
    duration: 'до конца недели'
  },

  // Тип 5: Повышенный % кэшбэка
  {
    id: '6',
    type: 'cashback',
    title: 'Чизкейк Нью-Йорк',
    description: 'Классический вкус.',
    cashbackPercent: 25,
    color: 'bg-emerald-100',
    duration: 'сегодня до 21:00'
  },

  // Тип 6: Фиксированные баллы за товар
  {
    id: '7',
    type: 'fixed_bonus',
    title: 'Фирменный Бургер',
    description: 'Сочная котлета из мраморной говядины.',
    bonusAmount: 350,
    color: 'bg-yellow-100',
    duration: 'до 1 декабря'
  }
];
