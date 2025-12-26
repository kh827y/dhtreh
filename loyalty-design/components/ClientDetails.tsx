import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Edit, 
  Ban, 
  Unlock, 
  PlusCircle, 
  MinusCircle, 
  Gift, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  ShoppingBag, 
  Clock, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Store,
  FileText,
  Copy,
  Wallet,
  TrendingUp,
  MapPin,
  MessageSquare,
  RotateCcw,
  Star
} from 'lucide-react';
import { createPortal } from 'react-dom';

// --- Types ---
interface Client {
  id: string;
  phone: string;
  name: string;
  email: string;
  visitFrequency: number;
  avgCheck: number;
  birthDate: string;
  level: string;
  gender: 'M' | 'F' | 'U';
}

interface ClientDetailsProps {
  client: Client;
  onBack: () => void;
  onEdit: (client: Client) => void;
  onNavigateToClient: (id: string) => void;
}

// Mock Interfaces
interface PointExpiration {
  id: string;
  dateAccrued: string;
  dateExpires: string;
  amount: number;
}

interface Review {
  id: string;
  date: string;
  outlet: string;
  rating: number;
  comment: string;
}

interface Referral {
  id: string;
  name: string;
  phone: string;
  dateJoined: string;
  purchases: number;
}

interface HistoryItem {
  id: string;
  amount: number; // Purchase amount in currency
  points: number; // + for accrual, - for redemption
  type: 'accrual' | 'redemption' | 'gift' | 'expiration' | 'return';
  reason: string; // e.g. "Purchase", "Gift", "Refund"
  details: string; // Check number etc.
  date: string; // DateTime string
  outlet: string;
  rating?: number; // 1-5 or undefined
}

const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

