import React from 'react';
import { 
  Settings, 
  Trophy, 
  Ban, 
  Store, 
  Users, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
import { AppView } from '../types';

interface MasterSettingsProps {
  onNavigate: (view: AppView) => void;
}

const MasterSettings: React.FC<MasterSettingsProps> = ({ onNavigate }) => {
  // Mock progress calculation
  const totalSteps = 4;
  const completedSteps = 2; // Levels and Outlets marked as done in UI
  const progress = (completedSteps / totalSteps) * 100;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Основные настройки</h2>
        <p className="text-gray-500 mt-1">Первичная конфигурация системы лояльности. Выполните эти шаги для запуска.</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-2">
           <span className="text-sm font-bold text-gray-900">Прогресс настройки</span>
           <span className="text-sm font-medium text-purple-600">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
           <div 
              className="bg-purple-600 h-3 rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${progress}%` }}
           ></div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
           Выполнено {completedSteps} из {totalSteps} шагов для базового запуска.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Step 1: Levels */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
           <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                 <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">
                    <Trophy size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900 text-lg">Уровни клиентов</h3>
                    <p className="text-sm text-gray-500 leading-snug mt-1">Создание статусов клиентов для разделения правил начисления и списания бонусов.</p>
                 </div>
              </div>
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
           </div>
           
           <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
                 <span className="text-gray-600">Текущая конфигурация:</span>
                 <span className="font-medium text-gray-900">Silver, Gold, Platinum</span>
              </div>
           </div>

           <button 
             onClick={() => onNavigate('loyalty_levels')}
             className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
           >
              <span>Настроить уровни</span>
              <ChevronRight size={16} />
           </button>
        </div>

        {/* Step 2: Limitations (Renamed to Bonus Settings) */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
           <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                 <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                    <Ban size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900 text-lg">Настройки бонусов</h3>
                    <p className="text-sm text-gray-500 leading-snug mt-1">Настройка времени жизни бонусов, отложенных начислений и правил начисления при списании.</p>
                 </div>
              </div>
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
           </div>
           
           <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
                 <span className="text-gray-600">Срок жизни баллов:</span>
                 <span className="font-medium text-gray-900">Не ограничен</span>
              </div>
           </div>

           <button 
             onClick={() => onNavigate('loyalty_limitations')}
             className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
           >
              <span>Настроить бонусы</span>
              <ChevronRight size={16} />
           </button>
        </div>

        {/* Step 3: Outlets */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
           <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                 <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                    <Store size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900 text-lg">Торговые точки</h3>
                    <p className="text-sm text-gray-500 leading-snug mt-1">Добавление филиалов и кассовых устройств.</p>
                 </div>
              </div>
              {/* Conditional Icon based on count */}
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
           </div>
           
           <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
                 <span className="text-gray-600">Активных точек:</span>
                 <span className="font-medium text-gray-900">2</span>
              </div>
           </div>

           <button 
             onClick={() => onNavigate('outlets')}
             className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
           >
              <span>Управление точками</span>
              <ChevronRight size={16} />
           </button>
        </div>

        {/* Step 4: Staff */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
           <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                 <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                    <Users size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900 text-lg">Сотрудники</h3>
                    <p className="text-sm text-gray-500 leading-snug mt-1">Персонал и доступ к панели кассира.</p>
                 </div>
              </div>
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
           </div>
           
           <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
                 <span className="text-gray-600">Всего сотрудников:</span>
                 <span className="font-medium text-gray-900">5</span>
              </div>
           </div>

           <button 
             onClick={() => onNavigate('settings_staff')}
             className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
           >
              <span>Управление персоналом</span>
              <ChevronRight size={16} />
           </button>
        </div>

      </div>
    </div>
  );
};

export default MasterSettings;