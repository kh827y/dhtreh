import React, { useState, useMemo } from 'react';
import { 
  Trophy, 
  Ban, 
  RefreshCw, 
  Cake, 
  UserPlus, 
  Hourglass, 
  Share2, 
  ChevronRight,
  Power,
  Settings,
  ArrowLeft,
  Plus,
  Edit,
  Trash2, 
  Users, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Save, 
  X, 
  Search, 
  Clock, 
  Flame, 
  ShieldCheck, 
  Coins,
  Info
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { AppView } from '../types';

interface LoyaltyMechanicsProps {
  onNavigate?: (view: AppView) => void;
  initialSection?: 'menu' | 'levels_editor' | 'limitations_editor';
}

interface MechanicToggle {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  color: string;
}

interface LoyaltyLevel {
  id: string;
  name: string;
  description: string;
  threshold: number; // Purchase sum to reach this level
  minAmount: number; // Min check amount to use benefits
  accrualPercent: number;
  redemptionPercent: number;
  isStarter: boolean;
  isHidden: boolean;
  membersCount: number;
}

interface LevelMember {
  id: string;
  name: string;
  phone: string;
  email: string;
  joinDate: string;
  totalSpend: number;
}

const initialLevels: LoyaltyLevel[] = [
  {
    id: '1',
    name: 'Base',
    description: 'Базовый уровень для всех новых клиентов',
    threshold: 0,
    minAmount: 0,
    accrualPercent: 3.0,
    redemptionPercent: 50.0,
    isStarter: true,
    isHidden: false,
    membersCount: 1250
  },
  {
    id: '2',
    name: 'Gold',
    description: 'Для постоянных покупателей',
    threshold: 50000,
    minAmount: 0,
    accrualPercent: 5.0,
    redemptionPercent: 50.0,
    isStarter: false,
    isHidden: false,
    membersCount: 320
  },
  {
    id: '3',
    name: 'Staff',
    description: 'Специальные условия для сотрудников',
    threshold: 0,
    minAmount: 0,
    accrualPercent: 10.0,
    redemptionPercent: 99.0,
    isStarter: false,
    isHidden: true, // Hidden level
    membersCount: 15
  }
];

const LoyaltyMechanics: React.FC<LoyaltyMechanicsProps> = ({ onNavigate, initialSection = 'menu' }) => {
  // --- Navigation State ---
  const [currentView, setCurrentView] = useState<'menu' | 'levels_editor' | 'limitations_editor'>(initialSection);

  // --- Mechanics Menu State ---
  const [mechanics, setMechanics] = useState<MechanicToggle[]>([
    {
      id: 'auto_return',
      title: 'Автовозврат клиентов',
      description: 'Возвращаем неактивных клиентов подарочными баллами',
      icon: <RefreshCw size={24} />,
      enabled: true,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      id: 'birthday',
      title: 'Поздравление с днём рождения',
      description: 'Автопоздравления и подарочные баллы к празднику',
      icon: <Cake size={24} />,
      enabled: true,
      color: 'bg-pink-50 text-pink-600'
    },
    {
      id: 'registration',
      title: 'Баллы за регистрацию',
      description: 'Приветственный бонус новым участникам программы',
      icon: <UserPlus size={24} />,
      enabled: true,
      color: 'bg-green-50 text-green-600'
    },
    {
      id: 'expiration',
      title: 'Напоминание о сгорании',
      description: 'Предупреждение клиентов о скором сгорании баллов',
      icon: <Hourglass size={24} />,
      enabled: false,
      color: 'bg-amber-50 text-amber-600'
    },
    {
      id: 'referral',
      title: 'Реферальная программа',
      description: 'Вознаграждение за приглашение новых клиентов',
      icon: <Share2 size={24} />,
      enabled: true,
      color: 'bg-purple-50 text-purple-600'
    },
  ]);

  // --- Limitations State ---
  const [limitations, setLimitations] = useState({
    isExpirationEnabled: false,
    expirationDays: 180,
    allowAccrualOnRedemption: false,
    activationDelay: 0
  });

  // --- Levels Editor State ---
  const [levels, setLevels] = useState<LoyaltyLevel[]>(initialLevels);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // --- Members Modal State ---
  const [viewingLevel, setViewingLevel] = useState<LoyaltyLevel | null>(null);
  const [membersSearch, setMembersSearch] = useState('');
  
  const [levelForm, setLevelForm] = useState({
    name: '',
    description: '',
    threshold: 0,
    minAmount: 0,
    accrualPercent: 0,
    redemptionPercent: 0,
    isStarter: false,
    isHidden: false
  });

  // --- Mock Members Data Generator ---
  const membersList = useMemo(() => {
    if (!viewingLevel) return [];
    // Generate deterministic mock data based on level ID
    const count = Math.min(viewingLevel.membersCount, 50); // Show max 50 for demo
    const names = ['Александр', 'Мария', 'Дмитрий', 'Елена', 'Андрей', 'Ольга', 'Сергей', 'Наталья', 'Иван', 'Юлия'];
    const surnames = ['Иванов(а)', 'Петров(а)', 'Сидоров(а)', 'Смирнов(а)', 'Кузнецов(а)', 'Попов(а)', 'Васильев(а)', 'Соколов(а)'];
    
    return Array.from({ length: count }).map((_, i) => ({
      id: `${viewingLevel.id}-${i}`,
      name: `${names[i % names.length]} ${surnames[i % surnames.length]}`,
      phone: `+7 (9${i % 10}${i % 10}) ${100 + i}-${20 + i}-${30 + i}`,
      email: `user${i}@example.com`,
      joinDate: new Date(2023, i % 12, (i % 28) + 1).toLocaleDateString('ru-RU'),
      totalSpend: Math.floor(Math.random() * (viewingLevel.id === '2' ? 100000 : 20000)) + (viewingLevel.id === '2' ? 50000 : 0)
    }));
  }, [viewingLevel]);

  const filteredMembers = useMemo(() => {
    return membersList.filter(m => 
      m.name.toLowerCase().includes(membersSearch.toLowerCase()) || 
      m.phone.includes(membersSearch)
    );
  }, [membersList, membersSearch]);

  // --- Handlers: Mechanics Menu ---

  const toggleMechanic = (id: string) => {
    setMechanics(prev => prev.map(mech => 
      mech.id === id ? { ...mech, enabled: !mech.enabled } : mech
    ));
  };

  const handleCardClick = (id: string) => {
    if (!onNavigate) return;

    switch (id) {
      case 'auto_return':
        onNavigate('autoreturn');
        break;
      case 'birthday':
        onNavigate('birthday');
        break;
      case 'registration':
        onNavigate('registration_points');
        break;
      case 'expiration':
        onNavigate('expiration_reminder');
        break;
      case 'referral':
        onNavigate('referral_settings');
        break;
      default:
        alert(`Переход к настройкам механики: ${id}`);
    }
  };

  // --- Handlers: Limitations ---
  
  const handleSaveLimitations = () => {
    alert('Настройки ограничений сохранены!');
    setCurrentView('menu');
  };

  // --- Handlers: Levels Editor ---

  const handleStartCreate = () => {
    setEditingId(null);
    setLevelForm({
      name: '',
      description: '',
      threshold: 0,
      minAmount: 0,
      accrualPercent: 3,
      redemptionPercent: 50,
      isStarter: false,
      isHidden: false
    });
    setIsModalOpen(true);
  };

  const handleStartEdit = (lvl: LoyaltyLevel) => {
    setEditingId(lvl.id);
    setLevelForm({
      name: lvl.name,
      description: lvl.description,
      threshold: lvl.threshold,
      minAmount: lvl.minAmount,
      accrualPercent: lvl.accrualPercent,
      redemptionPercent: lvl.redemptionPercent,
      isStarter: lvl.isStarter,
      isHidden: lvl.isHidden
    });
    setIsModalOpen(true);
  };

  const handleSaveLevel = () => {
    if (!levelForm.name) return alert('Введите название уровня');

    // Validation: Cannot hide if it's the only level
    if (levelForm.isHidden && levels.length <= 1 && (!editingId || (editingId && levels.length === 1))) {
       return alert('Нельзя сделать единственный уровень скрытым.');
    }

    const newLevelData = {
       name: levelForm.name,
       description: levelForm.description,
       threshold: Number(levelForm.threshold),
       minAmount: Number(levelForm.minAmount),
       accrualPercent: Number(levelForm.accrualPercent),
       redemptionPercent: Number(levelForm.redemptionPercent),
       isStarter: levelForm.isStarter,
       isHidden: levelForm.isHidden,
    };

    let updatedLevels = [...levels];

    if (editingId) {
       // Update existing
       updatedLevels = updatedLevels.map(l => l.id === editingId ? { ...l, ...newLevelData } : l);
    } else {
       // Create new
       updatedLevels.push({
          id: Date.now().toString(),
          membersCount: 0,
          ...newLevelData
       });
    }

    // Logic: Only one starter allowed. If current is set to starter, others become false.
    if (newLevelData.isStarter) {
       const targetId = editingId || updatedLevels[updatedLevels.length - 1].id;
       updatedLevels = updatedLevels.map(l => ({
          ...l,
          isStarter: l.id === targetId // True for current, false for others
       }));
    }

    setLevels(updatedLevels);
    setIsModalOpen(false);
  };

  const handleDeleteLevel = (id: string) => {
    const lvl = levels.find(l => l.id === id);
    if (!lvl) return;

    if (levels.length === 1) {
       return alert('Нельзя удалить единственный уровень.');
    }
    if (lvl.membersCount > 0) {
       return alert(`Нельзя удалить уровень, на котором есть участники (${lvl.membersCount} чел.). Сначала переместите их.`);
    }
    if (lvl.isStarter) {
       return alert('Нельзя удалить стартовый уровень. Сначала назначьте другой уровень стартовым.');
    }

    if (confirm(`Удалить уровень "${lvl.name}"?`)) {
       setLevels(prev => prev.filter(l => l.id !== id));
    }
  };

  const handleViewMembers = (lvl: LoyaltyLevel) => {
     setMembersSearch('');
     setViewingLevel(lvl);
  };

  // --- Render Views ---

  const renderLimitationsEditor = () => (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <button 
                onClick={() => setCurrentView('menu')}
                className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
             >
                <ArrowLeft size={20} />
             </button>
             <div>
                <h2 className="text-2xl font-bold text-gray-900">Настройки бонусов</h2>
                <p className="text-sm text-gray-500">Правила сгорания, активации и списания баллов.</p>
             </div>
          </div>
          <button 
             onClick={handleSaveLimitations}
             className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
             <Save size={18} />
             <span>Сохранить</span>
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Expiration Settings */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
             <div className="flex items-center space-x-3 mb-6">
                <div className={`p-2.5 rounded-lg ${limitations.isExpirationEnabled ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                   <Flame size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Сгорание баллов</h3>
             </div>
             
             <div className="space-y-4 flex-1">
                <p className="text-sm text-gray-600 min-h-[40px]">
                   Настройте срок жизни баллов, полученных за покупки. Если баллы не использовать вовремя, они сгорят.
                </p>
                
                <div className="space-y-3 pt-2">
                   <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                      <input 
                         type="radio" 
                         name="expiration"
                         checked={!limitations.isExpirationEnabled}
                         onChange={() => setLimitations({...limitations, isExpirationEnabled: false})}
                         className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <div className="flex items-center space-x-2">
                         <ShieldCheck size={16} className="text-green-600" />
                         <span className="font-medium text-gray-900 text-sm">Баллы не сгорают</span>
                      </div>
                   </label>

                   <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors has-[:checked]:bg-orange-50 has-[:checked]:border-orange-200">
                      <input 
                         type="radio" 
                         name="expiration"
                         checked={limitations.isExpirationEnabled}
                         onChange={() => setLimitations({...limitations, isExpirationEnabled: true})}
                         className="text-orange-600 focus:ring-orange-500 h-4 w-4"
                      />
                      <span className="font-medium text-gray-900 text-sm">Сгорают через время</span>
                   </label>
                </div>

                {limitations.isExpirationEnabled && (
                   <div className="animate-fade-in pl-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Количество дней</label>
                      <div className="relative">
                         <input 
                            type="number"
                            min="1"
                            value={limitations.expirationDays}
                            onChange={(e) => setLimitations({...limitations, expirationDays: Number(e.target.value)})}
                            className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                         />
                         <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">дней</span>
                      </div>
                   </div>
                )}
             </div>
          </div>

          {/* Simultaneous Accrual & Redemption */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
             <div className="flex items-center space-x-3 mb-6">
                <div className="p-2.5 rounded-lg bg-purple-100 text-purple-600">
                   <Coins size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Смешанная оплата</h3>
             </div>

             <div className="space-y-4 flex-1">
                <div className="flex items-start justify-between">
                   <p className="text-sm text-gray-600 flex-1 pr-4">
                      Разрешить списывать и начислять баллы одновременно в одном чеке?
                   </p>
                   <button 
                      onClick={() => setLimitations({...limitations, allowAccrualOnRedemption: !limitations.allowAccrualOnRedemption})}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${limitations.allowAccrualOnRedemption ? 'bg-purple-600' : 'bg-gray-300'}`}
                   >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${limitations.allowAccrualOnRedemption ? 'translate-x-6' : 'translate-x-1'}`} />
                   </button>
                </div>

                <div className={`p-3 rounded-lg text-sm border ${limitations.allowAccrualOnRedemption ? 'bg-purple-50 border-purple-100 text-purple-900' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                   {limitations.allowAccrualOnRedemption ? (
                      <div className="flex items-start space-x-2">
                         <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                         <div className="space-y-1">
                             <p className="font-medium">Опция включена</p>
                             <p className="text-xs opacity-90">
                                После списания баллов клиенту начисляются новые баллы на <strong>оплаченную деньгами часть чека</strong>.
                             </p>
                         </div>
                      </div>
                   ) : (
                      <div className="flex items-start space-x-2">
                         <Ban size={16} className="mt-0.5 flex-shrink-0" />
                         <span>
                            Если клиент списывает баллы, начисление за этот чек <strong>не производится</strong>.
                         </span>
                      </div>
                   )}
                </div>
             </div>
          </div>

          {/* Activation Delay */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
             <div className="flex items-center space-x-3 mb-6">
                <div className="p-2.5 rounded-lg bg-blue-100 text-blue-600">
                   <Clock size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Задержка активации</h3>
             </div>

             <div className="space-y-4 flex-1">
                <p className="text-sm text-gray-600 min-h-[40px]">
                   Баллы за покупку становятся доступными для списания через указанное время.
                </p>

                <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Дней до активации</label>
                   <div className="relative">
                      <input 
                         type="number"
                         min="0"
                         value={limitations.activationDelay}
                         onChange={(e) => setLimitations({...limitations, activationDelay: Number(e.target.value)})}
                         className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">дней</span>
                   </div>
                </div>

                <div className="flex items-center space-x-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                   <Info size={14} className="flex-shrink-0" />
                   <span>0 = баллы доступны сразу после покупки.</span>
                </div>
             </div>
          </div>

       </div>
    </div>
  );

  const renderLevelsEditor = () => (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <button 
                onClick={() => setCurrentView('menu')}
                className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
             >
                <ArrowLeft size={20} />
             </button>
             <div>
                <h2 className="text-2xl font-bold text-gray-900">Уровни клиентов</h2>
                <p className="text-sm text-gray-500">Настройка статусов и привилегий.</p>
             </div>
          </div>
          <button 
             onClick={handleStartCreate}
             className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
             <Plus size={18} />
             <span>Добавить уровень</span>
          </button>
       </div>

       <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                   <tr>
                      <th className="px-6 py-4 font-semibold">Название</th>
                      <th className="px-6 py-4 font-semibold text-right">Порог входа</th>
                      <th className="px-6 py-4 font-semibold text-center">Начисление</th>
                      <th className="px-6 py-4 font-semibold text-center">Списание</th>
                      <th className="px-6 py-4 font-semibold text-center">Свойства</th>
                      <th className="px-6 py-4 font-semibold text-right">Участников</th>
                      <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                   {levels.map((lvl) => (
                      <tr key={lvl.id} className="hover:bg-gray-50 transition-colors group">
                         <td className="px-6 py-4">
                            <div className="font-medium text-gray-900 text-base">{lvl.name}</div>
                            <div className="text-xs text-gray-500 truncate max-w-xs">{lvl.description}</div>
                         </td>
                         <td className="px-6 py-4 text-right">
                            {lvl.threshold > 0 ? (
                               <span className="font-medium">{lvl.threshold.toLocaleString()} ₽</span>
                            ) : (
                               <span className="text-gray-400">0 ₽</span>
                            )}
                         </td>
                         <td className="px-6 py-4 text-center">
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-bold text-xs">
                               {lvl.accrualPercent}%
                            </span>
                         </td>
                         <td className="px-6 py-4 text-center">
                            <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-bold text-xs">
                               {lvl.redemptionPercent}%
                            </span>
                         </td>
                         <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                               {lvl.isStarter && (
                                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 font-medium" title="Стартовая группа">
                                     Старт
                                  </span>
                               )}
                               {lvl.isHidden ? (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 flex items-center" title="Скрытая группа (не видна в прогрессе)">
                                     <EyeOff size={10} className="mr-1" /> Скрыт
                                  </span>
                               ) : (
                                  !lvl.isStarter && <span className="text-xs text-gray-400">-</span>
                               )}
                            </div>
                         </td>
                         <td className="px-6 py-4 text-right">
                            <button 
                               onClick={() => handleViewMembers(lvl)}
                               className="text-gray-600 hover:text-purple-600 font-medium flex items-center justify-end w-full group/btn"
                            >
                               <Users size={14} className="mr-1.5 text-gray-400 group-hover/btn:text-purple-600" />
                               {lvl.membersCount}
                            </button>
                         </td>
                         <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                               <button 
                                  onClick={() => handleStartEdit(lvl)}
                                  className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                  title="Редактировать"
                               >
                                  <Edit size={16} />
                               </button>
                               <button 
                                  onClick={() => handleDeleteLevel(lvl.id)}
                                  disabled={lvl.membersCount > 0 || levels.length === 1}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                  title={lvl.membersCount > 0 ? "Нельзя удалить: есть участники" : "Удалить"}
                               >
                                  <Trash2 size={16} />
                               </button>
                            </div>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>

       {/* Edit/Create Modal */}
       {isModalOpen && createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative z-[101] max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
                   <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Редактирование уровня' : 'Новый уровень'}</h3>
                   <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={24} />
                   </button>
                </div>
                
                <div className="p-6 space-y-6">
                   
                   {/* Name & Desc */}
                   <div className="space-y-4">
                      <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Название уровня <span className="text-red-500">*</span></label>
                         <input 
                            type="text" 
                            value={levelForm.name}
                            onChange={(e) => setLevelForm({...levelForm, name: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            placeholder="Например: Platinum"
                         />
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                         <textarea 
                            rows={2}
                            value={levelForm.description}
                            onChange={(e) => setLevelForm({...levelForm, description: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                            placeholder="Условия получения и привилегии"
                         />
                      </div>
                   </div>

                   {/* Percents */}
                   <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <div>
                         <label className="block text-sm font-medium text-gray-900 mb-1">% Начисления</label>
                         <div className="relative">
                            <input 
                               type="number" 
                               min="0"
                               step="0.1"
                               value={levelForm.accrualPercent}
                               onChange={(e) => setLevelForm({...levelForm, accrualPercent: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-2 font-bold text-green-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                         </div>
                         <p className="text-xs text-gray-500 mt-1">Кэшбэк баллами</p>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-gray-900 mb-1">% Списания</label>
                         <div className="relative">
                            <input 
                               type="number" 
                               min="0"
                               max="100"
                               value={levelForm.redemptionPercent}
                               onChange={(e) => setLevelForm({...levelForm, redemptionPercent: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-2 font-bold text-red-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                         </div>
                         <p className="text-xs text-gray-500 mt-1">От суммы чека</p>
                      </div>
                   </div>

                   {/* Thresholds */}
                   <div className="grid grid-cols-2 gap-6">
                      <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Порог перехода</label>
                         <div className="relative">
                            <input 
                               type="number" 
                               min="0"
                               value={levelForm.threshold}
                               onChange={(e) => setLevelForm({...levelForm, threshold: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                         </div>
                         <p className="text-xs text-gray-500 mt-1">Сумма покупок для получения уровня</p>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Мин. сумма чека</label>
                         <div className="relative">
                            <input 
                               type="number" 
                               min="0"
                               value={levelForm.minAmount}
                               onChange={(e) => setLevelForm({...levelForm, minAmount: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                         </div>
                         <p className="text-xs text-gray-500 mt-1">Для начисления/списания баллов</p>
                      </div>
                   </div>

                   {/* Properties */}
                   <div className="space-y-3 pt-2 border-t border-gray-100">
                      <label className="flex items-start space-x-3 cursor-pointer p-3 hover:bg-gray-50 rounded-lg transition-colors">
                         <div className="flex items-center h-5">
                            <input 
                               type="checkbox" 
                               checked={levelForm.isStarter}
                               onChange={(e) => setLevelForm({...levelForm, isStarter: e.target.checked, isHidden: e.target.checked ? false : levelForm.isHidden})}
                               className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                         </div>
                         <div>
                            <span className="font-medium text-gray-900 text-sm">Стартовая группа</span>
                            <p className="text-xs text-gray-500">Автоматически присваивается при регистрации. Может быть только одна.</p>
                         </div>
                      </label>

                      <label className={`flex items-start space-x-3 cursor-pointer p-3 hover:bg-gray-50 rounded-lg transition-colors ${levelForm.isStarter ? 'opacity-50 pointer-events-none' : ''}`}>
                         <div className="flex items-center h-5">
                            <input 
                               type="checkbox" 
                               checked={levelForm.isHidden}
                               onChange={(e) => setLevelForm({...levelForm, isHidden: e.target.checked})}
                               disabled={levelForm.isStarter}
                               className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                         </div>
                         <div>
                            <span className="font-medium text-gray-900 text-sm flex items-center">
                               <EyeOff size={14} className="mr-1.5" /> Скрытая группа
                            </span>
                            <p className="text-xs text-gray-500">
                               Видна только участникам. Не отображается в прогрессе. Переход только вручную или по промокоду.
                            </p>
                         </div>
                      </label>
                   </div>

                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3 sticky bottom-0 z-10">
                   <button 
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                   >
                      Отмена
                   </button>
                   <button 
                      onClick={handleSaveLevel}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm"
                   >
                      Сохранить
                   </button>
                </div>
             </div>
          </div>,
          document.body
       )}

       {/* Members List Modal */}
       {viewingLevel && createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl relative z-[101] flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
                   <div>
                      <h3 className="text-xl font-bold text-gray-900">Участники уровня <span className="text-purple-600">{viewingLevel.name}</span></h3>
                      <p className="text-sm text-gray-500 mt-1">Всего участников: {viewingLevel.membersCount}</p>
                   </div>
                   <button onClick={() => setViewingLevel(null)} className="text-gray-400 hover:text-gray-600 p-1">
                      <X size={24} />
                   </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-gray-100 bg-white">
                   <div className="relative max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                         type="text" 
                         value={membersSearch}
                         onChange={(e) => setMembersSearch(e.target.value)}
                         placeholder="Поиск по имени или телефону..."
                         className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                   </div>
                </div>
                
                {/* Table Content - Scrollable */}
                <div className="flex-1 overflow-y-auto">
                   <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                         <tr>
                            <th className="px-6 py-3 font-semibold bg-gray-50">Имя</th>
                            <th className="px-6 py-3 font-semibold bg-gray-50">Телефон</th>
                            {/* REMOVED EMAIL COLUMN HERE */}
                            <th className="px-6 py-3 font-semibold bg-gray-50 text-right">Потрачено</th>
                            <th className="px-6 py-3 font-semibold bg-gray-50 text-right">Дата рег.</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                         {filteredMembers.length > 0 ? (
                            filteredMembers.map((member) => (
                               <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-6 py-3 font-medium text-gray-900">{member.name}</td>
                                  <td className="px-6 py-3 text-gray-600 font-mono text-xs">{member.phone}</td>
                                  {/* REMOVED EMAIL CELL HERE */}
                                  <td className="px-6 py-3 text-right font-medium">{member.totalSpend.toLocaleString()} ₽</td>
                                  <td className="px-6 py-3 text-right text-gray-500">{member.joinDate}</td>
                               </tr>
                            ))
                         ) : (
                            <tr>
                               <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                                  Участники не найдены
                               </td>
                            </tr>
                         )}
                      </tbody>
                   </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                   <button 
                      onClick={() => setViewingLevel(null)}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                   >
                      Закрыть
                   </button>
                </div>
             </div>
          </div>,
          document.body
       )}
    </div>
  );

  // --- Main Render Switch ---

  if (currentView === 'levels_editor') {
     return (
        <div className="p-8 max-w-[1400px] mx-auto animate-fade-in">
           {renderLevelsEditor()}
        </div>
     );
  }

  if (currentView === 'limitations_editor') {
     return (
        <div className="p-8 max-w-[1400px] mx-auto animate-fade-in">
           {renderLimitationsEditor()}
        </div>
     );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Механики лояльности</h2>
        <p className="text-gray-500 mt-1">Настройка правил начисления, списания и автоматических коммуникаций.</p>
      </div>

      {/* Configuration Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Базовые настройки</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Client Levels Card */}
          <div 
            onClick={() => setCurrentView('levels_editor')}
            className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-start justify-between relative overflow-hidden"
          >
            <div className="flex items-start space-x-4 relative z-10">
              <div className="p-3 rounded-lg bg-yellow-50 text-yellow-600 group-hover:bg-yellow-100 transition-colors">
                <Trophy size={28} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Уровни клиентов</h4>
                <p className="text-sm text-gray-500 mt-1">Ступени программы и условия перехода между уровнями.</p>
                <div className="mt-3 flex items-center space-x-2 text-xs font-medium text-gray-400 group-hover:text-purple-500">
                   <span>Настроено: {levels.length} ур.</span>
                </div>
              </div>
            </div>
            <div className="p-2 bg-gray-50 rounded-full group-hover:bg-purple-50 text-gray-300 group-hover:text-purple-600 transition-colors">
               <ChevronRight size={20} />
            </div>
          </div>

          {/* Point Limitations Card - NOW CLICKABLE */}
          <div 
            onClick={() => setCurrentView('limitations_editor')}
            className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-start justify-between"
          >
            <div className="flex items-start space-x-4">
              <div className="p-3 rounded-lg bg-red-50 text-red-600 group-hover:bg-red-100 transition-colors">
                <Ban size={28} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Настройки бонусов</h4>
                <p className="text-sm text-gray-500 mt-1">Срок жизни, запреты и задержки начисления баллов.</p>
              </div>
            </div>
            <div className="p-2 bg-gray-50 rounded-full group-hover:bg-purple-50 text-gray-300 group-hover:text-purple-600 transition-colors">
               <ChevronRight size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Automations Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Дополнительные возможности</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mechanics.map((mech) => (
            <div 
              key={mech.id} 
              onClick={() => handleCardClick(mech.id)}
              className={`bg-white p-6 rounded-xl border transition-all duration-200 cursor-pointer group hover:shadow-md hover:border-purple-200 relative ${mech.enabled ? 'border-gray-200 shadow-sm' : 'border-gray-100 bg-gray-50/30'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-lg transition-colors ${mech.enabled ? mech.color : 'bg-gray-100 text-gray-400 group-hover:text-gray-600'}`}>
                  {mech.icon}
                </div>
                
                {/* Toggle Switch */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevents navigating when clicking the toggle
                    toggleMechanic(mech.id);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 z-10 ${mech.enabled ? 'bg-purple-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mech.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              
              <div className="space-y-2">
                 <div className="flex items-center space-x-2">
                    <h4 className={`text-lg font-bold transition-colors ${mech.enabled ? 'text-gray-900' : 'text-gray-600'}`}>{mech.title}</h4>
                    {!mech.enabled && <span className="text-[10px] uppercase font-bold text-gray-500 border border-gray-300 px-1.5 rounded">Выкл</span>}
                 </div>
                 <p className="text-sm text-gray-500 min-h-[40px]">{mech.description}</p>
                 
                 <div className="pt-4 mt-2 border-t border-gray-50 flex justify-between items-center">
                    <button 
                       className={`text-sm font-medium transition-colors flex items-center hover:text-purple-700 ${mech.enabled ? 'text-purple-600' : 'text-gray-500'}`}
                    >
                       <Settings size={14} className="mr-1.5" />
                       Настроить
                    </button>
                    {mech.enabled ? (
                      <span className="flex items-center text-xs text-green-600 font-medium">
                         <Power size={12} className="mr-1" /> Активна
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-gray-400">
                         <Power size={12} className="mr-1" /> Отключена
                      </span>
                    )}
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default LoyaltyMechanics;