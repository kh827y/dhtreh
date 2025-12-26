import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Lock, Bell, Info, Save } from 'lucide-react';

const FraudProtection: React.FC = () => {
  // Notification Thresholds
  const [dailyFrequency, setDailyFrequency] = useState(3);
  const [monthlyFrequency, setMonthlyFrequency] = useState(15);
  const [maxPoints, setMaxPoints] = useState(5000);

  // Blocking Rules
  const [blockOnDailyLimit, setBlockOnDailyLimit] = useState(false);

  const handleSave = () => {
    // In a real app, this would save to backend
    alert('Настройки безопасности обновлены');
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Защита от мошенничества</h2>
           <p className="text-gray-500 mt-1">Настройка порогов уведомлений и автоматических блокировок подозрительных операций.</p>
        </div>
        
        <button 
           onClick={handleSave}
           className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
           <Save size={18} />
           <span>Сохранить</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Notification Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
           <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
              <Bell className="text-amber-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900">Пороги уведомлений</h3>
           </div>
           
           <div className="space-y-6">
              <div className="bg-amber-50 p-3 rounded-lg flex items-start space-x-2 text-sm text-amber-800">
                 <Info size={16} className="mt-0.5 flex-shrink-0" />
                 <p>События, превышающие эти лимиты, отправят уведомление администратору, но <strong>не будут заблокированы</strong> автоматически (кроме дневного лимита при включенной блокировке).</p>
              </div>

              {/* Daily Frequency */}
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Частота начислений за день</label>
                 <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">Более</span>
                    <input 
                       type="number" 
                       min="1"
                       value={dailyFrequency}
                       onChange={(e) => setDailyFrequency(Number(e.target.value))}
                       className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <span className="text-sm text-gray-500">раз одному клиенту</span>
                 </div>
              </div>

              {/* Monthly Frequency */}
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Частота начислений за месяц</label>
                 <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">Более</span>
                    <input 
                       type="number" 
                       min="1"
                       value={monthlyFrequency}
                       onChange={(e) => setMonthlyFrequency(Number(e.target.value))}
                       className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                    <span className="text-sm text-gray-500">раз одному клиенту</span>
                 </div>
              </div>

              {/* Max Points Amount */}
              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">Максимальное разовое начисление</label>
                 <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">Более</span>
                    <div className="relative">
                       <input 
                          type="number" 
                          min="1"
                          step="100"
                          value={maxPoints}
                          onChange={(e) => setMaxPoints(Number(e.target.value))}
                          className="w-32 border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 text-center font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
                       />
                       <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">pts</span>
                    </div>
                    <span className="text-sm text-gray-500">за одну операцию</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Blocking Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
           <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
              <Lock className="text-red-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900">Активная защита</h3>
           </div>

           <div className="space-y-6">
              <div className="flex items-start justify-between">
                 <div className="mr-4">
                    <h4 className="font-medium text-gray-900">Блокировка дневного лимита</h4>
                    <p className="text-sm text-gray-500 mt-1">
                       Если клиент превысит установленный порог ({dailyFrequency} начислений в день), 
                       последующие операции начисления будут автоматически заблокированы до конца суток.
                    </p>
                 </div>
                 <button 
                    onClick={() => setBlockOnDailyLimit(!blockOnDailyLimit)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${blockOnDailyLimit ? 'bg-red-500' : 'bg-gray-300'}`}
                 >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blockOnDailyLimit ? 'translate-x-6' : 'translate-x-1'}`} />
                 </button>
              </div>

              {blockOnDailyLimit && (
                 <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex items-start space-x-3 animate-fade-in">
                    <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                    <div className="text-sm text-red-800">
                       <p className="font-bold mb-1">Режим строгой блокировки включен</p>
                       <p>Кассир увидит ошибку "Превышен лимит операций" при попытке начислить баллы сверх нормы.</p>
                    </div>
                 </div>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default FraudProtection;