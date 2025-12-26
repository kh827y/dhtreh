import React, { useState } from 'react';
import { 
  Store, 
  Building2, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Lock, 
  ChevronLeft, 
  X, 
  LogOut, 
  Camera,
  Plus,
  Wallet,
  Check
} from 'lucide-react';

interface CashierPanelMobileProps {
  onExit: () => void;
}

const CashierPanelMobile: React.FC<CashierPanelMobileProps> = ({ onExit }) => {
  const [authStep, setAuthStep] = useState<'app_login' | 'pin' | 'authorized'>('app_login');
  
  // Login State
  const [appLogin, setAppLogin] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIN State
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Terminal State
  const [isScanning, setIsScanning] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  // Transaction State
  const [checkoutStep, setCheckoutStep] = useState<'search' | 'amount' | 'mode' | 'success'>('search');
  const [txAmount, setTxAmount] = useState('');
  
  // Mock Data
  const [currentClient, setCurrentClient] = useState<any>(null);

  const handleAppLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (appLogin && appPassword) {
      setAuthStep('pin');
    }
  };

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        // Mock PIN validation
        if (newPin === '1234') { 
           setAuthStep('authorized');
        } else {
           setPinError(true);
           setTimeout(() => {
             setPin('');
             setPinError(false);
           }, 500);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleSearch = () => {
      if (inputValue === '123') {
          setCurrentClient({
              name: 'Иван Петров',
              balance: 1250,
              level: 'Gold'
          });
          setCheckoutStep('amount');
      } else {
          alert('Клиент не найден (тест: 123)');
      }
  };

  const resetCheckout = () => {
    setCheckoutStep('search');
    setInputValue('');
    setTxAmount('');
    setCurrentClient(null);
  };

  // --- Render Logic ---

  if (authStep === 'app_login') {
    return (
      <div className="flex-1 flex flex-col justify-center p-6 bg-slate-100 min-h-screen">
         <div className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative">
            <div className="p-8">
               <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center shadow-md shadow-purple-200">
                     <Store size={32} className="text-white" />
                  </div>
               </div>

               <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Терминал</h2>
               <p className="text-center text-gray-500 text-sm mb-8 font-medium">Авторизация устройства</p>

               <form onSubmit={handleAppLogin} className="space-y-5">
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Логин</label>
                     <div className="relative">
                        <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                           type="text"
                           value={appLogin}
                           onChange={(e) => setAppLogin(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 pl-11 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-medium"
                           placeholder="Например: shop_01"
                        />
                     </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Пароль</label>
                     <div className="relative">
                        <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                           type={showPassword ? "text" : "password"}
                           value={appPassword}
                           onChange={(e) => setAppPassword(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-12 py-3.5 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-medium"
                           placeholder="•••••••••"
                        />
                        <button 
                           type="button"
                           onClick={() => setShowPassword(!showPassword)}
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                           {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                     </div>
                  </div>

                  <button 
                     type="submit"
                     disabled={!appLogin || !appPassword}
                     className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg mt-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                  >
                     Войти
                  </button>
               </form>
            </div>
            {/* Bottom Accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600"></div>
         </div>
      </div>
    );
  }

  if (authStep === 'pin') {
      return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <button onClick={() => setAuthStep('app_login')} className="absolute top-6 left-6 text-gray-500 hover:text-gray-900 flex items-center space-x-2 transition-colors">
                <ChevronLeft size={20} /> <span>Назад</span>
            </button>

            <div className="w-full max-w-sm text-center space-y-8 animate-fade-in">
                <div>
                <div className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center shadow-sm mb-4">
                    <Lock size={32} className="text-purple-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Вход сотрудника</h2>
                <p className="text-gray-500 mt-2">Введите ваш PIN-код</p>
                </div>

                {/* PIN Dots */}
                <div className={`flex justify-center space-x-4 mb-8`}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-4 h-4 rounded-full transition-all duration-200 ${
                            i < pin.length 
                            ? pinError ? 'bg-red-500 scale-110' : 'bg-purple-600 scale-110' 
                            : 'bg-gray-300'
                        }`}
                    />
                ))}
                </div>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                        key={num}
                        onClick={() => handlePinInput(num.toString())}
                        className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center"
                    >
                        {num}
                    </button>
                ))}
                <div className="w-20 h-20 flex items-center justify-center"></div>
                <button
                    onClick={() => handlePinInput('0')}
                    className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center"
                >
                    0
                </button>
                <button
                    onClick={handlePinBackspace}
                    className="w-20 h-20 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-all mx-auto"
                >
                    <ChevronLeft size={32} />
                </button>
                </div>
            </div>
        </div>
      );
  }

  // Authorized Main View
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Mobile Header */}
        <div className="bg-white px-4 py-3 flex justify-between items-center border-b border-gray-200 sticky top-0 z-10">
            <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-xs">
                    АФ
                </div>
                <div>
                    <div className="text-sm font-bold text-gray-900 leading-none">Алиса Ф.</div>
                    <div className="text-xs text-gray-500">Кассир</div>
                </div>
            </div>
            <button onClick={() => setAuthStep('pin')} className="p-2 text-gray-400 hover:text-gray-600">
                <LogOut size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto">
            {checkoutStep === 'search' && (
                <div className="flex flex-col h-full justify-center max-w-sm mx-auto space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Поиск клиента</h2>
                        <div className="relative mb-4">
                            <input 
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Телефон или карта"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-center text-lg font-medium outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                            />
                        </div>
                        <button 
                            onClick={handleSearch}
                            disabled={!inputValue}
                            className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all"
                        >
                            Найти
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => setIsScanning(true)}
                        className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 active:scale-95 transition-all"
                    >
                        <Camera size={20} />
                        <span>Сканировать QR</span>
                    </button>
                </div>
            )}

            {checkoutStep === 'amount' && currentClient && (
                <div className="max-w-sm mx-auto space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                        <div>
                            <div className="font-bold text-gray-900">{currentClient.name}</div>
                            <div className="text-xs text-gray-500">{currentClient.level}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-purple-600">{currentClient.balance}</div>
                            <div className="text-xs text-gray-400 uppercase font-bold">Баллов</div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <label className="block text-sm font-medium text-gray-700">Сумма покупки</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={txAmount}
                                onChange={(e) => setTxAmount(e.target.value)}
                                placeholder="0"
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-4 pr-10 text-2xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                autoFocus 
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₽</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => setCheckoutStep('mode')}
                        disabled={!txAmount}
                        className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl shadow-lg disabled:opacity-50 active:scale-95 transition-all"
                    >
                        Далее
                    </button>
                    <button onClick={resetCheckout} className="w-full py-3 text-gray-500 font-medium">Отмена</button>
                </div>
            )}

            {checkoutStep === 'mode' && (
                <div className="max-w-sm mx-auto space-y-4 pt-4">
                    <button onClick={() => setCheckoutStep('success')} className="w-full bg-white p-6 rounded-2xl border-2 border-transparent hover:border-purple-500 shadow-sm transition-all group text-left">
                        <div className="flex items-center space-x-3 mb-2">
                            <div className="p-2 bg-green-100 rounded-lg text-green-600"><Plus size={24} /></div>
                            <h3 className="text-lg font-bold text-gray-900">Начислить</h3>
                        </div>
                        <p className="text-gray-500 text-sm">Клиент копит баллы.</p>
                    </button>

                    <button onClick={() => setCheckoutStep('success')} className="w-full bg-white p-6 rounded-2xl border-2 border-transparent hover:border-orange-500 shadow-sm transition-all group text-left">
                        <div className="flex items-center space-x-3 mb-2">
                            <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><Wallet size={24} /></div>
                            <h3 className="text-lg font-bold text-gray-900">Списать</h3>
                        </div>
                        <p className="text-gray-500 text-sm">Оплата баллами.</p>
                    </button>
                    
                    <button onClick={() => setCheckoutStep('amount')} className="w-full py-3 text-gray-500 font-medium">Назад</button>
                </div>
            )}

            {checkoutStep === 'success' && (
                <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white mb-6 shadow-lg shadow-green-200">
                        <Check size={32} strokeWidth={3} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Успешно!</h2>
                    <p className="text-gray-500 text-center mb-8">Операция проведена. Баллы начислены.</p>
                    <button onClick={resetCheckout} className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-all">
                        Новый чек
                    </button>
                </div>
            )}
        </div>

        {/* Scanner Overlay */}
        {isScanning && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
                <div className="text-white mb-8 text-lg font-medium">Наведите на QR-код</div>
                <div className="w-64 h-64 border-4 border-white/20 rounded-3xl relative overflow-hidden">
                    <div className="absolute inset-0 border-4 border-purple-500 rounded-3xl animate-pulse"></div>
                </div>
                <button onClick={() => setIsScanning(false)} className="mt-12 px-8 py-3 bg-white/10 rounded-full text-white backdrop-blur-sm">Отмена</button>
            </div>
        )}
    </div>
  );
};

export default CashierPanelMobile;