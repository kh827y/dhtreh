import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, LogOut, Crown, Clock, ChevronRight, 
  BarChart3, Users, Settings, Calculator, Gift, 
  PieChart, Grid, CreditCard, Coins, RefreshCw, 
  Cake, Hourglass, Share2, Bell, Shield, Key, 
  Globe, Code, Smartphone, MessageSquare, MapPin,
  TrendingUp, UserPlus, ShoppingBag, Lock,
  UserCircle2, RefreshCcw, Target, BadgeCheck, Sliders,
  Tag, Ticket, Award, MonitorSmartphone, ShieldAlert,
  Link2, Upload, Activity, List, Trophy, Ban, Layers, UserCog,
  ClipboardList
} from 'lucide-react';
import { AppView } from '../types';

interface HeaderProps {
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
}

interface SearchResult {
  label: string;
  type: 'Раздел' | 'Настройка' | 'Инструмент' | 'График' | 'KPI' | 'Таблица' | 'Интеграция';
  view: AppView;
  icon: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ onNavigate, onLogout }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Search Index - Strictly matched to Sidebar and Page Titles
  const searchIndex: SearchResult[] = [
    // --- SIDEBAR: MASTER ---
    { label: 'Основные настройки', type: 'Раздел', view: 'settings', icon: <Settings size={14} /> },

    // --- SIDEBAR: ANALYTICS ---
    { label: 'Сводный отчет', type: 'Раздел', view: 'summary', icon: <BarChart3 size={14} /> },
    { label: 'По времени', type: 'Раздел', view: 'by_time', icon: <Clock size={14} /> },
    { label: 'Портрет клиента', type: 'Раздел', view: 'portrait', icon: <UserCircle2 size={14} /> },
    { label: 'Повторные продажи', type: 'Раздел', view: 'repeat', icon: <RefreshCcw size={14} /> },
    { label: 'Динамика', type: 'Раздел', view: 'dynamics', icon: <TrendingUp size={14} /> },
    { label: 'RFM Анализ', type: 'Раздел', view: 'rfm', icon: <Target size={14} /> },
    { label: 'Активность точек', type: 'Раздел', view: 'outlet', icon: <StoreIcon size={14} /> },
    { label: 'Активность персонала', type: 'Раздел', view: 'staff', icon: <BadgeCheck size={14} /> },
    { label: 'Реферальная программа', type: 'Раздел', view: 'referral', icon: <Share2 size={14} /> },
    { label: 'Дни рождения', type: 'Раздел', view: 'birthday_stats', icon: <Cake size={14} /> },
    { label: 'Автовозврат клиентов', type: 'Раздел', view: 'autoreturn_stats', icon: <RefreshCw size={14} /> },

    // --- SIDEBAR: LOYALTY ---
    { label: 'Механики', type: 'Раздел', view: 'loyalty_mechanics', icon: <Sliders size={14} /> },
    { label: 'Акции с товарами', type: 'Раздел', view: 'promotions', icon: <Tag size={14} /> },
    { label: 'Акции с баллами', type: 'Раздел', view: 'points_promotions', icon: <Coins size={14} /> },
    { label: 'Промокоды', type: 'Раздел', view: 'promocodes', icon: <Ticket size={14} /> },
    { label: 'Мотивация персонала', type: 'Раздел', view: 'staff_motivation', icon: <Award size={14} /> },
    { label: 'Панель кассира', type: 'Раздел', view: 'cashier_panel', icon: <MonitorSmartphone size={14} /> },
    { label: 'Защита от мошенничества', type: 'Раздел', view: 'fraud_protection', icon: <ShieldAlert size={14} /> },
    { label: 'Журнал операций', type: 'Раздел', view: 'operations_log', icon: <ClipboardList size={14} /> },
    { label: 'Push-рассылки', type: 'Раздел', view: 'push_notifications', icon: <Bell size={14} /> },
    { label: 'Telegram-рассылки', type: 'Раздел', view: 'telegram_newsletters', icon: <SendIcon size={14} /> },

    // --- SIDEBAR: FEEDBACK ---
    { label: 'Отзывы', type: 'Раздел', view: 'reviews', icon: <MessageSquare size={14} /> },

    // --- SIDEBAR: CLIENTS ---
    { label: 'Клиенты', type: 'Раздел', view: 'clients', icon: <Users size={14} /> },
    { label: 'Аудитории', type: 'Раздел', view: 'audiences', icon: <FilterIcon size={14} /> },

    // --- SIDEBAR: GOODS ---
    { label: 'Товары', type: 'Раздел', view: 'goods_list', icon: <ShoppingBag size={14} /> },
    { label: 'Категории', type: 'Раздел', view: 'categories_list', icon: <Layers size={14} /> },

    // --- SIDEBAR: SETTINGS ---
    { label: 'Системные настройки', type: 'Раздел', view: 'settings_system', icon: <Globe size={14} /> },
    { label: 'Торговые точки', type: 'Раздел', view: 'outlets', icon: <MapPin size={14} /> },
    { label: 'Сотрудники', type: 'Раздел', view: 'settings_staff', icon: <UserCog size={14} /> },
    { label: 'Группы доступа', type: 'Раздел', view: 'settings_access_groups', icon: <Shield size={14} /> },
    { label: 'Уведомления в Telegram', type: 'Раздел', view: 'settings_telegram', icon: <SendIcon size={14} /> },
    { label: 'Интеграции', type: 'Раздел', view: 'settings_integrations', icon: <Link2 size={14} /> },

    // --- SIDEBAR: TOOLS ---
    { label: 'Импорт данных', type: 'Раздел', view: 'tools_import', icon: <Upload size={14} /> },

    // --- INNER CONTENT BLOCKS (Contextual Search) ---
    
    // Dashboard
    { label: 'Выручка (KPI)', type: 'KPI', view: 'summary', icon: <CreditCard size={14} /> },
    { label: 'Регистрации (KPI)', type: 'KPI', view: 'summary', icon: <UserPlus size={14} /> },
    { label: 'Средний чек (KPI)', type: 'KPI', view: 'summary', icon: <TrendingUp size={14} /> },
    { label: 'Списано баллов (KPI)', type: 'KPI', view: 'summary', icon: <Coins size={14} /> },
    { label: 'Динамика выручки', type: 'График', view: 'summary', icon: <BarChart3 size={14} /> },
    { label: 'Структура продаж', type: 'График', view: 'summary', icon: <PieChart size={14} /> },
    { label: 'Покупок на клиента', type: 'KPI', view: 'summary', icon: <ShoppingBag size={14} /> },
    { label: 'Частота визитов', type: 'KPI', view: 'summary', icon: <Clock size={14} /> },
    { label: 'Активная база', type: 'KPI', view: 'summary', icon: <Activity size={14} /> },

    // By Time
    { label: 'Время с последней покупки', type: 'График', view: 'by_time', icon: <Clock size={14} /> },
    { label: 'Активность клиентов', type: 'График', view: 'by_time', icon: <BarChart3 size={14} /> },
    { label: 'Тепловая карта', type: 'График', view: 'by_time', icon: <Grid size={14} /> },

    // Portrait
    { label: 'Распределение по полу', type: 'График', view: 'portrait', icon: <PieChart size={14} /> },
    { label: 'Сравнение по полу', type: 'График', view: 'portrait', icon: <BarChart3 size={14} /> },
    { label: 'Аналитика по возрасту', type: 'График', view: 'portrait', icon: <BarChart3 size={14} /> },
    { label: 'Детальная демография', type: 'График', view: 'portrait', icon: <Users size={14} /> },

    // Repeat Sales
    { label: 'Частота покупок', type: 'График', view: 'repeat', icon: <BarChart3 size={14} /> },
    { label: 'Уникальные покупатели', type: 'KPI', view: 'repeat', icon: <Users size={14} /> },

    // Dynamics
    { label: 'Динамика среднего чека', type: 'График', view: 'dynamics', icon: <TrendingUp size={14} /> },
    { label: 'Экономика баллов', type: 'График', view: 'dynamics', icon: <Coins size={14} /> },
    { label: 'Движение баллов', type: 'График', view: 'dynamics', icon: <BarChart3 size={14} /> },

    // RFM
    { label: 'Распределение RFM групп', type: 'График', view: 'rfm', icon: <Grid size={14} /> },
    { label: 'Детальные комбинации', type: 'Таблица', view: 'rfm', icon: <List size={14} /> },

    // Outlets
    { label: 'Лидер по выручке', type: 'KPI', view: 'outlet', icon: <Trophy size={14} /> },
    { label: 'Лидер роста', type: 'KPI', view: 'outlet', icon: <TrendingUp size={14} /> },
    { label: 'Макс. трафик', type: 'KPI', view: 'outlet', icon: <StoreIcon size={14} /> },
    { label: 'Эффективность точек', type: 'Таблица', view: 'outlet', icon: <List size={14} /> },

    // Staff
    { label: 'Лучший сотрудник', type: 'KPI', view: 'staff', icon: <Award size={14} /> },
    { label: 'Лучший продавец', type: 'KPI', view: 'staff', icon: <BadgeCheck size={14} /> },
    { label: 'Лидер привлечения', type: 'KPI', view: 'staff', icon: <UserPlus size={14} /> },
    { label: 'Детальная эффективность', type: 'Таблица', view: 'staff', icon: <List size={14} /> },

    // Referral
    { label: 'Динамика привлечения', type: 'График', view: 'referral', icon: <TrendingUp size={14} /> },
    { label: 'Топ амбассадоров', type: 'Таблица', view: 'referral', icon: <Crown size={14} /> },

    // Mechanics Settings (Deep links)
    { label: 'Уровни клиентов', type: 'Настройка', view: 'loyalty_levels', icon: <Trophy size={14} /> },
    { label: 'Настройки бонусов', type: 'Настройка', view: 'loyalty_limitations', icon: <Ban size={14} /> },
    { label: 'Настройки автовозврата', type: 'Настройка', view: 'autoreturn', icon: <RefreshCw size={14} /> },
    { label: 'Настройки поздравлений', type: 'Настройка', view: 'birthday', icon: <Cake size={14} /> },
    { label: 'Настройки регистрации', type: 'Настройка', view: 'registration_points', icon: <UserPlus size={14} /> },
    { label: 'Настройки сгорания', type: 'Настройка', view: 'expiration_reminder', icon: <Hourglass size={14} /> },
    { label: 'Настройки реферальной', type: 'Настройка', view: 'referral_settings', icon: <Share2 size={14} /> },

    // Integrations
    { label: 'REST API', type: 'Интеграция', view: 'integration_rest_api', icon: <Code size={14} /> },
    { label: 'Telegram Miniapp', type: 'Интеграция', view: 'integration_telegram_miniapp', icon: <Smartphone size={14} /> },
  ];

  // Handle Search Input
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const results = searchIndex.filter(item => 
      item.label.toLowerCase().includes(lowerQuery)
    );
    setSearchResults(results);
  }, [searchQuery]);

  // Click outside to close search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (view: AppView) => {
    onNavigate(view);
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 sticky top-0 z-20">
      {/* Search Bar */}
      <div className="flex items-center w-96 relative" ref={searchRef}>
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-100 rounded-lg leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:bg-white sm:text-sm transition-colors"
            placeholder="Поиск раздела, графика или настройки..."
          />
        </div>

        {/* Search Results Dropdown */}
        {isSearchFocused && searchQuery && (
          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-96 overflow-y-auto animate-fade-in z-50">
            {searchResults.length > 0 ? (
              <div className="py-2">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between">
                  <span>Результаты поиска</span>
                  <span>{searchResults.length}</span>
                </div>
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => handleResultClick(result.view)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between group transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded transition-colors ${
                        result.type === 'Раздел' ? 'bg-purple-100 text-purple-600' :
                        result.type === 'Настройка' ? 'bg-gray-100 text-gray-600' :
                        result.type === 'График' ? 'bg-blue-50 text-blue-600' :
                        result.type === 'KPI' ? 'bg-green-50 text-green-600' :
                        result.type === 'Интеграция' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {result.icon}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-700">{result.label}</div>
                        <div className="text-xs text-gray-500">{result.type}</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-purple-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Ничего не найдено</p>
                <p className="text-xs text-gray-400 mt-1">Попробуйте изменить запрос</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-4">
        
        {/* Subscription Info */}
        <div className="hidden md:flex items-center bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
            <div className="flex items-center space-x-1.5 mr-3 border-r border-purple-200 pr-3">
                <Crown size={14} className="text-purple-600 fill-current" />
                <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">Full</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-purple-700 font-medium" title="До окончания подписки">
                <Clock size={14} />
                <span>24 дня</span>
            </div>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="flex items-center space-x-2 text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors group"
          title="Выйти из аккаунта"
        >
          <LogOut size={20} className="group-hover:stroke-red-600" />
          <span className="text-sm font-medium hidden lg:inline">Выйти</span>
        </button>
      </div>
    </header>
  );
};

// Helper Icons for the Search Index
const StoreIcon = ({ size }: { size: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>;
const SendIcon = ({ size }: { size: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>;
const FilterIcon = ({ size }: { size: number }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;

export default Header;