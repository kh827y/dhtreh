import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  UserCog, 
  Plus, 
  Search, 
  Filter, 
  Shield, 
  MapPin, 
  Clock, 
  X,
  User,
  KeyRound,
  ChevronRight,
  Info
} from 'lucide-react';
import SettingsStaffDetails from './SettingsStaffDetails';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  status: 'active' | 'fired';
  outlets: string[];
  lastActivity: string;
  access: {
    hasAccess: boolean;
    group: string;
    login?: string;
  };
}

const mockEmployees: Employee[] = [
  { 
    id: '1', 
    firstName: 'Алиса', 
    lastName: 'Фриман', 
    phone: '+7 (999) 123-45-67', 
    email: 'alice@example.com',
    status: 'active', 
    outlets: ['Центральный магазин'], 
    lastActivity: 'Сегодня, 14:30', 
    access: { hasAccess: true, group: 'Аналитик', login: 'alice_f' } 
  },
  { 
    id: '2', 
    firstName: 'Боб', 
    lastName: 'Смит', 
    phone: '+7 (999) 987-65-43', 
    email: 'bob.smith@test.com',
    status: 'active', 
    outlets: ['Центральный магазин', 'ТЦ Сити Молл'], 
    lastActivity: 'Вчера, 18:45', 
    access: { hasAccess: true, group: 'Менеджер', login: 'bob_s' } 
  },
  { 
    id: '3', 
    firstName: 'Иван', 
    lastName: 'Райт', 
    phone: '+7 (900) 555-44-33', 
    email: 'ivan.w@shop.ru',
    status: 'active', 
    outlets: ['Киоск Аэропорт'], 
    lastActivity: '28.12.2023 10:00', 
    access: { hasAccess: true, group: 'Аналитик', login: 'ivan_w' } 
  },
  { 
    id: '4', 
    firstName: 'Елена', 
    lastName: 'Козлова', 
    phone: '+7 (911) 222-33-44', 
    status: 'fired', 
    outlets: ['ТЦ Сити Молл'], 
    lastActivity: '01.11.2023', 
    access: { hasAccess: false, group: '' } 
  },
  { 
    id: '5', 
    firstName: 'Дмитрий', 
    lastName: 'Волков', 
    phone: '+7 (926) 111-00-99', 
    status: 'active', 
    outlets: [], 
    lastActivity: '-', 
    access: { hasAccess: false, group: '' } 
  },
  { 
    id: '6', 
    firstName: 'Виктор', 
    lastName: 'Корнеев', 
    phone: '+7 (903) 777-88-99', 
    email: 'viktor@admin.com',
    status: 'active', 
    outlets: ['Центральный магазин'], 
    lastActivity: 'Сегодня, 09:00', 
    access: { hasAccess: true, group: 'Администратор', login: 'admin_viktor' } 
  }
];

