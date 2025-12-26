import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  Pencil,
  Trash2,
  Image as ImageIcon,
  X
} from 'lucide-react';

// --- Types ---
type NewsletterStatus = 'scheduled' | 'sending' | 'sent';

interface TelegramNewsletter {
  id: string;
  date: string;
  time: string;
  text: string;
  image?: string; // Data URL or URL
  audience: string;
  status: NewsletterStatus;
  reach: number; 
  failedCount?: number; // Number of users who didn't receive the message
}

const TelegramNewsletters: React.FC = () => {
  const [view, setView] = useState<'list' | 'create'>('list');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // State for image lightbox
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // --- Mock Data ---
  const mockAudiences = [
    { id: 'all', name: 'Все клиенты', count: 1250 },
    { id: 'vip', name: 'Золотой статус (VIP)', count: 120 },
    { id: 'churn', name: 'Риск оттока', count: 450 },
    { id: 'new', name: 'Новые клиенты', count: 300 },
    { id: 'dormant', name: 'Спящие (>90 дней)', count: 200 }
  ];

  const [newsletters, setNewsletters] = useState<TelegramNewsletter[]>([
    {
      id: '1',
      date: '26.12.2023',
      time: '18:00',
      text: '🎄 Праздничное меню уже в ресторане! Бронируйте столик через бота.',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=200',
      audience: 'all',
      status: 'scheduled',
      reach: 1250,
      failedCount: 0
    },
    {
      id: '2',
      date: 'Сегодня',
      time: '15:00',
      text: '🔥 Горячее предложение: Стейк Рибай со скидкой 20%!',
      audience: 'vip',
      status: 'sending',
      reach: 120,
      failedCount: 0
    },
    {
      id: '3',
      date: '22.12.2023',
      time: '11:00',
      text: 'Новый десерт "Зимняя сказка". Попробуйте первыми!',
      image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=200',
      audience: 'all',
      status: 'sent',
      reach: 1245,
      failedCount: 5 
    },
    {
      id: '4',
      date: '10.12.2023',
      time: '19:00',
      text: 'Дарим промокод TELEGRAM10 на доставку.',
      audience: 'new',
      status: 'sent',
      reach: 300,
      failedCount: 12
    }
  ]);

  // --- Form State ---
  const [formData, setFormData] = useState<{
    text: string;
    image?: string;
    audience: string;
    sendNow: boolean;
    date: string;
    time: string;
  }>({
    text: '',
    image: undefined,
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

  const getStatusBadge = (n: TelegramNewsletter) => {
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Handlers ---
  const handleSave = () => {
    if (!formData.text) return alert('Введите текст сообщения');

    const newNewsletter: TelegramNewsletter = {
      id: editingId || Date.now().toString(),
      date: formData.sendNow ? 'Сегодня' : new Date(formData.date).toLocaleDateString('ru-RU'),
      time: formData.sendNow ? new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) : formData.time,
      text: formData.text,
      image: formData.image,
      audience: formData.audience,
      status: formData.sendNow ? 'sending' : 'scheduled',
      reach: mockAudiences.find(a => a.id === formData.audience)?.count || 0,
      failedCount: 0
    };

    if (editingId) {
       setNewsletters(prev => prev.map(n => n.id === editingId ? newNewsletter : n));
    } else {
       setNewsletters([newNewsletter, ...newsletters]);
    }

    setEditingId(null);
    setView('list');
    setActiveTab('active');
  };

  const handleEdit = (item: TelegramNewsletter) => {
    setEditingId(item.id);
    
    // Attempt to parse "DD.MM.YYYY" back to "YYYY-MM-DD" for input
    const parts = item.date.split('.');
    let isoDate = new Date().toISOString().split('T')[0];
    if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    setFormData({
        text: item.text,
        image: item.image,
        audience: item.audience,
        sendNow: false,
        date: isoDate,
        time: item.time
    });
    setView('create');
  };

  const handleDelete = (id: string) => {
    if (confirm('Вы уверены, что хотите удалить эту рассылку?')) {
        setNewsletters(prev => prev.filter(n => n.id !== id));
    }
  };

  // --- Filtered Lists ---
  const filteredNewsletters = newsletters.filter(n => {
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
                 <p className="text-sm text-gray-500">Создание сообщения для Telegram бота</p>
              </div>
           </div>

           <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 space-y-6">
                 
                 {/* Text Input */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Текст сообщения</label>
                    <div className="relative">
                       <textarea 
                          value={formData.text}
                          onChange={(e) => setFormData({...formData, text: e.target.value})}
                          placeholder="Введите текст..."
                          rows={6}
                          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
                       />
                    </div>
                    <div className="mt-2 flex items-start space-x-2 text-xs text-gray-500">
                       <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                       <p>Поддерживается Markdown разметка: *жирный*, _курсив_, [ссылка](url).</p>
                    </div>
                 </div>

                 {/* Image Attachment */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Изображение (опционально)</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors relative">
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {formData.image ? (
                            <div className="relative h-48 w-full flex items-center justify-center">
                                <img src={formData.image} alt="Preview" className="max-h-full max-w-full object-contain rounded-md shadow-sm" />
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault(); 
                                        setFormData({...formData, image: undefined});
                                    }} 
                                    className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-1.5 shadow-md text-gray-500 hover:text-red-600 border border-gray-200"
                                >
                                    <X size={16}/>
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-gray-500 pointer-events-none">
                                <ImageIcon size={32} className="mb-2 text-gray-400" />
                                <span className="text-sm font-medium">Нажмите или перетащите изображение</span>
                                <span className="text-xs text-gray-400 mt-1">PNG, JPG до 5MB</span>
                            </div>
                        )}
                    </div>
                 </div>

                 {/* Audience */}
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Получатели</label>
                    <select 
                       value={formData.audience}
                       onChange={(e) => setFormData({...formData, audience: e.target.value})}
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                         className="rounded text-blue-600 focus:ring-blue-500"
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
                   className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                 >
                    <Send size={16} />
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
           <div className="flex items-center space-x-2">
              <h2 className="text-2xl font-bold text-gray-900">Telegram-рассылки</h2>
           </div>
           <p className="text-gray-500 mt-1">Отправка сообщений пользователям Telegram бота.</p>
        </div>
        
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({
               text: '',
               image: undefined,
               audience: 'all',
               sendNow: true,
               date: new Date().toISOString().split('T')[0],
               time: '12:00'
            });
            setView('create');
          }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
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
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Активные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {newsletters.filter(n => n.status === 'scheduled' || n.status === 'sending').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'archived' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Архивные
            <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${activeTab === 'archived' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                {newsletters.filter(n => n.status === 'sent').length}
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
                     <th className="px-6 py-4 font-semibold w-16">Фото</th>
                     <th className="px-6 py-4 font-semibold w-40">Дата отправки</th>
                     <th className="px-6 py-4 font-semibold">Сообщение</th>
                     <th className="px-6 py-4 font-semibold">Аудитория</th>
                     <th className="px-6 py-4 font-semibold text-right">Статус</th>
                     {activeTab === 'active' && <th className="px-6 py-4 font-semibold text-right w-24">Действия</th>}
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredNewsletters.length === 0 ? (
                     <tr>
                        <td colSpan={activeTab === 'active' ? 6 : 5} className="px-6 py-10 text-center text-gray-500">
                           <Send size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>
                             {activeTab === 'active' 
                               ? 'Нет активных или запланированных рассылок' 
                               : 'Архив рассылок пуст'}
                           </p>
                        </td>
                     </tr>
                  ) : (
                     filteredNewsletters.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                           <td className="px-6 py-4">
                              {item.image ? (
                                  <div 
                                    className="h-10 w-10 rounded-lg overflow-hidden border border-gray-200 cursor-zoom-in hover:opacity-80 transition-opacity"
                                    onClick={() => setExpandedImage(item.image!)}
                                  >
                                      <img src={item.image} alt="" className="h-full w-full object-cover" />
                                  </div>
                              ) : (
                                  <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                      <ImageIcon size={16} />
                                  </div>
                              )}
                           </td>
                           <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                              <div className="flex flex-col">
                                 <span className="font-medium text-gray-900">{item.date}</span>
                                 <span className="text-xs text-gray-500">{item.time}</span>
                              </div>
                           </td>
                           <td className="px-6 py-4 text-gray-900">
                              <p className="line-clamp-2 max-w-xl">{item.text}</p>
                           </td>
                           <td className="px-6 py-4 text-gray-600">
                              <div className="flex items-center space-x-2">
                                 <Users size={14} />
                                 <span>{getAudienceName(item.audience)}</span>
                              </div>
                              {item.reach ? <span className="text-xs text-gray-400 mt-1 block">~{item.reach} получателей</span> : null}
                           </td>
                           <td className="px-6 py-4 text-right">
                              {getStatusBadge(item)}
                           </td>
                           {activeTab === 'active' && (
                               <td className="px-6 py-4 text-right">
                                  {item.status === 'scheduled' && (
                                    <div className="flex items-center justify-end space-x-2">
                                        <button 
                                          onClick={() => handleEdit(item)}
                                          title="Редактировать"
                                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                           <Pencil size={16} />
                                        </button>
                                        <button 
                                          onClick={() => handleDelete(item.id)}
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

      {/* Expanded Image Modal */}
      {expandedImage && createPortal(
        <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setExpandedImage(null)}
        >
            <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
                <img 
                    src={expandedImage} 
                    alt="Expanded" 
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
                />
                <button 
                    onClick={() => setExpandedImage(null)}
                    className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2"
                >
                    <X size={32} />
                </button>
            </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default TelegramNewsletters;