import React, { useState } from 'react';
import { 
  Store, 
  Plus, 
  MapPin, 
  Monitor, 
  Users, 
  Edit, 
  Trash2, 
  Save, 
  ArrowLeft, 
  X
} from 'lucide-react';

interface Device {
  id: string;
  externalId: string;
}

interface Outlet {
  id: string;
  name: string;
  isActive: boolean;
  reviewLinks: {
    yandex: string;
    gis: string;
    google: string;
  };
  devices: Device[];
  staffCount: number; // Mock data
}

const initialOutlets: Outlet[] = [
  {
    id: '1',
    name: 'Центральный магазин',
    isActive: true,
    reviewLinks: {
      yandex: 'https://yandex.ru/maps/...',
      gis: 'https://2gis.ru/...',
      google: ''
    },
    devices: [
      { id: 'd1', externalId: 'POS-001' },
      { id: 'd2', externalId: 'POS-002' },
      { id: 'd3', externalId: 'KIOSK-01' }
    ],
    staffCount: 5
  },
  {
    id: '2',
    name: 'ТЦ Сити Молл',
    isActive: true,
    reviewLinks: {
      yandex: '',
      gis: '',
      google: ''
    },
    devices: [
      { id: 'd4', externalId: 'POS-CM-01' }
    ],
    staffCount: 3
  },
  {
    id: '3',
    name: 'Точка в Парке (Сезонная)',
    isActive: false,
    reviewLinks: {
      yandex: '',
      gis: '',
      google: ''
    },
    devices: [],
    staffCount: 0
  }
];

