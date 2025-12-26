import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar, 
  Settings, 
  Users, 
  UserPlus, 
  Gift, 
  TrendingUp,
  Share2,
  Crown,
  X
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { AppView } from '../types';

interface LeaderboardEntry {
  rank: number;
  name: string;
  invitedCount: number;
  convertedCount: number;
  revenueGenerated: number;
}

interface ReferralAnalyticsProps {
  onNavigate: (view: AppView) => void;
}

const ReferralAnalytics: React.FC<ReferralAnalyticsProps> = ({ onNavigate }) => {
  const [period, setPeriod] = useState('Месяц');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Mock Data ---

  // 1. KPI Stats
  const stats = {
    registrations: 450,
    firstPurchases: 315, // ~70% conversion
    revenue: 1250000,
    bonusesPaid: 157500 // Points or Currency
  };

  // 2. Dynamics Data (Chart)
  const dynamicsData = useMemo(() => {
    const data = [];
    const days = 30;
    for (let i = 1; i <= days; i++) {
      const regs = Math.floor(10 + Math.random() * 20);
      const purchases = Math.floor(regs * (0.5 + Math.random() * 0.4)); // 50-90% conversion lag
      
      data.push({
        date: `${i} Ноя`,
        registrations: regs,
        purchases: purchases
      });
    }
    return data;
  }, [period]);

  // 3. Leaderboard Data
  const leaderboard: LeaderboardEntry[] = useMemo(() => [
    { rank: 1, name: 'Михаил Иванов', invitedCount: 42, convertedCount: 38, revenueGenerated: 152000 },
    { rank: 2, name: 'Дмитрий Петров', invitedCount: 35, convertedCount: 30, revenueGenerated: 120500 },
    { rank: 3, name: 'Елена Смирнова', invitedCount: 28, convertedCount: 22, revenueGenerated: 88000 },
    { rank: 4, name: 'Ольга Кузнецова', invitedCount: 25, convertedCount: 20, revenueGenerated: 75000 },
    { rank: 5, name: 'Сергей Попов', invitedCount: 18, convertedCount: 15, revenueGenerated: 62000 },
    { rank: 6, name: 'Анна Васильева', invitedCount: 15, convertedCount: 12, revenueGenerated: 48000 },
    { rank: 7, name: 'Андрей Соколов', invitedCount: 12, convertedCount: 8, revenueGenerated: 32000 },
    { rank: 8, name: 'Мария Михайлова', invitedCount: 10, convertedCount: 9, revenueGenerated: 36000 },
  ], []);

  // 4. Full Leaderboard Data (Extended for Modal)
  const fullLeaderboard: LeaderboardEntry[] = useMemo(() => {
    const extended = [...leaderboard];
    const names = [
        'Оскар Мартинез', 'Анжела Мартина', 'Тоби Флендерсон', 'Келли Капур', 
        'Райан Ховард', 'Крид Брэттон', 'Мередит Палмер', 'Дэррил Филбин', 
        'Эрин Хэннон', 'Гейб Льюис', 'Ян Левинсон', 'Дэвид Уоллес'
    ];
    
    names.forEach((name, idx) => {
       extended.push({
         rank: leaderboard.length + idx + 1,
         name: name,
         invitedCount: Math.floor(9 - idx * 0.5),
         convertedCount: Math.floor(7 - idx * 0.5),
         revenueGenerated: Math.floor(25000 - idx * 2000)
       });
    });
    return extended;
  }, [leaderboard]);

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <div className="flex items-center space-x-2">
              <Share2 size={24} className="text-purple-600" />
              <h2 className="text-2xl font-bold text-gray-900">Реферальная программа</h2>
           </div>
           <p className="text-gray-500 mt-1">Отслеживание вирусного роста и эффективности реферальных кампаний.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           {/* Period Selector */}
           <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <Calendar size={16} className="text-gray-400" />
              <select 
                 value={period}
                 onChange={(e) => setPeriod(e.target.value)}
                 className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
              >
                 <option>Вчера</option>
                 <option>Неделя</option>
                 <option>Месяц</option>
                 <option>Квартал</option>
                 <option>Год</option>
              </select>
           </div>

           {/* Configure Button */}
           <button 
             className="flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm"
             onClick={() => onNavigate('referral_settings')}
           >
             <Settings size={16} />
             <span>Настроить</span>
           </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {/* Registrations */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <UserPlus size={64} className="text-blue-600" />
            </div>
            <div>
               <span className="text-sm font-medium text-gray-500">Регистрации</span>
               <h3 className="text-3xl font-bold text-gray-900 mt-2">{stats.registrations}</h3>
            </div>
            <div className="flex items-center text-sm">
               <span className="text-green-600 font-medium flex items-center">
                  <TrendingUp size={14} className="mr-1" />
                  +12%
               </span>
               <span className="text-gray-400 ml-2">к прошл. периоду</span>
            </div>
         </div>

         {/* First Purchases */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <Gift size={64} className="text-purple-600" />
            </div>
            <div>
               <span className="text-sm font-medium text-gray-500">Первые покупки</span>
               <h3 className="text-3xl font-bold text-gray-900 mt-2">{stats.firstPurchases}</h3>
            </div>
            <div className="flex items-center text-sm">
               <span className="text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded">
                  {((stats.firstPurchases / stats.registrations) * 100).toFixed(1)}% Конверсия
               </span>
            </div>
         </div>

         {/* Revenue */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <TrendingUp size={64} className="text-green-600" />
            </div>
            <div>
               <span className="text-sm font-medium text-gray-500">Выручка (Реф.)</span>
               <h3 className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(stats.revenue)}</h3>
            </div>
            <div className="flex items-center text-sm">
               <span className="text-green-600 font-medium flex items-center">
                  <TrendingUp size={14} className="mr-1" />
                  +8%
               </span>
               <span className="text-gray-400 ml-2">к прошл. периоду</span>
            </div>
         </div>

         {/* Bonuses Paid (Cost) */}
         <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
            <div>
               <span className="text-sm font-medium text-slate-500">Выплачено бонусов</span>
               <h3 className="text-2xl font-bold text-slate-700 mt-2">{stats.bonusesPaid.toLocaleString()} баллов</h3>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
               <div className="bg-slate-400 h-1.5 rounded-full" style={{ width: '65%' }}></div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         {/* Chart Section */}
         <div className="xl:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold text-gray-900">Динамика привлечения</h3>
               <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                     <span className="w-3 h-3 rounded-full bg-blue-400"></span>
                     <span>Регистрации</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                     <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                     <span>Первая покупка</span>
                  </div>
               </div>
            </div>
            <div className="h-[350px]">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dynamicsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="#60A5FA" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPur" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                     <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                     <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                     />
                     <Area type="monotone" dataKey="registrations" stroke="#60A5FA" strokeWidth={2} fillOpacity={1} fill="url(#colorReg)" />
                     <Area type="monotone" dataKey="purchases" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorPur)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* Leaderboard Section */}
         <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col h-[450px]">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
               <div className="flex items-center space-x-2">
                  <Crown className="text-yellow-500" size={20} />
                  <h3 className="font-bold text-gray-900">Топ амбассадоров</h3>
               </div>
               <p className="text-xs text-gray-500 mt-1">Клиенты, приносящие наибольшую пользу.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
               <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-500 uppercase">
                     <tr>
                        <th className="px-4 py-3 bg-gray-50">Ранг</th>
                        <th className="px-4 py-3 bg-gray-50">Пользователь</th>
                        <th className="px-4 py-3 bg-gray-50 text-right">Пригласил</th>
                        <th className="px-4 py-3 bg-gray-50 text-right">Выручка</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                     {leaderboard.map((user) => (
                        <tr key={user.rank} className="hover:bg-gray-50 transition-colors">
                           <td className="px-4 py-3 font-medium text-gray-400 w-12 text-center">
                              {user.rank <= 3 ? (
                                 <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                                    user.rank === 1 ? 'bg-yellow-400' : user.rank === 2 ? 'bg-gray-400' : 'bg-orange-400'
                                 }`}>
                                    {user.rank}
                                 </div>
                              ) : (
                                 <span>#{user.rank}</span>
                              )}
                           </td>
                           <td className="px-4 py-3 font-medium text-gray-900">
                              {user.name}
                           </td>
                           <td className="px-4 py-3 text-right">
                              <span className="font-bold text-gray-900">{user.invitedCount}</span>
                              <span className="text-xs text-gray-400 ml-1">({user.convertedCount})</span>
                           </td>
                           <td className="px-4 py-3 text-right text-green-600 font-medium">
                              {formatCurrency(user.revenueGenerated)}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
               <button 
                onClick={() => setIsModalOpen(true)}
                className="text-sm text-purple-600 font-medium hover:text-purple-700"
               >
                 Полный отчет
               </button>
            </div>
         </div>
      </div>

      {/* Full Report Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-[101]">
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                 <div>
                   <h3 className="text-xl font-bold text-gray-900">Полный рейтинг рефералов</h3>
                   <p className="text-sm text-gray-500">Полный список рефералов и сгенерированная выручка.</p>
                 </div>
                 <button 
                   onClick={() => setIsModalOpen(false)} 
                   className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-lg transition-colors"
                 >
                   <X size={24} />
                 </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-0">
                 <table className="w-full text-sm text-left">
                    <thead className="sticky top-0 bg-white shadow-sm z-10 text-xs text-gray-500 uppercase">
                       <tr>
                          <th className="px-6 py-4 bg-gray-50">Ранг</th>
                          <th className="px-6 py-4 bg-gray-50">Пользователь</th>
                          <th className="px-6 py-4 bg-gray-50 text-right">Пригласил</th>
                          <th className="px-6 py-4 bg-gray-50 text-right">Конверсия</th>
                          <th className="px-6 py-4 bg-gray-50 text-right">Выручка</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {fullLeaderboard.map((user) => (
                          <tr key={user.rank} className="hover:bg-gray-50 transition-colors">
                             <td className="px-6 py-4 font-medium text-gray-400 w-16 text-center">
                                {user.rank <= 3 ? (
                                   <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                                      user.rank === 1 ? 'bg-yellow-400' : user.rank === 2 ? 'bg-gray-400' : 'bg-orange-400'
                                   }`}>
                                      {user.rank}
                                   </div>
                                ) : (
                                   <span>#{user.rank}</span>
                                )}
                             </td>
                             <td className="px-6 py-4 font-medium text-gray-900 text-base">
                                {user.name}
                             </td>
                             <td className="px-6 py-4 text-right">
                                <span className="font-bold text-gray-900">{user.invitedCount}</span>
                             </td>
                             <td className="px-6 py-4 text-right">
                                <span className="text-gray-600">{user.convertedCount}</span>
                                <span className="text-xs text-gray-400 ml-1">
                                   ({((user.convertedCount / user.invitedCount) * 100).toFixed(0)}%)
                                </span>
                             </td>
                             <td className="px-6 py-4 text-right text-green-600 font-medium">
                                {formatCurrency(user.revenueGenerated)}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              
              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                 <button 
                   onClick={() => setIsModalOpen(false)}
                   className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
                 >
                   Закрыть
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default ReferralAnalytics;