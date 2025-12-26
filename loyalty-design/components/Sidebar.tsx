import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, 
  BarChart3, 
  Users, 
  MessageSquare, 
  ShoppingBag, 
  Heart,
  Clock,
  UserCircle2,
  RefreshCcw,
  TrendingUp,
  Target,
  Store,
  BadgeCheck,
  Share2,
  Sliders,
  Tag,
  Coins,
  ClipboardList,
  Bell,
  Send,
  Ticket,
  Award,
  ShieldAlert,
  MonitorSmartphone,
  Filter,
  UserCog,
  Shield,
  Link2,
  Globe,
  Upload,
  ChevronDown,
  ChevronRight,
  Layers,
  Cake,
  RefreshCw
} from 'lucide-react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const menuGroups = useMemo(() => [
    {
      title: 'МАСТЕР',
      id: 'master_group',
      items: [
        { label: 'Основные настройки', icon: <Settings size={18} />, id: 'settings' }
      ]
    },
    {
      title: 'АНАЛИТИКА',
      id: 'analytics_group',
      items: [
        { label: 'Сводный отчет', icon: <BarChart3 size={18} />, id: 'summary' },
        { label: 'По времени', icon: <Clock size={18} />, id: 'by_time' },
        { label: 'Портрет клиента', icon: <UserCircle2 size={18} />, id: 'portrait' },
        { label: 'Повторные продажи', icon: <RefreshCcw size={18} />, id: 'repeat' },
        { label: 'Динамика', icon: <TrendingUp size={18} />, id: 'dynamics' },
        { label: 'RFM Анализ', icon: <Target size={18} />, id: 'rfm' },
        { label: 'Активность точек', icon: <Store size={18} />, id: 'outlet' },
        { label: 'Активность персонала', icon: <BadgeCheck size={18} />, id: 'staff' },
        { label: 'Реферальная программа', icon: <Share2 size={18} />, id: 'referral' },
        { label: 'Дни рождения', icon: <Cake size={18} />, id: 'birthday_stats' },
        { label: 'Автовозврат клиентов', icon: <RefreshCw size={18} />, id: 'autoreturn_stats' },
      ]
    },
    {
      title: 'ПРОГРАММА ЛОЯЛЬНОСТИ',
      id: 'loyalty_group',
      items: [
        { label: 'Механики', icon: <Sliders size={18} />, id: 'loyalty_mechanics' },
        { label: 'Акции с товарами', icon: <Tag size={18} />, id: 'promotions' },
        { label: 'Акции с баллами', icon: <Coins size={18} />, id: 'points_promotions' },
        { label: 'Промокоды', icon: <Ticket size={18} />, id: 'promocodes' },
        { label: 'Мотивация персонала', icon: <Award size={18} />, id: 'staff_motivation' },
        { label: 'Панель кассира', icon: <MonitorSmartphone size={18} />, id: 'cashier_panel' },
        { label: 'Защита от мошенничества', icon: <ShieldAlert size={18} />, id: 'fraud_protection' },
        { label: 'Журнал операций', icon: <ClipboardList size={18} />, id: 'operations_log' },
        { label: 'Push-рассылки', icon: <Bell size={18} />, id: 'push_notifications' },
        { label: 'Telegram-рассылки', icon: <Send size={18} />, id: 'telegram_newsletters' }
      ]
    },
    {
      title: 'ОБРАТНАЯ СВЯЗЬ',
      id: 'feedback_group',
      items: [{ label: 'Отзывы', icon: <MessageSquare size={18} />, id: 'reviews' }]
    },
    {
      title: 'КЛИЕНТЫ И АУДИТОРИИ',
      id: 'clients_group',
      items: [
        { label: 'Клиенты', icon: <Users size={18} />, id: 'clients' },
        { label: 'Аудитории', icon: <Filter size={18} />, id: 'audiences' }
      ]
    },
    {
      title: 'ТОВАРЫ И КАТЕГОРИИ',
      id: 'goods_group',
      items: [
        { label: 'Товары', icon: <ShoppingBag size={18} />, id: 'goods_list' },
        { label: 'Категории', icon: <Layers size={18} />, id: 'categories_list' }
      ]
    },
    {
      title: 'НАСТРОЙКИ',
      id: 'settings_group',
      items: [
        { label: 'Системные настройки', icon: <Globe size={18} />, id: 'settings_system' },
        { label: 'Торговые точки', icon: <Store size={18} />, id: 'outlets' },
        { label: 'Сотрудники', icon: <UserCog size={18} />, id: 'settings_staff' },
        { label: 'Группы доступа', icon: <Shield size={18} />, id: 'settings_access_groups' },
        { label: 'Уведомления в Telegram', icon: <Send size={18} />, id: 'settings_telegram' },
        { label: 'Интеграции', icon: <Link2 size={18} />, id: 'settings_integrations' }
      ]
    },
    {
      title: 'ИНСТРУМЕНТЫ',
      id: 'tools_group',
      items: [{ label: 'Импорт данных', icon: <Upload size={18} />, id: 'tools_import' }]
    }
  ], []);

  // Effect to automatically open the section of the current view
  useEffect(() => {
    const activeGroup = menuGroups.find(group => 
      group.items.some(item => item.id === currentView)
    );
    
    if (activeGroup) {
      setExpandedSections(prev => {
        if (!prev.includes(activeGroup.title)) {
          return [...prev, activeGroup.title];
        }
        return prev;
      });
    }
  }, [currentView, menuGroups]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title) 
        : [...prev, title]
    );
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 h-screen flex flex-col flex-shrink-0 sticky top-0 overflow-y-auto custom-scrollbar">
      <div className="p-6 flex items-center space-x-2">
        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">L</div>
        <div>
          <h1 className="font-bold text-gray-800 text-lg leading-tight">Loyalty</h1>
          <span className="text-xs text-gray-500 uppercase tracking-widest">Business</span>
        </div>
      </div>

      <nav className="flex-1 px-4 pb-6 space-y-2">
        {menuGroups.map((group) => {
          const isExpanded = expandedSections.includes(group.title);
          const isActiveGroup = group.items.some(i => i.id === currentView);

          return (
            <div key={group.id} className="border-b border-gray-50 last:border-0 pb-2">
              <button
                onClick={() => toggleSection(group.title)}
                className={`w-full flex items-center justify-between px-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${isActiveGroup ? 'text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span>{group.title}</span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              
              {isExpanded && (
                <ul className="space-y-1 mt-1 animate-fade-in">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => onNavigate(item.id as AppView)}
                        className={`w-full flex items-center space-x-3 px-2 py-2 rounded-lg text-sm transition-colors duration-200 text-left
                          ${currentView === item.id 
                            ? 'bg-purple-50 text-purple-700 font-medium' 
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                      >
                        {item.icon ? (
                          <span className={`flex-shrink-0 ${currentView === item.id ? 'text-purple-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                            {item.icon}
                          </span>
                        ) : (
                          <span className="w-[18px] flex-shrink-0"></span> // Spacer for indentation
                        )}
                        <span className="leading-tight">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default Sidebar;