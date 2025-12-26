import React, { useState, useMemo, useRef } from 'react';
import { 
  Scan, 
  LogOut, 
  RotateCcw, 
  History, 
  Trophy, 
  Home, 
  X, 
  ChevronLeft, 
  Wallet, 
  Check, 
  Loader2, 
  Store, 
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  Keyboard, 
  QrCode, 
  Search, 
  User, 
  Zap, 
  Menu, 
  MoreVertical, 
  ArrowRightLeft, 
  Plus,
  CreditCard,
  ChevronRight,
  UserPlus,
  Copy,
  Receipt,
  SlidersHorizontal,
  Calendar,
  Filter,
  AlertTriangle
} from 'lucide-react';

interface CashierPanelMobileProps {
  onExit: () => void;
}

type Tab = 'checkout' | 'history' | 'rating' | 'returns';
type CheckoutMode = 'landing' | 'manual_input' | 'scanning' | 'profile' | 'amount' | 'redeem' | 'precheck' | 'success';

// Updated Data Structure
interface Transaction {
  id: string;
  type: 'sale' | 'return';
  amount: number;
  pointsAccrued: number;
  pointsRedeemed: number;
  date: Date;
  client: string;
  checkId: string;
  cashier: string;
}

const CashierPanelMobile: React.FC<CashierPanelMobileProps> = ({ onExit }) => {
  // Auth State
  const [authStep, setAuthStep] = useState<'app_login' | 'pin' | 'authorized'>('app_login');
  const [appLogin, setAppLogin] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Navigation
  const [activeTab, setActiveTab] = useState<Tab>('checkout');
  
  // Checkout Flow State
  const [mode, setMode] = useState<CheckoutMode>('landing');
  const [inputValue, setInputValue] = useState('');
  const [amountValue, setAmountValue] = useState('');
  const [checkId, setCheckId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txType, setTxType] = useState<'accrue' | 'redeem'>('accrue');
  const [txRedeemPoints, setTxRedeemPoints] = useState('');
  
  // Data State
  const [client, setClient] = useState<{name: string; balance: number; level: string; id: string; avatar: string} | null>(null);
  
  // Return Flow State
  const [returnCheckId, setReturnCheckId] = useState('');
  const [returnTx, setReturnTx] = useState<Transaction | null>(null);
  const [returnSuccess, setReturnSuccess] = useState(false);

  // History & Filter State
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    staff: '',
    amountFrom: '',
    amountTo: ''
  });

  // Modal Drag State
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);

  // Mock Employee Data
  const employee = {
    name: 'Алиса Фриман',
    role: 'Кассир',
    outlet: 'ТЦ Галерея',
    avatar: 'AF'
  };

  // Mock History (Updated Structure)
  const historyData: Transaction[] = [
    { 
      id: '1', 
      type: 'sale', 
      amount: 1250, 
      pointsAccrued: 62, 
      pointsRedeemed: 0,
      date: new Date(Date.now() - 1000 * 60 * 15), // 15 mins ago
      client: 'Александр В.',
      checkId: '4921',
      cashier: 'Алиса Фриман'
    },
    { 
      id: '2', 
      type: 'sale', 
      amount: 450, 
      pointsAccrued: 0,
      pointsRedeemed: 150,
      date: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
      client: 'Елена С.',
      checkId: '4880',
      cashier: 'Алиса Фриман'
    },
    { 
      id: '3', 
      type: 'sale', 
      amount: 3100, 
      pointsAccrued: 155, 
      pointsRedeemed: 500, // Mixed transaction
      date: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
      client: 'Мария И.',
      checkId: '4750',
      cashier: 'Боб Смит'
    },
    { 
      id: '4', 
      type: 'return', 
      amount: 890, 
      pointsAccrued: 0, 
      pointsRedeemed: -44, // Return points to balance
      date: new Date(Date.now() - 1000 * 60 * 60 * 25), 
      client: 'Дмитрий П.',
      checkId: '4602',
      cashier: 'Алиса Фриман'
    },
    { 
      id: '5', 
      type: 'sale', 
      amount: 5200, 
      pointsAccrued: 260, 
      pointsRedeemed: 0,
      date: new Date(Date.now() - 1000 * 60 * 60 * 48), 
      client: 'Виктор К.',
      checkId: '4512',
      cashier: 'Боб Смит'
    },
  ];

  // Derived Data
  const uniqueStaff = Array.from(new Set(historyData.map(t => t.cashier)));

  const purchaseAmount = useMemo(() => Number(amountValue) || 0, [amountValue]);
  const redeemAmount = useMemo(() => Number(txRedeemPoints) || 0, [txRedeemPoints]);
  const accrualRate = 0.05;
  const accruePoints = useMemo(() => Math.floor(purchaseAmount * accrualRate), [purchaseAmount]);
  const redeemableMax = useMemo(() => Math.min(client?.balance || 0, purchaseAmount || 0), [client, purchaseAmount]);
  const payableAmount = useMemo(() => Math.max(purchaseAmount - redeemAmount, 0), [purchaseAmount, redeemAmount]);

  const filteredHistory = useMemo(() => {
    return historyData.filter(tx => {
      // Search
      const searchLower = searchQuery.toLowerCase();
      if (searchQuery && !tx.client.toLowerCase().includes(searchLower) && !tx.checkId.includes(searchLower)) {
        return false;
      }
      
      // Date Filter
      if (filters.dateFrom) {
        const txDate = new Date(tx.date).setHours(0,0,0,0);
        const fromDate = new Date(filters.dateFrom).setHours(0,0,0,0);
        if (txDate < fromDate) return false;
      }
      if (filters.dateTo) {
        const txDate = new Date(tx.date).setHours(0,0,0,0);
        const toDate = new Date(filters.dateTo).setHours(0,0,0,0);
        if (txDate > toDate) return false;
      }

      // Staff Filter
      if (filters.staff && tx.cashier !== filters.staff) return false;

      // Amount Filter
      if (filters.amountFrom && tx.amount < Number(filters.amountFrom)) return false;
      if (filters.amountTo && tx.amount > Number(filters.amountTo)) return false;

      return true;
    });
  }, [historyData, searchQuery, filters]);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // --- Handlers ---

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

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
      setPinError(false);

      if (newPin.length === 4) {
        if (newPin === '1234') {
          setAuthStep('authorized');
          setPin('');
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
    setPinError(false);
  };

  const handleNumpadInput = (key: string, targetSetter: React.Dispatch<React.SetStateAction<string>>, currentVal: string) => {
    if (key === 'backspace') {
      targetSetter(prev => prev.slice(0, -1));
    } else if (key === 'clear') {
      targetSetter('');
    } else {
      if (currentVal.length < 12) {
        targetSetter(prev => prev === '0' ? key : prev + key);
      }
    }
  };

  const startManualInput = () => {
    setInputValue('');
    setMode('manual_input');
  };

  const startScan = () => {
    setMode('scanning');
    setTimeout(() => {
      setClient({
        name: 'Виктория С.',
        balance: 2450,
        level: 'Gold',
        id: '88005553535',
        avatar: 'VS'
      });
      setMode('profile');
    }, 1500);
  };

  const performSearch = () => {
    if (inputValue.length < 3) return;
    setIsProcessing(true);
    setTimeout(() => {
      setClient({
        name: 'Дмитрий П.',
        balance: 890,
        level: 'Silver',
        id: inputValue,
        avatar: 'DP'
      });
      setIsProcessing(false);
      setMode('profile');
    }, 600);
  };

  const startCheckout = (type: 'accrue' | 'redeem' = 'accrue') => {
    setTxType(type);
    setAmountValue('');
    setCheckId('');
    setTxRedeemPoints('');
    setMode('amount');
  };

  const confirmAmount = () => {
    if (!purchaseAmount) return;
    if (txType === 'accrue') {
      setMode('precheck');
    } else {
      setMode('redeem');
    }
  };

  const setRedeemMax = () => {
    setTxRedeemPoints(Math.floor(redeemableMax).toString());
  };

  const confirmRedeem = () => {
    if (!redeemAmount || redeemAmount > redeemableMax) return;
    setMode('precheck');
  };

  const completeTransaction = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setMode('success');
    }, 1000);
  };

  const resetAll = () => {
    setMode('landing');
    setClient(null);
    setInputValue('');
    setAmountValue('');
    setCheckId('');
    setReturnCheckId('');
    setReturnTx(null);
    setReturnSuccess(false);
    setTxRedeemPoints('');
  };

  const handleReturnSearch = () => {
    if (!returnCheckId) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      
      // Attempt to find in mock data
      const found = historyData.find(t => t.checkId === returnCheckId);
      
      if (found) {
        setReturnTx(found);
      } else {
        // Fallback mock if not found in list, for demo
        setReturnTx({
            id: 'mock-return',
            type: 'sale',
            amount: 2500,
            pointsAccrued: 125,
            pointsRedeemed: 0,
            date: new Date(),
            client: 'Иван И.',
            checkId: returnCheckId,
            cashier: 'Алиса Фриман'
        });
      }
    }, 600);
  };

  const confirmReturn = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setReturnTx(null);
      setReturnSuccess(true);
      setReturnCheckId('');
    }, 1000);
  };

  const closeModal = () => {
    setSelectedTx(null);
    setIsCopied(false);
    setDragY(0); // Reset drag
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      staff: '',
      amountFrom: '',
      amountTo: ''
    });
  };

  // --- Modal Drag Handlers ---
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - dragStartY.current;
    
    // Only allow dragging down
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragY > 120) { // Threshold to dismiss
      closeModal();
    } else {
      setDragY(0); // Snap back
    }
  };

  // --- Components ---

  const Header = () => (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">
          {employee.avatar}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 leading-none">{employee.name}</span>
          <span className="text-[10px] text-gray-500">{employee.outlet}</span>
        </div>
      </div>
      <button onClick={onExit} className="text-gray-400 hover:text-red-500 transition-colors">
        <LogOut size={20} />
      </button>
    </div>
  );

  const BottomNav = () => (
    <div className="h-16 bg-white border-t border-gray-200 grid grid-cols-4 pb-safe z-30 relative">
      {[
        { id: 'checkout', icon: Home, label: 'Касса' },
        { id: 'history', icon: History, label: 'История' },
        { id: 'rating', icon: Trophy, label: 'Рейтинг' },
        { id: 'returns', icon: RotateCcw, label: 'Возврат' },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => { setActiveTab(tab.id as Tab); resetAll(); setSelectedTx(null); }}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === tab.id 
              ? 'text-purple-600' 
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const DialerNumpad = ({ onInput, onConfirm, confirmLabel, disabled = false, showConfirm = true }: any) => (
    <div className="w-full flex-1 flex flex-col justify-end pb-6 [@media(max-height:700px)]:flex-none [@media(max-height:700px)]:pb-3 [@media(max-height:600px)]:pb-2">
      <div className="grid grid-cols-3 gap-y-6 gap-x-8 px-8 mb-6 [@media(max-height:700px)]:gap-y-3 [@media(max-height:700px)]:gap-x-5 [@media(max-height:700px)]:px-5 [@media(max-height:700px)]:mb-3 [@media(max-height:600px)]:gap-y-2 [@media(max-height:600px)]:gap-x-4 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:mb-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button
            key={num}
            onClick={() => onInput(num.toString())}
            className="text-3xl font-light text-gray-900 active:text-purple-600 transition-colors h-16 flex items-center justify-center rounded-full active:bg-gray-100 [@media(max-height:700px)]:text-2xl [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:text-xl [@media(max-height:600px)]:h-10"
          >
            {num}
          </button>
        ))}
        <button onClick={() => onInput('clear')} className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center justify-center h-16 active:bg-gray-100 rounded-full [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10">Сброс</button>
        <button onClick={() => onInput('0')} className="text-3xl font-light text-gray-900 active:text-purple-600 transition-colors h-16 flex items-center justify-center rounded-full active:bg-gray-100 [@media(max-height:700px)]:text-2xl [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:text-xl [@media(max-height:600px)]:h-10">0</button>
        <button onClick={() => onInput('backspace')} className="flex items-center justify-center h-16 text-gray-400 active:text-gray-600 active:bg-gray-100 rounded-full [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10">
          <ChevronLeft size={32} />
        </button>
      </div>
      {showConfirm && (
        <div className="px-6 [@media(max-height:700px)]:px-4 [@media(max-height:600px)]:px-3">
          <button 
            onClick={onConfirm}
            disabled={disabled || isProcessing}
            className="w-full h-14 bg-purple-600 text-white rounded-xl text-base font-semibold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none [@media(max-height:700px)]:h-11 [@media(max-height:600px)]:h-10 [@media(max-height:600px)]:text-sm"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      )}
    </div>
  );

  // --- Views ---

  const renderCheckout = () => {
    // 1. Landing
    if (mode === 'landing') {
      return (
        <div className="flex-1 flex flex-col bg-gray-50 p-4 space-y-4 animate-in fade-in">
          {/* Shift Stats Card */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Текущая смена</h2>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-bold text-gray-900">42 500 ₽</span>
                <span className="text-sm text-gray-500 ml-2">выручка</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">24</div>
                <div className="text-xs text-gray-500">чека</div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-4">
            <button 
              onClick={startScan}
              className="flex-1 bg-purple-600 text-white rounded-2xl p-6 shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 group"
            >
              <div className="bg-white/20 p-4 rounded-full group-hover:bg-white/30 transition-colors">
                <QrCode size={32} />
              </div>
              <div className="text-center">
                <span className="block text-xl font-bold">Сканировать QR</span>
                <span className="text-sm text-purple-100 opacity-80">Камера устройства</span>
              </div>
            </button>

            <button 
              onClick={startManualInput}
              className="flex-1 bg-white text-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 group"
            >
              <div className="bg-gray-100 p-4 rounded-full text-gray-600 group-hover:bg-gray-200 transition-colors">
                <Keyboard size={32} />
              </div>
              <div className="text-center">
                <span className="block text-xl font-bold">Ввести номер</span>
                <span className="text-sm text-gray-500">Телефон или карта</span>
              </div>
            </button>
          </div>
        </div>
      );
    }

    // 2. Manual Input
    if (mode === 'manual_input') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMode('landing')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="mx-auto font-semibold text-gray-900 [@media(max-height:600px)]:text-sm">Поиск клиента</span>
            <div className="w-8"></div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center">
              <span className={`text-4xl font-mono tracking-wider [@media(max-height:700px)]:text-3xl [@media(max-height:600px)]:text-2xl ${inputValue ? 'text-gray-900' : 'text-gray-300'}`}>
                {inputValue || '000 000 000'}
              </span>
            </div>
            <DialerNumpad 
              onInput={(key: string) => handleNumpadInput(key, setInputValue, inputValue)} 
              onConfirm={performSearch}
              confirmLabel="Найти"
              disabled={inputValue.length < 3}
            />
          </div>
        </div>
      );
    }

    // 3. Scanning
    if (mode === 'scanning') {
      return (
        <div className="flex-1 bg-black relative flex flex-col items-center justify-center">
          <button onClick={() => setMode('landing')} className="absolute top-6 right-6 p-2 bg-white/20 rounded-full text-white">
            <X size={24} />
          </button>
          <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500 animate-[scan-mobile_2s_ease-in-out_infinite]"></div>
          </div>
          <p className="text-white mt-8 font-medium">Наведите камеру на код</p>
          <style>{`@keyframes scan-mobile { 0% { top: 0; } 100% { top: 100%; } }`}</style>
        </div>
      );
    }

    // 4. Profile
    if (mode === 'profile' && client) {
      return (
        <div className="flex-1 flex flex-col bg-gray-50 animate-in slide-in-from-right">
          <div className="bg-white p-6 border-b border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <button onClick={() => setMode('landing')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
              <div className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-bold uppercase tracking-wide border border-purple-100">
                {client.level}
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
              <p className="text-gray-500 text-sm mt-1">{client.id}</p>
              <div className="mt-6 inline-flex items-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-2xl font-bold text-gray-900 mr-2">{client.balance}</span>
                <span className="text-sm text-gray-500">баллов</span>
              </div>
            </div>
          </div>

          <div className="p-4 grid gap-4 mt-2">
            <button 
              onClick={() => startCheckout('accrue')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                  <Plus size={26} />
                </div>
                <div className="text-left">
                  <span className="block text-lg font-bold text-gray-900">Начислить</span>
                  <span className="text-sm text-gray-500">Обычная покупка</span>
                </div>
              </div>
              <ChevronRight className="text-gray-300" />
            </button>

            <button 
              onClick={() => startCheckout('redeem')}
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                  <Wallet size={26} />
                </div>
                <div className="text-left">
                  <span className="block text-lg font-bold text-gray-900">Списать</span>
                  <span className="text-sm text-gray-500">Оплата баллами</span>
                </div>
              </div>
              <ChevronRight className="text-gray-300" />
            </button>
          </div>
        </div>
      );
    }

    // 5. Amount
    if (mode === 'amount') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMode('profile')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-gray-600 [@media(max-height:600px)]:text-xs">
              Сумма покупки
            </span>
            <div className="w-8"></div>
          </div>
          
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-6 [@media(max-height:700px)]:px-5 [@media(max-height:600px)]:px-4">
              <div className="text-5xl font-semibold text-gray-900 flex items-baseline [@media(max-height:700px)]:text-4xl [@media(max-height:600px)]:text-3xl">
                {amountValue || '0'}
                <span className="text-2xl text-gray-300 ml-2 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">₽</span>
              </div>
              <div className="w-full max-w-sm mt-8 [@media(max-height:700px)]:mt-5 [@media(max-height:600px)]:mt-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 [@media(max-height:600px)]:mb-1">
                  Номер чека (опционально)
                </label>
                <input 
                  type="text" 
                  value={checkId}
                  onChange={(e) => setCheckId(e.target.value)}
                  placeholder="12345"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 focus:ring-2 focus:ring-purple-500 focus:bg-white outline-none transition-all [@media(max-height:700px)]:py-2 [@media(max-height:600px)]:py-1.5 [@media(max-height:600px)]:text-sm"
                />
              </div>
            </div>
            <DialerNumpad 
              onInput={(key: string) => handleNumpadInput(key, setAmountValue, amountValue)} 
              onConfirm={confirmAmount}
              confirmLabel="Далее"
              disabled={!purchaseAmount}
            />
          </div>
        </div>
      );
    }

    // 6. Redeem input
    if (mode === 'redeem') {
      return (
        <div className="flex-1 flex flex-col bg-white h-full">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setMode('amount')} className="p-2 -ml-2 text-gray-500 [@media(max-height:600px)]:p-1.5">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-orange-600 [@media(max-height:600px)]:text-xs">
              Сколько списать?
            </span>
            <div className="w-8"></div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 [@media(max-height:700px)]:px-5 [@media(max-height:700px)]:gap-3 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:gap-2">
              <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3 [@media(max-height:700px)]:p-3 [@media(max-height:700px)]:space-y-2 [@media(max-height:600px)]:p-2 [@media(max-height:600px)]:space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">Сумма покупки</div>
                  <div className="text-lg font-bold text-gray-900 [@media(max-height:700px)]:text-base [@media(max-height:600px)]:text-sm">{purchaseAmount} ₽</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">Доступно</div>
                  <div className="text-sm font-semibold text-orange-700 [@media(max-height:700px)]:text-xs">{redeemableMax} Б</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-500 font-semibold">К списанию</div>
                  <div className="flex items-baseline text-4xl font-bold text-gray-900 [@media(max-height:700px)]:text-3xl [@media(max-height:600px)]:text-2xl">
                    {txRedeemPoints || '0'}
                    <span className="text-base text-gray-400 ml-1 [@media(max-height:700px)]:text-sm [@media(max-height:600px)]:text-xs">Б</span>
                  </div>
                </div>
                <button 
                  onClick={setRedeemMax}
                  className="w-full px-4 py-3 bg-orange-50 text-orange-700 rounded-lg text-sm font-semibold active:scale-[0.99] transition-all border border-orange-100 [@media(max-height:700px)]:py-2 [@media(max-height:700px)]:text-xs [@media(max-height:600px)]:py-1.5"
                >
                  Списать максимум
                </button>
              </div>
              {redeemAmount > redeemableMax && (
                <div className="text-xs text-red-500">Недостаточно баллов или превышение суммы покупки</div>
              )}
            </div>
            <DialerNumpad 
              onInput={(key: string) => handleNumpadInput(key, setTxRedeemPoints, txRedeemPoints)} 
              onConfirm={confirmRedeem}
              confirmLabel="Далее"
              disabled={!redeemAmount || redeemAmount > redeemableMax}
            />
          </div>
        </div>
      );
    }

    // 8. Precheck
    if (mode === 'precheck') {
      return (
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex items-center p-4 border-b border-gray-100 justify-between">
            <button onClick={() => setMode(txType === 'accrue' ? 'amount' : 'redeem')} className="p-2 -ml-2 text-gray-500">
              <ChevronLeft size={24} />
            </button>
            <span className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Подтверждение
            </span>
            <div className="w-8"></div>
          </div>

          <div className="p-4 space-y-3">
            <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden">
              <div className={`p-4 ${txType === 'accrue' ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
                <h3 className="font-bold text-lg text-center">{txType === 'accrue' ? 'Начисление' : 'Списание баллов'}</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between text-gray-600">
                  <span>Сумма покупки</span>
                  <span className="font-semibold text-gray-900">{purchaseAmount} ₽</span>
                </div>
                {txType === 'redeem' && (
                  <div className="flex justify-between text-orange-600">
                    <span>Списание баллов</span>
                    <span className="font-bold">-{redeemAmount} Б</span>
                  </div>
                )}
                {txType === 'accrue' && (
                  <div className="flex justify-between text-green-600">
                    <span>Начисление баллов</span>
                    <span className="font-bold">+{accruePoints} Б</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-900">
                  <span className="font-semibold">К ОПЛАТЕ</span>
                  <span className="font-bold text-xl">{payableAmount} ₽</span>
                </div>

                {txType === 'redeem' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-left">
                      <h4 className="font-bold text-amber-900 text-sm">Примените скидку на кассе!</h4>
                      <p className="text-amber-800 text-xs mt-1 leading-snug">
                        Не забудьте уменьшить сумму чека на <strong>{redeemAmount} ₽</strong> в вашей POS-системе перед оплатой.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={completeTransaction}
              disabled={isProcessing}
              className="w-full h-14 bg-purple-600 text-white rounded-xl text-base font-semibold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : 'Провести операцию'}
            </button>
          </div>
        </div>
      );
    }

    // 9. Success
    if (mode === 'success') {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-white p-6 min-h-0 overflow-y-auto [@media(max-height:700px)]:justify-start [@media(max-height:700px)]:py-4 [@media(max-height:700px)]:px-4 [@media(max-height:600px)]:py-3 [@media(max-height:600px)]:px-3">
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl overflow-hidden relative mb-6 pb-2 [@media(max-height:700px)]:mb-4 [@media(max-height:700px)]:pb-1 [@media(max-height:600px)]:mb-3">
            <div className="bg-emerald-500 p-6 text-center text-white relative overflow-hidden [@media(max-height:700px)]:p-5 [@media(max-height:600px)]:p-4">
              <div className="absolute top-0 left-0 w-full h-full opacity-10" 
                   style={{backgroundImage: 'radial-gradient(circle, white 2px, transparent 2.5px)', backgroundSize: '10px 10px'}}>
              </div>
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-white/30 [@media(max-height:700px)]:w-12 [@media(max-height:700px)]:h-12 [@media(max-height:700px)]:mb-2 [@media(max-height:600px)]:w-10 [@media(max-height:600px)]:h-10">
                <Check size={32} strokeWidth={3} />
              </div>
              <h2 className="text-xl font-bold [@media(max-height:700px)]:text-lg [@media(max-height:600px)]:text-base">Оплата прошла</h2>
              <p className="text-emerald-100 text-sm [@media(max-height:700px)]:text-xs">{new Date().toLocaleString('ru-RU', {day: 'numeric', month:'long', hour:'2-digit', minute:'2-digit'})}</p>
            </div>

            <div className="p-6 bg-white relative z-10 space-y-5 [@media(max-height:700px)]:p-5 [@media(max-height:700px)]:space-y-4 [@media(max-height:600px)]:p-4 [@media(max-height:600px)]:space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-400 font-medium uppercase tracking-wider pb-4 border-b border-dashed border-slate-100 [@media(max-height:700px)]:pb-3 [@media(max-height:600px)]:text-[10px] [@media(max-height:600px)]:pb-2">
                <span>{employee.outlet}</span>
                <span>Кассир: {employee.name.split(' ')[0]}</span>
              </div>

              {client?.name && (
                <div className="flex justify-between items-center text-xs text-slate-500 [@media(max-height:600px)]:text-[10px]">
                  <span className="font-medium">Клиент</span>
                  <span className="font-semibold text-slate-900">{client.name}</span>
                </div>
              )}

              <div className="space-y-3 [@media(max-height:700px)]:space-y-2">
                <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                  <span className="text-slate-500">Сумма покупки</span>
                  <span className="font-bold text-slate-900">{purchaseAmount.toLocaleString('ru-RU')} ₽</span>
                </div>
                {redeemAmount > 0 && (
                  <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                    <span className="text-orange-500 flex items-center gap-1"><Wallet size={14} /> Списано баллов</span>
                    <span className="font-bold text-orange-500">-{redeemAmount}</span>
                  </div>
                )}
                {accruePoints > 0 && (
                  <div className="flex justify-between items-center text-sm [@media(max-height:700px)]:text-xs">
                    <span className="text-emerald-600 flex items-center gap-1"><Plus size={14} /> Начислено</span>
                    <span className="font-bold text-emerald-600">+{accruePoints}</span>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-400 uppercase mb-1 [@media(max-height:600px)]:text-[10px]">К ОПЛАТЕ</span>
                  <span className="text-3xl font-black text-slate-900 leading-none [@media(max-height:700px)]:text-2xl [@media(max-height:600px)]:text-xl">{payableAmount.toLocaleString('ru-RU')} ₽</span>
                </div>
              </div>
            </div>

            <div 
              className="w-full h-3 absolute bottom-0 left-0 bg-white [@media(max-height:600px)]:h-2"
              style={{
                maskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                maskSize: '20px 20px',
                maskPosition: 'bottom',
                WebkitMaskImage: 'radial-gradient(circle at 10px 10px, transparent 10px, black 10px)',
                WebkitMaskSize: '20px 20px',
                WebkitMaskPosition: 'bottom'
              }}
            ></div>
          </div>

          <button onClick={resetAll} className="w-full max-w-sm h-14 bg-gray-900 text-white rounded-xl font-semibold shadow-md [@media(max-height:700px)]:h-12 [@media(max-height:600px)]:h-10 [@media(max-height:600px)]:text-sm">Закрыть</button>
        </div>
      );
    }
    return null;
  };

  const renderHistory = () => (
    <div className="flex-1 bg-gray-50 flex flex-col relative">
      {/* Search & Filter Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm flex items-center gap-2">
        <div className="relative flex-1">
           <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
           <input 
             type="text" 
             placeholder="Чек или клиент..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="w-full h-10 pl-9 pr-4 rounded-lg bg-gray-100 border-none text-sm focus:ring-2 focus:ring-purple-500 outline-none"
           />
        </div>
        <button 
           onClick={() => setIsFilterOpen(true)}
           className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${activeFilterCount > 0 ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}
        >
           <SlidersHorizontal size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <div className="divide-y divide-gray-100">
          {filteredHistory.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Search size={32} className="mb-2 opacity-50" />
                <p className="text-sm">Ничего не найдено</p>
             </div>
          ) : (
             filteredHistory.map(tx => (
                <div 
                  key={tx.id} 
                  onClick={() => setSelectedTx(tx)}
                  className="p-4 flex justify-between items-center active:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                        tx.type === 'return' ? 'bg-red-50 text-red-600' : 
                        tx.pointsRedeemed > 0 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                    }`}>
                        {tx.type === 'return' ? <RotateCcw size={18} /> : tx.pointsRedeemed > 0 ? <Wallet size={18} /> : <Plus size={18} />}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="font-medium text-gray-900 truncate text-sm">{tx.client}</span>
                        <span className="text-xs text-gray-500 flex items-center">
                           {formatDate(tx.date)}
                        </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end flex-shrink-0 ml-2">
                     <span className="font-bold text-gray-900 text-sm">{tx.amount} ₽</span>
                     <div className="flex items-center gap-1">
                        {tx.type === 'return' ? (
                           <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">ВОЗВРАТ</span>
                        ) : (
                           <>
                              {tx.pointsAccrued > 0 && <span className="text-xs font-bold text-green-600">+{tx.pointsAccrued}</span>}
                              {tx.pointsRedeemed > 0 && <span className="text-xs font-bold text-red-500">-{tx.pointsRedeemed}</span>}
                           </>
                        )}
                     </div>
                  </div>
                </div>
             ))
          )}
        </div>
      </div>

      {/* Filter Bottom Sheet */}
      {isFilterOpen && (
         <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setIsFilterOpen(false)}></div>
            <div className="w-full bg-white rounded-t-2xl relative z-10 animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
               <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-lg">Фильтры</h3>
                  <button onClick={() => setIsFilterOpen(false)} className="p-1.5 bg-gray-100 rounded-full">
                     <X size={18} />
                  </button>
               </div>
               
               <div className="p-6 space-y-6 overflow-y-auto">
                  {/* Date Range */}
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Период</label>
                     <div className="flex gap-3">
                        <input 
                           type="date" 
                           value={filters.dateFrom} 
                           onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                           className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <input 
                           type="date" 
                           value={filters.dateTo} 
                           onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                           className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                     </div>
                  </div>

                  {/* Staff */}
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Сотрудник</label>
                     <select 
                        value={filters.staff}
                        onChange={(e) => setFilters({...filters, staff: e.target.value})}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                     >
                        <option value="">Все сотрудники</option>
                        {uniqueStaff.map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                  </div>

                  {/* Amount Range */}
                  <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Сумма чека</label>
                     <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                           <input 
                              type="number" 
                              placeholder="От" 
                              value={filters.amountFrom}
                              onChange={(e) => setFilters({...filters, amountFrom: e.target.value})}
                              className="w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                           />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₽</span>
                        </div>
                        <span className="text-gray-400">-</span>
                        <div className="relative flex-1">
                           <input 
                              type="number" 
                              placeholder="До" 
                              value={filters.amountTo}
                              onChange={(e) => setFilters({...filters, amountTo: e.target.value})}
                              className="w-full border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                           />
                           <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₽</span>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="p-4 border-t border-gray-100 flex gap-3 pb-safe-footer">
                  <button 
                     onClick={clearFilters}
                     className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium"
                  >
                     Сбросить
                  </button>
                  <button 
                     onClick={() => setIsFilterOpen(false)}
                     className="flex-[2] py-3 bg-purple-600 text-white rounded-xl font-bold shadow-sm"
                  >
                     Показать ({filteredHistory.length})
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Details Modal / Bottom Sheet */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
             onClick={closeModal}
           ></div>
           
           {/* Bottom Sheet Content */}
           <div 
             className="w-full bg-white rounded-t-2xl relative z-10 animate-in slide-in-from-bottom duration-300 pb-safe shadow-2xl flex flex-col max-h-[90vh]"
             style={{ transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : 'transform 0.2s' }}
           >
              {/* Swipe Handle & Header Area */}
              <div 
                className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none" 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                 <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
              </div>

              <div className="p-6 pt-2">
                 {/* Modal Header */}
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <h3 className="text-2xl font-bold text-gray-900">{selectedTx.amount} ₽</h3>
                       <p className="text-gray-500 text-sm mt-1">{selectedTx.type === 'return' ? 'Возврат' : 'Продажа'} • {formatDate(selectedTx.date)}</p>
                    </div>
                    <button onClick={closeModal} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                       <X size={20} className="text-gray-500" />
                    </button>
                 </div>

                 {/* Modal Body */}
                 <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                       <div>
                          <span className="text-xs font-bold text-gray-400 uppercase">Чек / ID</span>
                          <div className="text-sm font-mono font-medium text-gray-900 break-all pr-2 mt-1 line-clamp-1">
                             {selectedTx.checkId}
                          </div>
                       </div>
                       <button 
                          onClick={() => handleCopy(selectedTx.checkId)}
                          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isCopied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-500'}`}
                       >
                          {isCopied ? <Check size={18} /> : <Copy size={18} />}
                       </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 border border-gray-100 rounded-xl">
                          <span className="text-xs text-gray-400 block mb-1">Клиент</span>
                          <span className="text-sm font-bold text-gray-900">{selectedTx.client}</span>
                       </div>
                       <div className="p-4 border border-gray-100 rounded-xl">
                          <span className="text-xs text-gray-400 block mb-1">Кассир</span>
                          <span className="text-sm font-bold text-gray-900">{selectedTx.cashier}</span>
                       </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 flex justify-between">
                       <span className="text-sm text-gray-500">Начислено баллов</span>
                       <span className="text-sm font-bold text-green-600">+{selectedTx.pointsAccrued}</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-sm text-gray-500">Списано баллов</span>
                       <span className="text-sm font-bold text-red-500">-{selectedTx.pointsRedeemed}</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );

  const renderRating = () => (
    <div className="flex-1 bg-gray-50 flex flex-col">
      <div className="bg-white p-6 border-b border-gray-200">
        <div className="flex justify-between items-start mb-4">
           <div>
              <h2 className="text-xl font-bold text-gray-900">Мой рейтинг</h2>
              <p className="text-sm text-gray-500 mt-1">Период: Текущий месяц</p>
           </div>
           <div className="text-right">
              <span className="block text-3xl font-bold text-purple-600">1250</span>
              <span className="text-xs text-gray-400 uppercase font-bold">очков</span>
           </div>
        </div>

        {/* Rules Info */}
        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-3 border border-gray-100">
           <div className="flex flex-col items-center text-center">
              <div className="bg-white p-1.5 rounded-lg shadow-sm mb-1">
                 <UserPlus size={16} className="text-blue-500" />
              </div>
              <span className="text-xs text-gray-500">Новый</span>
              <span className="text-sm font-bold text-gray-900">+15 очков</span>
           </div>
           <div className="flex flex-col items-center text-center">
              <div className="bg-white p-1.5 rounded-lg shadow-sm mb-1">
                 <User size={16} className="text-purple-500" />
              </div>
              <span className="text-xs text-gray-500">Повторный</span>
              <span className="text-sm font-bold text-gray-900">+2 очка</span>
           </div>
        </div>

        <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
           <span>Ваше место в рейтинге: <span className="font-bold text-gray-900">1</span></span>
        </div>
      </div>
      
      <div className="p-4">
         <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 px-2">Топ сотрудников</h3>
         <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => (
               <div key={i} className="flex items-center justify-between p-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                     <span className={`font-bold w-6 text-center text-sm ${i===1 ? 'text-yellow-500' : 'text-gray-400'}`}>{i}</span>
                     <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">U{i}</div>
                     <span className="text-sm font-medium text-gray-900">Сотрудник {i}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{1500 - i * 120}</span>
               </div>
            ))}
         </div>
      </div>
    </div>
  );

  const renderReturns = () => (
    <div className="flex-1 bg-gray-50 flex flex-col p-4">
      <h2 className="text-xl font-bold text-gray-900 mb-4 px-2">Оформление возврата</h2>
      
      {!returnTx && !returnSuccess ? (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Номер чека</label>
            <input 
              type="text" 
              value={returnCheckId}
              onChange={(e) => setReturnCheckId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
              placeholder="12345"
            />
          </div>
          
          <button 
            onClick={handleReturnSearch}
            className="w-full h-12 bg-red-600 text-white rounded-lg font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={20} /> : 'Найти чек'}
          </button>
        </div>
      ) : returnTx && !returnSuccess ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in">
           <div className="bg-red-50 p-4 border-b border-red-100 flex items-center justify-between">
              <h3 className="font-bold text-red-900">Подтверждение возврата</h3>
              <div className="p-2 bg-white rounded-full text-red-600 shadow-sm">
                 <AlertTriangle size={20} />
              </div>
           </div>
           
           <div className="p-6 space-y-5">
              <div className="space-y-3 text-sm">
                 <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500">Чек / ID</span>
                    <span className="font-mono font-medium text-gray-900">{returnTx.checkId}</span>
                 </div>
                 <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500">Дата продажи</span>
                    <span className="font-medium text-gray-900">{formatDate(returnTx.date)}</span>
                 </div>
                 <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500">Клиент</span>
                    <span className="font-medium text-gray-900">{returnTx.client}</span>
                 </div>
                 <div className="flex justify-between pt-1">
                    <span className="text-gray-500">Сумма возврата</span>
                    <span className="font-bold text-gray-900 text-lg">{returnTx.amount} ₽</span>
                 </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
                 {returnTx.pointsAccrued > 0 && (
                    <div className="flex justify-between text-sm items-center">
                       <span className="text-gray-600">Будет списано</span>
                       <span className="font-bold text-red-600">-{returnTx.pointsAccrued} Б</span>
                    </div>
                 )}
                 {returnTx.pointsRedeemed > 0 && (
                    <div className="flex justify-between text-sm items-center">
                       <span className="text-gray-600">Будет возвращено</span>
                       <span className="font-bold text-green-600">+{returnTx.pointsRedeemed} Б</span>
                    </div>
                 )}
                 {returnTx.pointsAccrued === 0 && returnTx.pointsRedeemed === 0 && (
                    <span className="text-xs text-gray-400 italic text-center block">Баллы не начислялись и не списывались</span>
                 )}
              </div>

              <div className="flex gap-3 pt-2">
                 <button 
                    onClick={() => { setReturnTx(null); setReturnCheckId(''); }}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                 >
                    Отмена
                 </button>
                 <button 
                    onClick={confirmReturn}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                 >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <span>Подтвердить</span>}
                 </button>
              </div>
           </div>
        </div>
      ) : (
         <div className="bg-green-50 text-green-700 p-6 rounded-xl flex flex-col items-center justify-center text-center border border-green-100 animate-in fade-in">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-green-600">
               <Check size={24} strokeWidth={3} />
            </div>
            <h3 className="font-bold text-lg mb-1">Возврат оформлен</h3>
            <p className="text-sm opacity-90 mb-4">Операция успешно отменена, баллы скорректированы.</p>
            <button 
               onClick={resetAll}
               className="px-6 py-2 bg-white text-green-700 font-bold rounded-lg shadow-sm text-sm border border-green-200"
            >
               Закрыть
            </button>
         </div>
      )}
    </div>
  );

  if (authStep === 'app_login') {
    return (
      <div className="flex-1 flex flex-col justify-center p-6 bg-slate-100 min-h-screen overflow-y-auto [@media(max-height:700px)]:py-4 [@media(max-height:700px)]:px-4 [@media(max-height:600px)]:py-3 [@media(max-height:600px)]:px-3">
         <div className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative">
            <div className="p-8 [@media(max-height:700px)]:p-6 [@media(max-height:600px)]:p-4">
               <div className="flex justify-center mb-6 [@media(max-height:700px)]:mb-4 [@media(max-height:600px)]:mb-3">
                  <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center shadow-md shadow-purple-200 [@media(max-height:700px)]:w-14 [@media(max-height:700px)]:h-14 [@media(max-height:600px)]:w-12 [@media(max-height:600px)]:h-12">
                     <Store size={32} className="text-white" />
                  </div>
               </div>

               <h2 className="text-2xl font-bold text-center text-gray-900 mb-2 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">Терминал</h2>
               <p className="text-center text-gray-500 text-sm mb-8 font-medium [@media(max-height:700px)]:mb-6 [@media(max-height:600px)]:mb-4 [@media(max-height:600px)]:text-xs">Авторизация устройства</p>

               <form onSubmit={handleAppLogin} className="space-y-5 [@media(max-height:700px)]:space-y-4 [@media(max-height:600px)]:space-y-3">
                  <div className="space-y-2 [@media(max-height:600px)]:space-y-1">
                     <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Логин</label>
                     <div className="relative">
                        <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                           type="text"
                           value={appLogin}
                           onChange={(e) => setAppLogin(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 pl-11 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-medium [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2 [@media(max-height:600px)]:text-sm"
                           placeholder="Например: shop_01"
                        />
                     </div>
                  </div>

                  <div className="space-y-2 [@media(max-height:600px)]:space-y-1">
                     <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-wide">Пароль</label>
                     <div className="relative">
                        <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                           type={showPassword ? "text" : "password"}
                           value={appPassword}
                           onChange={(e) => setAppPassword(e.target.value)}
                           className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-12 py-3.5 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-gray-900 font-medium [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2 [@media(max-height:600px)]:text-sm"
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
                     className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg mt-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] [@media(max-height:700px)]:py-3 [@media(max-height:600px)]:py-2.5 [@media(max-height:600px)]:text-sm"
                  >
                     Войти
                  </button>
               </form>
            </div>
            <div className="h-1.5 w-full bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600"></div>
         </div>
      </div>
    );
  }

  if (authStep === 'pin') {
      return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 overflow-y-auto [@media(max-height:700px)]:p-3 [@media(max-height:600px)]:p-2">
            <button onClick={() => setAuthStep('app_login')} className="absolute top-6 left-6 text-gray-500 hover:text-gray-900 flex items-center space-x-2 transition-colors [@media(max-height:700px)]:top-4 [@media(max-height:700px)]:left-4 [@media(max-height:600px)]:top-3 [@media(max-height:600px)]:left-3">
                <ChevronLeft size={20} /> <span className="text-sm [@media(max-height:600px)]:text-xs">Назад</span>
            </button>

            <div className="w-full max-w-sm text-center space-y-8 [@media(max-height:700px)]:space-y-6 [@media(max-height:600px)]:space-y-4">
                <div>
                <div className="w-20 h-20 bg-white rounded-full mx-auto flex items-center justify-center shadow-sm mb-4 [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:mb-3 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:mb-2">
                    <Lock size={32} className="text-purple-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:text-lg">Вход сотрудника</h2>
                <p className="text-gray-500 mt-2 [@media(max-height:600px)]:text-xs">Введите ваш PIN-код</p>
                </div>

                <div className={`flex justify-center space-x-4 mb-8 [@media(max-height:700px)]:space-x-3 [@media(max-height:700px)]:mb-6 [@media(max-height:600px)]:space-x-2 [@media(max-height:600px)]:mb-4 ${pinError ? 'animate-shake' : ''}`}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-4 h-4 rounded-full transition-all duration-200 [@media(max-height:700px)]:w-3 [@media(max-height:700px)]:h-3 ${
                            i < pin.length 
                            ? pinError ? 'bg-red-500 scale-110' : 'bg-purple-600 scale-110' 
                            : 'bg-gray-300'
                        }`}
                    />
                ))}
                </div>

                <div className="grid grid-cols-3 gap-4 [@media(max-height:700px)]:gap-3 [@media(max-height:600px)]:gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                        key={num}
                        onClick={() => handlePinInput(num.toString())}
                        className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:text-lg"
                    >
                        {num}
                    </button>
                ))}
                <div className="w-20 h-20 flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14"></div>
                <button
                    onClick={() => handlePinInput('0')}
                    className="w-20 h-20 bg-white rounded-2xl shadow-sm text-2xl font-medium text-gray-700 hover:bg-gray-50 active:scale-95 transition-all mx-auto flex items-center justify-center [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:text-xl [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14 [@media(max-height:600px)]:text-lg"
                >
                    0
                </button>
                <button
                    onClick={handlePinBackspace}
                    className="w-20 h-20 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-all mx-auto [@media(max-height:700px)]:w-16 [@media(max-height:700px)]:h-16 [@media(max-height:600px)]:w-14 [@media(max-height:600px)]:h-14"
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

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      
      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'checkout' && renderCheckout()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'rating' && renderRating()}
        {activeTab === 'returns' && renderReturns()}
      </div>

      {/* Details Modal / Bottom Sheet */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
             onClick={closeModal}
           ></div>
           
           {/* Bottom Sheet Content */}
           <div 
             className="w-full bg-white rounded-t-2xl relative z-10 animate-in slide-in-from-bottom duration-300 pb-safe shadow-2xl flex flex-col max-h-[90vh]"
             style={{ transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : 'transform 0.2s' }}
           >
              {/* Swipe Handle & Header Area */}
              <div 
                className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none" 
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                 <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
              </div>

              <div className="p-6 pt-2">
                 {/* Modal Header */}
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <h3 className="text-2xl font-bold text-gray-900">{selectedTx.amount} ₽</h3>
                       <p className="text-gray-500 text-sm mt-1">{selectedTx.type === 'return' ? 'Возврат' : 'Продажа'} • {formatDate(selectedTx.date)}</p>
                    </div>
                    <button onClick={closeModal} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                       <X size={20} className="text-gray-500" />
                    </button>
                 </div>

                 {/* Modal Body */}
                 <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                       <div>
                          <span className="text-xs font-bold text-gray-400 uppercase">Чек / ID</span>
                          <div className="text-sm font-mono font-medium text-gray-900 break-all pr-2 mt-1 line-clamp-1">
                             {selectedTx.checkId}
                          </div>
                       </div>
                       <button 
                          onClick={() => handleCopy(selectedTx.checkId)}
                          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isCopied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-500'}`}
                       >
                          {isCopied ? <Check size={18} /> : <Copy size={18} />}
                       </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 border border-gray-100 rounded-xl">
                          <span className="text-xs text-gray-400 block mb-1">Клиент</span>
                          <span className="text-sm font-bold text-gray-900">{selectedTx.client}</span>
                       </div>
                       <div className="p-4 border border-gray-100 rounded-xl">
                          <span className="text-xs text-gray-400 block mb-1">Кассир</span>
                          <span className="text-sm font-bold text-gray-900">{selectedTx.cashier}</span>
                       </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 flex justify-between">
                       <span className="text-sm text-gray-500">Начислено баллов</span>
                       <span className="text-sm font-bold text-green-600">+{selectedTx.pointsAccrued}</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-sm text-gray-500">Списано баллов</span>
                       <span className="text-sm font-bold text-red-500">-{selectedTx.pointsRedeemed}</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />

      <style>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
        .pb-safe-footer { padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); }
        .animate-in { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

    </div>
  );
};

export default CashierPanelMobile;