const Outlets: React.FC = () => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');
  const [outlets, setOutlets] = useState<Outlet[]>(initialOutlets);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Outlet>({
    id: '',
    name: '',
    isActive: true,
    reviewLinks: { yandex: '', gis: '', google: '' },
    devices: [],
    staffCount: 0
  });
  
  // Temporary device input
  const [newDeviceInput, setNewDeviceInput] = useState('');

  // --- Handlers ---

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData({
      id: Date.now().toString(),
      name: '',
      isActive: true,
      reviewLinks: { yandex: '', gis: '', google: '' },
      devices: [],
      staffCount: 0
    });
    setView('create');
  };

  const handleStartEdit = (outlet: Outlet) => {
    setEditingId(outlet.id);
    setFormData({ ...outlet }); // Clone
    setView('edit');
  };

  const handleSave = () => {
    if (!formData.name.trim()) return alert('Введите название точки');

    if (view === 'create') {
      setOutlets(prev => [...prev, formData]);
    } else {
      setOutlets(prev => prev.map(o => o.id === editingId ? formData : o));
    }
    setView('list');
  };

  const handleAddDevice = () => {
    if (!newDeviceInput.trim()) return;
    const newDevice: Device = {
      id: Date.now().toString(),
      externalId: newDeviceInput
    };
    setFormData(prev => ({
      ...prev,
      devices: [...prev.devices, newDevice]
    }));
    setNewDeviceInput('');
  };

  const handleRemoveDevice = (deviceId: string) => {
    setFormData(prev => ({
      ...prev,
      devices: prev.devices.filter(d => d.id !== deviceId)
    }));
  };

  const handleDeleteOutlet = (id: string) => {
    if(confirm('Вы уверены? Это действие нельзя отменить.')) {
      setOutlets(prev => prev.filter(o => o.id !== id));
    }
  };

  // Filter lists
  const activeOutlets = outlets.filter(o => o.isActive);
  const inactiveOutlets = outlets.filter(o => !o.isActive);
  const displayedOutlets = activeTab === 'active' ? activeOutlets : inactiveOutlets;

  // --- Views ---

  if (view === 'create' || view === 'edit') {
    return (
      <div className="p-8 max-w-[1200px] mx-auto animate-fade-in">
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
                 <h2 className="text-2xl font-bold text-gray-900">{view === 'create' ? 'Новая торговая точка' : 'Редактирование точки'}</h2>
              </div>
           </div>
           
           <div className="flex items-center space-x-3">
              <div className="flex items-center bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                 <span className={`text-sm font-medium mr-3 ${formData.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {formData.isActive ? 'Работает' : 'Не работает'}
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           
           {/* Left Column: General & Reviews */}
           <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <h3 className="text-lg font-bold text-gray-900">Основная информация</h3>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название <span className="text-red-500">*</span></label>
                    <input 
                       type="text"
                       value={formData.name}
                       onChange={(e) => setFormData({...formData, name: e.target.value})}
                       className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                       placeholder="Например: Магазин на Ленина"
                    />
                 </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <h3 className="text-lg font-bold text-gray-900">Ссылки на отзывы</h3>
                 <p className="text-sm text-gray-500">Используются для перенаправления клиентов после высокой оценки качества обслуживания.</p>
                 
                 <div className="space-y-3">
                    <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">Яндекс.Карты</label>
                       <div className="flex items-center relative">
                          <span className="absolute left-3 text-red-500 font-bold text-xs">Я</span>
                          <input 
                             type="text"
                             value={formData.reviewLinks.yandex}
                             onChange={(e) => setFormData({...formData, reviewLinks: {...formData.reviewLinks, yandex: e.target.value}})}
                             className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             placeholder="https://yandex.ru/maps/..."
                          />
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">2ГИС</label>
                       <div className="flex items-center relative">
                          <span className="absolute left-3 text-green-600 font-bold text-xs">2</span>
                          <input 
                             type="text"
                             value={formData.reviewLinks.gis}
                             onChange={(e) => setFormData({...formData, reviewLinks: {...formData.reviewLinks, gis: e.target.value}})}
                             className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             placeholder="https://2gis.ru/..."
                          />
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1">Google Maps</label>
                       <div className="flex items-center relative">
                          <span className="absolute left-3 text-blue-500 font-bold text-xs">G</span>
                          <input 
                             type="text"
                             value={formData.reviewLinks.google}
                             onChange={(e) => setFormData({...formData, reviewLinks: {...formData.reviewLinks, google: e.target.value}})}
                             className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                             placeholder="https://google.com/maps/..."
                          />
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           {/* Right Column: Devices & Staff info */}
           <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900">Устройства (Кассы)</h3>
                    <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-medium">
                       {formData.devices.length}
                    </span>
                 </div>
                 
                 <div className="flex space-x-2">
                    <input 
                       type="text"
                       value={newDeviceInput}
                       onChange={(e) => setNewDeviceInput(e.target.value)}
                       placeholder="Внешний ID (напр. POS-05)"
                       className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                       onKeyDown={(e) => e.key === 'Enter' && handleAddDevice()}
                    />
                    <button 
                       onClick={handleAddDevice}
                       className="bg-purple-50 text-purple-600 p-2 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                       <Plus size={20} />
                    </button>
                 </div>

                 <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto custom-scrollbar">
                    {formData.devices.length === 0 ? (
                       <div className="p-4 text-center text-sm text-gray-400">Устройств пока нет</div>
                    ) : (
                       formData.devices.map(dev => (
                          <div key={dev.id} className="p-3 flex justify-between items-center hover:bg-gray-50">
                             <div className="flex items-center space-x-3">
                                <Monitor size={16} className="text-gray-400" />
                                <span className="text-sm font-medium text-gray-700">{dev.externalId}</span>
                             </div>
                             <button 
                                onClick={() => handleRemoveDevice(dev.id)}
                                className="text-gray-400 hover:text-red-500"
                             >
                                <X size={16} />
                             </button>
                          </div>
                       ))
                    )}
                 </div>
              </div>

              {/* Staff Read-only section */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900">Сотрудники</h3>
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">
                       {formData.staffCount}
                    </span>
                 </div>
                 <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600 flex items-start space-x-2">
                    <Users size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
                    <p>
                       Управление сотрудниками и привязка их к торговым точкам осуществляется в разделе "Сотрудники".
                    </p>
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
           <h2 className="text-2xl font-bold text-gray-900">Торговые точки</h2>
           <p className="text-gray-500 mt-1">Управление магазинами, кассами и ссылками на отзывы.</p>
        </div>
        
        <button 
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Добавить точку</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('active')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Работают
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'active' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {activeOutlets.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('inactive')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'inactive' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Не работают
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'inactive' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {inactiveOutlets.length}
            </span>
          </button>
        </nav>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
         {displayedOutlets.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-500">
               Нет торговых точек в этом разделе.
            </div>
         ) : (
            displayedOutlets.map(outlet => (
               <div key={outlet.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-6 group">
                  <div className="flex justify-between items-start mb-4">
                     <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                           <Store size={24} />
                        </div>
                        <div>
                           <h3 className="font-bold text-gray-900 text-lg leading-tight mb-2">{outlet.name}</h3>
                           <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${outlet.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {outlet.isActive ? 'Активна' : 'Не активна'}
                           </span>
                        </div>
                     </div>
                     <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                           onClick={() => handleStartEdit(outlet)}
                           className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        >
                           <Edit size={18} />
                        </button>
                        <button 
                           onClick={() => handleDeleteOutlet(outlet.id)}
                           className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                           <Trash2 size={18} />
                        </button>
                     </div>
                  </div>

                  <div className="space-y-3">
                     <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center text-gray-600">
                           <Monitor size={16} className="mr-2" />
                           <span>Устройства</span>
                        </div>
                        <span className="font-medium text-gray-900">{outlet.devices.length}</span>
                     </div>
                     <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center text-gray-600">
                           <Users size={16} className="mr-2" />
                           <span>Сотрудники</span>
                        </div>
                        <span className="font-medium text-gray-900">{outlet.staffCount}</span>
                     </div>
                     <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center text-gray-600">
                           <MapPin size={16} className="mr-2" />
                           <span>Ссылки на отзывы</span>
                        </div>
                        <div className="flex space-x-1">
                           {outlet.reviewLinks.yandex && <div className="w-2 h-2 rounded-full bg-red-500" title="Yandex" />}
                           {outlet.reviewLinks.gis && <div className="w-2 h-2 rounded-full bg-green-500" title="2GIS" />}
                           {outlet.reviewLinks.google && <div className="w-2 h-2 rounded-full bg-blue-500" title="Google" />}
                           {!outlet.reviewLinks.yandex && !outlet.reviewLinks.gis && !outlet.reviewLinks.google && <span className="text-xs text-gray-400">-</span>}
                        </div>
                     </div>
                  </div>
               </div>
            ))
         )}
      </div>

    </div>
  );
};

export default Outlets;