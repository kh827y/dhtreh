import React, { useState } from 'react';
import { 
  MonitorSmartphone, 
  RefreshCw, 
  Copy, 
  Eye, 
  EyeOff, 
  Store, 
  Users, 
  ExternalLink,
  Shield,
  KeyRound
} from 'lucide-react';
import { AppView } from '../types';

interface CashierPanelSettingsProps {
  onNavigate: (view: AppView) => void;
}

const CashierPanelSettings: React.FC<CashierPanelSettingsProps> = ({ onNavigate }) => {
  // App Access State
  const [appLogin] = useState('shop_12345');
  const [appPassword, setAppPassword] = useState('837291045');
  const [showAppPassword, setShowAppPassword] = useState(false);

  // Staff PINs State
  const [staffList, setStaffList] = useState([
    { id: '1', name: 'Алиса Фриман', outlet: 'Флагманский магазин', pin: '1234' },
    { id: '2', name: 'Боб Смит', outlet: 'Флагманский магазин', pin: '4321' },
    { id: '3', name: 'Иван Райт', outlet: 'Киоск Аэропорт', pin: '0000' },
    { id: '4', name: 'Диана Принс', outlet: 'ТЦ Сити Молл', pin: '2580' },
    { id: '5', name: 'Чарли Дэвис', outlet: 'ТЦ Сити Молл', pin: '1111' },
    { id: '6', name: 'Анна Ли', outlet: 'Филиал Пригород', pin: '9876' },
  ]);

  // Track which PINs are visible
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  const generateNewPassword = () => {
    let newPass = '';
    for (let i = 0; i < 9; i++) {
        newPass += Math.floor(Math.random() * 10);
    }
    setAppPassword(newPass);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, toast notification here
  };

  const togglePinVisibility = (id: string) => {
    setVisiblePins(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Панель кассира</h2>
        <p className="text-gray-500 mt-1">Настройка доступов к терминалу и управление PIN-кодами сотрудников.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: App Credentials */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
                 <MonitorSmartphone className="text-purple-600" size={20} />
                 <h3 className="text-lg font-bold text-gray-900">Доступ к приложению</h3>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 leading-relaxed">
                 Общие данные для входа в панель кассира всем сотрудникам.
              </div>

              {/* Login Field */}
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Логин</label>
                 <div className="flex items-center space-x-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 font-mono text-sm">
                       {appLogin}
                    </code>
                    <button 
                       onClick={() => copyToClipboard(appLogin)}
                       className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                       title="Копировать"
                    >
                       <Copy size={18} />
                    </button>
                 </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Пароль</label>
                 <div className="flex items-center space-x-2">
                    <div className="flex-1 relative">
                       <input 
                          type={showAppPassword ? 'text' : 'password'}
                          value={appPassword}
                          readOnly
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-gray-900 font-mono text-sm focus:outline-none"
                       />
                       <button 
                          onClick={() => setShowAppPassword(!showAppPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                       >
                          {showAppPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                    </div>
                    <button 
                       onClick={() => copyToClipboard(appPassword)}
                       className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                       title="Копировать"
                    >
                       <Copy size={18} />
                    </button>
                 </div>
              </div>

              {/* Regenerate Button */}
              <div className="pt-4 border-t border-gray-50">
                 <button 
                    onClick={generateNewPassword}
                    className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                 >
                    <RefreshCw size={16} />
                    <span>Сгенерировать новый пароль</span>
                 </button>
                 <p className="text-xs text-center text-gray-400 mt-2">
                    Внимание: потребуется повторный вход на всех устройствах.
                 </p>
              </div>
           </div>
        </div>

        {/* Right Col: Staff PINs */}
        <div className="lg:col-span-2">
           <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
                 <div className="flex items-center space-x-2">
                    <KeyRound className="text-purple-600" size={20} />
                    <h3 className="text-lg font-bold text-gray-900">PIN-коды сотрудников</h3>
                 </div>
                 <button 
                    onClick={() => { /* Placeholder for future management page */ }}
                    className="flex items-center space-x-1 text-sm text-gray-400 cursor-not-allowed font-medium transition-colors"
                    title="Страница управления сотрудниками в разработке"
                 >
                    <span>Управление сотрудниками</span>
                    <ExternalLink size={14} />
                 </button>
              </div>

              <div className="p-6 bg-gray-50/50 border-b border-gray-100">
                 <div className="flex items-start space-x-3 text-sm text-gray-600">
                    <Shield size={18} className="text-purple-600 mt-0.5 flex-shrink-0" />
                    <p>
                       Индивидуальные 4-значные PIN-коды для каждого сотрудника, запрашиваемые для доступа к операциям с баллами в панели кассира.
                    </p>
                 </div>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                       <tr>
                          <th className="px-6 py-4 font-semibold">Сотрудник</th>
                          <th className="px-6 py-4 font-semibold">Торговая точка</th>
                          <th className="px-6 py-4 font-semibold w-40">PIN-код</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {staffList.map((staff) => (
                          <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                             <td className="px-6 py-4 font-medium text-gray-900">
                                <div className="flex items-center space-x-3">
                                   <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
                                      {staff.name.split(' ').map(n => n[0]).join('')}
                                   </div>
                                   <span>{staff.name}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4 text-gray-600">
                                <div className="flex items-center space-x-2">
                                   <Store size={14} className="text-gray-400" />
                                   <span>{staff.outlet}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-32">
                                   <span className={`font-mono font-bold text-lg ${visiblePins[staff.id] ? 'text-gray-900' : 'text-gray-400'}`}>
                                      {visiblePins[staff.id] ? staff.pin : '••••'}
                                   </span>
                                   <button 
                                      onClick={() => togglePinVisibility(staff.id)}
                                      className="text-gray-400 hover:text-purple-600 transition-colors"
                                   >
                                      {visiblePins[staff.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                   </button>
                                </div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default CashierPanelSettings;