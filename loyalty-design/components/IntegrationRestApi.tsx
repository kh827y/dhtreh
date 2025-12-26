import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Copy, 
  Check, 
  RefreshCw, 
  Server, 
  FileText, 
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  Terminal
} from 'lucide-react';

interface IntegrationRestApiProps {
  onBack: () => void;
}

const IntegrationRestApi: React.FC<IntegrationRestApiProps> = ({ onBack }) => {
  const [apiKey, setApiKey] = useState('sk_live_51Mz...q3f9A');
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const baseUrl = 'https://api.link/api/integrations/';

  const endpoints = [
    {
      method: 'POST',
      url: 'code',
      title: 'Расшифровка кода',
      description: 'Получение информации о клиенте по QR-коду из приложения или номеру телефона. Возвращает баланс, уровень лояльности, % начисления и списания.'
    },
    {
      method: 'POST',
      url: 'calculate/action',
      title: 'Расчет товарных акций',
      description: 'Рассчитать количество подарочных позиций или бонусных баллов за товары в корзине согласно активным акциям (2+1, баллы за товар).'
    },
    {
      method: 'POST',
      url: 'calculate/bonus',
      title: 'Применение бонусной программы',
      description: 'Финальный расчет чека: применение списания баллов, начисление новых баллов от итоговой суммы.'
    },
    {
      method: 'POST',
      url: 'bonus',
      title: 'Фиксация транзакции',
      description: 'Проведение операции. Списывает баллы и начисляет новые. Должен вызываться при закрытии чека на кассе.'
    },
    {
      method: 'POST',
      url: 'refund',
      title: 'Возврат',
      description: 'Отмена операции. Возвращает списанные баллы клиенту и аннулирует начисленные за этот чек.'
    }
  ];

  const handleCopy = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateKey = () => {
    if (confirm('Вы уверены? Старый ключ перестанет работать, что может нарушить работу интеграции.')) {
      setApiKey('sk_live_' + Math.random().toString(36).substr(2, 24));
    }
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center space-x-4 mb-8">
         <button 
           onClick={onBack}
           className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
         >
            <ArrowLeft size={24} />
         </button>
         <div>
            <h2 className="text-2xl font-bold text-gray-900">REST API</h2>
            <p className="text-gray-500 mt-1">Интеграция с кассовым ПО и внешними системами.</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         
         {/* Left Column: Credentials */}
         <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
               <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
                  <Server size={20} className="text-blue-600" />
                  <h3 className="font-bold text-gray-900">Параметры подключения</h3>
               </div>

               {/* Base URL */}
               <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Base URL</label>
                  <div className="flex items-center space-x-2">
                     <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 font-mono text-sm truncate">
                        {baseUrl}
                     </code>
                     <button 
                        onClick={() => handleCopy(baseUrl, setCopiedUrl)}
                        className={`p-2 rounded-lg transition-colors ${copiedUrl ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                        title="Копировать URL"
                     >
                        {copiedUrl ? <Check size={18} /> : <Copy size={18} />}
                     </button>
                  </div>
               </div>

               {/* API Token */}
               <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">API Token</label>
                  <div className="relative">
                     <input 
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        readOnly
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-20 py-2 text-gray-800 font-mono text-sm focus:outline-none"
                     />
                     <div className="absolute right-1 top-1/2 -translate-y-1/2 flex space-x-1">
                        <button 
                           onClick={() => setShowKey(!showKey)}
                           className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                        >
                           {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button 
                           onClick={() => handleCopy(apiKey, setCopiedKey)}
                           className={`p-1.5 rounded transition-colors ${copiedKey ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                           {copiedKey ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                     </div>
                  </div>
                  <p className="text-xs text-gray-400">Передавайте этот токен в заголовке <code className="bg-gray-100 px-1 rounded text-gray-600">Authorization: Bearer TOKEN</code></p>
               </div>

               <div className="pt-2">
                  <button 
                     onClick={handleRegenerateKey}
                     className="w-full flex items-center justify-center space-x-2 border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                     <RefreshCw size={14} />
                     <span>Сгенерировать новый ключ</span>
                  </button>
               </div>
            </div>

            {/* Docs Link */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl shadow-md text-white">
               <div className="flex items-center space-x-3 mb-4">
                  <FileText size={24} className="text-blue-100" />
                  <h3 className="font-bold text-lg">Документация</h3>
               </div>
               <p className="text-blue-100 text-sm mb-6 leading-relaxed">
                  Полное описание методов, форматов запросов и кодов ошибок доступно в нашей базе знаний.
               </p>
               <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); alert('Переход на https://docs.api.link'); }}
                  className="flex items-center justify-between w-full bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-3 transition-colors group"
               >
                  <span className="font-medium text-sm">Перейти к документации</span>
                  <ExternalLink size={16} className="group-hover:translate-x-1 transition-transform" />
               </a>
            </div>
         </div>

         {/* Right Column: Methods */}
         <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
               <Code size={24} className="text-purple-600 mr-2" />
               Основные методы
            </h3>

            <div className="space-y-4">
               {endpoints.map((ep, idx) => (
                  <div key={idx} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group">
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                        <div className="flex items-center space-x-3 mb-2 sm:mb-0">
                           <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold font-mono">
                              {ep.method}
                           </span>
                           <span className="font-mono text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                              .../{ep.url}
                           </span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{ep.title}</span>
                     </div>
                     <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                        {ep.description}
                     </p>
                  </div>
               ))}
            </div>

            {/* Code Example Preview */}
            <div className="bg-gray-900 rounded-xl p-6 shadow-md border border-gray-800">
               <div className="flex items-center space-x-2 text-gray-400 mb-4 border-b border-gray-800 pb-3">
                  <Terminal size={18} />
                  <span className="text-xs font-mono">Пример запроса (cURL)</span>
               </div>
               <div className="font-mono text-xs text-gray-300 leading-relaxed overflow-x-auto">
                  <p><span className="text-purple-400">curl</span> -X POST \</p>
                  <p className="pl-4">'{baseUrl}calculate/bonus' \</p>
                  <p className="pl-4">-H 'Authorization: Bearer {apiKey.substring(0, 15)}...' \</p>
                  <p className="pl-4">-H 'Content-Type: application/json' \</p>
                  <p className="pl-4">-d '{"{"}</p>
                  <p className="pl-8">"client_code": "123456",</p>
                  <p className="pl-8">"amount": 1500,</p>
                  <p className="pl-8">"items": [...]</p>
                  <p className="pl-4">{"}"}'</p>
               </div>
            </div>
         </div>

      </div>
    </div>
  );
};

export default IntegrationRestApi;