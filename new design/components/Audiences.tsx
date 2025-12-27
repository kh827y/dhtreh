import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  ArrowLeft, 
  Save, 
  Calendar, 
  ShoppingBag, 
  DollarSign, 
  Target, 
  User, 
  Check
} from 'lucide-react';

interface Audience {
  id: string;
  name: string;
  count: number;
  createdAt: string;
  description: string;
}

interface AudienceFormData {
  name: string;
  // Outlets & Products
  selectedOutlets: string[];
  targetType: 'products' | 'categories';
  selectedProducts: string[];
  selectedCategories: string[];
  // Demographics
  gender: 'all' | 'M' | 'F' | 'U';
  ageFrom: string;
  ageTo: string;
  birthdayBefore: string; // days
  birthdayAfter: string; // days
  // Activity
  regDaysFrom: string;
  regDaysTo: string;
  lastPurchaseFrom: string;
  lastPurchaseTo: string;
  // Financials
  purchaseCountFrom: string;
  purchaseCountTo: string;
  avgCheckFrom: string;
  avgCheckTo: string;
  totalSpendFrom: string;
  totalSpendTo: string;
  // Segmentation
  selectedLevels: string[];
  selectedR: string[]; // 1-5
  selectedF: string[];
  selectedM: string[];
}

const initialFormData: AudienceFormData = {
  name: '',
  selectedOutlets: [],
  targetType: 'products',
  selectedProducts: [],
  selectedCategories: [],
  gender: 'all',
  ageFrom: '', ageTo: '',
  birthdayBefore: '', birthdayAfter: '',
  regDaysFrom: '', regDaysTo: '',
  lastPurchaseFrom: '', lastPurchaseTo: '',
  purchaseCountFrom: '', purchaseCountTo: '',
  avgCheckFrom: '', avgCheckTo: '',
  totalSpendFrom: '', totalSpendTo: '',
  selectedLevels: [],
  selectedR: [], selectedF: [], selectedM: []
};

// Mock Data
const mockOutlets = ['Центральный магазин', 'ТЦ Сити Молл', 'Киоск Аэропорт', 'Филиал Пригород', 'Онлайн магазин'];

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
];

const mockCategories = [
  { id: 'c1', name: 'Кофе', count: 12 },
  { id: 'c2', name: 'Выпечка', count: 8 },
  { id: 'c3', name: 'Десерты', count: 15 },
  { id: 'c4', name: 'Еда (Кухня)', count: 24 },
  { id: 'c5', name: 'Напитки б/а', count: 10 },
];

const mockLevels = ['Silver', 'Gold', 'Platinum'];

