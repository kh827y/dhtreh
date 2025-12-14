import React, { useState } from 'react';
import { Globe, Building2, Clock, Save } from 'lucide-react';

const SettingsSystem: React.FC = () => {
  const [companyName, setCompanyName] = useState('Моя Компания');
  const [timezone, setTimezone] = useState('Europe/Moscow');

  const timezones = [
    { value: 'Europe/Kaliningrad', label: '(MSK-1) Калининград' },
    { value: 'Europe/Moscow', label: '(MSK) Москва, Санкт-Петербург' },
    { value: 'Europe/Samara', label: '(MSK+1) Самара' },
    { value: 'Asia/Yekaterinburg', label: '(MSK+2) Екатеринбург' },
    { value: 'Asia/Omsk', label: '(MSK+3) Омск' },
    { value: 'Asia/Krasnoyarsk', label: '(MSK+4) Красноярск' },
    { value: 'Asia/Irkutsk', label: '(MSK+5) Иркутск' },
    { value: 'Asia/Yakutsk', label: '(MSK+6) Якутск' },
    { value: 'Asia/Vladivostok', label: '(MSK+7) Владивосток' },
    { value: 'Asia/Magadan', label: '(MSK+8) Магадан' },
    { value: 'Asia/Kamchatka', label: '(MSK+9) Камчатка' },
  ];

  const handleSave = () => {
    alert('Системные настройки сохранены!');
  };

  return (
    <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Системные настройки</h2>
           <p className="text-gray-500 mt-1">Базовые параметры вашего проекта.</p>
        </div>
        
        <button 
           onClick={handleSave}
           className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Save size={18} />
           <span>Сохранить</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg">
               <Globe size={20} className="text-purple-600" />
               <h3>Общие параметры</h3>
            </div>
         </div>
         
         <div className="p-6 space-y-6">
            
            {/* Company Name */}
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">Название компании</label>
               <div className="relative">
                  <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                     type="text" 
                     value={companyName}
                     onChange={(e) => setCompanyName(e.target.value)}
                     className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                     placeholder="Введите название"
                  />
               </div>
               <p className="text-xs text-gray-500 mt-2">
                  Это название будет отображаться в заголовках писем, push-уведомлений и в панели клиента.
               </p>
            </div>

            {/* Timezone */}
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">Часовой пояс</label>
               <div className="relative">
                  <Clock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select 
                     value={timezone}
                     onChange={(e) => setTimezone(e.target.value)}
                     className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 bg-white appearance-none focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                  >
                     {timezones.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                           {tz.label}
                        </option>
                     ))}
                  </select>
               </div>
               <p className="text-xs text-gray-500 mt-2">
                  Используется для корректного отображения времени транзакций и планирования рассылок.
               </p>
            </div>

         </div>
      </div>

    </div>
  );
};

export default SettingsSystem;