const ClientDetails: React.FC<ClientDetailsProps> = ({ client, onBack, onEdit, onNavigateToClient }) => {
  // --- Extended Client Info (Mock) ---
  const fullProfile = {
    ...client,
    age: 34,
    bonusPoints: 1250,
    pendingPoints: 150,
    daysSinceLastPurchase: 14,
    totalPurchases: 28,
    spendingLastMonth: 4500,
    spendingThisMonth: 1200,
    spendingTotal: 86500,
    regDate: '15.02.2023',
    comment: 'Предпочитает напитки на альтернативном молоке. Всегда берет с собой.',
    isBlocked: false,
    blockType: 'full', // 'accrual' | 'full'
    referrer: { id: '999', name: 'Ольга Сидорова' }
  };

  // --- State ---
  const [activeTab, setActiveTab] = useState<'expiration' | 'history' | 'reviews' | 'referrals'>('expiration');
  const [modalType, setModalType] = useState<'block' | 'accrue' | 'redeem' | 'gift' | null>(null);
  const [pages, setPages] = useState({ expiration: 1, history: 1, reviews: 1, referrals: 1 });
  const itemsPerPage = 5;

  // --- Modal Forms State ---
  const [accrueForm, setAccrueForm] = useState({ amount: '', checkNo: '', points: '', autoCalc: true, outlet: 'Центральный' });
  const [redeemForm, setRedeemForm] = useState({ points: '', outlet: 'Центральный' });
  const [giftForm, setGiftForm] = useState({ points: '', expiry: '0', comment: '' });
  const [blockForm, setBlockForm] = useState<'accrual' | 'full'>('accrual');

  // --- Mock Tables Data ---
  const expirations: PointExpiration[] = Array.from({ length: 12 }).map((_, i) => ({
    id: i.toString(),
    dateAccrued: '01.12.2023',
    dateExpires: '01.03.2024',
    amount: 100 + i * 50
  }));

  const historyData: HistoryItem[] = [
    { id: '101', amount: 1250, points: 125, type: 'accrual', reason: 'Покупка', details: 'Чек #4921', date: '28.12.2023 14:30', outlet: 'Флагманский магазин', rating: 5 },
    { id: '102', amount: 0, points: 500, type: 'gift', reason: 'Подарок', details: 'День рождения', date: '25.12.2023 09:00', outlet: 'Система' },
    { id: '103', amount: 450, points: -450, type: 'redemption', reason: 'Списание', details: 'Чек #4880', date: '20.12.2023 18:15', outlet: 'ТЦ Сити Молл', rating: 4 },
    { id: '104', amount: 890, points: 89, type: 'accrual', reason: 'Покупка', details: 'Чек #4750', date: '15.12.2023 12:45', outlet: 'Флагманский магазин' },
    { id: '105', amount: 0, points: -100, type: 'expiration', reason: 'Сгорание', details: 'Истек срок действия', date: '01.12.2023 00:00', outlet: 'Система' },
    { id: '106', amount: 2100, points: 210, type: 'accrual', reason: 'Покупка', details: 'Чек #4602', date: '28.11.2023 19:20', outlet: 'Киоск Аэропорт', rating: 5 },
    { id: '107', amount: 350, points: 35, type: 'accrual', reason: 'Покупка', details: 'Чек #4510', date: '10.11.2023 08:30', outlet: 'ТЦ Сити Молл' },
    { id: '108', amount: 0, points: 100, type: 'gift', reason: 'Ручное начисление', details: 'Компенсация', date: '05.11.2023 14:00', outlet: 'Администратор' },
  ];

  const reviews: Review[] = [
    { id: '1', date: '10.12.2023', outlet: 'ТЦ Плаза', rating: 5, comment: 'Всё отлично, спасибо!' },
    { id: '2', date: '05.11.2023', outlet: 'Центральный', rating: 4, comment: 'Кофе вкусный, но пришлось долго ждать заказ.' },
    { id: '3', date: '20.10.2023', outlet: 'ТЦ Плаза', rating: 5, comment: 'Супер!' },
    { id: '4', date: '15.09.2023', outlet: 'Центральный', rating: 5, comment: '' },
    { id: '5', date: '01.08.2023', outlet: 'ТЦ Плаза', rating: 3, comment: 'Забыл сахар.' },
    { id: '6', date: '12.07.2023', outlet: 'Центральный', rating: 5, comment: 'Любимое место.' },
  ];

  const referrals: Referral[] = [
    { id: '201', name: 'Алексей К.', phone: '+7 (900) ...-22-33', dateJoined: '10.11.2023', purchases: 5 },
    { id: '202', name: 'Мария П.', phone: '+7 (900) ...-44-55', dateJoined: '12.11.2023', purchases: 12 },
    { id: '203', name: 'Игорь С.', phone: '+7 (900) ...-66-77', dateJoined: '05.12.2023', purchases: 0 },
    { id: '204', name: 'Светлана Д.', phone: '+7 (900) ...-88-99', dateJoined: '20.12.2023', purchases: 2 },
    { id: '205', name: 'Виктор М.', phone: '+7 (900) ...-00-11', dateJoined: '25.12.2023', purchases: 1 },
    { id: '206', name: 'Елена Т.', phone: '+7 (900) ...-12-34', dateJoined: '28.12.2023', purchases: 0 },
  ];

  // --- Helpers ---
  const paginate = <T,>(data: T[], page: number) => data.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  
  const renderPagination = (totalItems: number, currentPage: number, setPage: (p: number) => void) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 bg-gray-50/50">
         <span className="text-xs text-gray-500">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - {Math.min(currentPage * itemsPerPage, totalItems)} из {totalItems}</span>
         <div className="flex items-center space-x-2">
            <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="text-xs font-medium">{currentPage}</span>
            <button onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ChevronRight size={16} /></button>
         </div>
      </div>
    );
  };

  const handleAction = () => {
    alert('Операция выполнена успешно (симуляция)');
    setModalType(null);
  };

  const handleCancelOperation = (id: string) => {
    if(confirm('Вы уверены, что хотите отменить эту операцию? Это действие создаст корректирующую запись.')) {
        alert(`Операция ${id} отменена.`);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* Navigation */}
      <div className="flex items-center space-x-4">
         <button onClick={onBack} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            <ArrowLeft size={20} />
         </button>
         <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 leading-none">Карточка клиента</h2>
            <span className="text-sm text-gray-500 mt-1">Просмотр и управление профилем</span>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         
         {/* --- LEFT COLUMN: Profile, Actions, Info --- */}
         <div className="xl:col-span-1 space-y-6">
            
            {/* Identity Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
               {/* Background Pattern */}
               <div className="h-24 bg-gradient-to-r from-purple-600 to-indigo-600"></div>
               
               <div className="px-6 pb-6 relative">
                  {/* Avatar */}
                  <div className="absolute -top-10 left-6">
                     <div className="w-20 h-20 rounded-xl bg-white p-1 shadow-md">
                        <div className={`w-full h-full rounded-lg flex items-center justify-center text-2xl font-bold text-white
                           ${fullProfile.level === 'Gold' ? 'bg-yellow-400' : 
                             fullProfile.level === 'Platinum' ? 'bg-slate-700' : 'bg-gray-400'}`}>
                           {fullProfile.name.charAt(0)}
                        </div>
                     </div>
                  </div>

                  {/* Top Actions */}
                  <div className="flex justify-end pt-3 mb-2">
                     <button onClick={() => onEdit(client)} className="text-gray-400 hover:text-purple-600 transition-colors p-1" title="Редактировать">
                        <Edit size={18} />
                     </button>
                  </div>

                  {/* Name & Status */}
                  <div className="mt-4">
                     <h3 className="text-xl font-bold text-gray-900">{fullProfile.name}</h3>
                     <div className="flex items-center space-x-2 mt-1">
                        <span className="text-sm text-gray-500 font-mono">ID: {fullProfile.id}</span>
                        {fullProfile.isBlocked ? (
                           <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${fullProfile.blockType === 'accrual' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                              <Ban size={10} className="mr-1" />
                              {fullProfile.blockType === 'accrual' ? 'Блок. начислений' : 'Заблокирован'}
                           </span>
                        ) : (
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Активен
                           </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
                           ${fullProfile.level === 'Gold' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 
                             fullProfile.level === 'Platinum' ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                           {fullProfile.level}
                        </span>
                     </div>
                  </div>

                  {/* Wallet */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between">
                     <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Баланс баллов</span>
                        <div className="text-2xl font-bold text-purple-700 mt-0.5">{fullProfile.bonusPoints} Б</div>
                        {fullProfile.pendingPoints > 0 && (
                           <div className="text-xs text-gray-500 mt-1 flex items-center">
                              <Clock size={10} className="mr-1" />
                              {fullProfile.pendingPoints} в ожидании
                           </div>
                        )}
                     </div>
                     <div className="bg-white p-2.5 rounded-full shadow-sm text-purple-600">
                        <Wallet size={24} />
                     </div>
                  </div>

                  {/* Action Buttons Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-6">
                     <button onClick={() => setModalType('accrue')} className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                        <PlusCircle size={16} /> <span>Начислить</span>
                     </button>
                     <button onClick={() => setModalType('redeem')} className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors">
                        <MinusCircle size={16} /> <span>Списать</span>
                     </button>
                     <button onClick={() => setModalType('gift')} className="flex items-center justify-center space-x-2 py-2.5 px-3 bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-100 rounded-lg text-sm font-medium transition-colors">
                        <Gift size={16} /> <span>Подарить</span>
                     </button>
                     <button onClick={() => setModalType('block')} className={`flex items-center justify-center space-x-2 py-2.5 px-3 border rounded-lg text-sm font-medium transition-colors
                        ${fullProfile.isBlocked ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}>
                        {fullProfile.isBlocked ? <Unlock size={16} /> : <Ban size={16} />}
                        <span>{fullProfile.isBlocked ? 'Разблок.' : 'Блокировка'}</span>
                     </button>
                  </div>
               </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
               
               <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Контакты</h4>
                  <div className="flex items-center justify-between group">
                     <div className="flex items-center space-x-3 text-sm text-gray-600">
                        <Phone size={16} className="text-gray-400" />
                        <span>{fullProfile.phone}</span>
                     </div>
                     <button className="text-gray-300 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-all" title="Копировать">
                        <Copy size={14} />
                     </button>
                  </div>
                  <div className="flex items-center justify-between group">
                     <div className="flex items-center space-x-3 text-sm text-gray-600">
                        <Mail size={16} className="text-gray-400" />
                        <span>{fullProfile.email || '—'}</span>
                     </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Личные данные</h4>
                  <div className="flex items-center justify-between">
                     <span className="text-sm text-gray-500">Пол / Возраст</span>
                     <span className="text-sm font-medium text-gray-900">
                        {fullProfile.gender === 'M' ? 'Мужской' : fullProfile.gender === 'F' ? 'Женский' : '—'}, {fullProfile.age}
                     </span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-sm text-gray-500">Дата рождения</span>
                     <span className="text-sm font-medium text-gray-900">{fullProfile.birthDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                     <span className="text-sm text-gray-500">Регистрация</span>
                     <span className="text-sm font-medium text-gray-900">{fullProfile.regDate}</span>
                  </div>
               </div>

               <div className="space-y-2">
                  <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Приглашение</h4>
                  <div className="flex items-center justify-between">
                     <span className="text-sm text-gray-500">Пригласил(а)</span>
                     {fullProfile.referrer ? (
                        <button onClick={() => onNavigateToClient(fullProfile.referrer.id)} className="text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center">
                           {fullProfile.referrer.name} <ExternalLink size={12} className="ml-1" />
                        </button>
                     ) : (
                        <span className="text-sm text-gray-400">—</span>
                     )}
                  </div>
               </div>

            </div>
         </div>

         {/* --- RIGHT COLUMN: Analytics, Comment, Tables --- */}
         <div className="xl:col-span-2 space-y-6">
            
            {/* KPI Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Всего покупок">Всего</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(fullProfile.spendingTotal)}</div>
                  <div className="text-xs text-green-600 mt-1 flex items-center">
                     <TrendingUp size={12} className="mr-1" /> LTV
                  </div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Этот месяц">Тек. месяц</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(fullProfile.spendingThisMonth)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                     Покупки
                  </div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Прошлый месяц">Прош. месяц</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(fullProfile.spendingLastMonth)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                     Покупки
                  </div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Средний чек">Ср. чек</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(fullProfile.avgCheck)}</div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Всего чеков">Чеков</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{fullProfile.totalPurchases}</div>
                  <div className="text-xs text-gray-400 mt-1">~ 1 в {fullProfile.visitFrequency} дн.</div>
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm xl:col-span-1">
                  <span className="text-xs font-medium text-gray-500 uppercase block truncate" title="Последний визит">Посл. визит</span>
                  <div className="mt-2 text-lg font-bold text-gray-900">{fullProfile.daysSinceLastPurchase} дн.</div>
                  <div className="text-xs text-gray-400 mt-1">назад</div>
               </div>
            </div>

            {/* Comment Section */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-start space-x-3">
               <MessageSquare className="text-gray-400 mt-1 flex-shrink-0" size={18} />
               <div className="flex-1">
                  <h4 className="text-sm font-bold text-gray-900 mb-1">Комментарий к пользователю</h4>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 italic">
                     {fullProfile.comment || 'Нет комментария'}
                  </p>
               </div>
            </div>

            {/* Tabs & Tables Container */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
               <div className="border-b border-gray-200 px-6 bg-gray-50/50">
                  <nav className="-mb-px flex space-x-6 overflow-x-auto">
                     {[
                        { id: 'expiration', label: 'Срок действия баллов' },
                        { id: 'history', label: 'История операций' },
                        { id: 'reviews', label: 'Отзывы' },
                        { id: 'referrals', label: 'Пригласил клиентов' }
                     ].map((tab) => (
                        <button
                           key={tab.id}
                           onClick={() => setActiveTab(tab.id as any)}
                           className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                              ${activeTab === tab.id 
                                 ? 'border-purple-600 text-purple-700' 
                                 : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                           {tab.label}
                        </button>
                     ))}
                  </nav>
               </div>

               <div className="flex-1">
                  {/* EXPIRATION TABLE */}
                  {activeTab === 'expiration' && (
                     <>
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                 <tr>
                                    <th className="px-6 py-3 font-semibold">Начислено</th>
                                    <th className="px-6 py-3 font-semibold">Сгорает</th>
                                    <th className="px-6 py-3 font-semibold text-right">Сумма</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                 {paginate(expirations, pages.expiration).map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                       <td className="px-6 py-3 text-gray-900">{item.dateAccrued}</td>
                                       <td className="px-6 py-3 text-gray-900">{item.dateExpires}</td>
                                       <td className="px-6 py-3 text-right font-bold text-orange-600">{item.amount} Б</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {renderPagination(expirations.length, pages.expiration, (p) => setPages({...pages, expiration: p}))}
                     </>
                  )}

                  {/* HISTORY TABLE */}
                  {activeTab === 'history' && (
                     <>
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                 <tr>
                                    <th className="px-6 py-3 font-semibold w-12">#</th>
                                    <th className="px-6 py-3 font-semibold text-right">Сумма</th>
                                    <th className="px-6 py-3 font-semibold text-right">Баллов</th>
                                    <th className="px-6 py-3 font-semibold">Подробности</th>
                                    <th className="px-6 py-3 font-semibold">Дата/время</th>
                                    <th className="px-6 py-3 font-semibold">Торговая точка</th>
                                    <th className="px-6 py-3 font-semibold">Оценка</th>
                                    <th className="px-6 py-3 font-semibold text-right">Действия</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                 {paginate(historyData, pages.history).map((item, idx) => {
                                    const globalIdx = (pages.history - 1) * itemsPerPage + idx + 1;
                                    return (
                                       <tr key={item.id} className="hover:bg-gray-50">
                                          <td className="px-6 py-4 text-gray-400 font-mono text-xs">{globalIdx}</td>
                                          <td className="px-6 py-4 text-right font-medium text-gray-900">
                                             {item.amount > 0 ? formatCurrency(item.amount) : <span className="text-gray-300">—</span>}
                                          </td>
                                          <td className={`px-6 py-4 text-right font-bold ${item.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                             {item.points > 0 ? '+' : ''}{item.points}
                                          </td>
                                          <td className="px-6 py-4">
                                             <div className="font-medium text-gray-900">{item.reason}</div>
                                             <div className="text-xs text-gray-500 mt-0.5">{item.details}</div>
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-xs">
                                             <div className="font-medium text-gray-900">{item.date.split(' ')[0]}</div>
                                             <div className="text-gray-500">{item.date.split(' ')[1]}</div>
                                          </td>
                                          <td className="px-6 py-4 text-gray-900">
                                             <div className="flex items-center space-x-1.5">
                                                <Store size={14} className="text-gray-400" />
                                                <span className="truncate max-w-[120px]" title={item.outlet}>{item.outlet}</span>
                                             </div>
                                          </td>
                                          <td className="px-6 py-4">
                                             {item.rating ? (
                                                <div className="flex items-center space-x-1 text-xs font-bold text-gray-700 bg-yellow-50 px-2 py-1 rounded w-fit">
                                                   <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                                   <span>{item.rating}</span>
                                                </div>
                                             ) : (
                                                <span className="text-gray-300">—</span>
                                             )}
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                             <button 
                                                onClick={() => handleCancelOperation(item.id)}
                                                title="Отменить операцию"
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                             >
                                                <RotateCcw size={16} />
                                             </button>
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        </div>
                        {renderPagination(historyData.length, pages.history, (p) => setPages({...pages, history: p}))}
                     </>
                  )}

                  {/* REVIEWS TABLE */}
                  {activeTab === 'reviews' && (
                     <>
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                 <tr>
                                    <th className="px-6 py-3 font-semibold">Дата</th>
                                    <th className="px-6 py-3 font-semibold">Точка</th>
                                    <th className="px-6 py-3 font-semibold">Оценка</th>
                                    <th className="px-6 py-3 font-semibold">Отзыв</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                 {paginate(reviews, pages.reviews).map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                       <td className="px-6 py-3 text-gray-600 whitespace-nowrap">{item.date}</td>
                                       <td className="px-6 py-3 text-gray-900">
                                          <div className="flex items-center space-x-2">
                                             <Store size={14} className="text-gray-400"/>
                                             <span className="truncate max-w-[120px]" title={item.outlet}>{item.outlet}</span>
                                          </div>
                                       </td>
                                       <td className="px-6 py-3">
                                          <div className="flex text-yellow-400 text-xs">
                                             {Array.from({length: 5}).map((_, i) => (
                                                <Star key={i} size={12} className={i < item.rating ? 'fill-current' : 'text-gray-200'} />
                                             ))}
                                          </div>
                                       </td>
                                       <td className="px-6 py-3 text-gray-700 break-words max-w-xs">
                                          {item.comment || <span className="text-gray-400 italic">Без текста</span>}
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {renderPagination(reviews.length, pages.reviews, (p) => setPages({...pages, reviews: p}))}
                     </>
                  )}

                  {/* REFERRALS TABLE */}
                  {activeTab === 'referrals' && (
                     <>
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                 <tr>
                                    <th className="px-6 py-3 font-semibold">Клиент</th>
                                    <th className="px-6 py-3 font-semibold">Телефон</th>
                                    <th className="px-6 py-3 font-semibold">Дата</th>
                                    <th className="px-6 py-3 font-semibold text-right">Покупок</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                 {paginate(referrals, pages.referrals).map((item) => (
                                    <tr 
                                       key={item.id} 
                                       className="hover:bg-gray-50 cursor-pointer transition-colors"
                                       onClick={() => onNavigateToClient(item.id)}
                                    >
                                       <td className="px-6 py-3 font-medium text-purple-600 hover:text-purple-800">
                                          {item.name}
                                       </td>
                                       <td className="px-6 py-3 text-gray-600">{item.phone}</td>
                                       <td className="px-6 py-3 text-gray-600">{item.dateJoined}</td>
                                       <td className="px-6 py-3 text-right font-medium text-gray-900">{item.purchases}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                        {renderPagination(referrals.length, pages.referrals, (p) => setPages({...pages, referrals: p}))}
                     </>
                  )}
               </div>
            </div>

         </div>
      </div>

      {/* --- MODALS REUSE --- */}
      
      {/* Block Modal */}
      {modalType === 'block' && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
               <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">{fullProfile.isBlocked ? 'Разблокировать' : 'Заблокировать'}</h3>
                  <p className="text-sm text-gray-500">{fullProfile.name}</p>
               </div>
               <div className="p-6 space-y-4">
                  {!fullProfile.isBlocked && (
                     <div className="space-y-3">
                        <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                           <input type="radio" name="blockType" checked={blockForm === 'accrual'} onChange={() => setBlockForm('accrual')} className="text-red-600 focus:ring-red-500" />
                           <div>
                              <span className="block font-medium text-gray-900 text-sm">Только начисления</span>
                              <span className="text-xs text-gray-500">Клиент сможет тратить, но не копить</span>
                           </div>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                           <input type="radio" name="blockType" checked={blockForm === 'full'} onChange={() => setBlockForm('full')} className="text-red-600 focus:ring-red-500" />
                           <div>
                              <span className="block font-medium text-gray-900 text-sm">Полная блокировка</span>
                              <span className="text-xs text-gray-500">Начисления и списания запрещены</span>
                           </div>
                        </label>
                     </div>
                  )}
                  {fullProfile.isBlocked && (
                     <p className="text-gray-700 text-sm">Снять все ограничения с этого клиента?</p>
                  )}
               </div>
               <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Отмена</button>
                  <button onClick={handleAction} className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${fullProfile.isBlocked ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                     {fullProfile.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                  </button>
               </div>
            </div>
         </div>, document.body
      )}

      {/* Accrue Points Modal */}
      {modalType === 'accrue' && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
               <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                  <h3 className="text-lg font-bold text-gray-900">Начисление баллов</h3>
               </div>
               <div className="p-6 space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Сумма покупки</label>
                     <input type="number" value={accrueForm.amount} onChange={(e) => setAccrueForm({...accrueForm, amount: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="0 ₽"/>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">№ Чека</label>
                     <input type="text" value={accrueForm.checkNo} onChange={(e) => setAccrueForm({...accrueForm, checkNo: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" placeholder="Необязательно"/>
                  </div>
                  
                  <div className="flex items-center space-x-3 pt-1">
                     <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={accrueForm.autoCalc} onChange={(e) => setAccrueForm({...accrueForm, autoCalc: e.target.checked})} className="rounded text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm text-gray-900">Автокалькуляция (5%)</span>
                     </label>
                  </div>

                  {!accrueForm.autoCalc && (
                     <div className="animate-fade-in">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Количество баллов</label>
                        <input type="number" value={accrueForm.points} onChange={(e) => setAccrueForm({...accrueForm, points: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
                     </div>
                  )}

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Торговая точка</label>
                     <select value={accrueForm.outlet} onChange={(e) => setAccrueForm({...accrueForm, outlet: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none">
                        <option>Центральный</option>
                        <option>ТЦ Плаза</option>
                        <option>Киоск Аэропорт</option>
                     </select>
                  </div>
               </div>
               <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Отмена</button>
                  <button onClick={handleAction} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Начислить</button>
               </div>
            </div>
         </div>, document.body
      )}

      {/* Redeem Points Modal */}
      {modalType === 'redeem' && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
               <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                  <h3 className="text-lg font-bold text-gray-900">Списание баллов</h3>
                  <p className="text-xs text-gray-500 mt-1">Доступно: <span className="font-bold text-green-600">{fullProfile.bonusPoints} Б</span></p>
               </div>
               <div className="p-6 space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Сумма списания</label>
                     <input type="number" max={fullProfile.bonusPoints} value={redeemForm.points} onChange={(e) => setRedeemForm({...redeemForm, points: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Торговая точка</label>
                     <select value={redeemForm.outlet} onChange={(e) => setRedeemForm({...redeemForm, outlet: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                        <option>Центральный</option>
                        <option>ТЦ Плаза</option>
                        <option>Киоск Аэропорт</option>
                     </select>
                  </div>
               </div>
               <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Отмена</button>
                  <button onClick={handleAction} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">Списать</button>
               </div>
            </div>
         </div>, document.body
      )}

      {/* Gift Points Modal */}
      {modalType === 'gift' && createPortal(
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
               <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center space-x-2">
                  <Gift className="text-pink-600" size={20} />
                  <h3 className="text-lg font-bold text-gray-900">Подарить баллы</h3>
               </div>
               <div className="p-6 space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Сумма баллов</label>
                     <input type="number" value={giftForm.points} onChange={(e) => setGiftForm({...giftForm, points: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-center text-pink-600 focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Срок жизни (дней)</label>
                     <div className="relative">
                        <input type="number" value={giftForm.expiry} onChange={(e) => setGiftForm({...giftForm, expiry: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0 = вечно</span>
                     </div>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий (виден клиенту)</label>
                     <input type="text" placeholder="Подарок на день рождения!" value={giftForm.comment} onChange={(e) => setGiftForm({...giftForm, comment: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none" />
                  </div>
               </div>
               <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
                  <button onClick={() => setModalType(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Отмена</button>
                  <button onClick={handleAction} className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium">Подарить</button>
               </div>
            </div>
         </div>, document.body
      )}

    </div>
  );
};

export default ClientDetails;