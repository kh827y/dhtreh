import React, { useState, useMemo } from 'react';
import { 
  Link2, 
  Code, 
  Send, 
  Settings, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { AppView } from '../types';

interface SettingsIntegrationsProps {
  onNavigate: (view: AppView) => void;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  connected: boolean;
  color: string; // for icon background
  docsUrl?: string;
  targetView?: AppView;
}

const SettingsIntegrations: React.FC<SettingsIntegrationsProps> = ({ onNavigate }) => {
  // State for integrations
  const [integrations] = useState<Integration[]>([
    {
      id: 'rest_api',
      name: 'REST API',
      description: 'API для работы с баллами, заказами, клиентами и товарами.',
      icon: Code,
      connected: true,
      color: 'bg-blue-50 text-blue-600',
      docsUrl: '#',
      targetView: 'integration_rest_api'
    },
    {
      id: 'telegram_miniapp',
      name: 'Telegram Miniapp',
      description: 'Приложение программы лояльности в Telegram.',
      icon: Send,
      connected: false,
      color: 'bg-sky-50 text-sky-500',
      docsUrl: '#',
      targetView: 'integration_telegram_miniapp'
    }
  ]);

  // Sort: Connected first
  const sortedIntegrations = useMemo(() => {
    return [...integrations].sort((a, b) => {
      if (a.connected === b.connected) return 0;
      return a.connected ? -1 : 1;
    });
  }, [integrations]);

  const handleNavigate = (item: Integration) => {
    if (item.targetView) {
      onNavigate(item.targetView);
    } else {
      alert(`Переход к странице интеграции: ${item.id}`);
    }
  };

  const openDocs = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    // window.open(url, '_blank');
    alert(`Открытие документации: ${url}`);
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Интеграции</h2>
        <p className="text-gray-500 mt-1">Подключение внешних сервисов и настройка обмена данными.</p>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sortedIntegrations.map((item) => (
          <div 
            key={item.id} 
            onClick={() => handleNavigate(item)}
            className={`bg-white p-6 rounded-xl border transition-all duration-200 flex flex-col h-full hover:shadow-md cursor-pointer group ${
              item.connected ? 'border-purple-200 shadow-sm ring-1 ring-purple-50' : 'border-gray-200 shadow-sm'
            }`}
          >
            {/* Card Header */}
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${item.color} transition-transform group-hover:scale-105 duration-200`}>
                <item.icon size={28} />
              </div>
              
              <div className="flex items-center space-x-2">
                 <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center ${
                    item.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                 }`}>
                    {item.connected ? (
                       <>
                          <CheckCircle2 size={12} className="mr-1.5" />
                          Подключено
                       </>
                    ) : (
                       'Отключено'
                    )}
                 </span>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 mb-6">
               <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">{item.name}</h3>
               <p className="text-sm text-gray-500 leading-relaxed">
                  {item.description}
               </p>
            </div>

            {/* Footer / Actions */}
            <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
               <div className={`text-sm font-medium flex items-center transition-colors ${
                     item.connected 
                        ? 'text-purple-600 group-hover:text-purple-700' 
                        : 'text-gray-600 group-hover:text-purple-600'
                  }`}>
                  {item.connected ? (
                     <>
                        <Settings size={16} className="mr-1.5" />
                        Настроить
                     </>
                  ) : (
                     <>
                        <span>Подробнее</span>
                        <ChevronRight size={16} className="ml-1" />
                     </>
                  )}
               </div>
               
               {item.docsUrl && (
                  <button 
                    onClick={(e) => openDocs(e, item.docsUrl!)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center transition-colors z-10"
                  >
                     Документация <ExternalLink size={12} className="ml-1" />
                  </button>
               )}
            </div>
          </div>
        ))}

        {/* Coming Soon Placeholder */}
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-70 min-h-[200px]">
           <div className="bg-gray-100 p-3 rounded-full mb-3 text-gray-400">
              <Link2 size={24} />
           </div>
           <h3 className="font-medium text-gray-600">Больше интеграций скоро</h3>
           <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Мы работаем над подключением iiko, r_keeper, 1С и популярных CRM систем.
           </p>
        </div>
      </div>

    </div>
  );
};

export default SettingsIntegrations;