import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Camera, 
  Ban, 
  Trash2, 
  Shield, 
  KeyRound, 
  Eye, 
  EyeOff, 
  ExternalLink,
  Store,
  Plus,
  X,
  CreditCard,
  History,
  RefreshCw
} from 'lucide-react';
import { Employee } from './SettingsStaff';

interface OutletAssignment {
  outletId: string;
  outletName: string;
  pinCode: string;
  txCount: number;
  lastTx: string;
}

interface SettingsStaffDetailsProps {
  basicInfo: Employee;
  onBack: () => void;
  onUpdate: (updated: Partial<Employee>) => void;
}

const mockOutletsList = [
  'Центральный магазин', 
  'ТЦ Сити Молл', 
  'Киоск Аэропорт', 
  'Филиал Пригород'
];

const SettingsStaffDetails: React.FC<SettingsStaffDetailsProps> = ({ basicInfo, onBack, onUpdate }) => {
  // --- Extended State ---
  const [profile, setProfile] = useState({
    firstName: basicInfo.firstName,
    lastName: basicInfo.lastName,
    phone: basicInfo.phone,
    email: basicInfo.email || 'employee@example.com',
    comment: 'Ответственный сотрудник.', // Mock
    status: basicInfo.status,
    photoUrl: null as string | null
  });

  const [access, setAccess] = useState({
    hasAccess: basicInfo.access.hasAccess,
    group: basicInfo.access.group || 'Аналитик',
    login: basicInfo.access.login || 'user123',
    password: 'password123' // Mock
  });

  const [assignments, setAssignments] = useState<OutletAssignment[]>([
    // Mock Assignments derived from basicInfo.outlets
    ...basicInfo.outlets.map((name, i) => ({
      outletId: i.toString(),
      outletName: name,
      pinCode: Math.floor(1000 + Math.random() * 9000).toString(),
      txCount: Math.floor(Math.random() * 500),
      lastTx: '28.12.2023'
    }))
  ]);

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [isAddOutletOpen, setIsAddOutletOpen] = useState(false);
  const [selectedOutletToAdd, setSelectedOutletToAdd] = useState(mockOutletsList[0]);

  // --- Handlers ---

  const handleSaveProfile = () => {
    onUpdate({
        id: basicInfo.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        email: profile.email,
        status: profile.status,
        access: {
            hasAccess: access.hasAccess,
            group: access.group,
            login: access.login
        },
        outlets: assignments.map(a => a.outletName)
    });
    alert('Изменения сохранены');
  };

  const handleFireEmployee = () => {
    if (confirm('Вы уверены, что хотите уволить этого сотрудника? Доступ ко всем системам будет заблокирован.')) {
        setProfile(p => ({ ...p, status: 'fired' }));
        setAccess(a => ({ ...a, hasAccess: false }));
        onUpdate({ id: basicInfo.id, status: 'fired', access: { ...basicInfo.access, hasAccess: false } });
    }
  };

  const handleAddOutlet = () => {
    if (assignments.find(a => a.outletName === selectedOutletToAdd)) {
        alert('Сотрудник уже привязан к этой точке');
        return;
    }
    const newAssignment: OutletAssignment = {
        outletId: Date.now().toString(),
        outletName: selectedOutletToAdd,
        pinCode: Math.floor(1000 + Math.random() * 9000).toString(),
        txCount: 0,
        lastTx: '-'
    };
    setAssignments([...assignments, newAssignment]);
    setIsAddOutletOpen(false);
  };

  const handleRemoveOutlet = (outletName: string) => {
    if (confirm(`Отвязать сотрудника от точки "${outletName}"?`)) {
        setAssignments(prev => prev.filter(a => a.outletName !== outletName));
    }
  };

  const handleRegeneratePin = (outletName: string) => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setAssignments(prev => prev.map(a => 
        a.outletName === outletName ? { ...a, pinCode: newPin } : a
    ));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setProfile(p => ({ ...p, photoUrl: reader.result as string }));
        };
        reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-fade-in">
       
       {/* Navigation Header */}
       <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
             <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
                <ArrowLeft size={20} />
             </button>
             <div>
                <h2 className="text-2xl font-bold text-gray-900 leading-none">{profile.lastName} {profile.firstName}</h2>
                <div className="flex items-center space-x-2 mt-1">
                   <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${profile.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {profile.status === 'active' ? 'Работает' : 'Уволен'}
                   </span>
                   <span className="text-sm text-gray-500">{access.group}</span>
                </div>
             </div>
          </div>
          
          <button 
             onClick={handleSaveProfile}
             className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
          >
             <Save size={18} />
             <span>Сохранить</span>
          </button>
       </div>

       <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* COLUMN 1: Profile & Status */}
          <div className="space-y-6">
             <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
                <div className="flex flex-col items-center">
                   <div className="relative group cursor-pointer">
                      <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
                         {profile.photoUrl ? (
                            <img src={profile.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                         ) : (
                            <span className="text-4xl font-bold text-gray-400">{profile.firstName[0]}{profile.lastName[0]}</span>
                         )}
                      </div>
                      <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Camera className="text-white" size={24} />
                         <input type="file" accept="image/*" onChange={handlePhotoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                      <input 
                         type="text" 
                         value={profile.firstName}
                         onChange={(e) => setProfile({...profile, firstName: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
                      <input 
                         type="text" 
                         value={profile.lastName}
                         onChange={(e) => setProfile({...profile, lastName: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                      <input 
                         type="text" 
                         value={profile.phone}
                         onChange={(e) => setProfile({...profile, phone: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input 
                         type="email" 
                         value={profile.email}
                         onChange={(e) => setProfile({...profile, email: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                      <textarea 
                         rows={3}
                         value={profile.comment}
                         onChange={(e) => setProfile({...profile, comment: e.target.value})}
                         className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                      />
                   </div>
                </div>

                {profile.status !== 'fired' && (
                   <div className="pt-4 border-t border-gray-100">
                      <button 
                         onClick={handleFireEmployee}
                         className="w-full flex items-center justify-center space-x-2 text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                         <Ban size={16} />
                         <span>Уволить сотрудника</span>
                      </button>
                   </div>
                )}
             </div>
          </div>

          {/* COLUMN 2: Access & Stats */}
          <div className="space-y-6">
             <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                   <div className="flex items-center space-x-2">
                      <Shield className="text-purple-600" size={20} />
                      <h3 className="font-bold text-gray-900">Доступ в панель</h3>
                   </div>
                   <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                         type="checkbox" 
                         checked={access.hasAccess}
                         onChange={(e) => setAccess({...access, hasAccess: e.target.checked})}
                         className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                   </label>
                </div>

                {access.hasAccess ? (
                   <div className="space-y-4 animate-fade-in">
                      <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Группа доступа</label>
                         <select 
                            value={access.group}
                            onChange={(e) => setAccess({...access, group: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                         >
                            <option value="Аналитик">Аналитик</option>
                            <option value="Менеджер">Менеджер</option>
                            <option value="Администратор">Администратор</option>
                         </select>
                      </div>
                      
                      <div className="p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
                         <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Логин</label>
                            <input 
                               type="text"
                               value={access.login}
                               onChange={(e) => setAccess({...access, login: e.target.value})}
                               className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                            />
                         </div>
                         <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Пароль</label>
                            <div className="relative">
                               <input 
                                  type={showPassword ? 'text' : 'password'}
                                  value={access.password}
                                  onChange={(e) => setAccess({...access, password: e.target.value})}
                                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm pr-10 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                               />
                               <button 
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                               >
                                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                               </button>
                            </div>
                         </div>
                      </div>
                   </div>
                ) : (
                   <div className="text-center py-6 text-gray-500 text-sm">
                      <Ban size={32} className="mx-auto text-gray-300 mb-2" />
                      Доступ запрещен
                   </div>
                )}
             </div>

             <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                   <History className="text-blue-500" size={20} />
                   <h3 className="font-bold text-gray-900">История действий</h3>
                </div>
                <div className="text-sm text-gray-600 mb-4">
                   Просмотр всех операций (начисления, списания), выполненных этим сотрудником.
                </div>
                <button 
                   onClick={() => alert('Переход в журнал операций с фильтром по ID сотрудника')}
                   className="w-full flex items-center justify-center space-x-2 border border-gray-200 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                   <span>Открыть журнал</span>
                   <ExternalLink size={14} />
                </button>
             </div>
          </div>

          {/* COLUMN 3: Workplaces */}
          <div className="space-y-6">
             <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                   <div className="flex items-center space-x-2">
                      <Store className="text-green-600" size={20} />
                      <h3 className="font-bold text-gray-900">Торговые точки</h3>
                   </div>
                   <button 
                      onClick={() => setIsAddOutletOpen(true)}
                      className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                      title="Привязать к точке"
                   >
                      <Plus size={18} />
                   </button>
                </div>

                {isAddOutletOpen && (
                   <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 animate-fade-in">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Выберите точку</label>
                      <div className="flex space-x-2">
                         <select 
                            value={selectedOutletToAdd}
                            onChange={(e) => setSelectedOutletToAdd(e.target.value)}
                            className="flex-1 text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                         >
                            {mockOutletsList.map(o => <option key={o} value={o}>{o}</option>)}
                         </select>
                         <button onClick={handleAddOutlet} className="px-3 py-1 bg-purple-600 text-white rounded-md text-sm">OK</button>
                         <button onClick={() => setIsAddOutletOpen(false)} className="px-2 py-1 text-gray-500 hover:text-gray-700"><X size={16} /></button>
                      </div>
                   </div>
                )}

                <div className="space-y-3">
                   {assignments.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">Нет привязанных точек</div>
                   ) : (
                      assignments.map((assignment) => (
                         <div key={assignment.outletId} className="bg-gray-50 rounded-lg border border-gray-200 p-4 relative group">
                            <div className="flex justify-between items-start mb-2">
                               <h4 className="font-bold text-gray-900 text-sm">{assignment.outletName}</h4>
                               <button 
                                  onClick={() => handleRemoveOutlet(assignment.outletName)}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                               >
                                  <Trash2 size={16} />
                               </button>
                            </div>
                            
                            <div className="flex items-center justify-between mb-3">
                               <div className="flex items-center space-x-2 bg-white px-2 py-1 rounded border border-gray-200">
                                  <KeyRound size={14} className="text-gray-400" />
                                  <span className="font-mono font-bold text-lg tracking-widest text-gray-800">{assignment.pinCode}</span>
                                  <button onClick={() => handleRegeneratePin(assignment.outletName)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-purple-600 transition-colors" title="Сгенерировать новый PIN">
                                      <RefreshCw size={12} />
                                  </button>
                               </div>
                               <span className="text-xs text-gray-500">PIN-код для входа</span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-200 pt-2">
                               <div className="flex items-center space-x-1" title="Количество транзакций">
                                  <CreditCard size={12} />
                                  <span>{assignment.txCount} чек.</span>
                               </div>
                               <div className="flex items-center space-x-1" title="Последняя транзакция">
                                  <History size={12} />
                                  <span>{assignment.lastTx}</span>
                               </div>
                            </div>
                         </div>
                      ))
                   )}
                </div>
             </div>
          </div>

       </div>
    </div>
  );
};

export default SettingsStaffDetails;