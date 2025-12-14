import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Folder, 
  CornerDownRight, 
  ArrowLeft,
  Save,
  ShoppingBag,
  Minus,
  Check,
  PackagePlus,
  AlertCircle,
  X,
  ChevronRight,
  ArrowRight
} from 'lucide-react';

// --- Types ---

interface Category {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  status: 'active' | 'archived';
}

interface Product {
  id: string;
  name: string;
  categoryId: string | null;
}

// --- Mock Data ---

const initialCategories: Category[] = [
  { id: '1', name: 'Кофе', description: 'Горячие кофейные напитки', parentId: null, status: 'active' },
  { id: '2', name: 'Черный кофе', description: 'Американо, Эспрессо', parentId: '1', status: 'active' },
  { id: '3', name: 'Кофе с молоком', description: 'Капучино, Латте', parentId: '1', status: 'active' },
  { id: '4', name: 'Выпечка', description: 'Свежие круассаны и булочки', parentId: null, status: 'active' },
  { id: '5', name: 'Десерты', description: 'Торты и пирожные', parentId: null, status: 'active' },
  { id: '6', name: 'Напитки', description: 'Холодные напитки и лимонады', parentId: null, status: 'active' },
  { id: '7', name: 'Сезонное меню', description: 'Летние предложения', parentId: '6', status: 'active' },
];

const initialProducts: Product[] = [
  { id: 'p1', name: 'Капучино 0.3', categoryId: '3' },
  { id: 'p2', name: 'Латте 0.4', categoryId: '3' },
  { id: 'p3', name: 'Эспрессо', categoryId: '2' },
  { id: 'p4', name: 'Американо', categoryId: '2' },
  { id: 'p5', name: 'Круассан классический', categoryId: '4' },
  { id: 'p6', name: 'Круассан с миндалем', categoryId: '4' },
  { id: 'p7', name: 'Чизкейк Нью-Йорк', categoryId: '5' },
  { id: 'p8', name: 'Брауни', categoryId: '5' },
  { id: 'p9', name: 'Вода без газа 0.5', categoryId: '6' },
  { id: 'p10', name: 'Лимонад Домашний', categoryId: '6' },
  { id: 'p11', name: 'Сэндвич с курицей', categoryId: null },
  { id: 'p12', name: 'Салат Греческий', categoryId: null },
];