const SettingsStaff: React.FC = () => {
  const [view, setView] = useState<'list' | 'details'>('list');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'fired'>('active');
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Tooltip State for Portal
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterOutlet, setFilterOutlet] = useState('all');
  const [filterAccessOnly, setFilterAccessOnly] = useState(false);

  // Add Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    comment: '',
    grantAccess: false,
    accessGroup: 'Аналитик',
    login: '',
    password: ''
  });

  // Derived Lists
  const uniqueOutlets = Array.from(new Set(employees.flatMap(e => e.outlets)));
  const uniqueGroups = Array.from(new Set(employees.filter(e => e.access.hasAccess).map(e => e.access.group)));

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // 1. Tab Filter
      if (emp.status !== activeTab) return false;

      // 2. Search Filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        emp.firstName.toLowerCase().includes(searchLower) ||
        emp.lastName.toLowerCase().includes(searchLower) ||
        emp.phone.includes(searchLower);
      if (!matchesSearch) return false;

      // 3. Outlet Filter
      if (filterOutlet !== 'all' && !emp.outlets.includes(filterOutlet)) return false;

      // 4. Group Filter
      if (filterGroup !== 'all' && emp.access.group !== filterGroup) return false;

      // 5. Access Checkbox
      if (filterAccessOnly && !emp.access.hasAccess) return false;

      return true;
    });
  }, [employees, activeTab, searchTerm, filterOutlet, filterGroup, filterAccessOnly]);

  const handleAddEmployee = () => {
    if (!formData.firstName) return alert('Введите имя сотрудника');

    const newEmployee: Employee = {
      id: Date.now().toString(),
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: formData.phone,
      email: formData.email,
      status: 'active',
      outlets: [], // Default empty or select in form (simplified for now)
      lastActivity: '-',
      access: {
        hasAccess: formData.grantAccess,
        group: formData.grantAccess ? formData.accessGroup : '',
        login: formData.grantAccess ? formData.login : undefined
      }
    };

    setEmployees(prev => [newEmployee, ...prev]);
    setIsModalOpen(false);
    // Reset form
    setFormData({
      firstName: '', lastName: '', phone: '', email: '', comment: '',
      grantAccess: false, accessGroup: 'Аналитик', login: '', password: ''
    });
  };

  const handleRowClick = (emp: Employee) => {
    setSelectedEmployeeId(emp.id);
    setView('details');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedEmployeeId(null);
  };

  const getGroupBadgeStyle = (groupName: string) => {
    if (groupName === 'Администратор') {
        return 'bg-green-50 text-green-700 border-green-200';
    }
    // All other groups (Manager, Analyst, custom ones) get Blue to signify "Restricted/Role"
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  // --- Details View ---
  if (view === 'details' && selectedEmployeeId) {
    const employee = employees.find(e => e.id === selectedEmployeeId);
    if (!employee) return <div>Сотрудник не найден</div>;

    return (
        <SettingsStaffDetails 
            basicInfo={employee} 
            onBack={handleBackToList}
            onUpdate={(updatedEmp) => {
                setEmployees(prev => prev.map(e => e.id === updatedEmp.id ? { ...e, ...updatedEmp } : e));
            }}
        />
    );
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Сотрудники</h2>
           <p className="text-gray-500 mt-1">Управление персоналом и правами доступа.</p>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Добавить сотрудника</span>
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
                {employees.filter(e => e.status === 'active').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('fired')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'fired' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Уволены
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'fired' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {employees.filter(e => e.status === 'fired').length}
            </span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         
         {/* Filters Bar */}
         <div className="p-4 border-b border-gray-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
            <div className="relative flex-1 w-full xl:max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                  type="text"
                  placeholder="Поиск по имени или телефону..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
               />
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
               <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <Shield size={16} className="text-gray-400" />
                  <select 
                     value={filterGroup}
                     onChange={(e) => setFilterGroup(e.target.value)}
                     className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-4"
                  >
                     <option value="all">Все группы</option>
                     {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
               </div>

               <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <MapPin size={16} className="text-gray-400" />
                  <select 
                     value={filterOutlet}
                     onChange={(e) => setFilterOutlet(e.target.value)}
                     className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-4"
                  >
                     <option value="all">Все точки</option>
                     {uniqueOutlets.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>

               <label className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input 
                     type="checkbox" 
                     checked={filterAccessOnly}
                     onChange={(e) => setFilterAccessOnly(e.target.checked)}
                     className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700 whitespace-nowrap">С доступом в панель</span>
               </label>
            </div>
         </div>

         {/* Table */}
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Имя</th>
                     <th className="px-6 py-4 font-semibold">Торговые точки</th>
                     <th className="px-6 py-4 font-semibold">
                        <div className="flex items-center gap-1 w-fit">
                            <span>Активность</span>
                            <div 
                                className="cursor-help text-gray-400 hover:text-gray-600 transition-colors"
                                onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setTooltip({
                                        x: rect.left + rect.width / 2,
                                        y: rect.top,
                                        text: "Время последней операции с баллами или входа в панель управления"
                                    });
                                }}
                                onMouseLeave={() => setTooltip(null)}
                            >
                                <Info size={14} />
                            </div>
                        </div>
                     </th>
                     <th className="px-6 py-4 font-semibold">Доступ в панель</th>
                     <th className="px-6 py-4 font-semibold text-right w-16"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredEmployees.length === 0 ? (
                     <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                           <UserCog size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>Сотрудники не найдены.</p>
                        </td>
                     </tr>
                  ) : (
                     filteredEmployees.map((emp) => (
                        <tr 
                           key={emp.id} 
                           className="hover:bg-gray-50 transition-colors cursor-pointer group"
                           onClick={() => handleRowClick(emp)}
                        >
                           <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                 <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm">
                                    {emp.firstName[0]}{emp.lastName[0]}
                                 </div>
                                 <div>
                                    <div className="font-medium text-gray-900">{emp.firstName} {emp.lastName}</div>
                                    <div className="text-xs text-gray-500">{emp.phone}</div>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                 {emp.outlets.length > 0 ? (
                                    emp.outlets.map((o, idx) => (
                                       <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                          {o}
                                       </span>
                                    ))
                                 ) : (
                                    <span className="text-gray-400 text-xs italic">Не назначено</span>
                                 )}
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              <div className="flex flex-col">
                                 <div className="flex items-center text-gray-900">
                                    <Clock size={14} className="mr-1.5 text-gray-400" />
                                    <span>{emp.lastActivity}</span>
                                 </div>
                                 <span className="text-[10px] text-gray-400 mt-0.5">Последняя активность</span>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              {emp.access.hasAccess ? (
                                 <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getGroupBadgeStyle(emp.access.group)}`}>
                                    {emp.access.group}
                                 </span>
                              ) : (
                                 <span className="text-gray-400 text-xs">Нет доступа</span>
                              )}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <ChevronRight className="text-gray-300 group-hover:text-gray-500 transition-colors" size={20} />
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* Add Employee Modal */}
      {isModalOpen && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                  <h3 className="text-xl font-bold text-gray-900">Новый сотрудник</h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                     <X size={24} />
                  </button>
               </div>
               
               <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Имя <span className="text-red-500">*</span></label>
                        <input 
                           type="text" 
                           value={formData.firstName}
                           onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
                        <input 
                           type="text" 
                           value={formData.lastName}
                           onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                     </div>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                     <input 
                        type="text" 
                        placeholder="+7"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                     />
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                     <input 
                        type="email" 
                        placeholder="example@mail.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                     />
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                     <textarea 
                        rows={2}
                        value={formData.comment}
                        onChange={(e) => setFormData({...formData, comment: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                     />
                  </div>

                  {/* Panel Access Section */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                     <label className="flex items-center space-x-3 cursor-pointer mb-4">
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formData.grantAccess ? 'bg-purple-600' : 'bg-gray-300'}`}>
                           <input 
                              type="checkbox" 
                              checked={formData.grantAccess}
                              onChange={(e) => setFormData({...formData, grantAccess: e.target.checked})}
                              className="sr-only" 
                           />
                           <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.grantAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                        </div>
                        <span className="font-medium text-gray-900">Доступ в панель управления</span>
                     </label>

                     {formData.grantAccess && (
                        <div className="space-y-4 animate-fade-in pl-1">
                           <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Группа доступа</label>
                              <select 
                                 value={formData.accessGroup}
                                 onChange={(e) => setFormData({...formData, accessGroup: e.target.value})}
                                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                              >
                                 <option value="Аналитик">Аналитик</option>
                                 <option value="Менеджер">Менеджер</option>
                                 <option value="Администратор">Администратор</option>
                              </select>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Логин</label>
                                 <div className="relative">
                                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                       type="text" 
                                       value={formData.login}
                                       onChange={(e) => setFormData({...formData, login: e.target.value})}
                                       className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                 </div>
                              </div>
                              <div>
                                 <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Пароль</label>
                                 <div className="relative">
                                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                       type="password" 
                                       value={formData.password}
                                       onChange={(e) => setFormData({...formData, password: e.target.value})}
                                       className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
                  <button 
                     onClick={() => setIsModalOpen(false)}
                     className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                  >
                     Отмена
                  </button>
                  <button 
                     onClick={handleAddEmployee}
                     className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                  >
                     Создать
                  </button>
               </div>
            </div>
         </div>,
         document.body
      )}

      {/* Tooltip Portal */}
      {tooltip && createPortal(
        <div 
            className="fixed z-[9999] px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl pointer-events-none max-w-xs text-center"
            style={{ 
                top: tooltip.y - 8, 
                left: tooltip.x, 
                transform: 'translate(-50%, -100%)' 
            }}
        >
            {tooltip.text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-gray-900"></div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SettingsStaff;