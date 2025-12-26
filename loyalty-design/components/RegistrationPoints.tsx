import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Save, 
  UserPlus, 
  MessageSquare, 
  Gift, 
  Clock, 
  Calendar,
  ShieldAlert,
  Coins
} from 'lucide-react';
import { AppView } from '../types';

interface RegistrationPointsProps {
  initialTab?: 'main' | 'stats';
  onNavigate: (view: AppView) => void;
}

const RegistrationPoints: React.FC<RegistrationPointsProps> = ({ onNavigate }) => {
  // Settings State
  const [settings, setSettings] = useState({
    isEnabled: true,
    pointsAmount: 500,
    
    // Burning
    burningEnabled: true,
    burningDays: 30,

    // Delay
    delayEnabled: false,
    delayHours: 1,

    // Push
    pushEnabled: true,
    pushText: 'Добро пожаловать в клуб! Вам начислено %bonus% приветственных баллов.',
  });

  const handleSave = () => {
    alert('Настройки регистрации сохранены!');
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <button 
               onClick={() => onNavigate('loyalty_mechanics')} 
               className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 text-gray-600 transition-all"
            >
               <ArrowLeft size={20} />
            </button>
            <div>
               <h2 className="text-2xl font-bold text-gray-900 leading-tight">Баллы за регистрацию</h2>
               <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span className="font-medium">Механики</span>
                  <span>/</span>
                  <span>Приветственный бонус</span>
               </div>
            </div>
         </div>
         
         <button 
            onClick={handleSave}
            className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm hover:shadow-md text-sm"
         >
            <Save size={16} />
            <span>Сохранить</span>
         </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
       
         {/* Hero Status Card */}
         <div className={`rounded-xl border transition-colors ${settings.isEnabled ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200'}`}>
            <div className="p-6 flex items-center justify-between">
               <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg ${settings.isEnabled ? 'bg-white text-teal-600 shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                     <UserPlus size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                     <h3 className={`font-bold text-base ${settings.isEnabled ? 'text-teal-900' : 'text-gray-700'}`}>
                        {settings.isEnabled ? 'Бонус за регистрацию активен' : 'Сценарий отключен'}
                     </h3>
                     <p className={`text-sm ${settings.isEnabled ? 'text-teal-800' : 'text-gray-500'}`}>
                        {settings.isEnabled 
                           ? 'Новые клиенты автоматически получают приветственные баллы при регистрации.' 
                           : 'Включите, чтобы мотивировать новых клиентов на первую покупку.'}
                     </p>
                  </div>
               </div>
               
               {/* Standard Toggle Switch */}
               <button 
                  onClick={() => setSettings({...settings, isEnabled: !settings.isEnabled})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.isEnabled ? 'bg-teal-500' : 'bg-gray-200'}`}
               >
                  <span className="sr-only">Toggle Registration Points</span>
                  <span 
                     aria-hidden="true"
                     className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.isEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
               </button>
            </div>
         </div>

         <div className={`grid grid-cols-1 xl:grid-cols-12 gap-6 transition-opacity duration-200 ${settings.isEnabled ? 'opacity-100' : 'opacity-60 pointer-events-none'}`}>
            
            {/* LEFT COLUMN: Logic & Message (7/12) */}
            <div className="xl:col-span-7 space-y-6">
               
               {/* Reward Card */}
               <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex items-center space-x-3 mb-6">
                     <div className="bg-yellow-50 p-2 rounded-lg text-yellow-600">
                        <Coins size={18} />
                     </div>
                     <h3 className="text-base font-bold text-gray-900">Начисление</h3>
                  </div>
                  
                  <div>
                     <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Количество баллов</label>
                     <div className="flex items-center space-x-3">
                        <div className="relative w-32">
                           <input 
                              type="number" 
                              min="0"
                              value={settings.pointsAmount}
                              onChange={(e) => setSettings({...settings, pointsAmount: Number(e.target.value)})}
                              className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 rounded-lg px-3 py-2 text-center text-lg font-bold text-gray-900 transition-all outline-none"
                           />
                        </div>
                        <span className="text-sm text-gray-600 font-medium">приветственных бонусов</span>
                     </div>
                     <p className="text-xs text-gray-400 mt-2">
                        Начисляются единоразово сразу после успешной регистрации в системе.
                     </p>
                  </div>
               </div>

               {/* Message Card */}
               <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                     <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                           <MessageSquare size={18} />
                        </div>
                        <h3 className="text-base font-bold text-gray-900">Уведомление</h3>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                           type="checkbox" 
                           checked={settings.pushEnabled}
                           onChange={(e) => setSettings({...settings, pushEnabled: e.target.checked})}
                           className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                     </label>
                  </div>

                  <div className={`space-y-5 ${settings.pushEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                     <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Текст Push-уведомления</label>
                        <textarea 
                           rows={3}
                           maxLength={150}
                           value={settings.pushText}
                           onChange={(e) => setSettings({...settings, pushText: e.target.value})}
                           className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                           placeholder="Текст приветствия..."
                        />
                        <div className="flex justify-between items-center mt-2">
                           <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 font-medium">Вставить:</span>
                              <button onClick={() => setSettings({...settings, pushText: settings.pushText + ' %username%'})} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors">Имя клиента</button>
                              <button onClick={() => setSettings({...settings, pushText: settings.pushText + ' %bonus%'})} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors">Сумма бонуса</button>
                           </div>
                           <span className={`text-xs ${settings.pushText.length > 140 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                              {settings.pushText.length}/150
                           </span>
                        </div>
                     </div>

                     {/* Phone Preview */}
                     <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Предпросмотр</div>
                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-sm mx-auto flex items-start gap-3">
                           <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-lg flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
                              <Gift size={16} fill="currentColor" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-baseline mb-0.5">
                                 <span className="font-bold text-gray-900 text-xs">Loyalty App</span>
                                 <span className="text-[9px] text-gray-400">Только что</span>
                              </div>
                              <p className="text-xs text-gray-600 leading-snug break-words">
                                 {settings.pushText || 'Текст уведомления...'}
                              </p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

            </div>

            {/* RIGHT COLUMN: Options (5/12) */}
            <div className="xl:col-span-5 space-y-6">
               
               {/* Expiration Settings */}
               <div className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.burningEnabled ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'}`}>
                  <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                     <div className="flex items-center space-x-2">
                        <div className={`p-1.5 rounded-md transition-colors ${settings.burningEnabled ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                           <Calendar size={16} />
                        </div>
                        <h3 className={`font-bold text-sm ${settings.burningEnabled ? 'text-gray-900' : 'text-gray-500'}`}>Срок действия</h3>
                     </div>
                     
                     <button 
                        onClick={() => setSettings({...settings, burningEnabled: !settings.burningEnabled})}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.burningEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                     >
                        <span className="sr-only">Toggle Burning</span>
                        <span
                           aria-hidden="true"
                           className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.burningEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                     </button>
                  </div>

                  <div className={`p-5 ${settings.burningEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                     <p className="text-xs text-gray-600 mb-3">
                        Сгорают ли приветственные баллы, если клиент их не использует?
                     </p>
                     <div className="flex items-center space-x-3">
                        <div className="relative w-24">
                           <input 
                              type="number" 
                              min="1"
                              value={settings.burningDays}
                              onChange={(e) => setSettings({...settings, burningDays: Number(e.target.value)})}
                              className="w-full bg-white border border-orange-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-md px-2 py-1.5 text-center font-bold text-gray-900 text-sm outline-none"
                           />
                        </div>
                        <span className="text-sm font-medium text-gray-700">дней</span>
                     </div>
                  </div>
               </div>

               {/* Delay Settings */}
               <div className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.delayEnabled ? 'border-purple-200 ring-1 ring-purple-100' : 'border-gray-100'}`}>
                  <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                     <div className="flex items-center space-x-2">
                        <div className={`p-1.5 rounded-md transition-colors ${settings.delayEnabled ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                           <Clock size={16} />
                        </div>
                        <h3 className={`font-bold text-sm ${settings.delayEnabled ? 'text-gray-900' : 'text-gray-500'}`}>Отложенное начисление</h3>
                     </div>
                     
                     <button 
                        onClick={() => setSettings({...settings, delayEnabled: !settings.delayEnabled})}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.delayEnabled ? 'bg-purple-500' : 'bg-gray-200'}`}
                     >
                        <span className="sr-only">Toggle Delay</span>
                        <span
                           aria-hidden="true"
                           className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.delayEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                     </button>
                  </div>

                  <div className={`p-5 ${settings.delayEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                     <p className="text-xs text-gray-600 mb-3">
                        Начислить баллы не сразу, а через некоторое время после регистрации.
                     </p>
                     <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-700">Через</span>
                        <div className="relative w-24">
                           <input 
                              type="number" 
                              min="1"
                              value={settings.delayHours}
                              onChange={(e) => setSettings({...settings, delayHours: Number(e.target.value)})}
                              className="w-full bg-white border border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-md px-2 py-1.5 text-center font-bold text-gray-900 text-sm outline-none"
                           />
                        </div>
                        <span className="text-sm font-medium text-gray-700">часов</span>
                     </div>
                  </div>
               </div>

               {/* Info Tip */}
               <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3">
                  <div className="text-blue-500 mt-0.5">
                     <ShieldAlert size={16} />
                  </div>
                  <div className="text-xs text-blue-900/80 leading-relaxed">
                     <span className="font-bold text-blue-900 block mb-1">Защита от фрода</span>
                     Включение задержки начисления помогает бороться с массовыми регистрациями ботов.
                  </div>
               </div>

            </div>

         </div>
      </div>

    </div>
  );
};

export default RegistrationPoints;