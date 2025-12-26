import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Smartphone, 
  Copy, 
  Check, 
  Save, 
  RefreshCw, 
  Send,
  ExternalLink,
  Bot
} from 'lucide-react';
import { AppView } from '../types';

interface IntegrationTelegramMiniappProps {
  onBack: () => void;
}

const IntegrationTelegramMiniapp: React.FC<IntegrationTelegramMiniappProps> = ({ onBack }) => {
  // Config State
  const [token, setToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  
  // Generating a fake merchant-specific link
  const miniappLink = 'https://miniapp.link/?merchant=cmishf4tv0000tawioq0l7pcp';

  // UI Helper States
  const [copiedLink, setCopiedLink] = useState(false);

  const handleConnect = () => {
    if (!token) return alert('Пожалуйста, введите токен бота');
    
    setIsLoading(true);
    // Simulate API Check
    setTimeout(() => {
      setIsLoading(false);
      setIsConnected(true);
      setBotUsername('@MyLoyaltyBot'); // Mock response
    }, 1500);
  };

  const handleDisconnect = () => {
    if(confirm('Отключить бота? Ваше приложение в Telegram перестанет работать.')) {
        setIsConnected(false);
        setBotUsername(null);
        setToken('');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(miniappLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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
            <h2 className="text-2xl font-bold text-gray-900">Telegram Miniapp</h2>
            <p className="text-gray-500 mt-1">Подключение собственного приложения лояльности внутри Telegram.</p>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
         
         {/* Left Column: Screenshots & Preview */}
         <div className="space-y-8">
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[500px]">
               <h3 className="text-lg font-semibold text-gray-700 mb-6">Как это выглядит у клиента</h3>
               
               <div className="flex space-x-6">
                  {/* Phone Mockup 1: Menu */}
                  <div className="relative w-[240px] h-[480px] bg-gray-900 rounded-[2.5rem] border-8 border-gray-900 shadow-2xl overflow-hidden">
                     <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-xl z-20"></div>
                     <img 
                        src="https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?auto=format&fit=crop&q=80&w=400" 
                        alt="Screen 1" 
                        className="w-full h-full object-cover opacity-80"
                     />
                     <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 flex flex-col justify-end p-4">
                        <div className="bg-white rounded-xl p-3 shadow-lg mb-2">
                           <div className="h-2 w-16 bg-gray-200 rounded mb-2"></div>
                           <div className="h-10 w-full bg-purple-100 rounded flex items-center justify-center text-purple-600 font-bold">
                              540 Баллов
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Phone Mockup 2: QR */}
                  <div className="relative w-[240px] h-[480px] bg-gray-900 rounded-[2.5rem] border-8 border-gray-900 shadow-2xl overflow-hidden hidden sm:block mt-12">
                     <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-b-xl z-20"></div>
                     <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6">
                        <h4 className="font-bold text-gray-900 mb-4">Карта лояльности</h4>
                        <div className="w-32 h-32 bg-gray-900 rounded-lg flex items-center justify-center text-white text-xs mb-4">
                           QR CODE
                        </div>
                        <p className="text-center text-xs text-gray-500">Покажите этот код кассиру для начисления баллов</p>
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
               <h3 className="font-bold text-gray-900 mb-2">Преимущества</h3>
               <ul className="space-y-2">
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5" />
                     <span>Не нужно скачивать приложение — работает внутри Telegram.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5" />
                     <span>Быстрая регистрация и доступ к карте лояльности.</span>
                  </li>
                  <li className="flex items-start space-x-3 text-sm text-gray-600">
                     <Check size={16} className="text-green-500 mt-0.5" />
                     <span>Бесплатные PUSH-уведомления через бота.</span>
                  </li>
               </ul>
            </div>
         </div>

         {/* Right Column: Settings Form */}
         <div className="space-y-6">
            
            {/* Connection Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900">Настройка подключения</h3>
               </div>
               
               <div className="p-6 space-y-6">
                  {isConnected ? (
                     // CONNECTED STATE
                     <div className="bg-green-50 border border-green-100 rounded-xl p-5 animate-fade-in">
                        <div className="flex items-start justify-between">
                           <div className="flex items-center space-x-4">
                              <div className="bg-green-100 p-3 rounded-full text-green-600">
                                 <Bot size={24} />
                              </div>
                              <div>
                                 <h4 className="font-bold text-green-900">Бот успешно подключен</h4>
                                 <p className="text-green-700 font-medium">{botUsername}</p>
                              </div>
                           </div>
                           <button 
                              onClick={handleConnect}
                              className="text-gray-500 hover:text-green-700 p-2 rounded-full hover:bg-green-100 transition-colors"
                              title="Проверить подключение"
                           >
                              <RefreshCw size={18} />
                           </button>
                        </div>
                        
                        <div className="mt-6 pt-4 border-t border-green-100 flex items-center justify-between">
                           <button 
                              onClick={() => { setIsConnected(false); }} 
                              className="text-sm font-medium text-green-800 hover:underline"
                           >
                              Заменить токен
                           </button>
                           <button 
                              onClick={handleDisconnect}
                              className="text-sm font-medium text-red-600 hover:text-red-800"
                           >
                              Отключить
                           </button>
                        </div>
                     </div>
                  ) : (
                     // DISCONNECTED STATE (Form)
                     <div className="space-y-4">
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">Токен бота из BotFather</label>
                           <div className="relative">
                              <input 
                                 type="text" 
                                 value={token}
                                 onChange={(e) => setToken(e.target.value)}
                                 className="w-full border border-gray-300 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-mono text-sm"
                                 placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWxyz"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                 <Smartphone size={18} />
                              </div>
                           </div>
                           <p className="text-xs text-gray-500 mt-2">
                              Создайте нового бота в <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">@BotFather</a> и скопируйте полученный API Token.
                           </p>
                        </div>

                        <button 
                           onClick={handleConnect}
                           disabled={isLoading}
                           className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-wait"
                        >
                           {isLoading ? (
                              <>
                                 <RefreshCw size={18} className="animate-spin" />
                                 <span>Проверка...</span>
                              </>
                           ) : (
                              <>
                                 <Save size={18} />
                                 <span>Сохранить и подключить</span>
                              </>
                           )}
                        </button>
                     </div>
                  )}
               </div>
            </div>

            {/* Setup Instructions (Always Visible) */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
               <h3 className="font-bold text-gray-900 text-lg">Настройка кнопки в Telegram</h3>
               
               <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                     <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">Ссылка на ваше приложение (Main App)</label>
                     <div className="flex items-center space-x-2">
                        <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 text-sm text-gray-700 font-mono truncate">
                           {miniappLink}
                        </code>
                        <button 
                           onClick={handleCopyLink}
                           className={`p-2 rounded-lg transition-colors ${copiedLink ? 'bg-green-500 text-white' : 'bg-white border border-blue-200 text-blue-600 hover:bg-blue-100'}`}
                        >
                           {copiedLink ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                     </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                     <p>Для запуска приложения внутри бота выполните следующие действия:</p>
                     <ol className="list-decimal list-inside space-y-2 ml-1">
                        <li>В <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 font-medium">BotFather</a> напишите команду <code className="bg-gray-100 px-1 py-0.5 rounded">/mybots</code>.</li>
                        <li>Выберите вашего бота из списка.</li>
                        <li>Перейдите в <strong>Bot Settings</strong> &rarr; <strong>Configure Mini App</strong>.</li>
                        <li>Нажмите <strong>Enable Mini App</strong>.</li>
                        <li>Вставьте вашу ссылку (скопируйте выше) и отправьте её боту.</li>
                     </ol>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-100">
                     <p className="text-xs text-gray-500">
                        Также рекомендуется настроить кнопку меню: <strong>Bot Settings</strong> &rarr; <strong>Menu Button</strong> &rarr; <strong>Configure Menu Button</strong> и вставьте ту же ссылку.
                     </p>
                  </div>
               </div>
            </div>

         </div>
      </div>

    </div>
  );
};

export default IntegrationTelegramMiniapp;