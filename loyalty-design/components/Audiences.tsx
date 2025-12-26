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
  Check,
  X,
  Phone,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { createPortal } from 'react-dom';

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
  
  // Members Modal State
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [viewingAudience, setViewingAudience] = useState<Audience | null>(null);
  const [membersSearch, setMembersSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const modalItemsPerPage = 12;

  const [audiences, setAudiences] = useState<Audience[]>([
    { id: '1', name: 'Лояльные клиенты (Gold)', count: 450, createdAt: '20.12.2023', description: 'Клиенты уровня Gold с покупками за посл. 30 дней' },
    { id: '2', name: 'Риск оттока', count: 120, createdAt: '15.12.2023', description: 'Не покупали более 60 дней' },
    { id: '3', name: 'Именинники (Январь)', count: 85, createdAt: '01.01.2024', description: 'День рождения в ближайшие 30 дней' },
    { id: '4', name: 'Любители кофе', count: 1200, createdAt: '10.11.2023', description: 'Покупали товары категории Кофе более 5 раз' },
  ]);

  const [formData, setFormData] = useState<AudienceFormData>(initialFormData);

  // --- Mock Members Data Generator ---
  const allAudienceMembers = useMemo(() => {
    if (!viewingAudience) return [];
    const displayCount = Math.min(viewingAudience.count, 500); 
    const firstNames = ['Александр', 'Дмитрий', 'Сергей', 'Андрей', 'Алексей', 'Максим', 'Евгений', 'Иван', 'Михаил', 'Артем', 'Елена', 'Мария', 'Ольга', 'Наталья', 'Анна'];
    const lastNames = ['Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Новиков', 'Морозов', 'Волков', 'Зайцев', 'Павлов', 'Семенов', 'Голубев', 'Виноградов'];
    
    return Array.from({ length: displayCount }).map((_, i) => ({
      id: `10${i + 100}`,
      name: `${firstNames[i % firstNames.length]} ${lastNames[(i + 7) % lastNames.length]}`,
      phone: `+7 (9${(i % 9).toString().repeat(2)}) ${100 + i}-22-33`,
      level: mockLevels[i % mockLevels.length],
      lastPurchase: `${((i % 28) + 1).toString().padStart(2, '0')}.12.2023`,
      totalSpend: Math.floor(Math.random() * 50000) + 500
    }));
  }, [viewingAudience]);

  const filteredMembers = useMemo(() => {
    return allAudienceMembers.filter(m => 
      m.name.toLowerCase().includes(membersSearch.toLowerCase()) || 
      m.phone.includes(membersSearch)
    );
  }, [allAudienceMembers, membersSearch]);

  const paginatedMembers = useMemo(() => {
    const start = (modalPage - 1) * modalItemsPerPage;
    return filteredMembers.slice(start, start + modalItemsPerPage);
  }, [filteredMembers, modalPage]);

  const totalModalPages = Math.ceil(filteredMembers.length / modalItemsPerPage);

  // Stable Pagination Logic - Fixes jumpy layout
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 5;
    
    if (totalModalPages <= maxButtons) {
      for (let i = 1; i <= totalModalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, modalPage - 2);
      let end = Math.min(totalModalPages, start + maxButtons - 1);
      
      if (end === totalModalPages) {
        start = Math.max(1, end - maxButtons + 1);
      }
      
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  // --- Handlers ---

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData(initialFormData);
    setProductSearch('');
    setView('create');
  };

  const handleStartEdit = (audience: Audience) => {
    setEditingId(audience.id);
    // In a real app we'd load full data here. Resetting to defaults for demo.
    setFormData({
        ...initialFormData,
        name: audience.name,
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
      count: Math.floor(Math.random() * 1000) + 50,
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

  const handleViewMembers = (audience: Audience) => {
    setViewingAudience(audience);
    setMembersSearch('');
    setModalPage(1);
    setIsMembersModalOpen(true);
  };

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

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <Target size={20} className="text-purple-600" />
                    <h3>Точки и Товары</h3>
                 </div>
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
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                       <label className="block text-sm font-medium text-gray-700">Покупал товары</label>
                       <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                          Выбрано: {formData.targetType === 'products' ? formData.selectedProducts.length : formData.selectedCategories.length}
                       </span>
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
                        <button onClick={() => setFormData({...formData, targetType: 'products'})} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${formData.targetType === 'products' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Товары</button>
                        <button onClick={() => setFormData({...formData, targetType: 'categories'})} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${formData.targetType === 'categories' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Категории</button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder={formData.targetType === 'products' ? "Поиск товаров..." : "Поиск категорий..."} className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                    </div>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto custom-scrollbar">
                        {visibleItems.map(item => {
                              const isSelected = formData.targetType === 'products' ? formData.selectedProducts.includes(item.id) : formData.selectedCategories.includes(item.id);
                              return (
                                 <div key={item.id} onClick={() => toggleProductSelection(item.id)} className={`p-2.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50' : ''}`}>
                                    <div className="flex items-center space-x-3">
                                       <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${isSelected ? 'bg-purple-200 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{item.name.charAt(0)}</div>
                                       <div>
                                          <div className={`text-sm ${isSelected ? 'font-medium text-purple-900' : 'text-gray-700'}`}>{item.name}</div>
                                       </div>
                                    </div>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>{isSelected && <Check size={10} className="text-white" />}</div>
                                 </div>
                              );
                        })}
                    </div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <User size={20} className="text-blue-500" />
                    <h3>Демография</h3>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
                       <select value={formData.gender} onChange={(e) => setFormData({...formData, gender: e.target.value as any})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                          <option value="all">Любой</option>
                          <option value="M">Мужской</option>
                          <option value="F">Женский</option>
                          <option value="U">Не указан</option>
                       </select>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Возраст</label>
                       <div className="flex items-center space-x-2">
                          <input type="number" placeholder="От" value={formData.ageFrom} onChange={(e) => setFormData({...formData, ageFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                          <span className="text-gray-400">-</span>
                          <input type="number" placeholder="До" value={formData.ageTo} onChange={(e) => setFormData({...formData, ageTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       </div>
                    </div>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">День рождения (период до/после дня рождения)</label>
                    <div className="grid grid-cols-2 gap-4">
                       <input type="number" placeholder="За N дней до" value={formData.birthdayBefore} onChange={(e) => setFormData({...formData, birthdayBefore: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       <input type="number" placeholder="Через N дней после" value={formData.birthdayAfter} onChange={(e) => setFormData({...formData, birthdayAfter: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Section 2: Activity, Financials & Segmentation */}
           <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <Calendar size={20} className="text-orange-500" />
                    <h3>Активность</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Дней с регистрации</label>
                       <div className="flex items-center space-x-2">
                          <input type="number" placeholder="От" value={formData.regDaysFrom} onChange={(e) => setFormData({...formData, regDaysFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                          <input type="number" placeholder="До" value={formData.regDaysTo} onChange={(e) => setFormData({...formData, regDaysTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       </div>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Дней с посл. покупки</label>
                       <div className="flex items-center space-x-2">
                          <input type="number" placeholder="От" value={formData.lastPurchaseFrom} onChange={(e) => setFormData({...formData, lastPurchaseFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                          <input type="number" placeholder="До" value={formData.lastPurchaseTo} onChange={(e) => setFormData({...formData, lastPurchaseTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       </div>
                    </div>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Количество покупок</label>
                    <div className="flex items-center space-x-2">
                       <input type="number" placeholder="Минимум" value={formData.purchaseCountFrom} onChange={(e) => setFormData({...formData, purchaseCountFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       <input type="number" placeholder="Максимум" value={formData.purchaseCountTo} onChange={(e) => setFormData({...formData, purchaseCountTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <DollarSign size={20} className="text-green-600" />
                    <h3>Финансы</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Средний чек (₽)</label>
                       <div className="flex items-center space-x-2">
                          <input type="number" placeholder="От" value={formData.avgCheckFrom} onChange={(e) => setFormData({...formData, avgCheckFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                          <input type="number" placeholder="До" value={formData.avgCheckTo} onChange={(e) => setFormData({...formData, avgCheckTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       </div>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Сумма покупок (₽)</label>
                       <div className="flex items-center space-x-2">
                          <input type="number" placeholder="От" value={formData.totalSpendFrom} onChange={(e) => setFormData({...formData, totalSpendFrom: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                          <input type="number" placeholder="До" value={formData.totalSpendTo} onChange={(e) => setFormData({...formData, totalSpendTo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                       </div>
                    </div>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                    <ShoppingBag size={20} className="text-pink-600" />
                    <h3>Сегментация</h3>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Уровни клиентов</label>
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
                 <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">RFM Сегменты (1-5)</label>
                    {['R', 'F', 'M'].map(metric => (
                        <div key={metric} className="flex items-center space-x-3">
                           <span className="text-xs font-bold w-4 text-gray-500">{metric}</span>
                           <div className="flex space-x-1">
                              {['1','2','3','4','5'].map(val => {
                                 const listKey = `selected${metric}` as keyof AudienceFormData;
                                 const isSelected = (formData[listKey] as string[]).includes(val);
                                 return (
                                    <button 
                                      key={val}
                                      onClick={() => setFormData({...formData, [listKey]: toggleSelection(formData[listKey] as string[], val)})}
                                      className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${isSelected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                       {val}
                                    </button>
                                 );
                              })}
                           </div>
                        </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Аудитории</h2>
           <p className="text-gray-500 mt-1">Создание сегментов клиентов для таргетированных рассылок и акций.</p>
        </div>
        <button onClick={handleStartCreate} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"><Plus size={18} /><span>Создать аудиторию</span></button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input type="text" placeholder="Поиск аудитории..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500"><Filter size={16} /><span>{filteredAudiences.length} сегментов</span></div>
         </div>
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
                  {filteredAudiences.map((audience) => (
                        <tr key={audience.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4 font-medium text-purple-600">{audience.name}</td>
                           <td className="px-6 py-4 text-gray-600 max-w-md truncate">{audience.description}</td>
                           <td className="px-6 py-4 text-right"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{audience.count} чел.</span></td>
                           <td className="px-6 py-4 text-right text-gray-500 text-xs">{audience.createdAt}</td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                 <button onClick={() => handleViewMembers(audience)} title="Просмотр состава" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye size={16} /></button>
                                 <button onClick={() => handleStartEdit(audience)} title="Редактировать" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"><Edit size={16} /></button>
                                 <button onClick={() => handleDelete(audience.id)} title="Удалить" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                              </div>
                           </td>
                        </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {isMembersModalOpen && viewingAudience && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl relative z-[101] flex flex-col max-h-[90vh] overflow-hidden">
               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10 flex-shrink-0">
                  <div className="flex items-center space-x-3">
                     <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Users size={24} /></div>
                     <div>
                        <h3 className="text-xl font-bold text-gray-900">Состав аудитории: {viewingAudience.name}</h3>
                        <p className="text-sm text-gray-500">Показано <span className="font-bold text-purple-600">{filteredMembers.length}</span> из {viewingAudience.count} подходящих клиентов</p>
                     </div>
                  </div>
                  <button onClick={() => setIsMembersModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={24} /></button>
               </div>
               <div className="p-4 border-b border-gray-100 bg-white flex-shrink-0">
                  <div className="relative max-w-md">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                     <input type="text" value={membersSearch} onChange={(e) => { setMembersSearch(e.target.value); setModalPage(1); }} placeholder="Поиск в сегменте по имени или телефону..." className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm text-left">
                     <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm border-b border-gray-100">
                        <tr>
                           <th className="px-6 py-4 font-semibold bg-gray-50">Клиент</th>
                           <th className="px-6 py-4 font-semibold bg-gray-50">Телефон</th>
                           <th className="px-6 py-4 font-semibold bg-gray-50 text-center">Уровень</th>
                           <th className="px-6 py-4 font-semibold bg-gray-50 text-center">Посл. покупка</th>
                           <th className="px-6 py-4 font-semibold bg-gray-50 text-right">LTV (Сумма)</th>
                           <th className="px-6 py-4 font-semibold bg-gray-50 text-right w-16"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {paginatedMembers.length > 0 ? (
                           paginatedMembers.map((member) => (
                              <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                                 <td className="px-6 py-4"><div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">{member.name.charAt(0)}</div><span className="font-medium text-gray-900">{member.name}</span></div></td>
                                 <td className="px-6 py-4 text-gray-600 whitespace-nowrap"><div className="flex items-center space-x-2"><Phone size={12} className="text-gray-400" /><span className="font-mono text-xs">{member.phone}</span></div></td>
                                 <td className="px-6 py-4 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${member.level === 'Gold' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' : member.level === 'Platinum' ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{member.level}</span></td>
                                 <td className="px-6 py-4 text-center text-gray-600 whitespace-nowrap text-xs"><div className="flex items-center justify-center space-x-1"><Clock size={12} className="text-gray-400" /><span>{member.lastPurchase}</span></div></td>
                                 <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">₽{member.totalSpend.toLocaleString()}</td>
                                 <td className="px-6 py-4 text-right"><button title="Перейти в карточку" className="text-purple-400 hover:text-purple-600 p-1 rounded-lg hover:bg-purple-50 transition-all" onClick={() => { alert(`Переход в карточку клиента ID: ${member.id}`); setIsMembersModalOpen(false); }}><ExternalLink size={16} /></button></td>
                              </tr>
                           ))
                        ) : (
                           <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400 bg-white"><Search size={48} className="mx-auto opacity-20 mb-3" /><p className="text-base">Клиенты не найдены</p></td></tr>
                        )}
                     </tbody>
                  </table>
               </div>
               <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                     <AlertCircle size={14} className="text-purple-500" />
                     <span>Показано {Math.min(filteredMembers.length, (modalPage - 1) * modalItemsPerPage + 1)}-{Math.min(filteredMembers.length, modalPage * modalItemsPerPage)} из {filteredMembers.length}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                     <button onClick={() => setModalPage(p => Math.max(1, p - 1))} disabled={modalPage === 1} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"><ChevronLeft size={16} /></button>
                     <div className="flex space-x-1">
                        {getPageNumbers().map((p, i) => (
                           <button 
                             key={i} 
                             onClick={() => typeof p === 'number' && setModalPage(p)} 
                             disabled={typeof p !== 'number'}
                             className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${modalPage === p ? 'bg-purple-600 text-white shadow-sm' : p === '...' ? 'bg-transparent text-gray-400 cursor-default' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                           >
                             {p}
                           </button>
                        ))}
                     </div>
                     <button onClick={() => setModalPage(p => Math.min(totalModalPages, p + 1))} disabled={modalPage === totalModalPages || totalModalPages === 0} className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"><ChevronRight size={16} /></button>
                     <button onClick={() => setIsMembersModalOpen(false)} className="ml-4 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors shadow-sm">Закрыть</button>
                  </div>
               </div>
            </div>
         </div>,
         document.body
      )}
    </div>
  );
};

export default Audiences;