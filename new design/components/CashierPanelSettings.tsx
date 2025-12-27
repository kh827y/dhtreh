import React, { useState } from 'react';
import { 
  MonitorSmartphone, 
  RefreshCw, 
  Copy, 
  Store, 
  ExternalLink,
  Shield,
  KeyRound,
  X
} from 'lucide-react';
import { AppView } from '../types';

interface CashierPanelSettingsProps {
  onNavigate: (view: AppView) => void;
}

const CashierPanelSettings: React.FC<CashierPanelSettingsProps> = ({ onNavigate }) => {
  // App Access State
  const [appLogin] = useState('shop_12345');
  const [issueCount, setIssueCount] = useState(6);
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [issuedExpiresAt, setIssuedExpiresAt] = useState<string | null>(null);

  const [activationCodes, setActivationCodes] = useState<
    Array<{ id: string; tokenHint: string; expiresAt: string; status: string }>
  >([
    {
      id: '1',
      tokenHint: '045',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
      status: 'ACTIVE',
    },
    {
      id: '2',
      tokenHint: '777',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      status: 'USED',
    },
  ]);

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

  const formatDateTime = (value: string) => {
    try {
      const date = new Date(value);
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return value;
    }
  };

  const mapActivationStatus = (status: string) => {
    const normalized = String(status || '')
      .trim()
      .toUpperCase();
    switch (normalized) {
      case 'ACTIVE':
        return {
          label: 'Активен',
          className: 'bg-green-50 text-green-700 border border-green-100',
        };
      case 'USED':
        return {
          label: 'Использован',
          className: 'bg-gray-50 text-gray-700 border border-gray-100',
        };
      case 'EXPIRED':
        return {
          label: 'Истёк',
          className: 'bg-amber-50 text-amber-700 border border-amber-100',
        };
      case 'REVOKED':
        return {
          label: 'Отозван',
          className: 'bg-red-50 text-red-700 border border-red-100',
        };
      default:
        return {
          label: '—',
          className: 'bg-gray-50 text-gray-700 border border-gray-100',
        };
    }
  };

  const issueActivationCodes = () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
    const codes = Array.from({ length: Math.max(1, Math.min(50, issueCount)) }).map(() => {
      let out = '';
      for (let i = 0; i < 9; i += 1) {
        out += Math.floor(Math.random() * 10);
      }
      return out;
    });
    setIssuedCodes(codes);
    setIssuedExpiresAt(expiresAt);
    setActivationCodes((prev) => [
      ...codes.map((code) => ({
        id: `c_${Date.now()}_${code}`,
        tokenHint: code.slice(-3),
        expiresAt,
        status: 'ACTIVE',
      })),
      ...prev,
    ]);
  };

  const revokeActivationCode = (id: string) => {
    setActivationCodes((prev) =>
      prev.map((code) => (code.id === id ? { ...code, status: 'REVOKED' } : code)),
    );
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
                 Логин общий для всех сотрудников. Код активации используется один раз для подключения устройства (срок действия — 3 дня).
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

              {/* Activation codes */}
              <div className="pt-4 border-t border-gray-50 space-y-4">
                 <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Коды активации</label>
                    <div className="flex items-center space-x-2">
                       <input
                         type="number"
                         inputMode="numeric"
                         min={1}
                         max={50}
                         value={issueCount}
                         onChange={(event) => {
                           const next = Number(event.target.value);
                           if (!Number.isFinite(next)) return;
                           setIssueCount(Math.max(1, Math.min(50, Math.trunc(next))));
                         }}
                         className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none"
                         aria-label="Количество кодов"
                       />
                       <button 
                          onClick={issueActivationCodes}
                          className="flex-1 flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                       >
                          <RefreshCw size={16} />
                          <span>Выпустить коды</span>
                       </button>
                    </div>
                    <p className="text-xs text-gray-400">
                       После выпуска коды показываются один раз — скопируйте их и передайте сотрудникам.
                    </p>
                 </div>

                 {issuedCodes.length ? (
                    <div className="space-y-3">
                       <div className="text-xs text-gray-500">
                         Новые коды до{' '}
                         <span className="font-medium text-gray-700">
                           {issuedExpiresAt ? formatDateTime(issuedExpiresAt) : '—'}
                         </span>
                       </div>
                       <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                         {issuedCodes.map((code) => (
                           <div key={code} className="flex items-center space-x-2">
                             <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 font-mono text-sm">
                               {code}
                             </code>
                             <button 
                                onClick={() => copyToClipboard(code)}
                                className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Копировать"
                             >
                                <Copy size={18} />
                             </button>
                           </div>
                         ))}
                       </div>
                    </div>
                 ) : null}

                 <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Выпущенные коды
                    </div>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {activationCodes.map((code) => {
                        const badge = mapActivationStatus(code.status);
                        const isActive = String(code.status || '').trim().toUpperCase() === 'ACTIVE';
                        return (
                          <div
                            key={code.id}
                            className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <code className="font-mono text-sm text-gray-900">
                                  •••{code.tokenHint || '—'}
                                </code>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                До {code.expiresAt ? formatDateTime(code.expiresAt) : '—'}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1">
                              {isActive ? (
                                <button
                                  onClick={() => revokeActivationCode(code.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Отозвать код"
                                >
                                  <X size={16} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                 </div>
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
                    onClick={() => onNavigate('settings_staff')}
                    className="flex items-center space-x-1 text-sm text-gray-400 font-medium transition-colors"
                    title="Управление сотрудниками"
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

              <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
                 <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
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
