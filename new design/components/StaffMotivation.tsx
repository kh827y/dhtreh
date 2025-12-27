import React, { useState } from 'react';
import { Award, UserPlus, User, Clock, Save, Power, Layout } from 'lucide-react';

const StaffMotivation: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  
  // Settings State
  const [newClientPoints, setNewClientPoints] = useState(10);
  const [existingClientPoints, setExistingClientPoints] = useState(1);
  const [ratingPeriod, setRatingPeriod] = useState('month');
  const [customDays, setCustomDays] = useState(30);

  const handleSave = () => {
    alert('Настройки мотивации персонала сохранены!');
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Мотивация персонала</h2>
           <p className="text-gray-500 mt-1">Настройка вознаграждений и рейтингов для сотрудников.</p>
        </div>
        
        <button 
           onClick={handleSave}
           className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Save size={18} />
           <span>Сохранить</span>
        </button>
      </div>

      {/* Main Toggle */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${isEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
               <Power size={24} />
            </div>
            <div>
               <h3 className="text-lg font-bold text-gray-900">Программа мотивации</h3>
               <p className="text-sm text-gray-500">
                  {isEnabled ? 'Активна. Сотрудники получают очки за действия.' : 'Выключена. Очки не начисляются.'}
               </p>
            </div>
         </div>
         <button 
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
         >
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
         </button>
      </div>

      <div className={`space-y-8 transition-opacity duration-300 ${isEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
         
         {/* Points Settings */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
               <Award className="text-purple-600" size={20} />
               <h3 className="text-lg font-bold text-gray-900">Настройки начисления очков</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* New Client */}
               <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                  <div className="flex items-center space-x-3 mb-4">
                     <div className="bg-white p-2 rounded-lg text-blue-600 shadow-sm">
                        <UserPlus size={20} />
                     </div>
                     <span className="font-semibold text-gray-900">За нового клиента</span>
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm text-gray-600">Количество очков</label>
                     <div className="relative">
                        <input 
                           type="number" 
                           min="0"
                           value={newClientPoints}
                           onChange={(e) => setNewClientPoints(Number(e.target.value))}
                           className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">pts</span>
                     </div>
                     <p className="text-xs text-gray-500">Начисляется, когда клиент совершает первую покупку с программой лояльности.</p>
                  </div>
               </div>

               {/* Existing Client */}
               <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                  <div className="flex items-center space-x-3 mb-4">
                     <div className="bg-white p-2 rounded-lg text-purple-600 shadow-sm">
                        <User size={20} />
                     </div>
                     <span className="font-semibold text-gray-900">За существующего клиента</span>
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm text-gray-600">Количество очков</label>
                     <div className="relative">
                        <input 
                           type="number" 
                           min="0"
                           value={existingClientPoints}
                           onChange={(e) => setExistingClientPoints(Number(e.target.value))}
                           className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">pts</span>
                     </div>
                     <p className="text-xs text-gray-500">Начисляется, если у клиента уже были покупки по программе лояльности.</p>
                  </div>
               </div>
            </div>
         </div>

         {/* Display Settings */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
               <Layout className="text-purple-600" size={20} />
               <h3 className="text-lg font-bold text-gray-900">Рейтинг в панели кассира</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <div>
                     <label className="block font-medium text-gray-900 mb-2">Период отображения</label>
                     <p className="text-sm text-gray-500 mb-3">За какой период отображать начисленные очки сотруднику в его интерфейсе.</p>
                     
                     <div className="space-y-2">
                        {[
                           { id: 'week', label: 'Неделя (текущая)' },
                           { id: 'month', label: 'Месяц (текущий)' },
                           { id: 'quarter', label: 'Квартал' },
                           { id: 'year', label: 'Год' },
                           { id: 'custom', label: 'Произвольный период (дней)' },
                        ].map((option) => (
                           <label key={option.id} className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg border hover:bg-gray-50 transition-colors border-gray-200 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                              <input 
                                 type="radio" 
                                 name="period"
                                 value={option.id}
                                 checked={ratingPeriod === option.id}
                                 onChange={(e) => setRatingPeriod(e.target.value)}
                                 className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                              />
                              <span className="text-sm font-medium text-gray-700">{option.label}</span>
                           </label>
                        ))}
                     </div>
                  </div>

                  {ratingPeriod === 'custom' && (
                     <div className="ml-7 animate-fade-in">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Количество дней</label>
                        <div className="relative w-32">
                           <input 
                              type="number"
                              min="1"
                              value={customDays}
                              onChange={(e) => setCustomDays(Number(e.target.value))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none pr-8"
                           />
                           <Clock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                     </div>
                  )}
               </div>

               <div className="bg-gray-50 rounded-xl p-6 flex flex-col justify-center items-center text-center border border-gray-200 border-dashed">
                  <div className="bg-white p-4 rounded-lg shadow-sm w-64 mb-3">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500 uppercase font-bold">Ваш рейтинг</span>
                        <Award size={16} className="text-amber-500" />
                     </div>
                     <div className="text-3xl font-bold text-purple-600 mb-1">
                        1,250
                     </div>
                     <div className="text-xs text-gray-400">
                        очков за {ratingPeriod === 'custom' ? `${customDays} дн.` : 
                                  ratingPeriod === 'week' ? 'эту неделю' : 
                                  ratingPeriod === 'month' ? 'этот месяц' : 
                                  ratingPeriod === 'quarter' ? 'этот квартал' : 'этот год'}
                     </div>
                  </div>
                  <p className="text-sm text-gray-500">Пример отображения в панели кассира</p>
               </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default StaffMotivation;