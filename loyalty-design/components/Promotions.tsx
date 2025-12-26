import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Power, 
  Info, 
  Calendar, 
  Percent, 
  Gift, 
  Coins, 
  ShoppingBag,
  X,
  ArrowLeft,
  Save,
  Clock,
  Users,
  Search,
  Check,
  Edit,
  Pencil,
  ExternalLink
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { AppView } from '../types';

// --- Types ---

type PromotionStatus = 'active' | 'disabled' | 'ended';
type PromotionType = 'double_points' | 'buy_x_get_y' | 'promo_price';
type PointsRuleType = 'fixed' | 'percent' | 'multiplier';

interface PromotionConfig {
  targetType: 'products' | 'categories';
  selectedItemIds: string[];
  audience: string;
  usageLimit: string;
  pointsRuleType: PointsRuleType;
  pointsValue: number;
  buyCount: number;
  freeCount: number;
  promoPrice: number;
  startImmediately: boolean;
  isIndefinite: boolean;
}

interface Promotion {
  id: string;
  title: string;
  type: PromotionType;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
  revenue: number;
  cost: number;
  purchases: number;
  config: PromotionConfig; // Store full config for editing
}

interface PromotionsProps {
  onNavigate?: (view: AppView) => void;
}

// --- Helpers ---

const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

const calculateROI = (revenue: number, cost: number): number => {
  if (cost === 0) return 0;
  return ((revenue - cost) / cost) * 100;
};

// --- Mock Data Generators ---

const mockProducts = [
  { id: 'p1', name: 'Капучино Классический', category: 'Кофе' },
  { id: 'p2', name: 'Латте Макиато', category: 'Кофе' },
  { id: 'p3', name: 'Эспрессо', category: 'Кофе' },
  { id: 'p4', name: 'Круассан с шоколадом', category: 'Выпечка' },
  { id: 'p5', name: 'Круассан миндальный', category: 'Выпечка' },
  { id: 'p6', name: 'Чизкейк Нью-Йорк', category: 'Десерты' },
  { id: 'p7', name: 'Сэндвич с лососем', category: 'Еда' },
  { id: 'p8', name: 'Салат Цезарь', category: 'Еда' },
  { id: 'p9', name: 'Лимонад Домашний', category: 'Напитки' },
  { id: 'p10', name: 'Чай Зеленый', category: 'Напитки' },
  { id: 'p11', name: 'Брауни', category: 'Десерты' },
  { id: 'p12', name: 'Сырники со сметаной', category: 'Завтраки' },
];

const mockCategories = [
  { id: 'c1', name: 'Кофе', count: 12 },
  { id: 'c2', name: 'Выпечка', count: 8 },
  { id: 'c3', name: 'Десерты', count: 15 },
  { id: 'c4', name: 'Еда (Кухня)', count: 24 },
  { id: 'c5', name: 'Напитки б/а', count: 10 },
  { id: 'c6', name: 'Завтраки', count: 6 },
];

// --- Main Component ---

