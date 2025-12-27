import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  Gift, 
  Edit, 
  User, 
  X, 
  Save, 
  Calendar,
  Filter
} from 'lucide-react';
import { createPortal } from 'react-dom';
import ClientDetails from './ClientDetails';

interface Client {
  id: string;
  phone: string;
  name: string;
  email: string;
  visitFrequency: number; // avg days
  avgCheck: number;
  birthDate: string;
  level: string;
  gender: 'M' | 'F' | 'U';
}

interface ClientsProps {
  targetClientId?: string | null;
}

// Helpers
const calculateAge = (birthDateStr: string): number => {
  if (!birthDateStr) return 0;
  const parts = birthDateStr.split('.');
  if (parts.length !== 3) return 0;
  
  const birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  const today = new Date();
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

const Clients: React.FC<ClientsProps> = ({ targetClientId }) => {
  // --- State ---
  const [view, setView] = useState<'list' | 'details'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null); 
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  // Add/Edit Form State
  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    name: '',
    birthDate: '',
    level: 'Silver',
    gender: 'U',
    comment: ''
  });

  // Gift Form State
  const [giftPoints, setGiftPoints] = useState<number>(100);
  const [giftComment, setGiftComment] = useState('');
  const [giftExpiry, setGiftExpiry] = useState<string>('0');

  // Mock Data
  const [clients, setClients] = useState<Client[]>([
    { id: '1001', phone: '+7 (999) 123-45-67', name: 'Иван Петров', email: 'ivan@example.com', visitFrequency: 14, avgCheck: 650, birthDate: '12.05.1990', level: 'Gold', gender: 'M' },
    { id: '1002', phone: '+7 (911) 987-65-43', name: 'Анна Смирнова', email: 'anna@example.com', visitFrequency: 7, avgCheck: 420, birthDate: '25.10.1995', level: 'Silver', gender: 'F' },
    { id: '1003', phone: '+7 (905) 555-01-02', name: 'Дмитрий Соколов', email: 'dmitry@mail.ru', visitFrequency: 30, avgCheck: 1200, birthDate: '01.01.1985', level: 'Platinum', gender: 'M' },
    { id: '1004', phone: '+7 (921) 111-22-33', name: 'Мария Иванова', email: 'maria@test.com', visitFrequency: 21, avgCheck: 550, birthDate: '15.03.1992', level: 'Silver', gender: 'F' },
    { id: '1005', phone: '+7 (999) 444-55-66', name: 'Алексей Попов', email: 'alex@popov.net', visitFrequency: 45, avgCheck: 800, birthDate: '20.07.1988', level: 'Silver', gender: 'M' },
    { id: '1006', phone: '+7 (900) 100-20-30', name: 'Елена Кузнецова', email: 'elena@kuz.com', visitFrequency: 5, avgCheck: 350, birthDate: '30.11.1998', level: 'Gold', gender: 'F' },
    { id: '1007', phone: '+7 (916) 777-88-99', name: 'Павел Сидоров', email: 'pavel@sid.com', visitFrequency: 60, avgCheck: 2100, birthDate: '14.02.1980', level: 'Platinum', gender: 'M' },
    { id: '1008', phone: '+7 (925) 333-22-11', name: 'Ольга Васильева', email: 'olga@vas.ru', visitFrequency: 12, avgCheck: 580, birthDate: '05.09.1993', level: 'Silver', gender: 'F' },
    { id: '1009', phone: '+7 (999) 000-11-22', name: 'Сергей Морозов', email: 'sergey@moroz.com', visitFrequency: 25, avgCheck: 700, birthDate: '19.06.1982', level: 'Silver', gender: 'M' },
    { id: '1010', phone: '+7 (903) 888-99-00', name: 'Наталья Федорова', email: 'nat@fed.com', visitFrequency: 18, avgCheck: 620, birthDate: '22.04.1991', level: 'Gold', gender: 'F' },
    { id: '1011', phone: '+7 (915) 654-32-10', name: 'Андрей Волков', email: 'volkov@mail.ru', visitFrequency: 90, avgCheck: 1500, birthDate: '10.12.1975', level: 'Silver', gender: 'M' },
    { id: '1012', phone: '+7 (926) 123-98-76', name: 'Юлия Новикова', email: 'julia@nov.com', visitFrequency: 10, avgCheck: 480, birthDate: '08.08.2000', level: 'Silver', gender: 'F' },
  ]);

  // Effect to handle navigation from other components
  useEffect(() => {
    if (targetClientId) {
        const found = clients.find(c => c.id === targetClientId);
        if (found) {
            setSelectedClient(found);
            setView('details');
        } else {
            // Fallback if ID not found in mock list (create temp mock for viewing)
            const tempClient: Client = {
                id: targetClientId,
                name: 'Клиент #' + targetClientId,
                phone: '+7 (000) 000-00-00',
                email: '',
                avgCheck: 0,
                visitFrequency: 0,
                birthDate: '',
                level: 'Silver',
                gender: 'U'
            };
            setSelectedClient(tempClient);
            setView('details');
        }
    }
  }, [targetClientId, clients]);

  // Filtering Logic
  const filteredClients = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(lowerSearch) || 
      c.phone.includes(lowerSearch) || 
      c.email.toLowerCase().includes(lowerSearch)
    );
  }, [clients, searchTerm]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // --- Handlers ---

  const openAddModal = () => {
    setEditingClientId(null);
    setFormData({
      phone: '', email: '', name: '', birthDate: '', level: 'Silver', gender: 'U', comment: ''
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (client: Client, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingClientId(client.id);
    
    // Convert DD.MM.YYYY to YYYY-MM-DD for input
    let isoDate = '';
    if (client.birthDate) {
       const parts = client.birthDate.split('.');
       if (parts.length === 3) isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    setFormData({
      phone: client.phone,
      email: client.email,
      name: client.name,
      birthDate: isoDate,
      level: client.level,
      gender: client.gender,
      comment: '' 
    });
    setIsAddModalOpen(true);
  };

  const handleSaveClient = () => {
    if (!formData.phone || !formData.name) return alert('Заполните обязательные поля');
    
    const formattedBirthDate = formData.birthDate ? formData.birthDate.split('-').reverse().join('.') : '';

    if (editingClientId) {
      // Edit mode
      setClients(prev => prev.map(c => {
        if (c.id === editingClientId) {
          const updated = {
            ...c,
            phone: formData.phone,
            name: formData.name,
            email: formData.email,
            birthDate: formattedBirthDate,
            level: formData.level,
            gender: formData.gender as 'M' | 'F' | 'U',
          };
          // Also update selectedClient if we are currently viewing it
          if (selectedClient && selectedClient.id === editingClientId) {
             setSelectedClient(updated);
          }
          return updated;
        }
        return c;
      }));
    } else {
      // Create mode
      const newClient: Client = {
        id: Date.now().toString(),
        phone: formData.phone,
        name: formData.name,
        email: formData.email,
        birthDate: formattedBirthDate,
        level: formData.level,
        gender: formData.gender as 'M' | 'F' | 'U',
        visitFrequency: 0,
        avgCheck: 0
      };
      setClients([newClient, ...clients]);
    }
    
    setIsAddModalOpen(false);
  };

  const openGiftModal = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClient(client);
    setGiftPoints(100);
    setGiftExpiry('0');
    setGiftComment('');
    setIsGiftModalOpen(true);
  };

  const handleSendGift = () => {
    if (!selectedClient) return;
    alert(`Начислено ${giftPoints} подарочных баллов клиенту ${selectedClient.name}`);
    setIsGiftModalOpen(false);
    // Don't null selectedClient if in details view
    if (view === 'list') setSelectedClient(null);
  };

  const handleCardClick = (client: Client) => {
    setSelectedClient(client);
    setView('details');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedClient(null);
  };

  const navigateToClient = (id: string) => {
     // Navigation within Details view (e.g. referrer)
     const found = clients.find(c => c.id === id);
     if (found) {
        setSelectedClient(found);
     } else {
        alert('Клиент не найден в списке');
     }
  };

  // --- Render Details View ---
  if (view === 'details' && selectedClient) {
     return (
        <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
           <ClientDetails 
              client={selectedClient} 
              onBack={handleBackToList} 
              onEdit={(c) => openEditModal(c)}
              onNavigateToClient={navigateToClient}
           />
           {/* Add/Edit Modal Reuse */}
           {isAddModalOpen && createPortal(
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
                 <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                       <h3 className="text-xl font-bold text-gray-900">{editingClientId ? 'Редактирование клиента' : 'Новый клиент'}</h3>
                       <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={24} />
                       </button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Телефон <span className="text-red-500">*</span></label>
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
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                             />
                          </div>
                       </div>

                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">ФИО клиента <span className="text-red-500">*</span></label>
                          <input 
                             type="text" 
                             value={formData.name}
                             onChange={(e) => setFormData({...formData, name: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                          <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">День рождения</label>
                             <input 
                                type="date" 
                                value={formData.birthDate}
                                onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                             />
                          </div>
                          <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Пол</label>
                             <select 
                                value={formData.gender}
                                onChange={(e) => setFormData({...formData, gender: e.target.value as any})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                             >
                                <option value="U">Не указан</option>
                                <option value="M">Мужской</option>
                                <option value="F">Женский</option>
                             </select>
                          </div>
                       </div>

                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Уровень</label>
                          <select 
                             value={formData.level}
                             onChange={(e) => setFormData({...formData, level: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                             <option value="Silver">Silver</option>
                             <option value="Gold">Gold</option>
                             <option value="Platinum">Platinum</option>
                          </select>
                       </div>

                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                          <textarea 
                             rows={3}
                             value={formData.comment}
                             onChange={(e) => setFormData({...formData, comment: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                          />
                       </div>
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
                       <button 
                          onClick={() => setIsAddModalOpen(false)}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                       >
                          Отмена
                       </button>
                       <button 
                          onClick={handleSaveClient}
                          className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                       >
                          {editingClientId ? 'Сохранить' : 'Создать'}
                       </button>
                    </div>
                 </div>
              </div>,
              document.body
           )}
        </div>
     );
  }

  // --- Render List View ---
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Клиенты</h2>
           <p className="text-gray-500 mt-1">База данных покупателей, управление профилями и начислениями.</p>
        </div>
        
        <div className="flex space-x-3">
           <button 
             onClick={() => alert('Переход к инструменту импорта (в разработке)')}
             className="flex items-center space-x-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
           >
              <Upload size={18} />
              <span>Импорт</span>
           </button>
           <button 
             onClick={openAddModal}
             className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
           >
              <Plus size={18} />
              <span>Добавить клиента</span>
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         
         {/* Filters Bar */}
         <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                  type="text"
                  placeholder="Поиск по имени, телефону или email..."
                  value={searchTerm}
                  onChange={(e) => {
                     setSearchTerm(e.target.value);
                     setCurrentPage(1);
                  }}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
               />
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-500">
               <Filter size={16} />
               <span>Найдено: {filteredClients.length}</span>
            </div>
         </div>

         {/* Table */}
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold w-16">#</th>
                     <th className="px-6 py-4 font-semibold">Телефон</th>
                     <th className="px-6 py-4 font-semibold">Имя</th>
                     <th className="px-6 py-4 font-semibold">Email</th>
                     <th className="px-6 py-4 font-semibold text-right">Частота (дней)</th>
                     <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                     <th className="px-6 py-4 font-semibold">Дата рожд.</th>
                     <th className="px-6 py-4 font-semibold">Возраст</th>
                     <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {paginatedClients.length === 0 ? (
                     <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                           <User size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>Клиенты не найдены.</p>
                        </td>
                     </tr>
                  ) : (
                     paginatedClients.map((client) => (
                        <tr 
                           key={client.id} 
                           className="hover:bg-gray-50 transition-colors cursor-pointer"
                           onClick={() => handleCardClick(client)}
                        >
                           <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                              {client.id}
                           </td>
                           <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                              {client.phone}
                           </td>
                           <td className="px-6 py-4 text-gray-900">
                              <div className="flex items-center space-x-2">
                                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold
                                    ${client.level === 'Gold' ? 'bg-yellow-400' : 
                                      client.level === 'Platinum' ? 'bg-slate-700' : 'bg-gray-400'}`
                                 }>
                                    {client.name.charAt(0)}
                                 </div>
                                 <span>{client.name}</span>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-gray-500">
                              {client.email || '-'}
                           </td>
                           <td className="px-6 py-4 text-right text-gray-900">
                              {client.visitFrequency > 0 ? client.visitFrequency : '-'}
                           </td>
                           <td className="px-6 py-4 text-right text-gray-900 font-medium">
                              {client.avgCheck > 0 ? formatCurrency(client.avgCheck) : '-'}
                           </td>
                           <td className="px-6 py-4 text-gray-500">
                              {client.birthDate || '-'}
                           </td>
                           <td className="px-6 py-4 text-gray-500">
                              {calculateAge(client.birthDate) || '-'}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                                 <button 
                                    onClick={(e) => openEditModal(client, e)}
                                    title="Редактировать"
                                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                 >
                                    <Edit size={16} />
                                 </button>
                                 <button 
                                    onClick={(e) => openGiftModal(client, e)}
                                    title="Начислить баллы"
                                    className="p-1.5 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                                 >
                                    <Gift size={16} />
                                 </button>
                              </div>
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
         </div>

         {/* Pagination */}
         {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
               <span className="text-sm text-gray-500">
                  Показано {Math.min((currentPage - 1) * itemsPerPage + 1, filteredClients.length)} - {Math.min(currentPage * itemsPerPage, filteredClients.length)} из {filteredClients.length}
               </span>
               <div className="flex items-center space-x-2">
                  <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium text-gray-900">
                     Стр. {currentPage}
                  </span>
                  <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages}
                     className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     <ChevronRight size={16} />
                  </button>
               </div>
            </div>
         )}
      </div>

      {/* Add/Edit Client Modal (Shared between List and Details view) */}
      {isAddModalOpen && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
               <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                  <h3 className="text-xl font-bold text-gray-900">{editingClientId ? 'Редактирование клиента' : 'Новый клиент'}</h3>
                  <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                     <X size={24} />
                  </button>
               </div>
               
               <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Телефон <span className="text-red-500">*</span></label>
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
                           value={formData.email}
                           onChange={(e) => setFormData({...formData, email: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                     </div>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">ФИО клиента <span className="text-red-500">*</span></label>
                     <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                     />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">День рождения</label>
                        <input 
                           type="date" 
                           value={formData.birthDate}
                           onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Пол</label>
                        <select 
                           value={formData.gender}
                           onChange={(e) => setFormData({...formData, gender: e.target.value as any})}
                           className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                           <option value="U">Не указан</option>
                           <option value="M">Мужской</option>
                           <option value="F">Женский</option>
                        </select>
                     </div>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Уровень</label>
                     <select 
                        value={formData.level}
                        onChange={(e) => setFormData({...formData, level: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                     >
                        <option value="Silver">Silver</option>
                        <option value="Gold">Gold</option>
                        <option value="Platinum">Platinum</option>
                     </select>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
                     <textarea 
                        rows={3}
                        value={formData.comment}
                        onChange={(e) => setFormData({...formData, comment: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                     />
                  </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
                  <button 
                     onClick={() => setIsAddModalOpen(false)}
                     className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                  >
                     Отмена
                  </button>
                  <button 
                     onClick={handleSaveClient}
                     className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
                  >
                     {editingClientId ? 'Сохранить' : 'Создать'}
                  </button>
               </div>
            </div>
         </div>,
         document.body
      )}

      {/* Gift Points Modal (List View Only) - Updated Style */}
      {isGiftModalOpen && selectedClient && view === 'list' && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-[101]">
               <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center space-x-2">
                  <Gift className="text-pink-600" size={20} />
                  <h3 className="text-lg font-bold text-gray-900">Подарить баллы</h3>
               </div>
               
               <div className="p-6 space-y-4">
                  <div className="text-sm text-gray-600 mb-2">
                     Клиент: <span className="font-semibold text-gray-900">{selectedClient.name}</span>
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Сумма баллов</label>
                     <input type="number" value={giftPoints} onChange={(e) => setGiftPoints(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-center text-pink-600 focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Срок жизни (дней)</label>
                     <div className="relative">
                        <input type="number" value={giftExpiry} onChange={(e) => setGiftExpiry(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0 = вечно</span>
                     </div>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий (виден клиенту)</label>
                     <input type="text" placeholder="Подарок на день рождения!" value={giftComment} onChange={(e) => setGiftComment(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                  </div>
               </div>

               <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
                  <button 
                     onClick={() => setIsGiftModalOpen(false)}
                     className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
                  >
                     Отмена
                  </button>
                  <button 
                     onClick={handleSendGift}
                     className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium"
                  >
                     Подарить
                  </button>
               </div>
            </div>
         </div>,
         document.body
      )}

    </div>
  );
};

export default Clients;