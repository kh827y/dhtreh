import React, { useState, useEffect, useMemo } from 'react';
import { 
  QrCode, 
  RotateCcw, 
  LogOut, 
  Search, 
  Store, 
  Receipt, 
  User, 
  ChevronRight, 
  Clock, 
  CreditCard, 
  TrendingUp, 
  AlertCircle, 
  History,
  Award,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Copy,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  UserPlus,
  Users,
  Medal,
  Crown,
  Wallet,
  Plus,
  Gift,
  Coins,
  Camera,
  Lock,
  KeyRound,
  ShieldCheck,
  Building2,
  ArrowLeft,
  Check,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';

interface CashierPanelProps {
  onExit: () => void;
}

// --- Types ---

// Extended Transaction Interface
interface Transaction {
  id: string;
  checkId: string;
  date: Date;
  type: 'sale' | 'return';
  client: string;
  staff: string;
  amount: number;
  pointsAccrued: number;
  pointsRedeemed: number;
}

interface StaffRating {
  id: string;
  name: string;
  outlet: string;
  score: number;
  avatar: string;
  rank: number;
}

interface ClientProfile {
  id: string;
  name: string;
  level: string;
  balance: number;
  avatar: string;
}

interface EmployeeProfile {
  id: string;
  name: string;
  role: string;
  outlet: string;
  avatar: string;
  pin: string;
}

// --- Mock Data ---

const staffDatabase: EmployeeProfile[] = [
  { id: '1', name: 'Алиса Ф.', role: 'Старший кассир', outlet: 'Центральный магазин', avatar: 'AF', pin: '1234' },
  { id: '2', name: 'Боб С.', role: 'Кассир', outlet: 'ТЦ Сити Молл', avatar: 'BS', pin: '4321' },
  { id: '3', name: 'Иван Р.', role: 'Стажер', outlet: 'Киоск Аэропорт', avatar: 'IR', pin: '0000' },
];

const leaderboardData: StaffRating[] = [
  { id: '1', name: 'Алиса Ф.', score: 1250, outlet: 'Центральный магазин', avatar: 'AF', rank: 1 },
  { id: '2', name: 'Иван Р.', score: 1100, outlet: 'Киоск Аэропорт', avatar: 'IR', rank: 2 },
  { id: '3', name: 'Елена С.', score: 950, outlet: 'ТЦ Сити Молл', avatar: 'ES', rank: 3 },
  { id: '4', name: 'Боб С.', score: 820, outlet: 'Центральный магазин', avatar: 'BS', rank: 4 },
  { id: '5', name: 'Анна Л.', score: 600, outlet: 'Филиал Пригород', avatar: 'AL', rank: 5 },
  { id: '6', name: 'Мария К.', score: 450, outlet: 'ТЦ Сити Молл', avatar: 'MK', rank: 6 },
];

const CashierPanel: React.FC<CashierPanelProps> = ({ onExit }) => {
  // --- Auth State ---
  const [authStep, setAuthStep] = useState<'app_login' | 'staff_pin' | 'authorized'>('app_login');
  const [currentUser, setCurrentUser] = useState<EmployeeProfile | null>(null);
  
  // App Login State
  const [appLogin, setAppLogin] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // PIN State
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // --- Terminal State ---
  const [activeView, setActiveView] = useState<'main' | 'history' | 'return' | 'rating'>('main');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Checkout Flow State
  const [checkoutStep, setCheckoutStep] = useState<'search' | 'amount' | 'mode' | 'redeem' | 'precheck' | 'success'>('search');
  const [currentClient, setCurrentClient] = useState<ClientProfile | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  
  // Transaction Data
  const [txAmount, setTxAmount] = useState('');
  const [txCheckId, setTxCheckId] = useState('');
  const [txRedeemPoints, setTxRedeemPoints] = useState('');
  const [txAccruePoints, setTxAccruePoints] = useState(0);
  const [txFinalAmount, setTxFinalAmount] = useState(0);

  // Filter States
  const [historySearch, setHistorySearch] = useState('');
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'return'>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');

  // Return Flow State
  const [returnTx, setReturnTx] = useState<Transaction | null>(null);
  const [returnSearchInput, setReturnSearchInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination & Rating
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [ratingFilter, setRatingFilter] = useState<'all' | 'my_outlet'>('all');

  const shiftStats = {
    revenue: 42500,
    checks: 48,
    bonusAccrued: 2150
  };

  const motivationSettings = {
    isEnabled: true,
    period: 'Текущий месяц',
    pointsNew: 15,
    pointsExisting: 2
  };

  // --- Effects ---

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Scanning Mock
  useEffect(() => {
    if (isScanning) {
        const timer = setTimeout(() => {
            setIsScanning(false);
            setInputValue('123');
            setCurrentClient({
                id: '123',
                name: 'Тестовый Клиент',
                level: 'Gold',
                balance: 5350,
                avatar: 'ТК'
            });
            setCheckoutStep('amount');
        }, 2000); 
        return () => clearTimeout(timer);
    }
  }, [isScanning]);

  // --- Data Memos ---

  const filteredLeaderboard = useMemo(() => {
    let data = leaderboardData;
    if (currentUser && ratingFilter === 'my_outlet') {
      data = data.filter(s => s.outlet === currentUser.outlet);
    }
    return data.sort((a, b) => b.score - a.score);
  }, [ratingFilter, currentUser]);

  const currentUserRating = currentUser ? leaderboardData.find(u => u.id === currentUser.id) : null;

  const fullHistory: Transaction[] = useMemo(() => {
    const base: Transaction[] = [
        { id: 'tx1', checkId: '45920', date: new Date(Date.now() - 1000 * 60 * 5), type: 'sale', client: 'Михаил И.', staff: 'Алиса Ф.', amount: 1250, pointsAccrued: 62, pointsRedeemed: 0 },
        { id: 'tx2', checkId: '45919', date: new Date(Date.now() - 1000 * 60 * 25), type: 'sale', client: 'Новый клиент', staff: 'Алиса Ф.', amount: 450, pointsAccrued: 22, pointsRedeemed: 0 },
        { id: 'tx3', checkId: '45918', date: new Date(Date.now() - 1000 * 60 * 45), type: 'return', client: 'Елена С.', staff: 'Боб С.', amount: 3100, pointsAccrued: -150, pointsRedeemed: 0 },
    ];
    for(let i=0; i<15; i++) {
        base.push({
            id: `tx-gen-${i}`,
            checkId: `${45913-i}`,
            date: new Date(Date.now() - 1000 * 60 * (200 + i*20)),
            type: Math.random() > 0.9 ? 'return' : 'sale',
            client: `Клиент ${i+1}`,
            staff: 'Алиса Ф.',
            amount: Math.floor(Math.random() * 2000) + 100,
            pointsAccrued: Math.floor(Math.random() * 50),
            pointsRedeemed: 0
        });
    }
    return base;
  }, []);

  const uniqueStaff = useMemo(() => Array.from(new Set(fullHistory.map(tx => tx.staff))), [fullHistory]);

  const filteredHistory = useMemo(() => {
    return fullHistory.filter(tx => {
      if (historySearch) {
        const lowerSearch = historySearch.toLowerCase();
        if (!tx.checkId.toLowerCase().includes(lowerSearch) && !tx.client.toLowerCase().includes(lowerSearch)) return false;
      }
      if (filterDate) {
        if (tx.date.toISOString().split('T')[0] !== filterDate) return false;
      }
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterStaff !== 'all' && tx.staff !== filterStaff) return false;
      return true;
    });
  }, [fullHistory, historySearch, filterDate, filterType, filterStaff]);

  const recentTx = fullHistory.slice(0, 5);
  const paginatedHistory = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return filteredHistory.slice(start, start + itemsPerPage);
  }, [filteredHistory, currentPage]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

  // --- Auth Handlers ---

  const handleAppLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock Validation: simple length check or hardcoded value
    if (appLogin.length > 0 && appPassword.length === 9) {
      setAuthStep('staff_pin');
      setAuthError('');
    } else {
      setAuthError('Неверный логин или пароль (пароль должен быть 9 цифр)');
    }
  };

  const handlePinInput = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setPinError(false);
      
      if (newPin.length === 4) {
        // Validate PIN
        const foundEmployee = staffDatabase.find(e => e.pin === newPin);
        if (foundEmployee) {
          setTimeout(() => {
            setCurrentUser(foundEmployee);
            setAuthStep('authorized');
            setPin('');
          }, 300); // Small delay for UX
        } else {
          setPinError(true);
          setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 800);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setPinError(false);
  };

  const handleLogout = () => {
    if (confirm('Закрыть смену и выйти в меню авторизации?')) {
      setCurrentUser(null);
      setAuthStep('app_login');
      setAppPassword(''); // Reset session password
    }
  };

  const handleChangeUser = () => {
    setCurrentUser(null);
    setAuthStep('staff_pin');
    setPin('');
  };

  // --- Terminal Handlers ---

  const handleSwitchView = (view: 'main' | 'history' | 'return' | 'rating') => {
      setActiveView(view);
      if (view !== 'main') resetCheckout();
      if (view !== 'return') {
          setReturnTx(null);
          setReturnSearchInput('');
      }
  };

  const resetCheckout = () => {
      setCheckoutStep('search');
      setInputValue('');
      setCurrentClient(null);
      setTxAmount('');
      setTxCheckId('');
      setTxRedeemPoints('');
      setTxAccruePoints(0);
      setTxFinalAmount(0);
  };

  const handleSearchAction = (action: string) => {
    if (!inputValue && action !== 'scan') return;
    if (action === 'scan') { setIsScanning(true); return; }
    if (inputValue === '123') {
        setCurrentClient({ id: '123', name: 'Тестовый Клиент', level: 'Gold', balance: 5350, avatar: 'ТК' });
        setCheckoutStep('amount');
    } else {
        alert('Клиент не найден (попробуйте 123)');
    }
  };

  const calculatePrecheck = (mode: 'accrue' | 'redeem') => {
      const amount = parseFloat(txAmount) || 0;
      let redeemed = 0;
      if (mode === 'redeem') redeemed = Math.min(parseInt(txRedeemPoints) || 0, currentClient?.balance || 0, amount);
      
      const final = amount - redeemed;
      const accrued = Math.floor(final * 0.05);

      setTxFinalAmount(final);
      setTxRedeemPoints(redeemed.toString());
      setTxAccruePoints(accrued);
      setCheckoutStep('precheck');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReturnSearch = () => {
      const found = fullHistory.find(tx => tx.checkId === returnSearchInput);
      if (found) setReturnTx(found); else alert('Чек не найден');
  };

  const confirmReturn = () => {
      if (returnTx) {
          alert('Возврат выполнен успешно');
          setReturnTx(null);
          setReturnSearchInput('');
      }
  };

  const fmtMoney = (val: number) => val.toLocaleString('ru-RU');

  const keys = [
    { label: '1', val: '1' }, { label: '2', val: '2' }, { label: '3', val: '3' },
    { label: '4', val: '4' }, { label: '5', val: '5' }, { label: '6', val: '6' },
    { label: '7', val: '7' }, { label: '8', val: '8' }, { label: '9', val: '9' },
    { label: 'C', val: 'clear', type: 'secondary' }, { label: '0', val: '0' }, { label: '⌫', val: 'back', type: 'secondary' },
  ];

  const ClientHeader = () => (
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between mb-6 animate-fade-in">
          <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">{currentClient?.avatar}</div>
              <div>
                  <h3 className="font-bold text-gray-900 leading-tight">{currentClient?.name}</h3>
                  <div className="flex items-center space-x-2 text-xs">
                      <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">{currentClient?.level}</span>
                      <span className="text-gray-500">ID: {currentClient?.id}</span>
                  </div>
              </div>
          </div>
          <div className="text-right">
              <span className="block text-xs text-gray-500 uppercase font-bold">Баланс</span>
              <span className="text-xl font-bold text-purple-600">{currentClient?.balance} Б</span>
          </div>
      </div>
  );

  // --- Auth View: App Login ---
  if (authStep === 'app_login') {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-4">
        
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-fade-in">
           <div className="p-10">
              <div className="flex justify-center mb-8">
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
                          autoFocus
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
                          onChange={(e) => {
                             const val = e.target.value.replace(/\D/g, '').slice(0, 9);
                             setAppPassword(val);
                          }}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-12 py-3.5 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-mono text-lg tracking-widest"
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

                 {authError && (
                    <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs font-medium border border-red-100 animate-in fade-in slide-in-from-top-1">
                       <AlertTriangle size={14} className="flex-shrink-0" />
                       <span>{authError}</span>
                    </div>
                 )}

                 <button 
                    type="submit" 
                    disabled={!appLogin || appPassword.length < 9}
                    className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg shadow-gray-200 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
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

  // --- Auth View: Staff PIN ---
  if (authStep === 'staff_pin') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
         <button onClick={() => setAuthStep('app_login')} className="absolute top-6 left-6 text-gray-500 hover:text-gray-900 flex items-center space-x-2 transition-colors">
            <ArrowLeft size={20} /> <span>Сменить терминал</span>
         </button>

         <div className="w-full max-w-sm text-center space-y-8 animate-fade-in">
            <div>
               <div className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center shadow-sm mb-4">
                  <Lock size={32} className="text-purple-600" />
               </div>
               <h2 className="text-2xl font-bold text-gray-900">Вход сотрудника</h2>
               <p className="text-gray-500 mt-2">Введите ваш 4-значный PIN-код</p>
            </div>

            {/* PIN Dots */}
            <div className={`flex justify-center space-x-4 mb-8 ${pinError ? 'animate-shake' : ''}`}>
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

            {/* Error Message */}
            <div className="h-6">
               {pinError && <p className="text-red-500 text-sm font-medium animate-fade-in">Неверный PIN-код</p>}
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
         <style>{`
            @keyframes shake {
               0%, 100% { transform: translateX(0); }
               25% { transform: translateX(-5px); }
               75% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.3s ease-in-out; }
         `}</style>
      </div>
    );
  }

  // --- Main Render (Authenticated) ---

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      
      {/* Scanning Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-fade-in">
           {/* Mock Camera Viewfinder */}
           <div className="relative w-72 h-72 rounded-2xl overflow-hidden bg-gray-900 shadow-2xl ring-4 ring-white/10">
              <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-purple-500 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-purple-500 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-purple-500 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-purple-500 rounded-br-xl"></div>
              <div className="absolute left-0 w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-[scan_2s_ease-in-out_infinite]" style={{ top: '50%' }}></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30">
                 <QrCode size={64} className="text-white mb-2" />
                 <span className="text-white text-xs tracking-widest font-mono">SCANNING</span>
              </div>
           </div>
           <p className="text-white mt-8 text-lg font-medium tracking-wide">Наведите камеру на QR-код</p>
           <button onClick={() => setIsScanning(false)} className="mt-10 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium backdrop-blur-md transition-all border border-white/10">Отмена</button>
           <style>{`@keyframes scan { 0% { top: 10%; opacity: 0; } 25% { opacity: 1; } 50% { top: 90%; opacity: 1; } 75% { opacity: 1; } 100% { top: 10%; opacity: 0; } }`}</style>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-20 bg-[#1e293b] flex flex-col items-center py-6 z-30 flex-shrink-0">
         <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mb-8 shadow-lg shadow-purple-900/30 cursor-pointer" onClick={() => handleSwitchView('main')}>L</div>
         <div className="flex-1 flex flex-col items-center space-y-4 w-full">
            <button onClick={() => handleSwitchView('main')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${activeView === 'main' ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'}`}><Search size={20} /></button>
            <button onClick={() => handleSwitchView('history')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${activeView === 'history' ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'}`}><History size={20} /></button>
            <button onClick={() => handleSwitchView('return')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${activeView === 'return' ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'}`}><RotateCcw size={20} /></button>
            <button onClick={() => handleSwitchView('rating')} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm ${activeView === 'rating' ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'}`}><Award size={20} /></button>
         </div>
         <div className="mt-auto group relative">
            <button className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors flex items-center justify-center"><LogOut size={20} /></button>
            {/* Logout Menu */}
            <div className="absolute left-full bottom-0 ml-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 hidden group-hover:block p-1 z-50">
               <button onClick={handleChangeUser} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center"><User size={14} className="mr-2"/> Сменить сотрудника</button>
               <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center"><LogOut size={14} className="mr-2"/> Закрыть смену</button>
            </div>
         </div>
      </aside>

      {/* CENTER */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]">
         
         <header className="h-16 px-6 flex items-center justify-between bg-white border-b border-slate-200">
            <div>
               <h1 className="font-bold text-slate-800 text-lg leading-tight">
                  {activeView === 'main' ? 'Терминал лояльности' : activeView === 'history' ? 'История операций' : activeView === 'return' ? 'Оформление возврата' : 'Рейтинг сотрудников'}
               </h1>
               <div className="flex items-center text-xs text-slate-500 mt-0.5 font-medium">
                  <Store size={12} className="mr-1 text-purple-600" />
                  <span>{currentUser?.outlet}</span>
               </div>
            </div>
            <div className="flex items-center space-x-6">
               <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 font-mono">{currentTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-xs text-slate-500">{currentTime.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>
               </div>
               <div className="flex items-center space-x-3 pl-6 border-l border-slate-200">
                  <div className="w-9 h-9 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-600 font-bold text-xs">{currentUser?.avatar}</div>
                  <div className="text-left hidden lg:block">
                     <div className="text-sm font-bold text-slate-900">{currentUser?.name}</div>
                     <div className="text-xs text-slate-500">{currentUser?.role}</div>
                  </div>
               </div>
            </div>
         </header>

         {/* --- MAIN CHECKOUT FLOW --- */}
         {activeView === 'main' ? (
            <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100/50">
               <div className="w-full max-w-md">
                  {/* STEP 1: SEARCH */}
                  {checkoutStep === 'search' && (
                     <div className="space-y-4 animate-fade-in">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-32 flex flex-col items-center justify-center relative overflow-hidden focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
                           <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Поиск клиента</label>
                           <input 
                              type="text"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchAction('search'); }}
                              placeholder="Телефон/карта или сканируйте QR"
                              className="w-full bg-transparent border-none text-center text-xl sm:text-2xl font-mono font-medium text-slate-900 tracking-widest outline-none placeholder:text-slate-300 placeholder:font-sans placeholder:text-sm sm:placeholder:text-lg placeholder:font-medium placeholder:tracking-normal focus:placeholder-transparent"
                              autoFocus
                           />
                           <div className={`absolute bottom-0 left-0 h-1.5 bg-purple-600 transition-all duration-300 ease-out ${inputValue ? 'w-full' : 'w-0'}`}></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                           {keys.map((k) => (
                              <button key={k.val} onClick={() => { if (k.val === 'clear') setInputValue(''); else if (k.val === 'back') setInputValue(prev => prev.slice(0, -1)); else if (inputValue.length < 16) setInputValue(prev => prev + k.val); }} className={`h-16 rounded-xl text-xl font-medium transition-all duration-100 active:scale-[0.98] select-none ${k.label === 'C' ? 'bg-[#FFFBEB] text-[#D97706] border border-[#FEF3C7] hover:bg-[#FEF3C7]' : k.type === 'secondary' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:border-purple-300 hover:text-purple-600'}`}>{k.label}</button>
                           ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                           <button onClick={() => handleSearchAction('scan')} className="h-14 bg-[#1e293b] hover:bg-[#334155] text-white rounded-xl font-semibold text-base flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]">
                              <Camera size={20} /><span>Камера</span>
                           </button>
                           <button disabled={!inputValue} onClick={() => handleSearchAction('search')} className="h-14 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-base flex items-center justify-center space-x-2 transition-all shadow-md shadow-purple-200 active:scale-[0.98]">
                              <span>Найти</span><ChevronRight size={20} />
                           </button>
                        </div>
                     </div>
                  )}

                  {/* STEP 2-6: CHECKOUT LOGIC (Same as before but wrapped) */}
                  {checkoutStep !== 'search' && (
                     <div className="animate-fade-in w-full">
                        {/* Headers and specific step renderers can be componentized further, 
                            but keeping inline for this XML update to ensure logic integrity. */}
                        {/* Amount */}
                        {checkoutStep === 'amount' && (
                           <>
                              <ClientHeader />
                              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                                 <div><label className="block text-sm font-medium text-gray-700 mb-2">Сумма покупки</label><div className="relative"><input type="number" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="0" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-4 pr-10 text-xl font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none" autoFocus /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₽</span></div></div>
                                 <div><label className="block text-sm font-medium text-gray-700 mb-2">Номер чека <span className="text-gray-400 font-normal">(необязательно)</span></label><input type="text" value={txCheckId} onChange={(e) => setTxCheckId(e.target.value)} placeholder="#" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-lg text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none" /></div>
                                 <div className="flex gap-3 pt-2"><button onClick={resetCheckout} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">Отмена</button><button onClick={() => { if(parseFloat(txAmount) > 0) setCheckoutStep('mode'); }} disabled={!parseFloat(txAmount)} className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">Далее</button></div>
                              </div>
                           </>
                        )}
                        {/* Mode */}
                        {checkoutStep === 'mode' && (
                           <>
                              <ClientHeader />
                              <div className="grid grid-cols-1 gap-4">
                                 <button onClick={() => { setTxRedeemPoints(''); calculatePrecheck('accrue'); }} className="bg-white p-6 rounded-2xl border-2 border-transparent hover:border-purple-500 shadow-sm hover:shadow-md transition-all group text-left"><div className="flex items-center space-x-3 mb-2"><div className="p-2 bg-green-100 rounded-lg text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors"><Plus size={24} /></div><h3 className="text-lg font-bold text-gray-900">Начислить баллы</h3></div><p className="text-gray-500 text-sm">Клиент копит баллы. Списание не производится.</p></button>
                                 <button onClick={() => setCheckoutStep('redeem')} disabled={!currentClient || currentClient.balance === 0} className="bg-white p-6 rounded-2xl border-2 border-transparent hover:border-orange-500 shadow-sm hover:shadow-md transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"><div className="flex items-center space-x-3 mb-2"><div className="p-2 bg-orange-100 rounded-lg text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors"><Wallet size={24} /></div><h3 className="text-lg font-bold text-gray-900">Списать баллы</h3></div><p className="text-gray-500 text-sm">Оплата части покупки баллами.</p></button>
                              </div>
                              <button onClick={() => setCheckoutStep('amount')} className="w-full mt-4 py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors">Назад</button>
                           </>
                        )}
                        {/* Redeem */}
                        {checkoutStep === 'redeem' && currentClient && (
                           <>
                              <ClientHeader />
                              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
                                 <div><div className="flex justify-between items-center mb-2"><label className="block text-sm font-medium text-gray-700">Списать баллы</label><span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded">Доступно: {Math.min(currentClient.balance, parseFloat(txAmount))}</span></div><div className="relative"><input type="number" value={txRedeemPoints} onChange={(e) => setTxRedeemPoints(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-4 pr-10 text-xl font-bold text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none" autoFocus /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">Б</span></div></div>
                                 <div className="flex gap-2"><button onClick={() => setTxRedeemPoints(Math.min(currentClient.balance, parseFloat(txAmount)).toString())} className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">Максимум</button><button onClick={() => setTxRedeemPoints(Math.floor(Math.min(currentClient.balance, parseFloat(txAmount)) / 2).toString())} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">50%</button></div>
                                 <div className="flex gap-3 pt-2"><button onClick={() => setCheckoutStep('mode')} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">Назад</button><button onClick={() => calculatePrecheck('redeem')} disabled={!txRedeemPoints || parseFloat(txRedeemPoints) <= 0 || parseFloat(txRedeemPoints) > currentClient.balance || parseFloat(txRedeemPoints) > parseFloat(txAmount)} className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">Далее</button></div>
                              </div>
                           </>
                        )}
                        {/* Precheck */}
                        {checkoutStep === 'precheck' && (
                           <>
                              <ClientHeader />
                              <div className="bg-white rounded-2xl border border-purple-100 shadow-lg overflow-hidden">
                                 <div className="bg-purple-600 p-4 text-white text-center"><h3 className="font-bold text-lg">Подтвердите операцию</h3></div>
                                 <div className="p-6 space-y-4">
                                    <div className="flex justify-between items-center text-gray-600"><span>Сумма покупки</span><span className="font-medium">{fmtMoney(parseFloat(txAmount))} ₽</span></div>
                                    {parseInt(txRedeemPoints) > 0 && (<div className="flex justify-between items-center text-orange-600"><span>Списание баллов</span><span className="font-bold">-{txRedeemPoints} Б</span></div>)}
                                    <div className="flex justify-between items-center text-green-600"><span>Начисление баллов</span><span className="font-bold">+{txAccruePoints} Б</span></div>
                                    <div className="border-t border-gray-100 pt-4 mt-2 flex justify-between items-center text-xl font-bold text-gray-900"><span>К ОПЛАТЕ</span><span>{fmtMoney(txFinalAmount)} ₽</span></div>
                                 </div>
                                 <div className="p-4 bg-gray-50 flex gap-3">
                                    <button onClick={() => setCheckoutStep(parseInt(txRedeemPoints) > 0 ? 'redeem' : 'mode')} className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-colors">Назад</button>
                                    <button onClick={() => setCheckoutStep('success')} className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-md flex items-center justify-center space-x-2"><Check size={20} /> <span>Провести</span></button>
                                 </div>
                              </div>
                           </>
                        )}
                        {/* Success */}
                        {checkoutStep === 'success' && (
                           <div className="flex flex-col items-center justify-center h-full">
                              <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl overflow-hidden relative pb-2 mb-6">
                                 <div className="bg-emerald-500 p-6 text-center text-white relative overflow-hidden"><div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-white/30"><Check size={32} strokeWidth={3} /></div><h2 className="text-xl font-bold">Оплата прошла</h2><p className="text-emerald-100 text-sm">{new Date().toLocaleString('ru-RU', {day: 'numeric', month:'long', hour:'2-digit', minute:'2-digit'})}</p></div>
                                 <div className="p-6 bg-white relative z-10"><div className="flex justify-between items-center text-xs text-slate-400 font-medium uppercase tracking-wider mb-6 pb-4 border-b border-dashed border-slate-100"><span>{currentUser?.outlet}</span><span>Кассир: {currentUser?.name.split(' ')[0]}</span></div><div className="space-y-3 mb-6"><div className="flex justify-between items-center text-sm"><span className="text-slate-500">Сумма покупки</span><span className="font-bold text-slate-900">{fmtMoney(parseFloat(txAmount))} ₽</span></div>{parseInt(txRedeemPoints) > 0 && (<div className="flex justify-between items-center text-sm"><span className="text-orange-500 flex items-center"><Coins size={14} className="mr-1"/> Списано баллов</span><span className="font-bold text-orange-500">-{txRedeemPoints}</span></div>)}{txAccruePoints > 0 && (<div className="flex justify-between items-center text-sm"><span className="text-emerald-600 flex items-center"><Gift size={14} className="mr-1"/> Начислено</span><span className="font-bold text-emerald-600">+{txAccruePoints}</span></div>)}</div><div className="bg-slate-50 rounded-xl p-4 border border-slate-100"><div className="flex justify-between items-end"><span className="text-xs font-bold text-slate-400 uppercase mb-1">К ОПЛАТЕ</span><span className="text-3xl font-black text-slate-900 leading-none">{fmtMoney(txFinalAmount)} ₽</span></div></div></div>
                                 <div className="w-full h-3 absolute bottom-0 left-0 bg-white" style={{ maskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)', maskSize: '20px 20px', maskPosition: 'bottom', WebkitMaskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)', WebkitMaskSize: '20px 20px', WebkitMaskPosition: 'bottom' }}></div>
                              </div>
                              <button onClick={resetCheckout} className="w-full max-w-sm py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98] flex items-center justify-center">Закрыть</button>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </main>
         ) : activeView === 'return' ? (
            // ... Return View (simplified for brevity, logic exists) ...
            <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100">
               <div className="w-full max-w-md space-y-6">
                  {!returnTx ? (
                     <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
                        <div className="flex flex-col items-center mb-8"><div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm shadow-red-100"><RotateCcw size={28} /></div><h2 className="text-xl font-bold text-slate-900">Оформление возврата</h2><p className="text-slate-500 text-sm mt-1 text-center">Введите номер чека для поиска транзакции</p></div>
                        <div className="space-y-4"><div className="relative"><input type="text" value={returnSearchInput} onChange={(e) => setReturnSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReturnSearch()} placeholder="№ Чека" className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium rounded-xl px-4 py-3 pl-11 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all outline-none" autoFocus /><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /></div><button onClick={handleReturnSearch} disabled={!returnSearchInput} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"><span>Найти операцию</span></button></div>
                     </div>
                  ) : (
                     <div className="bg-white rounded-2xl shadow-xl shadow-red-900/5 border border-red-100 overflow-hidden animate-fade-in">
                        <div className="bg-red-50 p-6 border-b border-red-100 flex items-center justify-between"><div><h3 className="text-xl font-bold text-red-900">Подтверждение возврата</h3><p className="text-red-700 text-sm mt-1">Проверьте данные перед списанием</p></div><div className="p-3 bg-white rounded-full text-red-600 shadow-sm"><AlertTriangle size={24} /></div></div>
                        <div className="p-6 space-y-6">
                           <div className="grid grid-cols-2 gap-4 text-sm"><div><span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Номер чека</span><div className="font-mono font-medium text-gray-900">{returnTx.checkId}</div></div><div><span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Дата продажи</span><div className="font-medium text-gray-900">{returnTx.date.toLocaleDateString()}</div></div><div className="col-span-2 pt-2 border-t border-gray-100"><span className="block text-gray-500 text-xs uppercase font-semibold mb-1">Клиент</span><div className="font-medium text-gray-900 flex items-center"><User size={16} className="mr-2 text-gray-400" />{returnTx.client}</div></div></div>
                           <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200"><div className="flex justify-between items-center"><span className="text-gray-600 font-medium">Сумма возврата</span><span className="text-lg font-bold text-gray-900">{fmtMoney(returnTx.amount)} ₽</span></div><div className="h-px bg-gray-200"></div>{returnTx.pointsAccrued > 0 && <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Будет списано</span><span className="font-bold text-red-600">-{returnTx.pointsAccrued} Б</span></div>}{returnTx.pointsRedeemed !== 0 && <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Будет возвращено</span><span className="font-bold text-green-600">+{Math.abs(returnTx.pointsRedeemed)} Б</span></div>}</div>
                           <div className="flex space-x-3 pt-2"><button onClick={() => { setReturnTx(null); setReturnSearchInput(''); }} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors">Отмена</button><button onClick={confirmReturn} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-md transition-colors flex items-center justify-center space-x-2"><RotateCcw size={18} /><span>Выполнить возврат</span></button></div>
                        </div>
                     </div>
                  )}
               </div>
            </main>
         ) : activeView === 'rating' ? (
            // ... Rating View ...
            <main className="flex-1 flex flex-col items-center p-6 bg-slate-100/50 overflow-hidden">
               {motivationSettings.isEnabled ? (
                  <div className="w-full max-w-4xl flex flex-col h-full overflow-hidden">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 flex-shrink-0">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between relative overflow-hidden"><div className="absolute top-0 right-0 w-24 h-24 bg-yellow-50 rounded-full -mr-8 -mt-8 z-0"></div><div className="relative z-10"><h3 className="text-sm font-medium text-slate-500">Ваш рейтинг</h3><div className="flex items-baseline mt-2 space-x-2"><span className="text-4xl font-bold text-slate-900">{currentUserRating?.score || 0}</span><span className="text-sm font-medium text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">{currentUserRating?.rank}-е место</span></div><p className="text-xs text-slate-400 mt-2 flex items-center"><Clock size={12} className="mr-1" /> Период: {motivationSettings.period}</p></div><div className="relative z-10 p-3 bg-yellow-100 rounded-full text-yellow-600 shadow-sm"><Trophy size={32} /></div></div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center"><h3 className="text-sm font-medium text-slate-500 mb-3">Правила начисления</h3><div className="space-y-3"><div className="flex justify-between items-center"><div className="flex items-center space-x-2 text-slate-700 text-sm"><UserPlus size={16} className="text-blue-500" /><span>Новый клиент</span></div><span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">+{motivationSettings.pointsNew} очков</span></div><div className="flex justify-between items-center"><div className="flex items-center space-x-2 text-slate-700 text-sm"><User size={16} className="text-purple-500" /><span>Постоянный клиент</span></div><span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">+{motivationSettings.pointsExisting} очков</span></div></div></div>
                     </div>
                     <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden"><div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0"><h3 className="font-bold text-slate-800">Топ сотрудников</h3><div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm"><button onClick={() => setRatingFilter('all')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${ratingFilter === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>Вся сеть</button><button onClick={() => setRatingFilter('my_outlet')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${ratingFilter === 'my_outlet' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>Моя точка</button></div></div><div className="flex-1 overflow-y-auto custom-scrollbar p-2">{filteredLeaderboard.map((user, index) => { const isMe = user.id === currentUser?.id; const currentRank = index + 1; return (<div key={user.id} className={`flex items-center p-3 rounded-xl mb-2 transition-colors ${isMe ? 'bg-purple-50 border border-purple-100' : 'hover:bg-slate-50 border border-transparent'}`}><div className="w-10 flex-shrink-0 flex justify-center">{currentRank === 1 ? <div className="w-8 h-8 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center shadow-sm"><Crown size={16} fill="currentColor" /></div> : currentRank === 2 ? <div className="w-8 h-8 bg-gray-100 text-slate-500 rounded-full flex items-center justify-center shadow-sm font-bold text-sm">2</div> : currentRank === 3 ? <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center shadow-sm font-bold text-sm">3</div> : <span className="text-slate-400 font-medium text-sm">{currentRank}</span>}</div><div className="flex items-center flex-1 ml-4"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs mr-3 ${isMe ? 'bg-purple-600 text-white shadow-md shadow-purple-200' : 'bg-slate-200 text-slate-500'}`}>{user.avatar}</div><div><div className="flex items-center"><span className={`font-bold text-sm ${isMe ? 'text-purple-900' : 'text-slate-900'}`}>{user.name}</span>{isMe && <span className="ml-2 text-[10px] bg-purple-200 text-purple-800 px-1.5 rounded font-bold">Вы</span>}</div><div className="text-xs text-slate-500 flex items-center mt-0.5"><Store size={10} className="mr-1" />{user.outlet}</div></div></div><div className="text-right"><span className={`font-bold text-lg ${isMe ? 'text-purple-700' : 'text-slate-700'}`}>{user.score}</span><span className="text-[10px] text-slate-400 block uppercase font-medium">очков</span></div></div>); })}</div></div>
                  </div>
               ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-md"><div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-6 relative"><Award size={48} className="text-slate-400" /><div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1"><AlertCircle size={24} className="text-slate-400" fill="white" /></div></div><h3 className="text-xl font-bold text-slate-800 mb-2">Рейтинг отключен</h3><p className="text-slate-500 text-sm">Система мотивации персонала в данный момент неактивна.</p></div>
               )}
            </main>
         ) : (
            // Full History
            <main className="flex-1 flex flex-col bg-slate-50/50 p-6 overflow-hidden">
               {/* ... (rest of history view code as is) ... */}
               <div className="max-w-5xl w-full mx-auto h-full flex flex-col">
                  <div className="flex flex-col space-y-4 mb-6 flex-shrink-0">
                     <div className="flex justify-between items-end"><h2 className="text-2xl font-bold text-slate-900">История операций</h2><div className="text-sm text-slate-500">Найдено: <span className="font-bold text-slate-900">{filteredHistory.length}</span></div></div>
                     <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-3"><div className="relative flex-1 w-full lg:w-auto"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="№ Чека или Имя клиента..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" /></div><div className="relative w-full lg:w-40"><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full pl-3 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all text-slate-600" /></div><div className="flex bg-slate-100 p-1 rounded-lg w-full lg:w-auto">{(['all', 'sale', 'return'] as const).map((type) => (<button key={type} onClick={() => setFilterType(type)} className={`flex-1 lg:flex-none px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${filterType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{type === 'all' ? 'Все' : type === 'sale' ? 'Продажа' : 'Возврат'}</button>))}</div><div className="relative w-full lg:w-48"><select value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all text-slate-600 appearance-none cursor-pointer"><option value="all">Все сотрудники</option>{uniqueStaff.map(s => <option key={s} value={s}>{s}</option>)}</select><User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div></div>
                  </div>
                  <div className="flex-1 flex flex-col min-h-0"><div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col"><div className="flex-1 overflow-y-auto custom-scrollbar">{paginatedHistory.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-slate-400"><Search size={48} className="mb-4 opacity-20" /><p>Операции не найдены</p><button onClick={() => { setHistorySearch(''); setFilterType('all'); setFilterDate(''); setFilterStaff('all'); }} className="mt-2 text-purple-600 hover:underline text-sm">Сбросить фильтры</button></div>) : (<div className="divide-y divide-slate-100">{paginatedHistory.map((tx) => { const isReturn = tx.type === 'return'; return (<div key={tx.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors group"><div className="flex items-start sm:items-center w-full sm:w-auto"><div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-4 flex-shrink-0 border ${isReturn ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{isReturn ? <RotateCcw size={18} /> : <Receipt size={18} />}</div><div><div className="flex items-center gap-2"><span className="font-bold text-slate-900 text-base">{fmtMoney(tx.amount)} ₽</span>{isReturn && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Возврат</span>}</div><div className="flex items-center text-xs text-slate-500 mt-1 relative"><button onClick={() => handleCopy(tx.id, tx.checkId)} className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors mr-2 group/copy max-w-[180px]" title="Копировать"><Copy size={10} className="text-slate-400 group-hover/copy:text-slate-600 flex-shrink-0" /><span className="font-mono truncate">{tx.checkId}</span></button><span>{tx.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {tx.date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>{copiedId === tx.id && <span className="absolute -bottom-4 left-0 text-[10px] text-green-600 font-medium bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-green-100 shadow-sm animate-fade-in z-10 pointer-events-none">Скопировано!</span>}</div></div></div><div className="flex flex-col w-full sm:w-1/3 text-left sm:px-4"><div className="flex items-center text-sm font-medium text-slate-900 mb-1"><User size={14} className="mr-2 text-slate-400" /><span className="truncate">{tx.client}</span></div><div className="flex items-center text-xs text-slate-500"><span className="bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate max-w-[150px]">Кассир: {tx.staff}</span></div></div><div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto min-w-[100px] border-t sm:border-0 border-slate-50 pt-2 sm:pt-0">{tx.pointsAccrued !== 0 && <div className={`flex items-center text-sm font-bold ${tx.pointsAccrued > 0 ? 'text-green-600' : 'text-red-500'}`}>{tx.pointsAccrued > 0 ? '+' : ''}{tx.pointsAccrued} Б {tx.pointsAccrued > 0 ? <ArrowUpRight size={14} className="ml-1" /> : <ArrowDownLeft size={14} className="ml-1" />}</div>}{tx.pointsRedeemed !== 0 && <div className={`flex items-center text-sm font-bold ${tx.pointsRedeemed > 0 ? 'text-red-500' : 'text-green-600'}`}>{tx.pointsRedeemed > 0 ? '-' : '+'}{Math.abs(tx.pointsRedeemed)} Б {tx.pointsRedeemed > 0 ? <ArrowDownLeft size={14} className="ml-1" /> : <ArrowUpRight size={14} className="ml-1" />}</div>}{tx.pointsAccrued === 0 && tx.pointsRedeemed === 0 && <span className="text-xs text-slate-400">Без баллов</span>}</div></div>); })}</div>)}</div>{totalPages > 1 && (<div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0"><span className="text-xs text-slate-500">Показано {Math.min((currentPage - 1) * itemsPerPage + 1, filteredHistory.length)} - {Math.min(currentPage * itemsPerPage, filteredHistory.length)} из {filteredHistory.length}</span><div className="flex items-center space-x-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button><span className="text-xs font-medium text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 min-w-[30px] text-center">{currentPage}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button></div></div>)}</div></div></div>
            </main>
         )}
      </div>

      {/* --- RIGHT COLUMN --- */}
      <aside className="w-96 bg-white border-l border-slate-200 flex flex-col z-20 shadow-lg hidden xl:flex">
         <div className="p-6 border-b border-purple-800 bg-gradient-to-br from-purple-600 to-indigo-700 text-white">
            <h3 className="text-xs font-bold text-purple-100 uppercase tracking-wider mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"></span>Смена</h3>
            <div className="grid grid-cols-2 gap-4"><div className="bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm shadow-sm"><div className="flex items-center space-x-1.5 text-purple-200 mb-1"><CreditCard size={12} /><span className="text-[10px] font-bold uppercase">Выручка</span></div><div className="text-lg font-bold text-white">{shiftStats.revenue.toLocaleString()} ₽</div></div><div className="bg-white/10 p-3 rounded-xl border border-white/10 backdrop-blur-sm shadow-sm"><div className="flex items-center space-x-1.5 text-purple-200 mb-1"><Receipt size={12} /><span className="text-[10px] font-bold uppercase">Чеков</span></div><div className="text-lg font-bold text-white">{shiftStats.checks}</div></div></div>
         </div>
         <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10"><h3 className="font-bold text-slate-800 text-sm">Последние</h3><span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">{recentTx.length}</span></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
               {recentTx.map((tx) => (
                  <div key={tx.id} className="group p-3 rounded-xl border border-slate-100 bg-white hover:border-purple-200 hover:shadow-md transition-all cursor-pointer relative"><div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${tx.type === 'return' ? 'bg-red-500' : 'bg-green-500'}`}></div><div className="pl-3"><div className="flex justify-between items-start mb-1"><div className="flex items-center space-x-2"><span className={`text-sm font-bold ${tx.type === 'return' ? 'text-red-600' : 'text-slate-900'}`}>{tx.amount} ₽</span>{tx.type === 'return' && <RotateCcw size={12} className="text-red-500" />}</div><span className="text-xs text-slate-400 font-mono">{tx.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {tx.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div><div className="flex justify-between items-center"><div className="flex items-center text-xs text-slate-500"><User size={12} className="mr-1.5 text-slate-400" /><span className="truncate max-w-[120px]">{tx.client}</span></div><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tx.pointsAccrued > 0 ? 'bg-green-50 text-green-700' : tx.pointsRedeemed > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{tx.pointsAccrued > 0 ? `+${tx.pointsAccrued}` : tx.pointsRedeemed > 0 ? `-${tx.pointsRedeemed}` : '0'} Б</span></div></div></div>
               ))}
            </div>
         </div>
         <div className="p-4 border-t border-slate-200 bg-white"><button onClick={() => handleSwitchView('return')} className="w-full flex items-center justify-center space-x-2 py-3 bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"><RotateCcw size={16} /><span>Оформить возврат</span></button></div>
      </aside>

    </div>
  );
};

export default CashierPanel;