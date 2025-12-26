import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Power, 
  MessageSquare, 
  Gift, 
  RotateCw, 
  BarChart3, 
  Settings,
  Clock,
  Zap,
  Bell,
  Check,
  AlertCircle
} from 'lucide-react';
import { AppView } from '../types';

interface AutoReturnProps {
  initialTab?: 'main' | 'stats';
  onNavigate: (view: AppView) => void;
}

const AutoReturn: React.FC<AutoReturnProps> = ({ initialTab = 'main', onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'main' | 'stats'>(initialTab);
  
  // Settings State
  const [settings, setSettings] = useState({
    isEnabled: true,
    returnDays: 30, // Days absent
    
    // Push (Always enabled)
    pushText: 'Мы скучаем! Возвращайтесь и получите бонусные баллы.',
    
    // Gift
    giftEnabled: false,
    giftAmount: 100,
    
    // Burning
    burningEnabled: false,
    burningDays: 7,
    
    // Retry
    retryEnabled: false,
    retryDays: 14
  });

  const handleSave = () => {
    alert('Настройки автовозврата сохранены!');
  };

  const renderMainTab = () => (
    <div className="space-y-6">
       
       {/* Hero Status Card */}
       <div className={`rounded-xl border transition-colors ${settings.isEnabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <div className="p-6 flex items-center justify-between">
             <div className="flex items-center space-x-4">
                <div className={`p-3 rounded-lg ${settings.isEnabled ? 'bg-white text-green-600 shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                   <Power size={20} strokeWidth={2.5} />
                </div>
                <div>
                   <h3 className={`font-bold text-base ${settings.isEnabled ? 'text-green-900' : 'text-gray-700'}`}>
                      {settings.isEnabled ? 'Автовозврат активен' : 'Сценарий отключен'}
                   </h3>
                   <p className={`text-sm ${settings.isEnabled ? 'text-green-700' : 'text-gray-500'}`}>
                      {settings.isEnabled 
                         ? 'Система автоматически отправляет уведомления ушедшим клиентам.' 
                         : 'Включите, чтобы начать автоматический возврат клиентов.'}
                   </p>
                </div>
             </div>
             
             {/* Standard Toggle Switch */}
             <button 
                onClick={() => setSettings({...settings, isEnabled: !settings.isEnabled})}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.isEnabled ? 'bg-green-600' : 'bg-gray-200'}`}
             >
                <span className="sr-only">Use setting</span>
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
             
             {/* Trigger Card */}
             <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                   <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
                      <Clock size={18} />
                   </div>
                   <h3 className="text-base font-bold text-gray-900">Условие срабатывания</h3>
                </div>
                
                <div className="flex items-center">
                   <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Период отсутствия</label>
                      <div className="flex items-center space-x-3">
                         <div className="relative w-24">
                            <input 
                               type="number" 
                               min="1"
                               value={settings.returnDays}
                               onChange={(e) => setSettings({...settings, returnDays: Number(e.target.value)})}
                               className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-lg px-3 py-2 text-center text-lg font-bold text-gray-900 transition-all outline-none"
                            />
                         </div>
                         <span className="text-sm text-gray-600 font-medium">дней без покупок</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                         Мы отправим уведомление, если клиент ничего не купит в течение этого времени.
                      </p>
                   </div>
                </div>
             </div>

             {/* Message Card */}
             <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                   <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                      <MessageSquare size={18} />
                   </div>
                   <h3 className="text-base font-bold text-gray-900">Сообщение</h3>
                </div>

                <div className="space-y-5">
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Текст Push-уведомления</label>
                      <textarea 
                         rows={3}
                         maxLength={150}
                         value={settings.pushText}
                         onChange={(e) => setSettings({...settings, pushText: e.target.value})}
                         className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                         placeholder="Введите привлекательный текст..."
                      />
                      <div className="flex justify-between items-center mt-2">
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-medium">Вставить:</span>
                            <button onClick={() => setSettings({...settings, pushText: settings.pushText + ' %username%'})} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors">Имя клиента</button>
                            <button onClick={() => setSettings({...settings, pushText: settings.pushText + ' %bonus%'})} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors">Размер бонуса</button>
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
                         <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
                            <Zap size={16} fill="currentColor" />
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

          {/* RIGHT COLUMN: Incentives & Retry (5/12) */}
          <div className="xl:col-span-5 space-y-6">
             
             {/* Incentives Card */}
             <div className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.giftEnabled ? 'border-pink-200 ring-1 ring-pink-100' : 'border-gray-100'}`}>
                <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                   <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-md transition-colors ${settings.giftEnabled ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-400'}`}>
                         <Gift size={16} />
                      </div>
                      <h3 className={`font-bold text-sm ${settings.giftEnabled ? 'text-gray-900' : 'text-gray-500'}`}>Подарочный бонус</h3>
                   </div>
                   
                   <button 
                      onClick={() => setSettings({...settings, giftEnabled: !settings.giftEnabled})}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.giftEnabled ? 'bg-pink-500' : 'bg-gray-200'}`}
                   >
                      <span className="sr-only">Toggle Gift</span>
                      <span
                         aria-hidden="true"
                         className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.giftEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                   </button>
                </div>

                <div className={`p-5 space-y-5 ${settings.giftEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                   <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Начислить баллы</label>
                      <div className="relative">
                         <input 
                            type="number" 
                            min="0"
                            value={settings.giftAmount}
                            onChange={(e) => setSettings({...settings, giftAmount: Number(e.target.value)})}
                            className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 rounded-lg px-3 py-2 font-bold text-gray-900 transition-all outline-none"
                         />
                         <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">pts</span>
                      </div>
                   </div>

                   <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-100">
                      <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-semibold text-orange-900">Сгорание бонуса</span>
                         
                         <button 
                            onClick={() => setSettings({...settings, burningEnabled: !settings.burningEnabled})}
                            className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.burningEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                         >
                            <span
                               aria-hidden="true"
                               className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.burningEnabled ? 'translate-x-3' : 'translate-x-0'}`}
                            />
                         </button>
                      </div>
                      
                      {settings.burningEnabled && (
                         <div className="flex items-center space-x-2 animate-fade-in">
                            <div className="relative w-20">
                               <input 
                                  type="number" 
                                  min="1"
                                  value={settings.burningDays}
                                  onChange={(e) => setSettings({...settings, burningDays: Number(e.target.value)})}
                                  className="w-full bg-white border border-orange-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-md px-2 py-1 text-center font-semibold text-gray-900 text-sm outline-none"
                               />
                            </div>
                            <span className="text-xs text-orange-800">дней</span>
                         </div>
                      )}
                   </div>
                </div>
             </div>

             {/* Retry Card */}
             <div className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.retryEnabled ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-gray-100'}`}>
                <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                   <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-md transition-colors ${settings.retryEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                         <RotateCw size={16} />
                      </div>
                      <h3 className={`font-bold text-sm ${settings.retryEnabled ? 'text-gray-900' : 'text-gray-500'}`}>Повторная отправка</h3>
                   </div>
                   
                   <button 
                      onClick={() => setSettings({...settings, retryEnabled: !settings.retryEnabled})}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.retryEnabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
                   >
                      <span className="sr-only">Toggle Retry</span>
                      <span
                         aria-hidden="true"
                         className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.retryEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                   </button>
                </div>

                <div className={`p-5 ${settings.retryEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                   <p className="text-xs text-gray-600 mb-3">
                      Если клиент не вернулся после первого сообщения, отправить повторное.
                   </p>
                   <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-700">Через</span>
                      <div className="relative w-20">
                         <input 
                            type="number" 
                            min="1"
                            value={settings.retryDays}
                            onChange={(e) => setSettings({...settings, retryDays: Number(e.target.value)})}
                            className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg px-2 py-1.5 text-center font-bold text-gray-900 text-sm transition-all outline-none"
                         />
                      </div>
                      <span className="text-sm font-medium text-gray-700">дней</span>
                   </div>
                </div>
             </div>

          </div>

       </div>
    </div>
  );

  const renderStatsTab = () => (
    <div className="flex flex-col items-center justify-center h-96 text-gray-400 bg-white rounded-2xl border border-gray-200 border-dashed">
       <div className="bg-gray-50 p-4 rounded-full mb-4">
          <BarChart3 size={32} />
       </div>
       <h3 className="text-lg font-bold text-gray-900 mb-1">Статистика собирается</h3>
       <p className="text-sm text-center max-w-md text-gray-500 px-4">
          После запуска сценария здесь появятся данные о возвращаемости, конверсии пушей и ROI.
       </p>
    </div>
  );

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
               <h2 className="text-2xl font-bold text-gray-900 leading-tight">Автовозврат</h2>
               <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span className="font-medium">Механики</span>
                  <span>/</span>
                  <span>Возврат клиентов</span>
               </div>
            </div>
         </div>
         
         {activeTab === 'main' && (
            <button 
               onClick={handleSave}
               className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm hover:shadow-md text-sm"
            >
               <Save size={16} />
               <span>Сохранить</span>
            </button>
         )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
         <nav className="-mb-px flex space-x-8">
            <button
               onClick={() => setActiveTab('main')}
               className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${activeTab === 'main' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
               <Settings size={16} className="mr-2" />
               Настройки
            </button>
            <button
               onClick={() => setActiveTab('stats')}
               className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${activeTab === 'stats' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
               <BarChart3 size={16} className="mr-2" />
               Аналитика
            </button>
         </nav>
      </div>

      {/* Content */}
      <div className="animate-fade-in pb-10">
         {activeTab === 'main' ? renderMainTab() : renderStatsTab()}
      </div>

    </div>
  );
};

export default AutoReturn;