import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Store, 
  User,
  Medal,
  TrendingUp,
  UserPlus,
  BadgeCheck,
  Star,
  Users
} from 'lucide-react';

interface StaffData {
  id: string;
  name: string;
  branch: string;
  performanceScore: number; // Internal "Score" (Ochki)
  salesCount: number;
  revenue: number;
  accruedPoints: number;
  redeemedPoints: number;
  newClients: number;
}

const StaffActivity: React.FC = () => {
  const [period, setPeriod] = useState('Месяц');
  const [selectedOutlet, setSelectedOutlet] = useState('Все точки');
  const [groupByEmployee, setGroupByEmployee] = useState(false);

  // Mock Data
  const allStaffData: StaffData[] = useMemo(() => [
    { id: '1', name: 'Алиса Фриман', branch: 'Флагманский магазин', performanceScore: 98, salesCount: 450, revenue: 1250000, accruedPoints: 5000, redeemedPoints: 2100, newClients: 45 },
    { id: '2', name: 'Боб Смит', branch: 'Флагманский магазин', performanceScore: 85, salesCount: 320, revenue: 890000, accruedPoints: 3500, redeemedPoints: 1500, newClients: 20 },
    { id: '3', name: 'Чарли Дэвис', branch: 'ТЦ Сити Молл', performanceScore: 92, salesCount: 380, revenue: 950000, accruedPoints: 4100, redeemedPoints: 1200, newClients: 15 },
    { id: '4', name: 'Диана Принс', branch: 'ТЦ Сити Молл', performanceScore: 78, salesCount: 250, revenue: 600000, accruedPoints: 2800, redeemedPoints: 900, newClients: 10 },
    { id: '5', name: 'Иван Райт', branch: 'Киоск Аэропорт', performanceScore: 95, salesCount: 600, revenue: 1100000, accruedPoints: 2500, redeemedPoints: 800, newClients: 85 },
    { id: '6', name: 'Фиона Галлахер', branch: 'Киоск Аэропорт', performanceScore: 88, salesCount: 550, revenue: 980000, accruedPoints: 2200, redeemedPoints: 600, newClients: 70 },
    { id: '7', name: 'Георгий Миллер', branch: 'Филиал Пригород', performanceScore: 82, salesCount: 200, revenue: 450000, accruedPoints: 1800, redeemedPoints: 1400, newClients: 12 },
    { id: '8', name: 'Анна Ли', branch: 'Филиал Пригород', performanceScore: 90, salesCount: 250, revenue: 520000, accruedPoints: 2100, redeemedPoints: 1100, newClients: 25 },
    // Adding duplicates to demonstrate aggregation capability
    { id: '9', name: 'Алиса Фриман', branch: 'ТЦ Сити Молл', performanceScore: 95, salesCount: 150, revenue: 350000, accruedPoints: 1500, redeemedPoints: 400, newClients: 5 },
  ], [period]);

  // Filter Data
  const filteredStaff = useMemo(() => {
    let data = allStaffData;
    if (selectedOutlet !== 'Все точки') {
       data = data.filter(staff => staff.branch === selectedOutlet);
    }
    
    if (groupByEmployee && selectedOutlet === 'Все точки') {
       const aggregated: Record<string, StaffData> = {};
       
       data.forEach(staff => {
          if (!aggregated[staff.name]) {
             aggregated[staff.name] = { ...staff }; // clone
          } else {
             const existing = aggregated[staff.name];
             existing.salesCount += staff.salesCount;
             existing.revenue += staff.revenue;
             existing.accruedPoints += staff.accruedPoints;
             existing.redeemedPoints += staff.redeemedPoints;
             existing.newClients += staff.newClients;
             // Weighted average for score could be better, but simple average for now
             existing.performanceScore = Math.round((existing.performanceScore + staff.performanceScore) / 2);
             // Concatenate branches if unique
             if (!existing.branch.includes(staff.branch)) {
                existing.branch += `, ${staff.branch}`;
             }
          }
       });
       return Object.values(aggregated);
    }

    return data;
  }, [allStaffData, selectedOutlet, groupByEmployee]);

  // Calculations
  const processedData = useMemo(() => {
    return filteredStaff.map(staff => ({
      ...staff,
      avgCheck: staff.salesCount > 0 ? Math.round(staff.revenue / staff.salesCount) : 0
    }));
  }, [filteredStaff]);

  const totals = useMemo(() => {
    const sum = (key: keyof StaffData) => filteredStaff.reduce((acc, curr) => acc + (curr[key] as number), 0);
    
    // Arithmetic mean of avg checks for the group
    const avgCheckSum = processedData.reduce((acc, curr) => acc + curr.avgCheck, 0);
    const arithmeticMeanAvgCheck = processedData.length ? Math.round(avgCheckSum / processedData.length) : 0;

    return {
      salesCount: sum('salesCount'),
      revenue: sum('revenue'),
      accruedPoints: sum('accruedPoints'),
      redeemedPoints: sum('redeemedPoints'),
      newClients: sum('newClients'),
      avgCheck: arithmeticMeanAvgCheck,
      performanceScore: Math.round(sum('performanceScore') / processedData.length) // avg score
    };
  }, [filteredStaff, processedData]);

  // Leaders
  const leaders = useMemo(() => {
    if (processedData.length === 0) return null;
    return {
      score: [...processedData].sort((a, b) => b.performanceScore - a.performanceScore)[0],
      revenue: [...processedData].sort((a, b) => b.revenue - a.revenue)[0],
      acquisition: [...processedData].sort((a, b) => b.newClients - a.newClients)[0]
    };
  }, [processedData]);

  const uniqueOutlets = useMemo(() => {
    return Array.from(new Set(allStaffData.map(s => s.branch)));
  }, [allStaffData]);

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Активность персонала</h2>
           <p className="text-gray-500">Показатели эффективности сотрудников и KPI.</p>
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

           {/* Outlet Selector */}
           <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <Store size={16} className="text-gray-400" />
              <select 
                 value={selectedOutlet}
                 onChange={(e) => {
                     setSelectedOutlet(e.target.value);
                     // If grouping was on but we select specific outlet, it's redundant to group usually, 
                     // but logic handles it (data is already filtered to 1 branch).
                     // Optional: setGroupByEmployee(false); 
                 }}
                 className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
              >
                 <option>Все точки</option>
                 {uniqueOutlets.map(outlet => (
                    <option key={outlet}>{outlet}</option>
                 ))}
              </select>
           </div>
           
           {/* Group By Employee Toggle */}
           <button
             onClick={() => {
                if (selectedOutlet !== 'Все точки') {
                   // Optional warning or auto-switch to 'All'
                   setSelectedOutlet('Все точки');
                }
                setGroupByEmployee(!groupByEmployee);
             }}
             className={`flex items-center space-x-2 border rounded-lg px-3 py-2 shadow-sm text-sm font-medium transition-colors ${groupByEmployee ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
             title="Объединить статистику сотрудника по всем точкам"
           >
              <Users size={16} />
              <span>Объединить торговые точки</span>
           </button>
        </div>
      </div>

      {/* Performance Highlights */}
      {leaders && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {/* Employee of the Month (Score) */}
           <div className="bg-gradient-to-br from-white to-amber-50 p-5 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                 <Star size={64} className="text-amber-500" />
              </div>
              <div className="flex items-center space-x-3 mb-2">
                 <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                    <Medal size={20} />
                 </div>
                 <span className="text-sm font-semibold text-amber-900">Лучший сотрудник</span>
              </div>
              <div className="mt-2">
                 <h3 className="text-xl font-bold text-gray-900">{leaders.score.name}</h3>
                 <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-2xl font-bold text-amber-600">{leaders.score.performanceScore}</span>
                    <span className="text-sm text-gray-500">баллов</span>
                 </div>
                 <p className="text-xs text-gray-400 mt-1 line-clamp-1">{leaders.score.branch}</p>
              </div>
           </div>

           {/* Top Seller (Revenue) */}
           <div className="bg-gradient-to-br from-white to-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                 <TrendingUp size={64} className="text-purple-600" />
              </div>
              <div className="flex items-center space-x-3 mb-2">
                 <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                    <BadgeCheck size={20} />
                 </div>
                 <span className="text-sm font-semibold text-purple-900">Лучший продавец</span>
              </div>
              <div className="mt-2">
                 <h3 className="text-xl font-bold text-gray-900">{leaders.revenue.name}</h3>
                 <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(leaders.revenue.revenue)}</p>
                 <p className="text-xs text-gray-400 mt-1">{leaders.revenue.salesCount} транзакций</p>
              </div>
           </div>

           {/* Acquisition Star (New Clients) */}
           <div className="bg-gradient-to-br from-white to-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-10">
                 <UserPlus size={64} className="text-blue-600" />
              </div>
              <div className="flex items-center space-x-3 mb-2">
                 <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                    <UserPlus size={20} />
                 </div>
                 <span className="text-sm font-semibold text-blue-900">Лидер привлечения</span>
              </div>
              <div className="mt-2">
                 <h3 className="text-xl font-bold text-gray-900">{leaders.acquisition.name}</h3>
                 <p className="text-2xl font-bold text-blue-700 mt-1">+{leaders.acquisition.newClients} <span className="text-sm font-normal text-blue-600">новых клиентов</span></p>
                 <p className="text-xs text-gray-400 mt-1 line-clamp-1">{leaders.acquisition.branch}</p>
              </div>
           </div>
        </div>
      )}

      {/* Main Data Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Детальная эффективность</h3>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Сотрудник</th>
                     <th className="px-6 py-4 font-semibold">Филиал</th>
                     <th className="px-6 py-4 font-semibold text-center">Очки</th>
                     <th className="px-6 py-4 font-semibold text-right">Чеков</th>
                     <th className="px-6 py-4 font-semibold text-right">Выручка</th>
                     <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                     <th className="px-6 py-4 font-semibold text-right">Начисл.</th>
                     <th className="px-6 py-4 font-semibold text-right">Списано</th>
                     <th className="px-6 py-4 font-semibold text-right">Новые</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {processedData.map((staff) => (
                     <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                           <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 mr-3 text-xs font-bold flex-shrink-0">
                              {staff.name.split(' ').map(n => n[0]).join('')}
                           </div>
                           {staff.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                           <span className="inline-block px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 max-w-[150px] truncate" title={staff.branch}>
                              {staff.branch}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className={`font-bold ${staff.performanceScore >= 90 ? 'text-green-600' : staff.performanceScore >= 80 ? 'text-blue-600' : 'text-amber-600'}`}>
                              {staff.performanceScore}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">{staff.salesCount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(staff.revenue)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(staff.avgCheck)}</td>
                        <td className="px-6 py-4 text-right text-green-600">+{staff.accruedPoints.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-red-500">-{staff.redeemedPoints.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                              +{staff.newClients}
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
               {/* Summary Footer */}
               <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr className="font-bold text-gray-900">
                     <td className="px-6 py-4" colSpan={2}>ИТОГО / СРЕДНЕЕ</td>
                     <td className="px-6 py-4 text-center">{totals.performanceScore}</td>
                     <td className="px-6 py-4 text-right">{totals.salesCount.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right">{formatCurrency(totals.revenue)}</td>
                     <td className="px-6 py-4 text-right text-purple-700">{formatCurrency(totals.avgCheck)}</td>
                     <td className="px-6 py-4 text-right text-green-700">+{totals.accruedPoints.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right text-red-700">-{totals.redeemedPoints.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right">+{totals.newClients.toLocaleString()}</td>
                  </tr>
               </tfoot>
            </table>
         </div>
      </div>
    </div>
  );
};

export default StaffActivity;