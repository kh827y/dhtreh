import React, { useState } from 'react';
import { 
  Send, 
  Users, 
  Plus, 
  Clock, 
  CheckCircle2, 
  ArrowLeft,
  AlertCircle,
  Loader2,
  AlertTriangle,
  Bell,
  Pencil,
  Trash2
} from 'lucide-react';

// --- Types ---
type PushStatus = 'scheduled' | 'sending' | 'sent';

interface PushNotification {
  id: string;
  date: string;
  time: string;
  text: string;
  audience: string;
  status: PushStatus;
  reach: number; 
  failedCount?: number; // Number of users who didn't receive the push
}

const PushNotifications: React.FC = () => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Mock Data ---
  const mockAudiences = [
    { id: 'all', name: 'Все клиенты', count: 1250 },
    { id: 'vip', name: 'Золотой статус (VIP)', count: 120 },
    { id: 'churn', name: 'Риск оттока', count: 450 },
    { id: 'new', name: 'Новые клиенты', count: 300 },
    { id: 'dormant', name: 'Спящие (>90 дней)', count: 200 }
  ];

  const [notifications, setNotifications] = useState<PushNotification[]>([
    {
      id: '1',
      date: '25.12.2023',
      time: '12:00',
      text: 'С Новым Годом! 🎄 Дарим 500 бонусов всем держателям карт.',
      audience: 'all',
      status: 'scheduled',
      reach: 1250,
      failedCount: 0
    },
    {
      id: '2',
      date: 'Сегодня',
      time: '14:30',
      text: '⚡️ Молния! Скидка 30% на всё меню только следующие 2 часа!',
      audience: 'all',
      status: 'sending', // Currently sending
      reach: 1250,
      failedCount: 0
    },
    {
      id: '3',
      date: '20.12.2023',
      time: '10:00',
      text: 'Только сегодня: двойные баллы на все десерты! 🍰',
      audience: 'all',
      status: 'sent',
      reach: 1245,
      failedCount: 5 // Small error count
    },
    {
      id: '4',
      date: '15.12.2023',
      time: '18:30',
      text: 'Мы соскучились! Вернитесь и получите кофе в подарок.',
      audience: 'churn',
      status: 'sent',
      reach: 450,
      failedCount: 42 // Significant error count
    },
    {
      id: '5',
      date: '01.11.2023',
      time: '09:00',
      text: 'Осеннее меню уже здесь! Попробуйте тыквенный латте.',
      audience: 'all',
      status: 'sent',
      reach: 1100,
      failedCount: 0
    }
  ]);

  // --- Form State ---
  const [formData, setFormData] = useState({
    text: '',
    audience: 'all',
    sendNow: true,
    date: new Date().toISOString().split('T')[0],
    time: '12:00'
  });

  // --- Helpers ---
  const getAudienceName = (id: string) => {
    const aud = mockAudiences.find(a => a.id === id);
    return aud ? aud.name : id;
  };

  const getStatusBadge = (n: PushNotification) => {
    switch (n.status) {
      case 'sending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 animate-pulse">
            <Loader2 size={12} className="mr-1 animate-spin"/> Выполняется
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock size={12} className="mr-1"/> Запланировано
          </span>
        );
      case 'sent':
        if (n.failedCount && n.failedCount > 0) {
            return (
                <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 size={12} className="mr-1"/> Отправлено
                    </span>
                    <span className="inline-flex items-center text-xs text-red-600 font-medium" title="Не доставлено пользователям">
                        <AlertTriangle size={10} className="mr-1"/> Не доставлено: {n.failedCount}
                    </span>
                </div>
            );
        }
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 size={12} className="mr-1"/> Отправлено
          </span>
        );
    }
  };

  // --- Handlers ---
  const handleSave = () => {
    if (!formData.text) return alert('Введите текст сообщения');

    const newPush: PushNotification = {
      id: editingId || Date.now().toString(),
      date: formData.sendNow ? 'Сегодня' : new Date(formData.date).toLocaleDateString('ru-RU'),
      time: formData.sendNow ? new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) : formData.time,
      text: formData.text,
      audience: formData.audience,
      status: formData.sendNow ? 'sending' : 'scheduled',
      reach: mockAudiences.find(a => a.id === formData.audience)?.count || 0,
      failedCount: 0
    };

    if (editingId) {
       setNotifications(prev => prev.map(n => n.id === editingId ? newPush : n));
    } else {
       setNotifications([newPush, ...notifications]);
    }

    setEditingId(null);
    setView('list');
    setActiveTab('active');
  };

  const handleEdit = (push: PushNotification) => {
    setEditingId(push.id);
    
    // Attempt to parse "DD.MM.YYYY" back to "YYYY-MM-DD" for input
    const parts = push.date.split('.');
    let isoDate = new Date().toISOString().split('T')[0];
    if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    setFormData({
        text: push.text,
        audience: push.audience,
        sendNow: false,
        date: isoDate,
        time: push.time
    });
    setView('create');
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить эту рассылку?')) {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }
  };

  // --- Filtered Lists ---
  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'active') {
        return n.status === 'scheduled' || n.status === 'sending';
    } else {
        return n.status === 'sent';
    }
  });

  // --- Render Create View ---
  if (view === 'create') {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
        <div className="max-w-3xl mx-auto">
           {/* Header */}
           <div className="flex items-center space-x-4 mb-8">
              <button 
                onClick={() => setView('list')}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
              >
                 <ArrowLeft size={24} />
              </button>
              <div>
                 <h2 className="text-2xl font-bold text-gray-900">{editingId ? 'Редактирование рассылки' : 'Новая рассылка'}</h2>
                 <p className="text-sm text-gray-500">Создание и настройка PUSH-уведомления</p>
              </div>
           </div>

           <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 space-y-6">
                 
                 {/* Text Input */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Текст уведомления</label>
                    <div className="relative">
                       <textarea 
                          value={formData.text}
                          onChange={(e) => setFormData({...formData, text: e.target.value})}
                          placeholder="Введите текст сообщения..."
                          rows={4}
                          maxLength={150}
                          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                       />
                       <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                          {formData.text.length}/150
                       </div>
                    </div>
                    <div className="mt-2 flex items-start space-x-2 text-xs text-gray-500">
                       <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                       <p>Рекомендуем использовать эмодзи для повышения конверсии. Избегайте слишком длинных текстов.</p>
                    </div>
                 </div>

                 {/* Audience */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Получатели</label>
                    <select 
                       value={formData.audience}
                       onChange={(e) => setFormData({...formData, audience: e.target.value})}
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                       {mockAudiences.map(aud => (
                          <option key={aud.id} value={aud.id}>
                             {aud.name} (~{aud.count} чел.)
                          </option>
                       ))}
                    </select>
                 </div>

                 {/* Scheduling */}
                 <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <label className="flex items-center space-x-2 mb-4 cursor-pointer">
                       <input 
                         type="checkbox" 
                         checked={formData.sendNow}
                         onChange={(e) => setFormData({...formData, sendNow: e.target.checked})}
                         className="rounded text-purple-600 focus:ring-purple-500"
                       />
                       <span className="text-sm font-medium text-gray-900">Отправить сейчас</span>
                    </label>

                    <div className={`grid grid-cols-2 gap-4 transition-opacity duration-200 ${formData.sendNow ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                       <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Дата</label>
                          <input 
                             type="date"
                             value={formData.date}
                             onChange={(e) => setFormData({...formData, date: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                       </div>
                       <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Время</label>
                          <input 
                             type="time"
                             value={formData.time}
                             onChange={(e) => setFormData({...formData, time: e.target.value})}
                             className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                       </div>
                    </div>
                 </div>

              </div>
              
              <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t border-gray-100">
                 <button 
                   onClick={() => setView('list')}
                   className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                 >
                    Отмена
                 </button>
                 <button 
                   onClick={handleSave}
                   className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
                 >
                    <Bell size={16} />
                    <span>{formData.sendNow ? 'Отправить' : 'Запланировать'}</span>
                 </button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  // --- Render List View ---
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Push-рассылки</h2>
           <p className="text-gray-500 mt-1">Управление массовыми уведомлениями клиентов.</p>
        </div>
        
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({
               text: '',
               audience: 'all',
               sendNow: true,
               date: new Date().toISOString().split('T')[0],
               time: '12:00'
            });
            setView('create');
          }}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Plus size={18} />
           <span>Создать рассылку</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('active')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Активные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'active' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {notifications.filter(n => n.status === 'scheduled' || n.status === 'sending').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'archived' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Архивные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'archived' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                {notifications.filter(n => n.status === 'sent').length}
            </span>
          </button>
        </nav>
      </div>

      {/* List Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold w-40">Дата отправки</th>
                     <th className="px-6 py-4 font-semibold">Сообщение</th>
                     <th className="px-6 py-4 font-semibold">Аудитория</th>
                     <th className="px-6 py-4 font-semibold text-right">Статус</th>
                     {activeTab === 'active' && <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>}
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredNotifications.length === 0 ? (
                     <tr>
                        <td colSpan={activeTab === 'active' ? 5 : 4} className="px-6 py-10 text-center text-gray-500">
                           <Bell size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>
                             {activeTab === 'active' 
                               ? 'Нет активных или запланированных рассылок' 
                               : 'Архив рассылок пуст'}
                           </p>
                        </td>
                     </tr>
                  ) : (
                     filteredNotifications.map((push) => (
                        <tr key={push.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                              <div className="flex flex-col">
                                 <span className="font-medium text-gray-900">{push.date}</span>
                                 <span className="text-xs text-gray-500">{push.time}</span>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-gray-900">
                              <p className="line-clamp-2 max-w-xl">{push.text}</p>
                           </td>
                           <td className="px-6 py-4 text-gray-600">
                              <div className="flex items-center space-x-2">
                                 <Users size={14} />
                                 <span>{getAudienceName(push.audience)}</span>
                              </div>
                              {push.reach ? <span className="text-xs text-gray-400 mt-1 block">~{push.reach} получателей</span> : null}
                           </td>
                           <td className="px-6 py-4 text-right">
                              {getStatusBadge(push)}
                           </td>
                           {activeTab === 'active' && (
                               <td className="px-6 py-4 text-right">
                                  {push.status === 'scheduled' && (
                                    <div className="flex items-center justify-end space-x-2">
                                        <button 
                                          onClick={() => handleEdit(push)}
                                          title="Редактировать"
                                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                        >
                                           <Pencil size={16} />
                                        </button>
                                        <button 
                                          onClick={() => handleDelete(push.id)}
                                          title="Удалить"
                                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                           <Trash2 size={16} />
                                        </button>
                                    </div>
                                  )}
                               </td>
                           )}
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

export default PushNotifications;