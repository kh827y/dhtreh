import React, { useState } from 'react';
import { 
  Ticket, 
  Plus, 
  Search, 
  Copy, 
  Calendar, 
  Coins, 
  Trophy, 
  Users, 
  ArrowLeft,
  Save, 
  CheckCircle2,
  AlertCircle,
  Archive,
  RefreshCw,
  Power,
  Pencil,
  Flame,
  ShieldCheck,
  MapPin
} from 'lucide-react';

// --- Types ---
type PromocodeStatus = 'active' | 'archived';

interface Promocode {
  id: string;
  code: string;
  description: string;
  points: number | null; // null if no points awarded
  assignsLevel: string | null; // id of level or null
  startDate: string;
  endDate: string | 'Бессрочно';
  
  // Limits
  usageLimit: number | 'unlimited'; // Total Limit (N users)
  usedCount: number;
  perClientLimit: number; // 1 by default
  frequencyDays: number | null; // null or 0 for no re-use delay
  requiresVisit: boolean;

  // Points Burning
  pointsBurnDays: number | null; // null = never

  status: PromocodeStatus;
}

const Promocodes: React.FC = () => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [activeTab, setActiveTab] = useState<PromocodeStatus>('active');
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Mock Data ---
  const [promocodes, setPromocodes] = useState<Promocode[]>([
    {
      id: '1',
      code: 'WELCOME2024',
      description: 'Приветственный бонус для новых участников программы.',
      points: 500,
      assignsLevel: null,
      startDate: '01.01.2024',
      endDate: 'Бессрочно',
      usageLimit: 'unlimited',
      usedCount: 1250,
      perClientLimit: 1,
      frequencyDays: 0,
      requiresVisit: false,
      pointsBurnDays: 30, // Burns after 30 days
      status: 'active'
    },
    {
      id: '2',
      code: 'VIP_UPGRADE',
      description: 'Мгновенное присвоение Золотого статуса и начисление бонусов.',
      points: 1000,
      assignsLevel: 'Gold',
      startDate: '01.12.2023',
      endDate: '31.12.2024',
      usageLimit: 100,
      usedCount: 42,
      perClientLimit: 1,
      frequencyDays: 0,
      requiresVisit: true,
      pointsBurnDays: null,
      status: 'active'
    },
    {
      id: '3',
      code: 'SORRY_BONUS',
      description: 'Компенсация за долгое ожидание заказа.',
      points: 200,
      assignsLevel: null,
      startDate: '01.06.2023',
      endDate: 'Бессрочно',
      usageLimit: 'unlimited',
      usedCount: 89,
      perClientLimit: 5, // Can use up to 5 times
      frequencyDays: 0,
      requiresVisit: false,
      pointsBurnDays: 90,
      status: 'active'
    },
    {
      id: '4',
      code: 'SUMMER_SALE',
      description: 'Летняя промо-акция.',
      points: null,
      assignsLevel: null,
      startDate: '01.06.2023',
      endDate: '31.08.2023',
      usageLimit: 5000,
      usedCount: 4500,
      perClientLimit: 1,
      frequencyDays: 0,
      requiresVisit: false,
      pointsBurnDays: null,
      status: 'archived'
    }
  ]);

  // --- Form State ---
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    hasPoints: true,
    pointsValue: 100,
    hasLevel: false,
    levelValue: 'Silver',
    
    // Limits
    isLimited: false, // Total limit
    limitValue: 100,
    perClientLimit: 1,
    
    // Frequency
    hasFrequencyLimit: false,
    frequencyDays: 1, // Default min value

    requiresVisit: false,
    
    isIndefinite: false,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],

    // Points Expiration
    isPointsBurning: false,
    pointsBurnDays: 30
  });

  // --- Helpers ---
  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, code: result }));
  };

  const handleSave = () => {
    if (!formData.code) return alert('Введите промокод');

    const newPromo: Promocode = {
      id: editingId || Date.now().toString(),
      code: formData.code.toUpperCase(),
      description: formData.description,
      points: formData.hasPoints ? formData.pointsValue : null,
      assignsLevel: formData.hasLevel ? formData.levelValue : null,
      startDate: new Date(formData.startDate).toLocaleDateString('ru-RU'),
      endDate: formData.isIndefinite ? 'Бессрочно' : new Date(formData.endDate).toLocaleDateString('ru-RU'),
      
      usageLimit: formData.isLimited ? formData.limitValue : 'unlimited',
      usedCount: editingId ? (promocodes.find(p => p.id === editingId)?.usedCount || 0) : 0,
      perClientLimit: formData.perClientLimit,
      frequencyDays: formData.hasFrequencyLimit ? formData.frequencyDays : 0,
      requiresVisit: formData.requiresVisit,

      pointsBurnDays: (formData.hasPoints && formData.isPointsBurning) ? formData.pointsBurnDays : null,
      
      status: 'active'
    };

    if (editingId) {
      setPromocodes(prev => prev.map(p => p.id === editingId ? newPromo : p));
    } else {
      setPromocodes(prev => [newPromo, ...prev]);
    }
    
    setView('list');
    setActiveTab('active');
  };

  const handleEdit = (item: Promocode) => {
    setEditingId(item.id);
    
    // Parse Date helper
    const parseDate = (dateStr: string) => {
       if (dateStr === 'Бессрочно' || dateStr.includes('Бессрочно')) return new Date().toISOString().split('T')[0];
       const parts = dateStr.split('.');
       if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
       return dateStr;
    };

    const freqDays = item.frequencyDays || 0;

    setFormData({
      code: item.code,
      description: item.description,
      hasPoints: item.points !== null,
      pointsValue: item.points || 100,
      hasLevel: item.assignsLevel !== null,
      levelValue: item.assignsLevel || 'Silver',
      
      isLimited: item.usageLimit !== 'unlimited',
      limitValue: item.usageLimit === 'unlimited' ? 100 : item.usageLimit,
      perClientLimit: item.perClientLimit,
      
      hasFrequencyLimit: freqDays > 0,
      frequencyDays: freqDays > 0 ? freqDays : 1,

      requiresVisit: item.requiresVisit,

      isIndefinite: item.endDate === 'Бессрочно',
      startDate: parseDate(item.startDate),
      endDate: parseDate(item.endDate),

      isPointsBurning: item.pointsBurnDays !== null,
      pointsBurnDays: item.pointsBurnDays || 30
    });
    
    setView('create');
  };

  const handleArchive = (id: string) => {
    setPromocodes(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' } : p));
  };

  const handleRestore = (id: string) => {
    setPromocodes(prev => prev.map(p => p.id === id ? { ...p, status: 'active' } : p));
  };

  const filteredPromocodes = promocodes.filter(p => p.status === activeTab);

  // --- Create View ---
  if (view === 'create') {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
        <div className="max-w-3xl mx-auto">
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
                   <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование' : 'Новый промокод'}</h2>
                   <p className="text-sm text-gray-500">Настройка правил активации промокода</p>
                </div>
             </div>
             <button 
                onClick={handleSave}
                className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
             >
                <Save size={18} />
                <span>Сохранить</span>
             </button>
          </div>

          <div className="space-y-6">
            {/* Main Info */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-2">Код</label>
                     <div className="relative flex items-center">
                        <Ticket size={18} className="absolute left-3 text-gray-400 z-10" />
                        <input 
                          type="text" 
                          value={formData.code}
                          onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                          placeholder="CODE2024"
                          className="w-full border border-gray-300 rounded-l-lg pl-10 pr-4 py-2 uppercase font-mono tracking-wide focus:ring-2 focus:ring-purple-500 focus:outline-none focus:z-10 relative z-0"
                        />
                        <button 
                          onClick={generateCode}
                          className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors relative z-0"
                        >
                          Сгенерировать
                        </button>
                     </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Описание</label>
                    <input 
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Для чего этот код..."
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Начало действия</label>
                       <input 
                         type="date"
                         value={formData.startDate}
                         onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                   </div>
                   <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Окончание</label>
                       <div className="space-y-2">
                           <div className={`relative ${formData.isIndefinite ? 'opacity-50 pointer-events-none' : ''}`}>
                             <input 
                               type="date"
                               value={formData.endDate}
                               onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                             />
                           </div>
                           <label className="flex items-center space-x-2 cursor-pointer">
                               <input 
                                 type="checkbox" 
                                 checked={formData.isIndefinite}
                                 onChange={(e) => setFormData({...formData, isIndefinite: e.target.checked})}
                                 className="rounded text-purple-600 focus:ring-purple-500"
                               />
                               <span className="text-sm text-gray-600">Бессрочно</span>
                           </label>
                       </div>
                   </div>
               </div>
            </div>

            {/* Rewards */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-gray-900">Вознаграждение</h3>
               
               <div className="space-y-4">
                  {/* Points Reward */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-start justify-between mb-4">
                          <div className="flex items-start space-x-3">
                             <input 
                               type="checkbox" 
                               checked={formData.hasPoints}
                               onChange={(e) => setFormData({...formData, hasPoints: e.target.checked})}
                               className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                             />
                             <div>
                                <span className="block font-medium text-gray-900">Начислить баллы</span>
                                <span className="text-sm text-gray-500">Клиент получит баллы при активации кода</span>
                             </div>
                          </div>
                          {formData.hasPoints && (
                             <div className="relative w-32">
                                <input 
                                  type="number"
                                  value={formData.pointsValue}
                                  onChange={(e) => setFormData({...formData, pointsValue: Number(e.target.value)})}
                                  className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-sm"
                                />
                                <Coins size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                             </div>
                          )}
                      </div>

                      {/* Points Expiration */}
                      {formData.hasPoints && (
                          <div className="ml-7 pt-4 border-t border-gray-200 animate-fade-in">
                              <span className="block text-sm font-medium text-gray-800 mb-2">Срок действия баллов</span>
                              <div className="space-y-2">
                                  <label className="flex items-center space-x-2 cursor-pointer">
                                      <input 
                                        type="radio" 
                                        name="points_burn"
                                        checked={!formData.isPointsBurning}
                                        onChange={() => setFormData({...formData, isPointsBurning: false})}
                                        className="text-purple-600 focus:ring-purple-500"
                                      />
                                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                                         <ShieldCheck size={14} className="text-green-600" />
                                         <span>Не сгорают</span>
                                      </div>
                                  </label>
                                  
                                  <div className="flex items-center space-x-4">
                                      <label className="flex items-center space-x-2 cursor-pointer">
                                          <input 
                                            type="radio" 
                                            name="points_burn"
                                            checked={formData.isPointsBurning}
                                            onChange={() => setFormData({...formData, isPointsBurning: true})}
                                            className="text-purple-600 focus:ring-purple-500"
                                          />
                                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                                             <Flame size={14} className="text-orange-500" />
                                             <span>Сгорят через</span>
                                          </div>
                                      </label>
                                      {formData.isPointsBurning && (
                                         <div className="relative w-24">
                                             <input 
                                                type="number" 
                                                value={formData.pointsBurnDays}
                                                onChange={(e) => setFormData({...formData, pointsBurnDays: Number(e.target.value)})}
                                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm h-8"
                                             />
                                             <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">дн.</span>
                                         </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Level Reward */}
                  <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-start space-x-3">
                         <input 
                           type="checkbox" 
                           checked={formData.hasLevel}
                           onChange={(e) => setFormData({...formData, hasLevel: e.target.checked})}
                           className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                         />
                         <div>
                            <span className="block font-medium text-gray-900">Присвоить уровень</span>
                            <span className="text-sm text-gray-500">Изменить текущий уровень лояльности клиента</span>
                         </div>
                      </div>
                      {formData.hasLevel && (
                         <select 
                            value={formData.levelValue}
                            onChange={(e) => setFormData({...formData, levelValue: e.target.value})}
                            className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                         >
                            <option value="Silver">Silver</option>
                            <option value="Gold">Gold</option>
                            <option value="Platinum">Platinum</option>
                         </select>
                      )}
                  </div>
               </div>
            </div>

            {/* Limits */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
               <h3 className="text-lg font-bold text-gray-900">Ограничения использования</h3>
               
               <div className="space-y-5">
                   {/* Total Limit (N clients) */}
                   <div className="flex items-center justify-between">
                       <label className="flex items-center space-x-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.isLimited}
                            onChange={(e) => setFormData({...formData, isLimited: e.target.checked})}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                              <span className="text-sm text-gray-900 font-medium">Ограничить общее количество</span>
                              <p className="text-xs text-gray-500">Сколько всего раз этот промокод может быть активирован (всеми клиентами).</p>
                          </div>
                       </label>

                       {formData.isLimited && (
                          <div className="relative w-32 animate-fade-in">
                            <input 
                              type="number"
                              value={formData.limitValue}
                              onChange={(e) => setFormData({...formData, limitValue: Number(e.target.value)})}
                              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                            />
                          </div>
                       )}
                   </div>

                   {/* Per Client Limit */}
                   <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                       <div>
                          <span className="block text-sm text-gray-900 font-medium">Лимит на одного клиента</span>
                          <p className="text-xs text-gray-500">Сколько раз один клиент может использовать код.</p>
                       </div>
                       <div className="relative w-32">
                           <input 
                             type="number"
                             min={1}
                             value={formData.perClientLimit}
                             onChange={(e) => setFormData({...formData, perClientLimit: Math.max(1, Number(e.target.value))})}
                             className="w-full border border-gray-300 rounded-lg pl-3 pr-10 py-1.5 text-sm [&::-webkit-inner-spin-button]:appearance-none"
                           />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">раз</span>
                       </div>
                   </div>

                   {/* Usage Period (Frequency) */}
                   <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                       <label className="flex items-center space-x-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.hasFrequencyLimit}
                            onChange={(e) => setFormData({...formData, hasFrequencyLimit: e.target.checked})}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                              <span className="text-sm text-gray-900 font-medium">Период использования в днях</span>
                              <p className="text-xs text-gray-500">Как часто клиент может использовать промокод.</p>
                          </div>
                       </label>

                       {formData.hasFrequencyLimit && (
                           <div className="relative w-32 animate-fade-in">
                               <input 
                                 type="number"
                                 min={1}
                                 value={formData.frequencyDays}
                                 onChange={(e) => setFormData({...formData, frequencyDays: Math.max(1, Number(e.target.value))})}
                                 className="w-full border border-gray-300 rounded-lg pl-3 pr-10 py-1.5 text-sm [&::-webkit-inner-spin-button]:appearance-none"
                               />
                               <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">дн.</span>
                           </div>
                       )}
                   </div>
                   
                   {/* Visit Requirement */}
                   <div className="border-t border-gray-50 pt-4">
                       <label className="flex items-center space-x-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.requiresVisit}
                            onChange={(e) => setFormData({...formData, requiresVisit: e.target.checked})}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex items-center">
                              <span className="text-sm text-gray-900 font-medium mr-2">Активен только если был визит</span>
                              <MapPin size={14} className="text-gray-400" />
                          </div>
                       </label>
                   </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- List View ---
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <div className="flex items-center space-x-2">
              <h2 className="text-2xl font-bold text-gray-900">Промокоды</h2>
           </div>
           <p className="text-gray-500 mt-1">Управление кодами для начисления бонусов и смены уровней.</p>
        </div>
        
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({
               code: '',
               description: '',
               hasPoints: true,
               pointsValue: 100,
               hasLevel: false,
               levelValue: 'Silver',
               isLimited: false,
               limitValue: 100,
               perClientLimit: 1,
               hasFrequencyLimit: false,
               frequencyDays: 1,
               requiresVisit: false,
               isIndefinite: false,
               startDate: new Date().toISOString().split('T')[0],
               endDate: new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0],
               isPointsBurning: false,
               pointsBurnDays: 30
            });
            setView('create');
          }}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать промокод</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('active')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Активные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'active' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {promocodes.filter(p => p.status === 'active').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'archived' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Архивные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'archived' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {promocodes.filter(p => p.status === 'archived').length}
            </span>
          </button>
        </nav>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Промокод</th>
                     <th className="px-6 py-4 font-semibold">Описание</th>
                     <th className="px-6 py-4 font-semibold">Бонусы</th>
                     <th className="px-6 py-4 font-semibold">Уровень</th>
                     <th className="px-6 py-4 font-semibold">Срок действия</th>
                     <th className="px-6 py-4 font-semibold text-right">Использований</th>
                     <th className="px-6 py-4 font-semibold text-right w-28">Действия</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredPromocodes.length === 0 ? (
                     <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                           <Ticket size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>
                             {activeTab === 'active' 
                               ? 'Нет активных промокодов' 
                               : 'Архив пуст'}
                           </p>
                        </td>
                     </tr>
                  ) : (
                     filteredPromocodes.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4">
                              <div className="flex items-center space-x-2">
                                 <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">{item.code}</span>
                                 <button title="Копировать" className="text-gray-400 hover:text-gray-600">
                                    <Copy size={14} />
                                 </button>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-gray-600">
                              <p className="line-clamp-1 max-w-xs" title={item.description}>{item.description}</p>
                           </td>
                           <td className="px-6 py-4">
                              {item.points ? (
                                 <div className="flex items-center space-x-1 text-green-600 font-medium">
                                    <Coins size={14} />
                                    <span>+{item.points}</span>
                                    {item.pointsBurnDays && (
                                       <span title={`Сгорают через ${item.pointsBurnDays} дней`}>
                                          <Flame size={12} className="text-orange-500 ml-1" />
                                       </span>
                                    )}
                                 </div>
                              ) : (
                                 <span className="text-gray-400">-</span>
                              )}
                           </td>
                           <td className="px-6 py-4">
                              {item.assignsLevel ? (
                                 <div className={`flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-bold w-fit
                                    ${item.assignsLevel === 'Gold' ? 'bg-yellow-100 text-yellow-700' : 
                                      item.assignsLevel === 'Silver' ? 'bg-gray-100 text-gray-700' : 'bg-slate-100 text-slate-700'}`}>
                                    <Trophy size={12} />
                                    <span>{item.assignsLevel}</span>
                                 </div>
                              ) : (
                                 <span className="text-gray-400">-</span>
                              )}
                           </td>
                           <td className="px-6 py-4 text-gray-600 text-xs">
                              <div className="flex items-center space-x-1">
                                 <Calendar size={14} className="text-gray-400"/>
                                 <span>{item.startDate} - {item.endDate}</span>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                 <span className="font-medium text-gray-900">{item.usedCount}</span>
                                 {item.usageLimit !== 'unlimited' && (
                                    <span className="text-xs text-gray-400">из {item.usageLimit}</span>
                                 )}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                 <button 
                                   onClick={() => handleEdit(item)} 
                                   title="Редактировать"
                                   className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                 >
                                    <Pencil size={16} />
                                 </button>
                                 {activeTab === 'active' ? (
                                    <button 
                                      onClick={() => handleArchive(item.id)}
                                      title="В архив"
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                       <Archive size={16} />
                                    </button>
                                 ) : (
                                    <button 
                                      onClick={() => handleRestore(item.id)}
                                      title="Восстановить"
                                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    >
                                       <RefreshCw size={16} />
                                    </button>
                                 )}
                              </div>
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default Promocodes;