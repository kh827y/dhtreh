import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, 
  Filter, 
  Calendar, 
  Store, 
  User, 
  Monitor, 
  Star, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RotateCcw, 
  AlertTriangle, 
  X, 
  Ban, 
  CheckCircle2, 
  FileText,
  ChevronLeft,
  ChevronRight,
  Info,
  ExternalLink,
  ChevronDown,
  Briefcase
} from 'lucide-react';

// --- Types ---

// Strictly defined types from prompt
type TransactionType = 
  | 'purchase' 
  | 'admin_adjustment' // начислено/списано администратором (generic)
  | 'gift'             // подарочные баллы
  | 'refund'           // возврат покупки
  | 'birthday'         // день рождения
  | 'autoreturn'       // автовозврат клиента
  | 'registration'     // регистрация
  | 'referral'         // реферальное начисление
  | 'referral_refund'  // возврат реферала
  | 'expiration'       // сгорание баллов
  | 'promocode'        // промокод
  | 'campaign';        // акция

interface Transaction {
  id: string;
  dateTime: string;
  checkNumber: string;
  outlet: string | null; // Nullable based on type
  source: {
    type: 'staff' | 'device' | 'system';
    name: string;
    id: string; // Added ID for filtering
  };
  rating?: number;
  
  // Financials
  purchaseAmount: number;
  pointsAccrued: number;
  pointsRedeemed: number;
  
  type: TransactionType;
  status: 'active' | 'cancelled';
  clientName: string;
  clientId: string;
}

interface OperationsLogProps {
  onClientClick?: (clientId: string) => void;
}

// --- Constants & Mock Data ---

const staffDirectory = [
  { id: 'st1', name: 'Алиса Фриман', status: 'active' },
  { id: 'st2', name: 'Боб Смит', status: 'active' },
  { id: 'st3', name: 'Иван Райт', status: 'active' },
  { id: 'st4', name: 'Елена Козлова', status: 'fired' }, 
];

const generateMockData = (): Transaction[] => {
  const outlets = ['Центральный магазин', 'ТЦ Сити Молл', 'Киоск Аэропорт', 'Филиал Пригород', 'Онлайн'];
  
  const devices = [
    { id: 'dev1', name: 'Касса №1 (Main)' },
    { id: 'dev2', name: 'Касса №2 (Hall)' },
    { id: 'dev3', name: 'Терминал самообслуживания' },
  ];
  
  const clientNames = [
    'Александр Иванов', 'Мария Петрова', 'Дмитрий Смирнов', 'Елена Кузнецова', 
    'Андрей Соколов', 'Ольга Попова', 'Сергей Лебедев', 'Наталья Козлова', 
    'Иван Новиков', 'Юлия Морозова', 'Максим Волков', 'Анна Васильева',
    'Павел Зайцев', 'Виктория Павлова', 'Артем Семенов', 'Екатерина Голубева',
    'Роман Виноградов', 'Татьяна Богданова', 'Евгений Воробьев', 'Ксения Федорова'
  ];

  const types: TransactionType[] = [
    'purchase', 'purchase', 'purchase', 'purchase',
    'admin_adjustment', 'gift', 'refund', 'birthday', 'autoreturn', 
    'registration', 'referral', 'referral_refund', 'expiration', 'promocode', 'campaign'
  ];

  return Array.from({ length: 80 }).map((_, i) => {
    const type = types[Math.floor(Math.random() * types.length)];
    const isPurchase = type === 'purchase';
    
    // Outlet Logic: Only for specific types
    const needsOutlet = ['purchase', 'refund', 'admin_adjustment'].includes(type);
    const outlet = needsOutlet ? outlets[Math.floor(Math.random() * outlets.length)] : null;

    // Source Logic
    let source: Transaction['source'];
    const sourceTypeRand = Math.random();
    
    if (type === 'autoreturn' || type === 'expiration' || type === 'birthday') {
       source = { type: 'system', name: 'Система', id: 'sys' };
    } else if (sourceTypeRand > 0.7 && isPurchase) {
       const dev = devices[Math.floor(Math.random() * devices.length)];
       source = { type: 'device', name: dev.name, id: dev.id };
    } else {
       const st = staffDirectory[Math.floor(Math.random() * staffDirectory.length)];
       source = { type: 'staff', name: st.name, id: st.id };
    }

    const amount = isPurchase ? Math.floor(Math.random() * 5000) + 150 : 0;
    
    let accrued = 0;
    let redeemed = 0;

    if (type === 'purchase') {
       accrued = Math.floor(amount * 0.05);
       if (Math.random() > 0.8) redeemed = Math.floor(Math.random() * 200);
    } else if (['gift', 'birthday', 'autoreturn', 'registration', 'referral', 'promocode', 'campaign'].includes(type)) {
       accrued = Math.floor(Math.random() * 500) + 100;
    } else if (type === 'expiration') {
       redeemed = Math.floor(Math.random() * 300) + 50;
    } else if (type === 'refund') {
       // Refund: Return points spent (accrual logic for client balance) or remove points earned (redemption logic)
       // Simplified: Returning purchase usually means client gets points back if they spent them.
       accrued = Math.floor(Math.random() * 200); // Returning points to client
    } else if (type === 'referral_refund') {
       redeemed = 300; // Taking back referral bonus
    } else if (type === 'admin_adjustment') {
        if (Math.random() > 0.5) accrued = 100; else redeemed = 100;
    }

    return {
      id: `TX-${10000 + i}`,
      dateTime: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
      checkNumber: isPurchase || type === 'refund' ? `#${Math.floor(Math.random() * 90000) + 10000}` : '-',
      outlet: outlet,
      source: source,
      rating: isPurchase && Math.random() > 0.6 ? Math.floor(Math.random() * 5) + 1 : undefined,
      purchaseAmount: amount,
      pointsAccrued: accrued,
      pointsRedeemed: redeemed,
      type,
      status: ((Math.random() > 0.98 && type === 'purchase') ? 'cancelled' : 'active') as 'active' | 'cancelled',
      clientName: clientNames[Math.floor(Math.random() * clientNames.length)],
      clientId: `100${i % 12 + 1}` // Reuse mock IDs from Clients component
    };
  }).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
};

