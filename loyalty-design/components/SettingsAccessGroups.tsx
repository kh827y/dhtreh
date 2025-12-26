import React, { useState } from 'react';
import { 
  Shield, 
  Plus, 
  Users, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  X, 
  Save, 
  Lock, 
  AlertCircle,
  ArrowLeft,
  Search,
  User
} from 'lucide-react';
import { createPortal } from 'react-dom';

interface AccessGroup {
  id: string;
  name: string;
  description: string;
  employeeCount: number;
  isSystem: boolean; // System groups cannot be deleted
  permissions: {
    fullAccess: boolean;
  };
}

interface GroupMember {
  id: string;
  name: string;
  avatar: string;
}

const SettingsAccessGroups: React.FC = () => {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Mock Data ---
  const [groups, setGroups] = useState<AccessGroup[]>([
    {
      id: '1',
      name: 'Администратор',
      description: 'Полный доступ ко всем разделам и настройкам системы.',
      employeeCount: 2,
      isSystem: true,
      permissions: { fullAccess: true }
    },
    {
      id: '2',
      name: 'Менеджер',
      description: 'Управление контентом, акциями и работа с клиентской базой.',
      employeeCount: 3,
      isSystem: false,
      permissions: { fullAccess: false }
    },
    {
      id: '4',
      name: 'Аналитик',
      description: 'Доступ только к просмотру аналитических отчетов и выгрузке данных.',
      employeeCount: 1,
      isSystem: false,
      permissions: { fullAccess: false }
    }
  ]);

  // Mock Members Data for Modal
  const mockMembers: Record<string, GroupMember[]> = {
    '1': [
      { id: '101', name: 'Александр В.', avatar: 'A' },
      { id: '102', name: 'Мария К.', avatar: 'M' }
    ],
    '2': [
      { id: '201', name: 'Елена С.', avatar: 'E' },
      { id: '202', name: 'Дмитрий П.', avatar: 'D' },
      { id: '203', name: 'Анна Л.', avatar: 'A' }
    ],
    '4': [
      { id: '401', name: 'Олег Р.', avatar: 'O' }
    ]
  };

  // --- Modal State ---
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [currentGroupMembers, setCurrentGroupMembers] = useState<GroupMember[]>([]);
  const [currentGroupName, setCurrentGroupName] = useState('');

  // --- Form State ---
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fullAccess: false
  });

  // --- Handlers ---

  const handleStartCreate = () => {
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      fullAccess: false
    });
    setView('create');
  };

  const handleStartEdit = (group: AccessGroup) => {
    setEditingId(group.id);
    setFormData({
      name: group.name,
      description: group.description,
      fullAccess: group.permissions.fullAccess
    });
    setView('edit');
  };

  const handleSave = () => {
    if (!formData.name.trim()) return alert('Введите название группы');

    if (editingId) {
      // Update existing
      setGroups(prev => prev.map(g => {
        if (g.id === editingId) {
          return {
            ...g,
            name: formData.name,
            description: formData.description,
            permissions: {
              ...g.permissions,
              fullAccess: formData.fullAccess
            }
          };
        }
        return g;
      }));
    } else {
      // Create new
      const newGroup: AccessGroup = {
        id: Date.now().toString(),
        name: formData.name,
        description: formData.description,
        employeeCount: 0,
        isSystem: false,
        permissions: {
          fullAccess: formData.fullAccess
        }
      };
      setGroups(prev => [...prev, newGroup]);
    }
    setView('list');
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить эту группу? Сотрудники, привязанные к ней, потеряют доступ.')) {
      setGroups(prev => prev.filter(g => g.id !== id));
    }
  };

  const openMembersModal = (group: AccessGroup) => {
    setCurrentGroupName(group.name);
    setCurrentGroupMembers(mockMembers[group.id] || []);
    setMembersModalOpen(true);
  };

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
                 <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование группы' : 'Новая группа'}</h2>
                 <p className="text-sm text-gray-500">Настройка названия и прав доступа.</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* Left Column: Info */}
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                 <h3 className="font-bold text-gray-900 text-lg">Общая информация</h3>
                 
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Название группы <span className="text-red-500">*</span></label>
                    <input 
                       type="text" 
                       value={formData.name}
                       onChange={(e) => setFormData({...formData, name: e.target.value})}
                       placeholder="Например: Маркетолог"
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                    <textarea 
                       rows={4}
                       value={formData.description}
                       onChange={(e) => setFormData({...formData, description: e.target.value})}
                       placeholder="Краткое описание обязанностей и прав..."
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                 </div>
              </div>
           </div>

           {/* Right Column: Permissions */}
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
                 <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <h3 className="font-bold text-gray-900 text-lg">Права доступа</h3>
                    <div className="flex items-center space-x-2">
                       <Shield size={18} className="text-purple-600" />
                       <span className="text-sm text-gray-500">Настройка ролей</span>
                    </div>
                 </div>

                 {/* Full Access Toggle */}
                 <div className="bg-purple-50 p-5 rounded-lg border border-purple-100">
                    <div className="flex items-start justify-between">
                       <div className="mr-4">
                          <label className="text-base font-bold text-purple-900 block mb-1">Полный доступ (супер-пользователь)</label>
                          <p className="text-sm text-purple-700">
                             Группа получит права администратора. Все ограничения ниже будут игнорироваться.
                          </p>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                             type="checkbox" 
                             checked={formData.fullAccess}
                             onChange={(e) => setFormData({...formData, fullAccess: e.target.checked})}
                             className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                       </label>
                    </div>
                 </div>

                 {/* Permissions Placeholder */}
                 <div className={`space-y-4 transition-opacity duration-300 ${formData.fullAccess ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                    <div className="p-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 flex flex-col items-center justify-center text-center">
                       <Shield size={32} className="text-gray-300 mb-3" />
                       <h4 className="font-medium text-gray-900 mb-1">Детальные настройки</h4>
                       <p className="text-sm text-gray-500 max-w-md">
                          Здесь будет список разделов (Аналитика, Клиенты, Акции) с галочками для тонкой настройки прав. Вы сможете выбрать, какие именно страницы и действия доступны этой группе.
                       </p>
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
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Группы доступа</h2>
           <p className="text-gray-500 mt-1">Управление ролями сотрудников и ограничение прав доступа.</p>
        </div>
        
        <button 
          onClick={handleStartCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать группу</span>
        </button>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <div key={group.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
             
             {/* Card Header */}
             <div className="p-6 pb-4 flex justify-between items-start">
                <div className="flex items-center space-x-3">
                   <div className={`p-2.5 rounded-lg ${group.permissions.fullAccess ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                      {group.permissions.fullAccess ? <Shield size={24} /> : <Lock size={24} />}
                   </div>
                   <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{group.name}</h3>
                      {group.isSystem && (
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Системная</span>
                      )}
                   </div>
                </div>
                
                <div className="flex space-x-1">
                   {group.id !== '1' && (
                      <button 
                        onClick={() => handleStartEdit(group)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Редактировать"
                      >
                          <Edit size={18} />
                      </button>
                   )}
                   {!group.isSystem && (
                      <button 
                        onClick={() => handleDelete(group.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Удалить"
                      >
                          <Trash2 size={18} />
                      </button>
                   )}
                </div>
             </div>

             {/* Description */}
             <div className="px-6 flex-1">
                <p className="text-sm text-gray-600 line-clamp-3">
                   {group.description || 'Нет описания'}
                </p>
             </div>

             {/* Permissions Preview & Footer */}
             <div className="p-6 pt-4 mt-2">
                <div className="flex items-center space-x-2 mb-4">
                   {group.permissions.fullAccess ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                         <CheckCircle2 size={12} className="mr-1" />
                         Полный доступ
                      </span>
                   ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                         <Lock size={12} className="mr-1" />
                         Ограниченный доступ
                      </span>
                   )}
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                   <div className="flex items-center space-x-2">
                      <Users size={16} />
                      <span>{group.employeeCount} сотр.</span>
                   </div>
                   <button 
                     onClick={() => openMembersModal(group)}
                     className="text-purple-600 hover:text-purple-700 font-medium text-xs"
                   >
                      Посмотреть состав
                   </button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* Members Modal */}
      {membersModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-[101]">
              
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                 <div>
                    <h3 className="text-xl font-bold text-gray-900">Состав группы</h3>
                    <p className="text-sm text-gray-500">{currentGroupName}</p>
                 </div>
                 <button onClick={() => setMembersModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                 </button>
              </div>
              
              <div className="p-0 max-h-[60vh] overflow-y-auto">
                 {currentGroupMembers.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                       <Users size={48} className="mx-auto text-gray-300 mb-3" />
                       <p>В этой группе пока нет сотрудников.</p>
                    </div>
                 ) : (
                    <div className="divide-y divide-gray-100">
                       {currentGroupMembers.map(member => (
                          <div key={member.id} className="p-4 flex items-center space-x-4 hover:bg-gray-50 transition-colors">
                             <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {member.avatar}
                             </div>
                             <div>
                                <div className="font-medium text-gray-900">{member.name}</div>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                 <button 
                    onClick={() => setMembersModalOpen(false)}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 font-medium"
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
};

export default SettingsAccessGroups;