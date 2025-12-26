import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Power, 
  Info, 
  Calendar, 
  Coins, 
  ShoppingBag,
  ArrowLeft,
  Save,
  Users,
  Flame,
  ShieldCheck,
  Pencil,
  Bell,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { AppView } from '../types';

// --- Types ---

type PromotionStatus = 'active' | 'disabled' | 'ended';

interface PointsPromotion {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  
  // Logic
  accruePoints: boolean;
  pointsAmount: number;
  isBurning: boolean; // Burn after promo ends?
  audience: string; // ID
  
  // Comms
  pushAtStart: boolean;
  pushStartText?: string;
  pushBeforeEnd: boolean;
  pushEndText?: string;

  // Stats
  revenue: number;
  cost: number;
}

interface PointsPromotionsProps {
  onNavigate?: (view: AppView) => void;
}

// --- Helpers ---
const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

const PointsPromotions: React.FC<PointsPromotionsProps> = ({ onNavigate }) => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [activeTab, setActiveTab] = useState<PromotionStatus>('active');
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Mock Data ---
  const mockAudiences = [
    { id: 'all', name: 'Все клиенты' },
    { id: 'new', name: 'Новые клиенты (регистрация < 30 дней)' },
    { id: 'vip', name: 'Золотой статус (VIP)' },
    { id: 'churn', name: 'Риск оттока' },
    { id: 'dormant', name: 'Спящие (нет покупок 90 дней)' }
  ];

  const [promotions, setPromotions] = useState<PointsPromotion[]>([
    {
      id: '1',
      title: 'Приветственные 500 бонусов',
      startDate: '01.01.2024',
      endDate: 'Бессрочно',
      status: 'active',
      accruePoints: true,
      pointsAmount: 500,
      isBurning: true,
      audience: 'new',
      pushAtStart: true,
      pushStartText: 'Привет! {name} уже началась. Вам начислено {bonus} бонусов!',
      pushBeforeEnd: false,
      revenue: 850000,
      cost: 42500,
    },
    {
      id: '2',
      title: 'Бонус за заполнение профиля',
      startDate: '15.01.2024',
      endDate: 'Бессрочно',
      status: 'active',
      accruePoints: true,
      pointsAmount: 100,
      isBurning: false,
      audience: 'all',
      pushAtStart: false,
      pushBeforeEnd: false,
      revenue: 340000,
      cost: 34000, 
    },
    {
      id: '3',
      title: 'Бонусы за отзыв',
      startDate: '01.11.2023',
      endDate: 'Бессрочно',
      status: 'disabled',
      accruePoints: true,
      pointsAmount: 300,
      isBurning: true,
      audience: 'all',
      pushAtStart: true,
      pushStartText: 'Спасибо за отзыв! Ловите {bonus} бонусов на счет.',
      pushBeforeEnd: false,
      revenue: 320000,
      cost: 15000,
    },
    {
      id: '4',
      title: 'Новогодний подарок VIP',
      startDate: '20.12.2023',
      endDate: '31.12.2023',
      status: 'ended',
      accruePoints: true,
      pointsAmount: 1000,
      isBurning: true,
      audience: 'vip',
      pushAtStart: true,
      pushStartText: 'С Новым Годом, {client}! Вам подарок: {bonus} бонусов.',
      pushBeforeEnd: true,
      pushEndText: 'Акция {name} скоро закончится. Успейте потратить бонусы!',
      revenue: 2500000,
      cost: 200000,
    }
  ]);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    isActive: false,
    startImmediately: true,
    startDate: new Date().toISOString().split('T')[0],
    isIndefinite: false,
    endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    audience: 'all',
    accruePoints: true,
    pointsAmount: 100,
    isBurning: false,
    pushAtStart: false,
    pushStartText: '',
    pushBeforeEnd: false,
    pushEndText: ''
  });

  // --- Handlers ---

  const handleDelete = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить эту акцию?')) {
      setPromotions(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleToggleStatus = (id: string, currentStatus: PromotionStatus) => {
    if (currentStatus === 'ended') return;
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const startCreation = () => {
    setEditingId(null);
    setFormData({
      title: '',
      isActive: false, // Default draft
      startImmediately: true,
      startDate: new Date().toISOString().split('T')[0],
      isIndefinite: false,
      endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      audience: 'all',
      accruePoints: true,
      pointsAmount: 100,
      isBurning: false,
      pushAtStart: false,
      pushStartText: 'Мы запустили акцию {name}! Вам доступно к получению {bonus} бонусов.',
      pushBeforeEnd: false,
      pushEndText: 'Акция {name} заканчивается через 2 дня! Не упустите выгоду.'
    });
    setView('create');
  };

  const handleEdit = (promo: PointsPromotion) => {
    setEditingId(promo.id);
    
    // Parse helper
    const parseDate = (dateStr: string) => {
       if (dateStr === 'Бессрочно' || dateStr.includes('Бессрочно')) return new Date().toISOString().split('T')[0];
       const parts = dateStr.split('.');
       if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
       return new Date().toISOString().split('T')[0];
    };

    const isIndefinite = promo.endDate === 'Бессрочно';

    setFormData({
      title: promo.title,
      isActive: promo.status === 'active',
      startImmediately: false, // For editing, we usually show the date
      startDate: parseDate(promo.startDate),
      isIndefinite: isIndefinite,
      endDate: parseDate(promo.endDate),
      audience: promo.audience,
      accruePoints: promo.accruePoints,
      pointsAmount: promo.pointsAmount,
      isBurning: promo.isBurning,
      pushAtStart: promo.pushAtStart,
      pushStartText: promo.pushStartText || '',
      pushBeforeEnd: promo.pushBeforeEnd,
      pushEndText: promo.pushEndText || ''
    });
    setView('create');
  };

  const handleSave = () => {
    if (!formData.title) {
        alert("Введите название акции");
        return;
    }

    const startDateStr = formData.startImmediately 
        ? new Date().toLocaleDateString('ru-RU') 
        : new Date(formData.startDate).toLocaleDateString('ru-RU');
    
    const endDateStr = formData.isIndefinite 
        ? 'Бессрочно' 
        : new Date(formData.endDate).toLocaleDateString('ru-RU');

    const newPromo: PointsPromotion = {
        id: editingId || Date.now().toString(),
        title: formData.title,
        startDate: startDateStr,
        endDate: endDateStr,
        status: formData.isActive ? 'active' : 'disabled',
        accruePoints: formData.accruePoints,
        pointsAmount: formData.accruePoints ? formData.pointsAmount : 0,
        isBurning: formData.accruePoints ? formData.isBurning : false,
        audience: formData.audience,
        pushAtStart: formData.pushAtStart,
        pushStartText: formData.pushStartText,
        pushBeforeEnd: formData.pushBeforeEnd,
        pushEndText: formData.pushEndText,
        revenue: editingId ? (promotions.find(p => p.id === editingId)?.revenue || 0) : 0,
        cost: editingId ? (promotions.find(p => p.id === editingId)?.cost || 0) : 0,
    };

    if (editingId) {
        setPromotions(prev => prev.map(p => p.id === editingId ? newPromo : p));
    } else {
        setPromotions(prev => [newPromo, ...prev]);
    }
    
    setView('list');
    setActiveTab(newPromo.status === 'active' ? 'active' : 'disabled');
  };

  const calculateROI = (revenue: number, cost: number) => {
     if (cost === 0) return 0;
     return (revenue / cost).toFixed(1);
  };

  const getAudienceName = (id: string) => {
      const a = mockAudiences.find(ma => ma.id === id);
      return a ? a.name : id;
  };

  const filteredPromotions = promotions.filter(p => p.status === activeTab);

  const PlaceholdersHint = () => (
      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2">
          <span>Доступные переменные:</span>
          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-help" title="Название акции">{'{name}'}</span>
          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-help" title="Имя клиента">{'{client}'}</span>
          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-help" title="Сумма баллов">{'{bonus}'}</span>
      </div>
  );

  // --- Views ---

  const renderCreateForm = () => (
    <div className="max-w-5xl mx-auto pb-10">
       {/* Header */}
       <div className="flex items-center justify-between mb-8">
           <div className="flex items-center space-x-4">
              <button 
                onClick={() => setView('list')}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                 <ArrowLeft size={24} />
              </button>
              <div>
                 <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование' : 'Создание акции'}</h2>
                 <p className="text-sm text-gray-500">{editingId ? 'Изменение параметров акции' : 'Настройка новой кампании'}</p>
              </div>
           </div>
           
           <div className="flex items-center space-x-4">
              {/* Draft/Active Toggle */}
              <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-lg border border-gray-200">
                 <span className={`text-sm font-medium ${formData.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {formData.isActive ? 'Активная' : 'Черновик'}
                 </span>
                 <button 
                   onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                   className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                 >
                   <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                 </button>
              </div>

              <button 
                  onClick={handleSave}
                  className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
               >
                  <Save size={18} />
                  <span>Сохранить</span>
               </button>
           </div>
       </div>
       
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Left Column: Main Config */}
           <div className="lg:col-span-2 space-y-6">
                
                {/* 1. Main Info */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                    <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Название акции</label>
                        <input 
                          type="text" 
                          placeholder="Например: Бонусы за регистрацию"
                          value={formData.title}
                          onChange={(e) => setFormData({...formData, title: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Start Date */}
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">Начало</label>
                           <div className="space-y-3">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={formData.startImmediately}
                                   onChange={(e) => setFormData({...formData, startImmediately: e.target.checked})}
                                   className="rounded text-purple-600 focus:ring-purple-500"
                                 />
                                 <span className="text-sm text-gray-900">Начать сразу</span>
                              </label>
                              
                              <div className={`relative ${formData.startImmediately ? 'opacity-50 pointer-events-none' : ''}`}>
                                  <input 
                                    type="date" 
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  />
                              </div>
                           </div>
                        </div>

                        {/* End Date */}
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">Завершение</label>
                           <div className="space-y-3">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={formData.isIndefinite}
                                   onChange={(e) => setFormData({...formData, isIndefinite: e.target.checked})}
                                   className="rounded text-purple-600 focus:ring-purple-500"
                                 />
                                 <span className="text-sm text-gray-900">Бессрочно</span>
                              </label>
                              
                              <div className={`relative ${formData.isIndefinite ? 'opacity-50 pointer-events-none' : ''}`}>
                                  <input 
                                    type="date" 
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  />
                              </div>
                           </div>
                        </div>
                    </div>
                </div>

                {/* 2. Rewards Configuration */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-900">Начисление баллов</h3>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.accruePoints}
                            onChange={(e) => setFormData({...formData, accruePoints: e.target.checked})}
                            className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                    </div>

                    {formData.accruePoints && (
                        <div className="animate-fade-in space-y-6">
                            <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Количество баллов</label>
                               <div className="relative w-full sm:w-1/2">
                                  <Coins size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                  <input 
                                    type="number" 
                                    value={formData.pointsAmount}
                                    onChange={(e) => setFormData({...formData, pointsAmount: Number(e.target.value)})}
                                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                  />
                               </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <span className="block text-sm font-medium text-gray-900 mb-2">Правила сгорания</span>
                                <div className="space-y-3">
                                   <label className="flex items-center space-x-3 cursor-pointer">
                                      <input 
                                        type="radio" 
                                        name="burning"
                                        checked={!formData.isBurning}
                                        onChange={() => setFormData({...formData, isBurning: false})}
                                        className="text-purple-600 focus:ring-purple-500"
                                      />
                                      <div className="flex items-center space-x-2 text-sm text-gray-700">
                                         <ShieldCheck size={16} className="text-green-600" />
                                         <span>Баллы не сгорают</span>
                                      </div>
                                   </label>

                                   <label className="flex items-center space-x-3 cursor-pointer">
                                      <input 
                                        type="radio" 
                                        name="burning"
                                        checked={formData.isBurning}
                                        onChange={() => setFormData({...formData, isBurning: true})}
                                        className="text-purple-600 focus:ring-purple-500"
                                      />
                                      <div className="flex items-center space-x-2 text-sm text-gray-700">
                                         <Flame size={16} className="text-orange-500" />
                                         <span>Сгорают после окончания акции</span>
                                      </div>
                                   </label>
                                </div>
                                <p className="text-xs text-gray-500 mt-3 ml-7">
                                   {formData.isBurning 
                                     ? 'Если акция завершится, неиспользованные баллы, начисленные в рамках этой акции, будут аннулированы.' 
                                     : 'Начисленные баллы останутся на счету клиента пока не будут потрачены.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

           </div>

           {/* Right Column: Audience & Comms */}
           <div className="space-y-6">
                
                {/* Audience */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg">
                           <Users size={20} className="text-gray-400" />
                           <h3>Аудитория</h3>
                        </div>
                        {onNavigate && (
                            <button 
                                title="Перейти к аудиториям" 
                                className="text-purple-600 hover:text-purple-800"
                                onClick={() => onNavigate('audiences')}
                            >
                                <ExternalLink size={16} />
                            </button>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Сегмент получателей</label>
                        <select 
                           value={formData.audience}
                           onChange={(e) => setFormData({...formData, audience: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                           {mockAudiences.map(a => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                           ))}
                        </select>
                    </div>
                </div>

                {/* Notifications */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg mb-2">
                       <Bell size={20} className="text-gray-400" />
                       <h3>Уведомления</h3>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-3">
                           <label className="flex items-start space-x-3 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={formData.pushAtStart}
                                onChange={(e) => setFormData({...formData, pushAtStart: e.target.checked})}
                                className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                              />
                              <div>
                                 <span className="block text-sm font-medium text-gray-900">PUSH при старте</span>
                                 <span className="text-xs text-gray-500">Отправить уведомление клиентам в момент начала акции.</span>
                              </div>
                           </label>
                           
                           {formData.pushAtStart && (
                              <div className="animate-fade-in pl-7">
                                  <div className="relative">
                                     <textarea 
                                        maxLength={300}
                                        value={formData.pushStartText}
                                        onChange={(e) => setFormData({...formData, pushStartText: e.target.value})}
                                        placeholder="Введите текст уведомления..."
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none min-h-[80px] resize-y"
                                     />
                                     <span className="absolute bottom-2 right-2 text-xs text-gray-400 pointer-events-none">
                                        {formData.pushStartText.length}/300
                                     </span>
                                  </div>
                                  <PlaceholdersHint />
                              </div>
                           )}
                        </div>

                        <div className={`pt-4 border-t border-gray-100 ${formData.isIndefinite ? 'opacity-50 pointer-events-none' : ''}`}>
                            <label className="flex items-start space-x-3 cursor-pointer">
                               <input 
                                 type="checkbox" 
                                 checked={formData.pushBeforeEnd}
                                 onChange={(e) => setFormData({...formData, pushBeforeEnd: e.target.checked})}
                                 className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                               />
                               <div>
                                  <span className="block text-sm font-medium text-gray-900">Напомнить об окончании</span>
                                  <span className="text-xs text-gray-500">Отправить PUSH за 2 дня до завершения акции.</span>
                               </div>
                            </label>

                            {formData.pushBeforeEnd && !formData.isIndefinite && (
                              <div className="animate-fade-in pl-7 mt-3">
                                  <div className="relative">
                                     <textarea 
                                        maxLength={300}
                                        value={formData.pushEndText}
                                        onChange={(e) => setFormData({...formData, pushEndText: e.target.value})}
                                        placeholder="Введите текст напоминания..."
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none min-h-[80px] resize-y"
                                     />
                                     <span className="absolute bottom-2 right-2 text-xs text-gray-400 pointer-events-none">
                                        {formData.pushEndText.length}/300
                                     </span>
                                  </div>
                                  <PlaceholdersHint />
                              </div>
                           )}

                            {formData.isIndefinite && (
                                <p className="text-xs text-amber-600 mt-2 flex items-center">
                                   <AlertCircle size={12} className="mr-1"/> 
                                   Недоступно для бессрочных акций
                                </p>
                            )}
                        </div>
                    </div>
                </div>

           </div>
       </div>
    </div>
  );

  if (view === 'create') {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
        {renderCreateForm()}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Акции с начислением баллов</h2>
           <p className="text-gray-500 mt-1">Управление бонусными кампаниями и начислениями.</p>
        </div>
        
        <button 
          onClick={startCreation}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать акцию</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['active', 'disabled', 'ended'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              {tab === 'active' && 'Активные'}
              {tab === 'disabled' && 'Выключенные'}
              {tab === 'ended' && 'Прошедшие'}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === tab ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {promotions.filter(p => p.status === tab).length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* List */}
      {filteredPromotions.length === 0 ? (
         <div className="text-center py-20 bg-white rounded-xl border border-gray-100 border-dashed">
            <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Здесь пока ничего нет</h3>
            <p className="text-gray-500">В этом разделе пока нет акций с начислением баллов.</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredPromotions.map((promo) => {
            const revPerBonus = calculateROI(promo.revenue, promo.cost);
            return (
              <div key={promo.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative group">
                
                {/* Header: Title, Dates, Actions */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 pr-4">
                     <h3 className="text-lg font-bold text-gray-900 mb-2">{promo.title}</h3>
                     <div className="flex items-center text-sm text-gray-400">
                        <Calendar size={14} className="mr-1.5" />
                        {promo.startDate} - {promo.endDate}
                     </div>
                  </div>

                  <div className="flex items-center space-x-2">
                     <button 
                       onClick={() => handleEdit(promo)} 
                       title="Редактировать"
                       className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                     >
                        <Pencil size={18} />
                     </button>
                     {promo.status !== 'ended' && (
                       <button 
                         onClick={() => handleToggleStatus(promo.id, promo.status)}
                         title={promo.status === 'active' ? 'Выключить' : 'Включить'}
                         className={`p-2 rounded-lg transition-colors ${promo.status === 'active' ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'}`}
                       >
                          <Power size={18} />
                       </button>
                     )}
                     <button 
                       onClick={() => handleDelete(promo.id)}
                       title="Удалить"
                       className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                     >
                        <Trash2 size={18} />
                     </button>
                  </div>
                </div>

                {/* Configuration Badges */}
                <div className="flex flex-wrap gap-3 mb-6">
                   {/* Points Value & Type */}
                   {promo.accruePoints ? (
                       <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border ${promo.isBurning ? 'bg-orange-50 border-orange-100 text-orange-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                          {promo.isBurning ? <Flame size={16} /> : <ShieldCheck size={16} />}
                          <span className="font-bold">
                            +{promo.pointsAmount} Б
                          </span>
                          {promo.isBurning ? (
                             <span className="text-xs border-l border-orange-200 pl-2 ml-1 opacity-80">
                                Сгораемые
                             </span>
                          ) : (
                             <span className="text-xs border-l border-blue-200 pl-2 ml-1 opacity-80">
                                Не сгорают
                             </span>
                          )}
                       </div>
                   ) : (
                       <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-500">
                          <Coins size={16} />
                          <span className="text-xs font-medium">Без баллов</span>
                       </div>
                   )}

                   {/* Audience */}
                   <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-600">
                      <Users size={16} />
                      <span className="text-sm font-medium">{getAudienceName(promo.audience)}</span>
                   </div>

                   {/* Push Badges */}
                   {(promo.pushAtStart || promo.pushBeforeEnd) && (
                       <div className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-100 text-purple-600">
                          <Bell size={16} />
                          <span className="text-xs font-bold">PUSH</span>
                       </div>
                   )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-50">
                   
                   {/* Revenue */}
                   <div>
                      <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                         <span>Выручка</span>
                         <Info size={10} className="ml-1 text-gray-300" />
                         {/* Tooltip */}
                         <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none text-left">
                            Сумма чеков с применёнными акционными баллами за вычетом самих баллов. Возвраты не учитываются.
                         </div>
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                         {formatCurrency(promo.revenue)}
                      </div>
                   </div>

                   {/* Cost */}
                   <div>
                      <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                         <span>Расходы</span>
                         <Info size={10} className="ml-1 text-gray-300" />
                         {/* Tooltip */}
                         <div className="hidden group-hover/tooltip:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none text-left">
                            Сумма потраченных баллов в денежном эквиваленте.
                         </div>
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                         {formatCurrency(promo.cost)}
                      </div>
                   </div>

                   {/* Revenue per Bonus */}
                   <div>
                      <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                         <span>Выручка на 1₽ бонуса</span>
                         <Info size={10} className="ml-1 text-gray-300" />
                         {/* Tooltip */}
                         <div className="hidden group-hover/tooltip:block absolute bottom-full right-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none text-left">
                            Сколько реальных денег клиент потратил на каждый 1 бонус. Эффективность акции.
                         </div>
                      </div>
                      <div className={`text-lg font-bold ${Number(revPerBonus) > 10 ? 'text-green-600' : 'text-gray-900'}`}>
                         {revPerBonus}₽
                      </div>
                   </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PointsPromotions;