const OperationsLog: React.FC<OperationsLogProps> = ({ onClientClick }) => {
  // --- State ---
  const [transactions, setTransactions] = useState<Transaction[]>(generateMockData());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filters
  const [searchCheck, setSearchCheck] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<string>('all');
  const [filterOutlet, setFilterOutlet] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [filterStaffStatus, setFilterStaffStatus] = useState<string>('all'); // 'all' | 'active' | 'fired'
  const [filterDevice, setFilterDevice] = useState<string>('all');

  // Modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // --- Derived Data Lists for Selects ---
  const uniqueStaff = useMemo(() => {
      // Filter staff list based on status selector if needed, or just show all who have transactions
      // Here we use the static directory to ensure we show everyone available in filter even if no transactions
      if (filterStaffStatus === 'all') return staffDirectory;
      return staffDirectory.filter(s => s.status === filterStaffStatus);
  }, [filterStaffStatus]);

  const uniqueDevices = useMemo(() => {
      const devMap = new Map();
      transactions.forEach(t => {
          if (t.source.type === 'device') devMap.set(t.source.id, t.source.name);
      });
      return Array.from(devMap.entries());
  }, [transactions]);

  const uniqueOutlets = useMemo(() => {
      const outlets = new Set<string>();
      transactions.forEach(t => {
          if (t.outlet) outlets.add(t.outlet);
      });
      return Array.from(outlets);
  }, [transactions]);

  // --- Filter Logic ---
  const filteredData = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Search Check
      if (searchCheck && !tx.checkNumber.toLowerCase().includes(searchCheck.toLowerCase())) return false;

      // 2. Date Range
      if (dateFrom) {
          const txDate = new Date(tx.dateTime).setHours(0,0,0,0);
          const fromDate = new Date(dateFrom).setHours(0,0,0,0);
          if (txDate < fromDate) return false;
      }
      if (dateTo) {
          const txDate = new Date(tx.dateTime).setHours(0,0,0,0);
          const toDate = new Date(dateTo).setHours(0,0,0,0);
          if (txDate > toDate) return false;
      }

      // 3. Type
      if (filterType !== 'all' && tx.type !== filterType) return false;

      // 4. Direction (New)
      if (filterDirection === 'accrual' && tx.pointsAccrued <= 0) return false;
      if (filterDirection === 'redemption' && tx.pointsRedeemed <= 0) return false;

      // 5. Outlet
      if (filterOutlet !== 'all' && tx.outlet !== filterOutlet) return false;

      // 6. Device
      if (filterDevice !== 'all') {
          if (tx.source.type !== 'device' || tx.source.id !== filterDevice) return false;
      }

      // 7. Staff & Staff Status
      if (filterStaffStatus !== 'all') {
          // If filtering by status, transaction MUST be from staff
          if (tx.source.type !== 'staff') return false;
          const staffMember = staffDirectory.find(s => s.id === tx.source.id);
          if (!staffMember || staffMember.status !== filterStaffStatus) return false;
      }

      if (filterStaff !== 'all') {
          if (tx.source.type !== 'staff' || tx.source.id !== filterStaff) return false;
      }

      return true;
    });
  }, [
      transactions, 
      searchCheck, 
      dateFrom, 
      dateTo, 
      filterType, 
      filterDirection, 
      filterOutlet, 
      filterDevice, 
      filterStaff, 
      filterStaffStatus
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- Helpers ---

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('ru-RU'),
      time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  const getReasonLabel = (type: TransactionType) => {
    switch (type) {
      case 'purchase': return 'Покупка';
      case 'admin_adjustment': return 'Администратор';
      case 'gift': return 'Подарочные баллы';
      case 'refund': return 'Возврат покупки';
      case 'birthday': return 'День рождения';
      case 'autoreturn': return 'Автовозврат клиента';
      case 'registration': return 'Регистрация';
      case 'referral': return 'Реферальное начисление';
      case 'referral_refund': return 'Возврат реферала';
      case 'expiration': return 'Сгорание баллов';
      case 'promocode': return 'Промокод';
      case 'campaign': return 'Акция';
      default: return type;
    }
  };

  const renderStars = (rating: number) => {
      return (
          <div className="flex space-x-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    size={12} 
                    className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} 
                  />
              ))}
          </div>
      );
  };

  const handleCancelOperation = (tx: Transaction) => {
    if (tx.status === 'cancelled') return;
    if (tx.type === 'refund' || tx.type === 'referral_refund') {
        alert('Возврат нельзя отменить. Создайте новую операцию.');
        return;
    }

    if (confirm(`Вы уверены, что хотите отменить операцию ${tx.id}?`)) {
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, status: 'cancelled' } : t));
        setSelectedTx(prev => prev ? { ...prev, status: 'cancelled' } : null);
    }
  };

  // --- Render ---

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Журнал операций</h2>
        <p className="text-gray-500 mt-1">История всех транзакций, начислений и списаний баллов.</p>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200/60 shadow-sm space-y-5">
         
         {/* Top Row: Search & Date & Reset */}
         <div className="flex flex-col xl:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
               <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input 
                  type="text"
                  placeholder="Поиск по номеру чека..."
                  value={searchCheck}
                  onChange={(e) => setSearchCheck(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-purple-500 rounded-xl text-sm font-medium transition-all outline-none"
               />
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
               <div className="relative">
                  <input 
                     type="date" 
                     value={dateFrom} 
                     onChange={(e) => setDateFrom(e.target.value)} 
                     className="pl-3 pr-2 py-1.5 bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
                  />
               </div>
               <span className="text-gray-300">|</span>
               <div className="relative">
                  <input 
                     type="date" 
                     value={dateTo} 
                     onChange={(e) => setDateTo(e.target.value)} 
                     className="pl-2 pr-3 py-1.5 bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
                  />
               </div>
            </div>

            {/* Reset */}
            <button 
               onClick={() => { 
                  setSearchCheck(''); 
                  setDateFrom(''); 
                  setDateTo('');
                  setFilterType('all');
                  setFilterDirection('all');
                  setFilterOutlet('all');
                  setFilterStaff('all');
                  setFilterStaffStatus('all');
                  setFilterDevice('all');
               }} 
               className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
            >
               <X size={16} />
               <span>Сбросить</span>
            </button>
         </div>

         {/* Bottom Row: Selects */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. Type */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Filter size={16} />
               </div>
               <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
               >
                  <option value="all">Все типы операций</option>
                  <option value="purchase">Покупка</option>
                  <option value="refund">Возврат покупки</option>
                  <option value="admin_adjustment">Администратор</option>
                  <option value="gift">Подарочные баллы</option>
                  <option value="birthday">День рождения</option>
                  <option value="autoreturn">Автовозврат</option>
                  <option value="registration">Регистрация</option>
                  <option value="referral">Реферальное начисление</option>
                  <option value="referral_refund">Возврат реферала</option>
                  <option value="expiration">Сгорание баллов</option>
                  <option value="promocode">Промокод</option>
                  <option value="campaign">Акция</option>
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* 2. Direction (New) */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <ArrowUpRight size={16} />
               </div>
               <select 
                  value={filterDirection}
                  onChange={(e) => setFilterDirection(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
               >
                  <option value="all">Начисления и списания</option>
                  <option value="accrual">Только начисления</option>
                  <option value="redemption">Только списания</option>
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* 3. Outlet */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Store size={16} />
               </div>
               <select 
                  value={filterOutlet}
                  onChange={(e) => setFilterOutlet(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
               >
                  <option value="all">Все торговые точки</option>
                  {uniqueOutlets.map((outlet) => (
                      <option key={outlet} value={outlet}>{outlet}</option>
                  ))}
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* 4. Staff Status (New) */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Briefcase size={16} />
               </div>
               <select 
                  value={filterStaffStatus}
                  onChange={(e) => { setFilterStaffStatus(e.target.value); setFilterStaff('all'); setFilterDevice('all'); }}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
               >
                  <option value="all">Текущие и уволенные</option>
                  <option value="active">Только текущие</option>
                  <option value="fired">Только уволенные</option>
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* 5. Staff Name */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <User size={16} />
               </div>
               <select 
                  value={filterStaff}
                  onChange={(e) => { setFilterStaff(e.target.value); setFilterDevice('all'); }}
                  disabled={filterDevice !== 'all'}
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all disabled:bg-gray-50 disabled:opacity-60"
               >
                  <option value="all">Все сотрудники</option>
                  {uniqueStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.status === 'fired' ? '(Уволен)' : ''}</option>
                  ))}
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* 6. Device */}
            <div className="relative">
               <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Monitor size={16} />
               </div>
               <select 
                  value={filterDevice}
                  onChange={(e) => { setFilterDevice(e.target.value); setFilterStaff('all'); }}
                  disabled={filterStaff !== 'all' || filterStaffStatus !== 'all'} // Device can't be staff status filtered
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all disabled:bg-gray-50 disabled:opacity-60"
               >
                  <option value="all">Все устройства</option>
                  {uniqueDevices.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                  ))}
               </select>
               <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
         </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold w-32">Дата / Время</th>
                     <th className="px-6 py-4 font-semibold">Клиент</th>
                     <th className="px-6 py-4 font-semibold">Основание</th>
                     <th className="px-6 py-4 font-semibold text-right">Баллы</th>
                     <th className="px-6 py-4 font-semibold">Торговая точка</th>
                     <th className="px-6 py-4 font-semibold">Источник</th>
                     <th className="px-6 py-4 font-semibold text-center w-24">Оценка</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {paginatedData.length === 0 ? (
                     <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                           <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                           <p>Операции не найдены.</p>
                        </td>
                     </tr>
                  ) : (
                     paginatedData.map((tx) => {
                        const { date, time } = formatDate(tx.dateTime);
                        const isCancelled = tx.status === 'cancelled';
                        const isSystem = tx.source.type === 'system';
                        
                        return (
                           <tr 
                              key={tx.id} 
                              onClick={() => setSelectedTx(tx)}
                              className={`hover:bg-gray-50 transition-colors cursor-pointer group ${isCancelled ? 'bg-gray-50/50 opacity-60 grayscale' : ''}`}
                           >
                              {/* Date */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                 <div className="font-medium text-gray-900">{date}</div>
                                 <div className="text-xs text-gray-500">{time}</div>
                              </td>

                              {/* Client (Clickable) */}
                              <td className="px-6 py-4">
                                 <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onClientClick) onClientClick(tx.clientId);
                                    }}
                                    className="font-medium text-purple-600 hover:text-purple-800 hover:underline flex items-center"
                                 >
                                    {tx.clientName}
                                    <ExternalLink size={10} className="ml-1 opacity-50" />
                                 </button>
                              </td>

                              {/* Reason & Amount */}
                              <td className="px-6 py-4">
                                 <div className="flex flex-col">
                                    <span className="font-bold text-gray-900">{getReasonLabel(tx.type)}</span>
                                    {tx.type === 'purchase' && (
                                       <span className="text-xs text-gray-500 mt-0.5">
                                          Сумма: <span className="font-medium text-gray-700">{formatCurrency(tx.purchaseAmount)}</span>
                                          {isCancelled && <span className="text-red-500 font-bold ml-2">(ОТМЕНА)</span>}
                                       </span>
                                    )}
                                    {tx.type !== 'purchase' && tx.checkNumber !== '-' && (
                                       <span className="text-xs text-gray-400 mt-0.5">Чек: {tx.checkNumber}</span>
                                    )}
                                 </div>
                              </td>

                              {/* Points */}
                              <td className="px-6 py-4 text-right">
                                 <div className="flex flex-col items-end gap-1">
                                    {tx.pointsAccrued > 0 && (
                                       <span className="font-bold text-green-600 flex items-center">
                                          +{tx.pointsAccrued} <ArrowUpRight size={12} className="ml-0.5" />
                                       </span>
                                    )}
                                    {tx.pointsRedeemed > 0 && (
                                       <span className="font-bold text-red-500 flex items-center">
                                          -{tx.pointsRedeemed} <ArrowDownLeft size={12} className="ml-0.5" />
                                       </span>
                                    )}
                                    {tx.pointsAccrued === 0 && tx.pointsRedeemed === 0 && (
                                       <span className="text-gray-300">-</span>
                                    )}
                                 </div>
                              </td>

                              {/* Outlet (Conditional) */}
                              <td className="px-6 py-4 text-gray-600">
                                 {tx.outlet ? (
                                    <div className="flex items-center space-x-2">
                                        <Store size={14} className="text-gray-400" />
                                        <span className="truncate max-w-[150px]" title={tx.outlet}>{tx.outlet}</span>
                                    </div>
                                 ) : (
                                    <span className="text-gray-300 pl-6">-</span>
                                 )}
                              </td>

                              {/* Source */}
                              <td className="px-6 py-4 text-gray-600">
                                 <div className="flex items-center space-x-2">
                                    {tx.source.type === 'device' ? (
                                       <Monitor size={14} className="text-purple-500" />
                                    ) : isSystem ? (
                                       <CheckCircle2 size={14} className="text-blue-500" />
                                    ) : (
                                       <User size={14} className={'text-gray-400'} />
                                    )}
                                    <span className="truncate max-w-[120px]" title={tx.source.name}>{tx.source.name}</span>
                                 </div>
                              </td>

                              {/* Rating (Stars) */}
                              <td className="px-6 py-4 text-center">
                                 {tx.rating ? (
                                    renderStars(tx.rating)
                                 ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                 )}
                              </td>
                           </tr>
                        );
                     })
                  )}
               </tbody>
            </table>
         </div>

         {/* Pagination */}
         {totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
               <span className="text-sm text-gray-500">
                  Показано {Math.min((currentPage - 1) * itemsPerPage + 1, filteredData.length)} - {Math.min(currentPage * itemsPerPage, filteredData.length)} из {filteredData.length}
               </span>
               <div className="flex items-center space-x-2">
                  <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium text-gray-900">
                     Стр. {currentPage}
                  </span>
                  <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages}
                     className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     <ChevronRight size={16} />
                  </button>
               </div>
            </div>
         )}
      </div>

      {/* Detail Modal */}
      {selectedTx && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
               
               {/* Modal Header */}
               <div className={`p-6 border-b border-gray-100 rounded-t-xl flex justify-between items-start ${selectedTx.status === 'cancelled' ? 'bg-gray-100' : 'bg-white'}`}>
                  <div>
                     <div className="flex items-center space-x-2">
                        <h3 className="text-xl font-bold text-gray-900">{getReasonLabel(selectedTx.type)}</h3>
                        {selectedTx.status === 'cancelled' && (
                           <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-red-200">
                              Отменена
                           </span>
                        )}
                     </div>
                     <p className="text-sm text-gray-500 font-mono mt-1">ID: {selectedTx.id} • {formatDate(selectedTx.dateTime).date}</p>
                  </div>
                  <button onClick={() => setSelectedTx(null)} className="text-gray-400 hover:text-gray-600 p-1">
                     <X size={24} />
                  </button>
               </div>

               {/* Modal Content */}
               <div className="p-6 space-y-6">
                  
                  {/* Financial Breakdown */}
                  {selectedTx.type === 'purchase' && (
                     <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-600">Сумма чека (полная)</span>
                           <span className="font-bold text-gray-900">{formatCurrency(selectedTx.purchaseAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-600">Оплачено деньгами</span>
                           <span className="font-medium text-gray-900">
                              {formatCurrency(Math.max(0, selectedTx.purchaseAmount - (selectedTx.pointsRedeemed)))}
                           </span>
                        </div>
                        {selectedTx.pointsRedeemed > 0 && (
                           <div className="flex justify-between items-center text-sm text-red-600">
                              <span>Оплачено баллами</span>
                              <span className="font-bold">-{selectedTx.pointsRedeemed} Б</span>
                           </div>
                        )}
                        <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center text-sm text-green-600">
                           <span>Начислено за покупку</span>
                           <span className="font-bold">+{selectedTx.pointsAccrued} Б</span>
                        </div>
                     </div>
                  )}

                  {/* General Points Info (Non-purchase) */}
                  {selectedTx.type !== 'purchase' && (
                     <div className="flex justify-center space-x-8 py-4">
                        <div className="text-center">
                           <div className="text-2xl font-bold text-green-600">+{selectedTx.pointsAccrued}</div>
                           <div className="text-xs text-gray-500 uppercase font-medium">Начислено</div>
                        </div>
                        <div className="text-center">
                           <div className="text-2xl font-bold text-red-500">-{selectedTx.pointsRedeemed}</div>
                           <div className="text-xs text-gray-500 uppercase font-medium">Списано/Возврат</div>
                        </div>
                     </div>
                  )}

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                        <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Клиент</span>
                        <div className="font-medium text-purple-600">{selectedTx.clientName}</div>
                     </div>
                     <div>
                        <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Торговая точка</span>
                        <div className="text-gray-800">{selectedTx.outlet || '—'}</div>
                     </div>
                     <div>
                        <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Исполнитель</span>
                        <div className="flex items-center text-gray-800">
                           {selectedTx.source.name}
                        </div>
                     </div>
                     <div>
                        <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Номер чека</span>
                        <div className="font-mono text-gray-800">{selectedTx.checkNumber}</div>
                     </div>
                  </div>

                  {/* Cancellation Warning/Action */}
                  <div className="border-t border-gray-100 pt-6">
                     {selectedTx.status === 'cancelled' ? (
                        <div className="bg-red-50 p-4 rounded-lg flex items-start space-x-3">
                           <Ban className="text-red-600 mt-0.5" size={20} />
                           <div className="text-sm text-red-800">
                              <p className="font-bold">Операция уже отменена</p>
                              <p>Баллы возвращены/списаны в соответствии с правилами отмены.</p>
                           </div>
                        </div>
                     ) : (selectedTx.type === 'refund' || selectedTx.type === 'referral_refund') ? (
                        <div className="bg-amber-50 p-4 rounded-lg flex items-start space-x-3">
                           <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
                           <div className="text-sm text-amber-800">
                              <p className="font-bold">Нельзя отменить возврат</p>
                              <p>Для коррекции создайте новую операцию вручную.</p>
                           </div>
                        </div>
                     ) : (
                        <button 
                           onClick={() => handleCancelOperation(selectedTx)}
                           className="w-full flex items-center justify-center space-x-2 border-2 border-red-100 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 py-3 rounded-xl font-bold transition-colors"
                        >
                           <RotateCcw size={18} />
                           <span>Отменить операцию</span>
                        </button>
                     )}
                  </div>

               </div>
            </div>
         </div>,
         document.body
      )}

    </div>
  );
};

export default OperationsLog;