const Audiences: React.FC = () => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  
  const [audiences, setAudiences] = useState<Audience[]>([
    { id: '1', name: 'Лояльные клиенты (Gold)', count: 450, createdAt: '20.12.2023', description: 'Клиенты уровня Gold с покупками за посл. 30 дней' },
    { id: '2', name: 'Риск оттока', count: 120, createdAt: '15.12.2023', description: 'Не покупали более 60 дней' },
    { id: '3', name: 'Именинники (Январь)', count: 85, createdAt: '01.01.2024', description: 'День рождения в ближайшие 30 дней' },
    { id: '4', name: 'Любители кофе', count: 1200, createdAt: '10.11.2023', description: 'Покупали товары категории Кофе более 5 раз' },
  ]);

  const [formData, setFormData] = useState<AudienceFormData>(initialFormData);

  // --- Handlers ---

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData(initialFormData);
    setProductSearch('');
    setView('create');
  };

  const handleStartEdit = (audience: Audience) => {
    setEditingId(audience.id);
    setFormData({
      ...initialFormData,
      name: audience.name,
      // simulating some data
      gender: 'all',
      selectedLevels: audience.name.includes('Gold') ? ['Gold'] : [],
    });
    setProductSearch('');
    setView('create');
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить эту аудиторию?')) {
      setAudiences(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleSave = () => {
    if (!formData.name) return alert('Введите название аудитории');

    const newAudience: Audience = {
      id: editingId || Date.now().toString(),
      name: formData.name,
      count: Math.floor(Math.random() * 1000) + 50, // Mock calc
      createdAt: new Date().toLocaleDateString('ru-RU'),
      description: 'Пользовательский сегмент'
    };

    if (editingId) {
      setAudiences(prev => prev.map(a => a.id === editingId ? newAudience : a));
    } else {
      setAudiences(prev => [newAudience, ...prev]);
    }
    setView('list');
  };

  // Toggle Helpers
  const toggleSelection = (list: string[], item: string) => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
  };

  const toggleProductSelection = (id: string) => {
    setFormData(prev => {
      const list = prev.targetType === 'products' ? prev.selectedProducts : prev.selectedCategories;
      const key = prev.targetType === 'products' ? 'selectedProducts' : 'selectedCategories';
      
      const newList = list.includes(id) ? list.filter(i => i !== id) : [...list, id];
      return { ...prev, [key]: newList };
    });
  };

  const filteredAudiences = audiences.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const visibleItems = useMemo(() => {
    if (formData.targetType === 'products') {
      return mockProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
    } else {
      return mockCategories.filter(c => c.name.toLowerCase().includes(productSearch.toLowerCase()));
    }
  }, [formData.targetType, productSearch]);

  // --- Views ---

  if (view === 'create') {
    return (
      <div className="p-8 max-w-[1200px] mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center space-x-4">
              <button onClick={() => setView('list')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                 <ArrowLeft size={24} />
              </button>
              <div>
                 <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование аудитории' : 'Новая аудитория'}</h2>
                 <p className="text-sm text-gray-500">Настройте параметры сегментации клиентов.</p>
              </div>
           </div>
           <button onClick={handleSave} className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 shadow-sm">
              <Save size={18} />
              <span>Сохранить</span>
           </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
           
           {/* Section 1: General & Targeting */}
           <div className="space-y-6">
              
              {/* Name */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                 <label className="block text-sm font-medium text-gray-900 mb-2">Название аудитории <span className="text-red-500">*</span></label>
                 <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    placeholder="Например: Покупатели кофе"
                 />
              </div>

              {/* Geo & Products */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <Target size={20} className="text-purple-600" />
                    <h3>Точки и Товары</h3>
                 </div>

                 {/* Outlets */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Посещал точки</label>
                    <div className="flex flex-wrap gap-2">
                       {mockOutlets.map(outlet => (
                          <button
                             key={outlet}
                             onClick={() => setFormData({...formData, selectedOutlets: toggleSelection(formData.selectedOutlets, outlet)})}
                             className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                formData.selectedOutlets.includes(outlet) 
                                ? 'bg-purple-100 border-purple-200 text-purple-800' 
                                : 'bg-white border-gray-200 text-gray-600 hover:border-purple-200'
                             }`}
                          >
                             {outlet}
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* Products Selection */}
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                       <label className="block text-sm font-medium text-gray-700">Покупал товары</label>
                       <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                          Выбрано: {formData.targetType === 'products' ? formData.selectedProducts.length : formData.selectedCategories.length}
                       </span>
                    </div>

                    <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                        <button 
                           onClick={() => setFormData({...formData, targetType: 'products'})}
                           className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${formData.targetType === 'products' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                        >
                           Товары
                        </button>
                        <button 
                           onClick={() => setFormData({...formData, targetType: 'categories'})}
                           className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${formData.targetType === 'categories' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                        >
                           Категории
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                           type="text"
                           value={productSearch}
                           onChange={(e) => setProductSearch(e.target.value)}
                           placeholder={formData.targetType === 'products' ? "Поиск товаров..." : "Поиск категорий..."}
                           className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                    </div>

                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto custom-scrollbar">
                        {visibleItems.length === 0 ? (
                           <div className="p-4 text-center text-sm text-gray-500">Ничего не найдено</div>
                        ) : (
                           visibleItems.map(item => {
                              const isSelected = formData.targetType === 'products' 
                                 ? formData.selectedProducts.includes(item.id) 
                                 : formData.selectedCategories.includes(item.id);
                              
                              return (
                                 <div 
                                   key={item.id} 
                                   onClick={() => toggleProductSelection(item.id)}
                                   className={`p-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50' : ''}`}
                                 >
                                    <div className="flex items-center space-x-3">
                                       <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${isSelected ? 'bg-purple-200 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                                          {item.name.charAt(0)}
                                       </div>
                                       <div>
                                          <div className={`text-sm ${isSelected ? 'font-medium text-purple-900' : 'text-gray-700'}`}>
                                             {item.name}
                                          </div>
                                          {formData.targetType === 'products' && 'category' in item && (
                                             <div className="text-[10px] text-gray-400">{item.category}</div>
                                          )}
                                          {formData.targetType === 'categories' && 'count' in item && (
                                             <div className="text-[10px] text-gray-400">{item.count} товаров</div>
                                          )}
                                       </div>
                                    </div>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>
                                       {isSelected && <Check size={10} className="text-white" />}
                                    </div>
                                 </div>
                              );
                           })
                        )}
                    </div>
                 </div>
              </div>

              {/* Demographics */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <User size={20} className="text-blue-500" />
                    <h3>Демография</h3>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
                       <select 
                          value={formData.gender}
                          onChange={(e) => setFormData({...formData, gender: e.target.value as any})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                       >
                          <option value="all">Любой</option>
                          <option value="M">Мужской</option>
                          <option value="F">Женский</option>
                          <option value="U">Не указан</option>
                       </select>
                    </div>
                    
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Возраст</label>
                       <div className="flex items-center space-x-2">
                          <input 
                             type="number" 
                             placeholder="От" 
                             value={formData.ageFrom}
                             onChange={(e) => setFormData({...formData, ageFrom: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                          <span className="text-gray-400">-</span>
                          <input 
                             type="number" 
                             placeholder="До" 
                             value={formData.ageTo}
                             onChange={(e) => setFormData({...formData, ageTo: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                       </div>
                    </div>
                 </div>

                 {/* Birthday */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">День рождения (относительно сегодня)</label>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="relative">
                          <input 
                             type="number" 
                             value={formData.birthdayBefore}
                             onChange={(e) => setFormData({...formData, birthdayBefore: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-12"
                             placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">дней до</span>
                       </div>
                       <div className="relative">
                          <input 
                             type="number" 
                             value={formData.birthdayAfter}
                             onChange={(e) => setFormData({...formData, birthdayAfter: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-12"
                             placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">дней после</span>
                       </div>
                    </div>
                 </div>
              </div>

           </div>

           {/* Section 2: Behavior & RFM */}
           <div className="space-y-6">
              
              {/* Activity */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <Calendar size={20} className="text-orange-500" />
                    <h3>Активность</h3>
                 </div>

                 {/* Registration Days */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Дней с регистрации</label>
                    <div className="flex items-center space-x-2">
                       <input 
                          type="number" 
                          placeholder="От" 
                          value={formData.regDaysFrom}
                          onChange={(e) => setFormData({...formData, regDaysFrom: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                       <span className="text-gray-400">-</span>
                       <input 
                          type="number" 
                          placeholder="До" 
                          value={formData.regDaysTo}
                          onChange={(e) => setFormData({...formData, regDaysTo: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                    </div>
                 </div>

                 {/* Last Purchase */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Дней с последней покупки</label>
                    <div className="flex items-center space-x-2">
                       <input 
                          type="number" 
                          placeholder="От" 
                          value={formData.lastPurchaseFrom}
                          onChange={(e) => setFormData({...formData, lastPurchaseFrom: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                       <span className="text-gray-400">-</span>
                       <input 
                          type="number" 
                          placeholder="До" 
                          value={formData.lastPurchaseTo}
                          onChange={(e) => setFormData({...formData, lastPurchaseTo: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                    </div>
                 </div>

                 {/* Purchase Count */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Количество покупок</label>
                    <div className="flex items-center space-x-2">
                       <input 
                          type="number" 
                          placeholder="От" 
                          value={formData.purchaseCountFrom}
                          onChange={(e) => setFormData({...formData, purchaseCountFrom: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                       <span className="text-gray-400">-</span>
                       <input 
                          type="number" 
                          placeholder="До" 
                          value={formData.purchaseCountTo}
                          onChange={(e) => setFormData({...formData, purchaseCountTo: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                    </div>
                 </div>
              </div>

              {/* Financials */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <DollarSign size={20} className="text-green-600" />
                    <h3>Финансы</h3>
                 </div>

                 {/* Avg Check */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Средний чек (₽)</label>
                    <div className="flex items-center space-x-2">
                       <input 
                          type="number" 
                          placeholder="От" 
                          value={formData.avgCheckFrom}
                          onChange={(e) => setFormData({...formData, avgCheckFrom: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                       <span className="text-gray-400">-</span>
                       <input 
                          type="number" 
                          placeholder="До" 
                          value={formData.avgCheckTo}
                          onChange={(e) => setFormData({...formData, avgCheckTo: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                    </div>
                 </div>

                 {/* Total Spend */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Сумма покупок (₽)</label>
                    <div className="flex items-center space-x-2">
                       <input 
                          type="number" 
                          placeholder="От" 
                          value={formData.totalSpendFrom}
                          onChange={(e) => setFormData({...formData, totalSpendFrom: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                       <span className="text-gray-400">-</span>
                       <input 
                          type="number" 
                          placeholder="До" 
                          value={formData.totalSpendTo}
                          onChange={(e) => setFormData({...formData, totalSpendTo: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                       />
                    </div>
                 </div>
              </div>

              {/* Segmentation */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <ShoppingBag size={20} className="text-pink-600" />
                    <h3>Сегментация</h3>
                 </div>

                 {/* Levels */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Уровень клиента</label>
                    <div className="flex flex-wrap gap-2">
                       {mockLevels.map(lvl => (
                          <button
                             key={lvl}
                             onClick={() => setFormData({...formData, selectedLevels: toggleSelection(formData.selectedLevels, lvl)})}
                             className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                formData.selectedLevels.includes(lvl) 
                                ? 'bg-yellow-100 border-yellow-200 text-yellow-800' 
                                : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-200'
                             }`}
                          >
                             {lvl}
                          </button>
                       ))}
                    </div>
                 </div>

                 {/* RFM */}
                 <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">RFM Сегменты (1 = плохо, 5 = отлично)</label>
                    
                    {/* R */}
                    <div className="flex items-center space-x-3">
                       <span className="text-xs font-bold w-4 text-gray-500">R</span>
                       <div className="flex space-x-1">
                          {['1','2','3','4','5'].map(val => (
                             <button 
                               key={val}
                               onClick={() => setFormData({...formData, selectedR: toggleSelection(formData.selectedR, val)})}
                               className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${formData.selectedR.includes(val) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                             >
                                {val}
                             </button>
                          ))}
                       </div>
                       <span className="text-xs text-gray-400">Давность</span>
                    </div>

                    {/* F */}
                    <div className="flex items-center space-x-3">
                       <span className="text-xs font-bold w-4 text-gray-500">F</span>
                       <div className="flex space-x-1">
                          {['1','2','3','4','5'].map(val => (
                             <button 
                               key={val}
                               onClick={() => setFormData({...formData, selectedF: toggleSelection(formData.selectedF, val)})}
                               className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${formData.selectedF.includes(val) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                             >
                                {val}
                             </button>
                          ))}
                       </div>
                       <span className="text-xs text-gray-400">Частота</span>
                    </div>

                    {/* M */}
                    <div className="flex items-center space-x-3">
                       <span className="text-xs font-bold w-4 text-gray-500">M</span>
                       <div className="flex space-x-1">
                          {['1','2','3','4','5'].map(val => (
                             <button 
                               key={val}
                               onClick={() => setFormData({...formData, selectedM: toggleSelection(formData.selectedM, val)})}
                               className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${formData.selectedM.includes(val) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                             >
                                {val}
                             </button>
                          ))}
                       </div>
                       <span className="text-xs text-gray-400">Деньги</span>
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
           <h2 className="text-2xl font-bold text-gray-900">Аудитории</h2>
           <p className="text-gray-500 mt-1">Создание сегментов клиентов для таргетированных рассылок и акций.</p>
        </div>
        
        <button 
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать аудиторию</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         
         {/* Filters Bar */}
         <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                  type="text"
                  placeholder="Поиск аудитории..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
               />
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-500">
               <Filter size={16} />
               <span>{filteredAudiences.length} сегментов</span>
            </div>
         </div>

         {/* Table */}
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Название</th>
                     <th className="px-6 py-4 font-semibold">Описание</th>
                     <th className="px-6 py-4 font-semibold text-right">Размер</th>
                     <th className="px-6 py-4 font-semibold text-right">Создана</th>
                     <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredAudiences.length === 0 ? (
                     <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                           <Users size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>Аудитории не найдены.</p>
                        </td>
                     </tr>
                  ) : (
                     filteredAudiences.map((audience) => (
                        <tr key={audience.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4 font-medium text-purple-600">
                              {audience.name}
                           </td>
                           <td className="px-6 py-4 text-gray-600 max-w-md truncate">
                              {audience.description}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                 {audience.count} чел.
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right text-gray-500 text-xs">
                              {audience.createdAt}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                 <button 
                                    onClick={() => alert(`Просмотр состава аудитории: ${audience.name}`)}
                                    title="Просмотр состава"
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                 >
                                    <Eye size={16} />
                                 </button>
                                 <button 
                                    onClick={() => handleStartEdit(audience)}
                                    title="Редактировать"
                                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                 >
                                    <Edit size={16} />
                                 </button>
                                 <button 
                                    onClick={() => handleDelete(audience.id)}
                                    title="Удалить"
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                 >
                                    <Trash2 size={16} />
                                 </button>
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

export default Audiences;