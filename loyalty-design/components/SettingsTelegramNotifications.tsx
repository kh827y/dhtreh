import React, { useState } from 'react';
import { 
  Send, 
  Copy, 
  RefreshCw, 
  MessageCircle, 
  ExternalLink, 
  User, 
  Users, 
  Bell, 
  AlertTriangle,
  Check,
  Star,
  FileText
} from 'lucide-react';
import { AppView } from '../types';

interface SettingsTelegramNotificationsProps {
  onNavigate: (view: AppView) => void;
}

const SettingsTelegramNotifications: React.FC<SettingsTelegramNotificationsProps> = ({ onNavigate }) => {
  // State
  const [token, setToken] = useState('e5om2ckocso51en3zxkhb3');
  const [botUsername] = useState('LoyaltyBusinessBot');
  
  // Preferences
  const [settings, setSettings] = useState({
    newOrders: true,
    reviews: true,
    reviewThreshold: '3', // "3 and lower"
    dailySummary: true,
    suspicious: true
  });

  // Mock Connected Accounts
  const [connectedAccounts, setConnectedAccounts] = useState([
    { id: 1, name: 'Иван Петров', username: '@ivan_petrov', type: 'user', date: '28.12.2023' },
    { id: 2, name: 'Команда продаж', username: '', type: 'group', date: '15.11.2023' }
  ]);

  // Handlers
  const regenerateToken = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setToken(result);
  };

  const copyTokenCommand = () => {
    navigator.clipboard.writeText(`/start ${token}`);
    alert('Команда скопирована в буфер обмена');
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Уведомления в Telegram</h2>
        <p className="text-gray-500 mt-1">Настройка оповещений о важных событиях в мессенджер.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Connection Panel */}
        <div className="space-y-6">
           {/* Quick Actions */}
           <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900 text-lg">Подключение</h3>
              <div className="grid grid-cols-2 gap-4">
                 <a 
                   href={`https://t.me/${botUsername}`} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="flex items-center justify-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition-colors"
                 >
                    <Send size={18} />
                    <span>Начать чат</span>
                 </a>
                 <button 
                   onClick={() => alert('Для добавления в группу, добавьте бота @' + botUsername + ' в участники группы и отправьте команду старт.')}
                   className="flex items-center justify-center space-x-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-medium transition-colors"
                 >
                    <Users size={18} />
                    <span>В группу</span>
                 </button>
              </div>
           </div>

           {/* Manual Instruction */}
           <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
              <h3 className="font-bold text-gray-900">Ручная настройка</h3>
              <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600">
                 <li>Откройте Telegram и найдите бота <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded">@{botUsername}</span></li>
                 <li>Нажмите кнопку <strong>Запустить</strong> или отправьте команду:</li>
              </ol>
              
              <div className="bg-gray-100 p-4 rounded-lg flex items-center justify-between group">
                 <code className="text-gray-800 font-mono text-sm">/start {token}</code>
                 <div className="flex space-x-2">
                    <button 
                       onClick={copyTokenCommand} 
                       className="p-1.5 bg-white rounded shadow-sm text-gray-500 hover:text-blue-600 transition-colors" 
                       title="Копировать"
                    >
                       <Copy size={16} />
                    </button>
                    <button 
                       onClick={regenerateToken} 
                       className="p-1.5 bg-white rounded shadow-sm text-gray-500 hover:text-green-600 transition-colors" 
                       title="Сгенерировать новый токен"
                    >
                       <RefreshCw size={16} />
                    </button>
                 </div>
              </div>
              <p className="text-xs text-gray-400">
                 Токен является уникальным ключом сотрудника. Не передавайте его третьим лицам.
              </p>
           </div>
        </div>

        {/* Preferences Panel */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
           <h3 className="font-bold text-gray-900 text-lg">Настройки уведомлений</h3>
           
           {/* New Orders */}
           <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                 <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                    <Bell size={20} />
                 </div>
                 <div>
                    <span className="block font-medium text-gray-900">Оповещать о новых заказах</span>
                    <span className="text-xs text-gray-500">Уведомления при создании заказа</span>
                 </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                 <input 
                    type="checkbox" 
                    checked={settings.newOrders}
                    onChange={(e) => setSettings({...settings, newOrders: e.target.checked})}
                    className="sr-only peer" 
                 />
                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
           </div>

           {/* Reviews */}
           <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center space-x-3">
                    <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                       <MessageCircle size={20} />
                    </div>
                    <div>
                       <span className="block font-medium text-gray-900">Оповещать о новых отзывах</span>
                       <span className="text-xs text-gray-500">Мгновенные уведомления об оценках</span>
                    </div>
                 </div>
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                       type="checkbox" 
                       checked={settings.reviews}
                       onChange={(e) => setSettings({...settings, reviews: e.target.checked})}
                       className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                 </label>
              </div>
              
              {settings.reviews && (
                 <div className="pl-12 animate-fade-in">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Порог оценки (включительно и ниже)</label>
                    <div className="flex gap-2">
                       {['1', '2', '3', '4', '5'].map((val) => (
                          <button
                             key={val}
                             onClick={() => setSettings({...settings, reviewThreshold: val})}
                             className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center transition-colors ${
                                settings.reviewThreshold === val 
                                   ? 'bg-yellow-50 border-yellow-200 text-yellow-700' 
                                   : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                             }`}
                          >
                             {val} <Star size={12} className="ml-1 fill-current" />
                          </button>
                       ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                       Вы будете получать уведомления только об отзывах с оценкой <strong>{settings.reviewThreshold} и ниже</strong>.
                    </p>
                 </div>
              )}
           </div>

           {/* Daily Summary */}
           <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div className="flex items-center space-x-3">
                 <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <FileText size={20} />
                 </div>
                 <div>
                    <span className="block font-medium text-gray-900">Ежедневная сводка</span>
                    <span className="text-xs text-gray-500">Отчет по показателям в 09:00</span>
                 </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                 <input 
                    type="checkbox" 
                    checked={settings.dailySummary}
                    onChange={(e) => setSettings({...settings, dailySummary: e.target.checked})}
                    className="sr-only peer" 
                 />
                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
           </div>

           {/* Suspicious Activity */}
           <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div className="flex items-center space-x-3">
                 <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                    <AlertTriangle size={20} />
                 </div>
                 <div>
                    <span className="block font-medium text-gray-900">Подозрительные действия</span>
                    <span className="text-xs text-gray-500">Аномалии и фрод-мониторинг</span>
                 </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                 <input 
                    type="checkbox" 
                    checked={settings.suspicious}
                    onChange={(e) => setSettings({...settings, suspicious: e.target.checked})}
                    className="sr-only peer" 
                 />
                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
           </div>
           
           <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500 flex items-start space-x-2">
              <ExternalLink size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                 Настроить параметры определения подозрительной активности можно в разделе 
                 <button onClick={() => onNavigate('fraud_protection')} className="text-blue-600 hover:underline ml-1">
                    Защита от мошенничества
                 </button>.
              </span>
           </div>

        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Подключенные пользователи</h3>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Имя / Название</th>
                     <th className="px-6 py-4 font-semibold">Логин Telegram</th>
                     <th className="px-6 py-4 font-semibold">Тип</th>
                     <th className="px-6 py-4 font-semibold text-right">Подключен</th>
                     <th className="px-6 py-4 font-semibold text-right">Статус</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {connectedAccounts.map((account) => (
                     <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{account.name}</td>
                        <td className="px-6 py-4 text-blue-600">{account.username || '—'}</td>
                        <td className="px-6 py-4">
                           {account.type === 'user' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                 <User size={12} className="mr-1" /> Личный
                              </span>
                           ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                 <Users size={12} className="mr-1" /> Группа
                              </span>
                           )}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-500">{account.date}</td>
                        <td className="px-6 py-4 text-right">
                           <span className="inline-flex items-center text-xs font-medium text-green-600">
                              <Check size={14} className="mr-1" /> Активен
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

    </div>
  );
};

export default SettingsTelegramNotifications;