const CategoriesList: React.FC = () => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  
  // Snapshots for Undo capability
  const [productsSnapshot, setProductsSnapshot] = useState<Product[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Editor State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '' as string | '',
    status: 'active' as 'active' | 'archived'
  });

  // Product linking state in Editor
  const [productLinkSearch, setProductLinkSearch] = useState('');

  // --- Recursive Logic ---

  const getDescendantIds = (catId: string): string[] => {
    const children = categories.filter(c => c.parentId === catId);
    let ids = children.map(c => c.id);
    children.forEach(child => {
      ids = [...ids, ...getDescendantIds(child.id)];
    });
    return ids;
  };

  const getRecursiveProductCount = (catId: string) => {
    const allCategoryIds = [catId, ...getDescendantIds(catId)];
    return products.filter(p => p.categoryId && allCategoryIds.includes(p.categoryId)).length;
  };

  const categoryTree = useMemo(() => {
    const tree: (Category & { children: Category[] })[] = [];
    const map: Record<string, any> = {};
    categories.forEach(cat => { map[cat.id] = { ...cat, children: [] }; });
    categories.forEach(cat => {
      if (cat.parentId && map[cat.parentId]) {
        map[cat.parentId].children.push(map[cat.id]);
      } else {
        tree.push(map[cat.id]);
      }
    });
    return tree;
  }, [categories]);

  const flattenedCategories = useMemo(() => {
    const result: (Category & { level: number })[] = [];
    const traverse = (nodes: any[], level: number) => {
      nodes.forEach(node => {
        result.push({ ...node, level });
        if (node.children && node.children.length > 0) {
          traverse(node.children, level + 1);
        }
      });
    };
    traverse(categoryTree, 0);
    if (searchTerm) {
      return result.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return result;
  }, [categoryTree, searchTerm]);

  // --- Handlers ---

  const handleStartCreate = () => {
    // Generate ID immediately so we can link products before saving
    const newId = Date.now().toString();
    setEditingId(newId);
    
    // Save snapshot to revert if cancelled
    setProductsSnapshot([...products]);
    
    setFormData({ name: '', description: '', parentId: '', status: 'active' });
    setProductLinkSearch('');
    setView('create');
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setProductsSnapshot([...products]); // Save snapshot
    
    setFormData({
      name: cat.name,
      description: cat.description,
      parentId: cat.parentId || '',
      status: cat.status
    });
    setProductLinkSearch('');
    setView('edit');
  };

  const handleCancel = () => {
    // Revert product changes
    setProducts(productsSnapshot);
    setView('list');
  };

  const handleSaveCategory = () => {
    if (!formData.name.trim()) return alert('Введите название категории');
    if (!editingId) return;

    const newCategory: Category = {
      id: editingId,
      name: formData.name,
      description: formData.description,
      parentId: formData.parentId || null,
      status: formData.status
    };

    if (view === 'edit') {
      setCategories(prev => prev.map(c => c.id === editingId ? newCategory : c));
    } else {
      setCategories(prev => [...prev, newCategory]);
    }
    setView('list');
  };

  const handleDeleteCategory = (id: string) => {
    const hasChildren = categories.some(c => c.parentId === id);
    if (hasChildren) {
      alert('Нельзя удалить категорию, содержащую подкатегории. Сначала удалите или переместите их.');
      return;
    }
    if (confirm('Вы уверены? Товары в этой категории станут "Без категории".')) {
      setCategories(prev => prev.filter(c => c.id !== id));
      setProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: null } : p));
    }
  };

  // --- Product Management inside Editor ---

  const handleUnlinkProduct = (prodId: string) => {
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, categoryId: null } : p));
  };

  const handleLinkProduct = (prodId: string) => {
    if (!editingId) return;
    setProducts(prev => prev.map(p => p.id === prodId ? { ...p, categoryId: editingId } : p));
  };

  const handleCreateProduct = () => {
    if (!editingId) return;
    const name = prompt('Название товара:');
    if (!name) return;
    
    const newProd: Product = {
        id: Date.now().toString(),
        name,
        categoryId: editingId
    };
    setProducts(prev => [...prev, newProd]);
  };

  // Lists for Editor
  const editorAttachedProducts = editingId ? products.filter(p => p.categoryId === editingId) : [];
  
  // Available products: Not in this category, matching search term
  const editorAvailableProducts = products.filter(p => 
    p.categoryId !== editingId && 
    p.name.toLowerCase().includes(productLinkSearch.toLowerCase())
  );

  // --- Create/Edit View ---

  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-fade-in h-[calc(100vh-64px)] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
           <div className="flex items-center space-x-4">
              <button 
                onClick={handleCancel}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                 <ArrowLeft size={24} />
              </button>
              <div>
                 <h2 className="text-2xl font-bold text-gray-900">{view === 'create' ? 'Новая категория' : 'Редактирование'}</h2>
              </div>
           </div>
           
           <div className="flex space-x-3">
              <button 
                 onClick={handleSaveCategory}
                 className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
              >
                 <Save size={18} />
                 <span>Сохранить</span>
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1 min-h-0">
           
           {/* Left Column: General Info (33%) */}
           <div className="xl:col-span-4 space-y-6 overflow-y-auto pr-2">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <h3 className="font-bold text-gray-900 text-lg border-b border-gray-100 pb-3">Основное</h3>
                 
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Название <span className="text-red-500">*</span></label>
                        <input 
                           type="text" 
                           value={formData.name}
                           onChange={(e) => setFormData({...formData, name: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                           placeholder="Например: Десерты"
                           autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Родительская категория</label>
                        <select 
                           value={formData.parentId}
                           onChange={(e) => setFormData({...formData, parentId: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        >
                           <option value="">-- Корневая категория --</option>
                           {categories
                              .filter(c => c.id !== editingId)
                              .map(c => (
                                 <option key={c.id} value={c.id}>{c.name}</option>
                              ))
                           }
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                        <div className="flex items-center h-[42px]">
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                 type="checkbox" 
                                 checked={formData.status === 'active'}
                                 onChange={(e) => setFormData({...formData, status: e.target.checked ? 'active' : 'archived'})}
                                 className="sr-only peer" 
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                              <span className="ml-3 text-sm font-medium text-gray-900">
                                 {formData.status === 'active' ? 'Активна' : 'В архиве'}
                              </span>
                           </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                        <textarea 
                           rows={6}
                           value={formData.description}
                           onChange={(e) => setFormData({...formData, description: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                           placeholder="Краткое описание..."
                        />
                    </div>
                 </div>
              </div>
           </div>

           {/* Right Column: Products Manager (66%) */}
           <div className="xl:col-span-8 h-full min-h-[500px]">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
                 
                 <div className="p-6 border-b border-gray-100 flex-shrink-0">
                    <h3 className="font-bold text-gray-900 text-lg">Состав категории</h3>
                    <p className="text-gray-500 text-sm mt-1">Управляйте списком товаров категории, выбирая их из списка доступных.</p>
                 </div>

                 {/* Dual List Area */}
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 overflow-hidden">
                    
                    {/* LEFT: Available Products */}
                    <div className="flex flex-col bg-gray-50/50 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex-shrink-0">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-bold text-gray-700">Доступные товары</span>
                              <button 
                                 onClick={handleCreateProduct}
                                 className="text-xs flex items-center bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100 transition-colors"
                              >
                                 <Plus size={12} className="mr-1"/> Создать
                              </button>
                           </div>
                           <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                              <input 
                                 type="text"
                                 value={productLinkSearch}
                                 onChange={(e) => setProductLinkSearch(e.target.value)}
                                 placeholder="Поиск по всем товарам..."
                                 className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white"
                              />
                           </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                           {editorAvailableProducts.length === 0 ? (
                              <div className="text-center py-10 text-gray-400 text-sm">
                                 {productLinkSearch ? 'Ничего не найдено' : 'Нет доступных товаров'}
                              </div>
                           ) : (
                              editorAvailableProducts.map(prod => (
                                 <div 
                                    key={prod.id} 
                                    className="group flex items-center justify-between p-3 bg-white rounded border border-gray-100 hover:border-purple-300 hover:shadow-sm transition-all"
                                 >
                                    <div>
                                       <div className="text-sm font-medium text-gray-900">{prod.name}</div>
                                       <div className="text-xs text-gray-500">
                                          {prod.categoryId && <span className="text-purple-600 bg-purple-50 px-1 rounded">Из др. категории</span>}
                                       </div>
                                    </div>
                                    <button 
                                       onClick={() => handleLinkProduct(prod.id)}
                                       className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-purple-600 hover:text-white transition-colors"
                                       title="Добавить в категорию"
                                    >
                                       <Plus size={16} />
                                    </button>
                                 </div>
                              ))
                           )}
                        </div>
                    </div>

                    {/* RIGHT: Attached Products */}
                    <div className="flex flex-col bg-white overflow-hidden">
                        <div className="p-4 border-b border-gray-100 sticky top-0 z-10 bg-white flex-shrink-0">
                           <div className="flex justify-between items-center h-[38px]"> {/* Match height of search bar container */}
                              <span className="text-sm font-bold text-gray-700">В этой категории</span>
                              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                 {editorAttachedProducts.length} поз.
                              </span>
                           </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                           {editorAttachedProducts.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                                 <ShoppingBag size={40} className="mb-3 opacity-20" />
                                 <p className="text-sm font-medium">Список пуст</p>
                                 <p className="text-xs mt-1">Добавьте товары из списка слева</p>
                              </div>
                           ) : (
                              editorAttachedProducts.map(prod => (
                                 <div 
                                    key={prod.id} 
                                    className="group flex items-center justify-between p-3 bg-white rounded border border-gray-100 hover:border-red-200 hover:bg-red-50/10 transition-all"
                                 >
                                    <div>
                                       <div className="text-sm font-medium text-gray-900">{prod.name}</div>
                                    </div>
                                    <button 
                                       onClick={() => handleUnlinkProduct(prod.id)}
                                       className="p-1.5 rounded-full text-gray-300 hover:bg-red-100 hover:text-red-600 transition-colors"
                                       title="Убрать из категории"
                                    >
                                       <Minus size={16} />
                                    </button>
                                 </div>
                              ))
                           )}
                        </div>
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
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Категории товаров</h2>
           <p className="text-gray-500 mt-1">Создавайте структуру каталога для удобной навигации и отчетности.</p>
        </div>
        
        <button 
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать категорию</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         
         {/* Filter Bar */}
         <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                  type="text"
                  placeholder="Поиск категорий..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
               />
            </div>
            <div className="text-sm text-gray-500">
               Всего: {categories.length}
            </div>
         </div>

         {/* Tree Table */}
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold w-1/3">Название</th>
                     <th className="px-6 py-4 font-semibold">Описание</th>
                     <th className="px-6 py-4 font-semibold text-center">Всего товаров</th>
                     <th className="px-6 py-4 font-semibold text-center">Статус</th>
                     <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {flattenedCategories.length === 0 ? (
                     <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                           <Layers size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>Категории не найдены.</p>
                        </td>
                     </tr>
                  ) : (
                     flattenedCategories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-gray-50 transition-colors group">
                           <td className="px-6 py-3">
                              <div className="flex items-center" style={{ paddingLeft: `${cat.level * 24}px` }}>
                                 {cat.level > 0 && (
                                    <CornerDownRight size={16} className="text-gray-300 mr-2 flex-shrink-0" />
                                 )}
                                 <div className={`p-1.5 rounded mr-3 ${cat.level === 0 ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                                    <Folder size={16} />
                                 </div>
                                 <span className={`font-medium ${cat.level === 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                                    {cat.name}
                                 </span>
                              </div>
                           </td>
                           <td className="px-6 py-3 text-gray-500 truncate max-w-xs">
                              {cat.description || '-'}
                           </td>
                           <td className="px-6 py-3 text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600" title="Включая подкатегории">
                                 {getRecursiveProductCount(cat.id)}
                              </span>
                           </td>
                           <td className="px-6 py-3 text-center">
                              {cat.status === 'active' ? (
                                 <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Активна</span>
                              ) : (
                                 <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">Архив</span>
                              )}
                           </td>
                           <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button 
                                    onClick={() => handleStartEdit(cat)}
                                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                    title="Редактировать"
                                 >
                                    <Edit size={16} />
                                 </button>
                                 <button 
                                    onClick={() => handleDeleteCategory(cat.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Удалить"
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

export default CategoriesList;