const Promotions: React.FC<PromotionsProps> = ({ onNavigate }) => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [activeTab, setActiveTab] = useState<PromotionStatus>('active');
  
  // Creation/Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<PromotionType | null>(null);
  const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  
  // Mock User Audiences
  const mockAudiences = [
    { id: 'gold', name: 'Золотой статус (VIP)', count: 120 },
    { id: 'churn', name: 'Риск оттока (30+ дней)', count: 450 },
    { id: 'staff', name: 'Сотрудники', count: 15 },
    { id: 'morning', name: 'Утренние посетители', count: 320 },
    { id: 'dessert_lovers', name: 'Любители сладкого', count: 540 }
  ];

  // Default Config
  const defaultConfig: PromotionConfig = {
    targetType: 'products',
    selectedItemIds: [],
    audience: 'all',
    usageLimit: 'unlimited',
    pointsRuleType: 'multiplier',
    pointsValue: 2,
    buyCount: 2,
    freeCount: 1,
    promoPrice: 99,
    startImmediately: true,
    isIndefinite: false,
  };

  // Form Data State
  const [formData, setFormData] = useState({
    title: '',
    isActive: false, // Draft by default
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    ...defaultConfig
  });

  // Mock Data
  const [promotions, setPromotions] = useState<Promotion[]>([
    {
      id: '1',
      title: 'Акционные баллы на Кофе',
      type: 'double_points',
      startDate: '01.12.2023',
      endDate: '31.12.2023',
      status: 'active',
      revenue: 150000,
      cost: 12000,
      purchases: 450,
      config: { ...defaultConfig, audience: 'morning' }
    },
    {
      id: '2',
      title: 'Круассан в подарок при покупке от 500₽',
      type: 'buy_x_get_y',
      startDate: '10.12.2023',
      endDate: '20.12.2023',
      status: 'active',
      revenue: 85000,
      cost: 15000,
      purchases: 120,
      config: { ...defaultConfig, audience: 'all' }
    },
    {
      id: '3',
      title: 'Скидка 20% на Ужины',
      type: 'promo_price',
      startDate: '01.11.2023',
      endDate: '30.11.2023',
      status: 'disabled',
      revenue: 320000,
      cost: 64000,
      purchases: 890,
      config: { ...defaultConfig, audience: 'gold' }
    },
    {
      id: '4',
      title: 'Летнее меню: 2+1',
      type: 'buy_x_get_y',
      startDate: '01.06.2023',
      endDate: '31.08.2023',
      status: 'ended',
      revenue: 1200000,
      cost: 250000,
      purchases: 3200,
      config: { ...defaultConfig, audience: 'all' }
    }
  ]);

  const filteredPromotions = promotions.filter(p => p.status === activeTab);

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

  const startCreation = (type: PromotionType) => {
    setSelectedType(type);
    setEditingId(null);
    setIsTypeSelectionOpen(false);
    
    // Reset form with smart defaults based on type
    setFormData({
      title: type === 'double_points' ? 'Акционные баллы' : type === 'buy_x_get_y' ? 'Акция 2+1' : 'Специальная цена',
      isActive: false,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      ...defaultConfig
    });
    setProductSearch('');
    setView('create');
  };

  const handleEdit = (promo: Promotion) => {
    setSelectedType(promo.type);
    setEditingId(promo.id);
    
    // Parse dates back to YYYY-MM-DD for input
    const parseDate = (dateStr: string) => {
       if (dateStr === 'Бессрочно') return new Date().toISOString().split('T')[0];
       const parts = dateStr.split('.');
       if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
       return dateStr;
    };

    setFormData({
      title: promo.title,
      isActive: promo.status === 'active',
      startDate: parseDate(promo.startDate),
      endDate: parseDate(promo.endDate),
      // Spread the stored config
      targetType: promo.config.targetType,
      selectedItemIds: promo.config.selectedItemIds,
      audience: promo.config.audience,
      usageLimit: promo.config.usageLimit,
      pointsRuleType: promo.config.pointsRuleType,
      pointsValue: promo.config.pointsValue,
      buyCount: promo.config.buyCount,
      freeCount: promo.config.freeCount,
      promoPrice: promo.config.promoPrice,
      startImmediately: promo.config.startImmediately,
      isIndefinite: promo.config.isIndefinite,
    });
    
    setProductSearch('');
    setView('create');
  };

  const handleSave = () => {
    if (!selectedType) return;
    
    const configData: PromotionConfig = {
      targetType: formData.targetType,
      selectedItemIds: formData.selectedItemIds,
      audience: formData.audience,
      usageLimit: formData.usageLimit,
      pointsRuleType: formData.pointsRuleType,
      pointsValue: formData.pointsValue,
      buyCount: formData.buyCount,
      freeCount: formData.freeCount,
      promoPrice: formData.promoPrice,
      startImmediately: formData.startImmediately,
      isIndefinite: formData.isIndefinite,
    };

    const commonData = {
      title: formData.title,
      type: selectedType,
      startDate: formData.startImmediately ? new Date().toLocaleDateString('ru-RU') : new Date(formData.startDate).toLocaleDateString('ru-RU'),
      endDate: formData.isIndefinite ? 'Бессрочно' : new Date(formData.endDate).toLocaleDateString('ru-RU'),
      status: (formData.isActive ? 'active' : 'disabled') as PromotionStatus,
      config: configData
    };

    if (editingId) {
      // Update existing
      setPromotions(prev => prev.map(p => p.id === editingId ? { ...p, ...commonData } : p));
    } else {
      // Create new
      const newPromo: Promotion = {
        id: Date.now().toString(),
        revenue: 0,
        cost: 0,
        purchases: 0,
        ...commonData
      };
      setPromotions(prev => [newPromo, ...prev]);
    }

    setView('list');
    setActiveTab(formData.isActive ? 'active' : 'disabled');
  };

  const toggleSelection = (id: string) => {
    setFormData(prev => {
      const exists = prev.selectedItemIds.includes(id);
      if (exists) {
        return { ...prev, selectedItemIds: prev.selectedItemIds.filter(item => item !== id) };
      } else {
        return { ...prev, selectedItemIds: [...prev.selectedItemIds, id] };
      }
    });
  };

  const getIconForType = (type: PromotionType) => {
    switch (type) {
      case 'double_points': return <Coins size={20} className="text-yellow-600" />;
      case 'buy_x_get_y': return <Gift size={20} className="text-purple-600" />;
      case 'promo_price': return <Percent size={20} className="text-red-600" />;
    }
  };

  const getTypeLabel = (type: PromotionType) => {
     switch (type) {
      case 'double_points': return 'Акционные баллы';
      case 'buy_x_get_y': return 'N-ый товар бесплатно';
      case 'promo_price': return 'Акционная цена';
    }
  };

  const getAudienceLabel = (id: string) => {
    if (id === 'all') return 'Все клиенты';
    const aud = mockAudiences.find(a => a.id === id);
    return aud ? aud.name : 'Неизвестно';
  };

  // Filtered lists for the wizard
  const visibleItems = useMemo(() => {
    if (formData.targetType === 'products') {
      return mockProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
    } else {
      return mockCategories.filter(c => c.name.toLowerCase().includes(productSearch.toLowerCase()));
    }
  }, [formData.targetType, productSearch]);

  // --- Renders ---

  const renderCreateForm = () => {
    return (
      <div className="max-w-4xl mx-auto pb-10">
        {/* Creation Header */}
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center space-x-4">
              <button 
                onClick={() => setView('list')}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                 <ArrowLeft size={24} />
              </button>
              <div>
                 <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование акции' : 'Создание акции'}</h2>
                 <p className="text-sm text-gray-500">{getTypeLabel(selectedType!)}</p>
              </div>
           </div>
           
           <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-lg border border-gray-200">
                 <span className={`text-sm font-medium ${formData.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {formData.isActive ? 'Активна' : 'Черновик'}
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
           {/* Left Column: Main Settings */}
           <div className="lg:col-span-2 space-y-6">
              
              {/* 1. General Info */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>
                 
                 <div>
                    <div className="flex justify-between items-center mb-1">
                       <label className="block text-sm font-medium text-gray-700">Название акции</label>
                       <span className={`text-xs ${formData.title.length >= 60 ? 'text-red-500' : 'text-gray-400'}`}>
                          {formData.title.length}/60
                       </span>
                    </div>
                    <input 
                      type="text" 
                      maxLength={60}
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      placeholder="Например: Двойные баллы на утренний кофе"
                    />
                    <p className="text-xs text-gray-500 mt-1">Краткое название для отображения в списке.</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Начало акции</label>
                       <div className="space-y-2">
                          <input 
                            type="date" 
                            disabled={formData.startImmediately}
                            value={formData.startDate}
                            onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                          <label className="flex items-center space-x-2 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={formData.startImmediately}
                               onChange={(e) => setFormData({...formData, startImmediately: e.target.checked})}
                               className="rounded text-purple-600 focus:ring-purple-500"
                             />
                             <span className="text-sm text-gray-600">Начать сразу после создания</span>
                          </label>
                       </div>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">Завершение</label>
                       <div className="space-y-2">
                          <input 
                            type="date" 
                            disabled={formData.isIndefinite}
                            value={formData.endDate}
                            onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                          />
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

              {/* 2. Products Selector */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex justify-between items-center">
                   <h3 className="text-lg font-bold text-gray-900">Товары и Категории</h3>
                   <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                     Выбрано: {formData.selectedItemIds.length}
                   </span>
                 </div>
                 
                 <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                    <button 
                       onClick={() => setFormData({...formData, targetType: 'products', selectedItemIds: []})}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${formData.targetType === 'products' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                    >
                       Товары
                    </button>
                    <button 
                       onClick={() => setFormData({...formData, targetType: 'categories', selectedItemIds: []})}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${formData.targetType === 'categories' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                    >
                       Категории
                    </button>
                 </div>

                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                       type="text"
                       value={productSearch}
                       onChange={(e) => setProductSearch(e.target.value)}
                       placeholder={formData.targetType === 'products' ? "Поиск товаров по названию..." : "Поиск категорий..."}
                       className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                 </div>

                 <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto custom-scrollbar">
                    {visibleItems.length === 0 ? (
                       <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
                    ) : (
                       visibleItems.map(item => {
                          const isSelected = formData.selectedItemIds.includes(item.id);
                          return (
                             <div 
                               key={item.id} 
                               onClick={() => toggleSelection(item.id)}
                               className={`p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50 hover:bg-purple-50' : ''}`}
                             >
                                <div className="flex items-center space-x-3">
                                   <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-purple-200 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {item.name.charAt(0)}
                                   </div>
                                   <div>
                                      <div className={`text-sm font-medium ${isSelected ? 'text-purple-900' : 'text-gray-900'}`}>
                                         {item.name}
                                      </div>
                                      <div className="text-xs text-gray-500 flex items-center space-x-2">
                                         {formData.targetType === 'products' && 'category' in item && (
                                           <span className="bg-gray-100 px-1.5 rounded">{item.category}</span>
                                         )}
                                         {formData.targetType === 'categories' && 'count' in item && (
                                            <span>{item.count} товаров</span>
                                         )}
                                      </div>
                                   </div>
                                </div>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>
                                   {isSelected && <Check size={14} className="text-white" />}
                                </div>
                             </div>
                          );
                       })
                    )}
                 </div>
              </div>

              {/* 3. Mechanics Specific Settings */}
              <div className="bg-white p-6 rounded-xl border border-purple-100 shadow-sm space-y-6 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
                 <h3 className="text-lg font-bold text-gray-900 relative z-10">Настройка выгоды</h3>
                 
                 {/* TYPE: POINTS */}
                 {selectedType === 'double_points' && (
                    <div className="space-y-6 relative z-10">
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">Правило начисления</label>
                          <div className="grid grid-cols-3 gap-3">
                             <button 
                               onClick={() => setFormData({...formData, pointsRuleType: 'multiplier'})}
                               className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${formData.pointsRuleType === 'multiplier' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-200'}`}
                             >
                                <span className="font-bold text-lg">X2</span>
                                <span className="text-xs">Множитель</span>
                             </button>
                             <button 
                               onClick={() => setFormData({...formData, pointsRuleType: 'percent'})}
                               className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${formData.pointsRuleType === 'percent' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-200'}`}
                             >
                                <Percent size={20} />
                                <span className="text-xs">% от цены</span>
                             </button>
                             <button 
                               onClick={() => setFormData({...formData, pointsRuleType: 'fixed'})}
                               className={`p-3 border rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${formData.pointsRuleType === 'fixed' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-200'}`}
                             >
                                <Coins size={20} />
                                <span className="text-xs">Фикс. баллы</span>
                             </button>
                          </div>
                       </div>
                       
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                             {formData.pointsRuleType === 'multiplier' ? 'Значение множителя' : 
                              formData.pointsRuleType === 'percent' ? 'Процент начисления' : 'Количество баллов'}
                          </label>
                          <div className="relative">
                             <input 
                               type="number" 
                               value={formData.pointsValue}
                               onChange={(e) => setFormData({...formData, pointsValue: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                                {formData.pointsRuleType === 'multiplier' ? 'X' : 
                                 formData.pointsRuleType === 'percent' ? '%' : 'B'}
                             </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                             {formData.pointsRuleType === 'multiplier' && `Клиент получит в ${formData.pointsValue} раза больше баллов, чем по базовому тарифу.`}
                             {formData.pointsRuleType === 'percent' && `Клиент получит ${formData.pointsValue}% от стоимости товара в виде баллов.`}
                             {formData.pointsRuleType === 'fixed' && `За покупку товара будет начислено ровно ${formData.pointsValue} баллов.`}
                          </p>
                       </div>
                    </div>
                 )}

                 {/* TYPE: BUNDLE */}
                 {selectedType === 'buy_x_get_y' && (
                    <div className="grid grid-cols-2 gap-6 relative z-10">
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Купить (N)</label>
                          <div className="relative">
                             <input 
                               type="number" 
                               value={formData.buyCount}
                               onChange={(e) => setFormData({...formData, buyCount: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">шт.</div>
                          </div>
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">В подарок (M)</label>
                          <div className="relative">
                             <input 
                               type="number" 
                               value={formData.freeCount}
                               onChange={(e) => setFormData({...formData, freeCount: Number(e.target.value)})}
                               className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             />
                             <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">шт.</div>
                          </div>
                       </div>
                       <div className="col-span-2 bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex items-start space-x-2">
                          <Info size={16} className="mt-0.5 flex-shrink-0" />
                          <span>При покупке {formData.buyCount} товаров, клиент получит еще {formData.freeCount} бесплатно. В чеке будет {formData.buyCount + formData.freeCount} позиций.</span>
                       </div>
                    </div>
                 )}

                 {/* TYPE: PRICE */}
                 {selectedType === 'promo_price' && (
                    <div className="relative z-10">
                       <label className="block text-sm font-medium text-gray-700 mb-1">Новая цена товара</label>
                       <div className="relative">
                          <input 
                            type="number" 
                            value={formData.promoPrice}
                            onChange={(e) => setFormData({...formData, promoPrice: Number(e.target.value)})}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none pl-8"
                          />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₽</div>
                       </div>
                       <p className="text-xs text-gray-500 mt-2">Эта цена будет применена ко всем выбранным товарам на период акции.</p>
                    </div>
                 )}
              </div>
           </div>

           {/* Right Column: Targeting & Limits */}
           <div className="space-y-6">
              
              {/* Audience */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <div className="flex items-center justify-between mb-2">
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Выберите сегмент</label>
                    <select 
                       value={formData.audience}
                       onChange={(e) => setFormData({...formData, audience: e.target.value})}
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                       <option value="all">Все клиенты</option>
                       {mockAudiences.map(aud => (
                          <option key={aud.id} value={aud.id}>
                             {aud.name} ({aud.count} чел.)
                          </option>
                       ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                       {formData.audience === 'all' 
                          ? 'Акция будет доступна всем зарегистрированным клиентам.' 
                          : `Акция доступна только клиентам из сегмента "${mockAudiences.find(a => a.id === formData.audience)?.name}".`
                       }
                    </p>
                 </div>
              </div>

              {/* Limits */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg mb-2">
                    <Clock size={20} className="text-gray-400" />
                    <h3>Ограничения</h3>
                 </div>
                 
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Частота использования</label>
                    <select 
                       value={formData.usageLimit}
                       onChange={(e) => setFormData({...formData, usageLimit: e.target.value})}
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                       <option value="unlimited">Без ограничений</option>
                       <option value="once_per_client">1 раз на клиента</option>
                       <option value="once_per_day">1 раз в сутки</option>
                       <option value="once_per_week">1 раз в неделю</option>
                       <option value="once_per_month">1 раз в месяц</option>
                    </select>
                 </div>
                 
                 <div className="p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700 flex items-start space-x-2">
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>Ограничение действует на уровне аккаунта клиента.</span>
                 </div>
              </div>

           </div>
        </div>
      </div>
    );
  };

  if (view === 'create') {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
        {renderCreateForm()}
      </div>
    );
  }

  // LIST VIEW RENDER
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Акции с товарами</h2>
           <p className="text-gray-500 mt-1">Управление товарными акциями, скидками и бонусами.</p>
        </div>
        
        <button 
          onClick={() => setIsTypeSelectionOpen(true)}
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

      {/* Grid */}
      {filteredPromotions.length === 0 ? (
         <div className="text-center py-20 bg-white rounded-xl border border-gray-100 border-dashed">
            <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Здесь пока ничего нет</h3>
            <p className="text-gray-500">В этом разделе пока нет акций.</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredPromotions.map((promo) => {
            const roi = calculateROI(promo.revenue, promo.cost);
            return (
              <div key={promo.id} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative group">
                
                {/* Top Row: Status & Actions */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                     <div className={`p-2 rounded-lg ${
                        promo.type === 'double_points' ? 'bg-yellow-50' : 
                        promo.type === 'buy_x_get_y' ? 'bg-purple-50' : 'bg-red-50'
                     }`}>
                        {getIconForType(promo.type)}
                     </div>
                     <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{getTypeLabel(promo.type)}</span>
                        <div className="flex items-center text-sm text-gray-400 mt-0.5">
                           <Calendar size={12} className="mr-1" />
                           {promo.startDate} - {promo.endDate}
                        </div>
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

                {/* Title & Badge */}
                <div className="mb-3 pr-4 mt-2 min-h-[2.5rem]">
                   <h3 className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight break-words" title={promo.title}>
                      {promo.title}
                      <span className="inline-flex items-center ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 align-middle whitespace-nowrap">
                        <Users size={12} className="mr-1" />
                        {getAudienceLabel(promo.config.audience)}
                     </span>
                   </h3>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-50">
                   {/* ROI */}
                   <div>
                      <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                         <span>ROI</span>
                         <Info size={10} className="ml-1 text-gray-300" />
                         {/* Tooltip */}
                         <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                            Насколько окупились ваши вложения. <br/>
                            Формула: (Выручка - Расходы)/Расходы * 100%
                         </div>
                      </div>
                      <div className={`text-lg font-bold ${roi > 0 ? 'text-green-600' : roi < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                         {roi > 0 ? '+' : ''}{roi.toFixed(0)}%
                      </div>
                   </div>

                   {/* Revenue */}
                   <div>
                      <div className="relative group/tooltip w-fit flex items-center text-xs text-gray-500 mb-1 cursor-help">
                         <span>Выручка</span>
                         <Info size={10} className="ml-1 text-gray-300" />
                         {/* Tooltip */}
                         <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                            Сумма чеков с применёнными акциями без учёта скидок и подарков. Возвраты не учитываются.
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
                         <div className="hidden group-hover/tooltip:block absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-20 shadow-xl pointer-events-none">
                            Сумма скидок с применённых акций.
                         </div>
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                         {formatCurrency(promo.cost)}
                      </div>
                   </div>

                   {/* Purchases */}
                   <div>
                      <div className="flex items-center text-xs text-gray-500 mb-1">
                         <span>Покупок</span>
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                         {promo.purchases}
                      </div>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Type Selection Modal */}
      {isTypeSelectionOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101] overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                 <h3 className="text-xl font-bold text-gray-900">Создать акцию</h3>
                 <button onClick={() => setIsTypeSelectionOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                 </button>
              </div>
              <div className="p-6 space-y-4">
                 <p className="text-sm text-gray-500 mb-4">Выберите тип механики для новой акции:</p>
                 
                 <button 
                   onClick={() => startCreation('double_points')}
                   className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-start space-x-4 group"
                 >
                    <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg group-hover:bg-yellow-100">
                       <Coins size={24} />
                    </div>
                    <div>
                       <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Акционные баллы на товары</h4>
                       <p className="text-sm text-gray-500 mt-1">Клиенты получают дополнительные баллы за покупку определенных товаров.</p>
                    </div>
                 </button>

                 <button 
                   onClick={() => startCreation('buy_x_get_y')}
                   className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-start space-x-4 group"
                 >
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100">
                       <Gift size={24} />
                    </div>
                    <div>
                       <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Каждый N-ый товар бесплатно</h4>
                       <p className="text-sm text-gray-500 mt-1">Механики «2+1», «3-й в подарок» и другие комплектные акции.</p>
                    </div>
                 </button>

                 <button 
                   onClick={() => startCreation('promo_price')}
                   className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-start space-x-4 group"
                 >
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg group-hover:bg-red-100">
                       <Percent size={24} />
                    </div>
                    <div>
                       <h4 className="font-bold text-gray-900 group-hover:text-purple-700">Акционная цена на товары</h4>
                       <p className="text-sm text-gray-500 mt-1">Фиксированная скидка или специальная цена на выбранные позиции.</p>
                    </div>
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Promotions;