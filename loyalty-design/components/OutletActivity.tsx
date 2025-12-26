import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Store, 
  Award, 
  TrendingUp, 
  Users, 
  ArrowUpRight, 
  ArrowDownRight,
  Trophy,
  ShoppingBag
} from 'lucide-react';

interface OutletData {
  id: string;
  name: string;
  salesCount: number;
  revenue: number;
  accruedPoints: number;
  redeemedPoints: number;
  customerCount: number;
  newClients: number;
}

const OutletActivity: React.FC = () => {
  const [period, setPeriod] = useState('Месяц');

  // Mock Data
  const outletData: OutletData[] = useMemo(() => [
    { id: '1', name: 'Флагманский магазин', salesCount: 1250, revenue: 2450000, accruedPoints: 12000, redeemedPoints: 8500, customerCount: 850, newClients: 120 },
    { id: '2', name: 'ТЦ Сити Молл', salesCount: 980, revenue: 1650000, accruedPoints: 9500, redeemedPoints: 3200, customerCount: 720, newClients: 45 },
    { id: '3', name: 'Киоск Аэропорт', salesCount: 2100, revenue: 1050000, accruedPoints: 4200, redeemedPoints: 1100, customerCount: 1900, newClients: 350 },
    { id: '4', name: 'Онлайн магазин', salesCount: 560, revenue: 3100000, accruedPoints: 25000, redeemedPoints: 15000, customerCount: 500, newClients: 25 },
    { id: '5', name: 'Филиал Пригород', salesCount: 450, revenue: 890000, accruedPoints: 5000, redeemedPoints: 4100, customerCount: 300, newClients: 60 },
  ], [period]); // Dependency on period just to simulate refresh in real app

  // Calculations
  const processedData = useMemo(() => {
    return outletData.map(outlet => ({
      ...outlet,
      avgCheck: Math.round(outlet.revenue / outlet.salesCount)
    }));
  }, [outletData]);

  const totals = useMemo(() => {
    const sum = (key: keyof OutletData) => outletData.reduce((acc, curr) => acc + (curr[key] as number), 0);
    
    // Arithmetic mean of avg checks as requested
    const avgCheckSum = processedData.reduce((acc, curr) => acc + curr.avgCheck, 0);
    const arithmeticMeanAvgCheck = Math.round(avgCheckSum / processedData.length);

    return {
      salesCount: sum('salesCount'),
      revenue: sum('revenue'),
      accruedPoints: sum('accruedPoints'),
      redeemedPoints: sum('redeemedPoints'),
      customerCount: sum('customerCount'),
      newClients: sum('newClients'),
      avgCheck: arithmeticMeanAvgCheck
    };
  }, [outletData, processedData]);

  const leaders = useMemo(() => {
    return {
      revenue: [...outletData].sort((a, b) => b.revenue - a.revenue)[0],
      newClients: [...outletData].sort((a, b) => b.newClients - a.newClients)[0],
      traffic: [...outletData].sort((a, b) => b.salesCount - a.salesCount)[0]
    };
  }, [outletData]);

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Активность точек</h2>
           <p className="text-gray-500">Показатели эффективности по локациям и точкам продаж.</p>
        </div>
        
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
      </div>

      {/* Performance Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Revenue Leader */}
         <div className="bg-gradient-to-br from-white to-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
               <Trophy size={64} className="text-purple-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
               <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                  <Award size={20} />
               </div>
               <span className="text-sm font-semibold text-purple-900">Лидер по выручке</span>
            </div>
            <div className="mt-2">
               <h3 className="text-xl font-bold text-gray-900">{leaders.revenue.name}</h3>
               <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(leaders.revenue.revenue)}</p>
            </div>
         </div>

         {/* New Clients Leader */}
         <div className="bg-gradient-to-br from-white to-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
               <Users size={64} className="text-blue-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
               <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <TrendingUp size={20} />
               </div>
               <span className="text-sm font-semibold text-blue-900">Лидер роста</span>
            </div>
            <div className="mt-2">
               <h3 className="text-xl font-bold text-gray-900">{leaders.newClients.name}</h3>
               <p className="text-2xl font-bold text-blue-700 mt-1">+{leaders.newClients.newClients} <span className="text-sm font-normal text-blue-600">новых клиентов</span></p>
            </div>
         </div>

         {/* Traffic Leader */}
         <div className="bg-gradient-to-br from-white to-green-50 p-5 rounded-xl border border-green-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
               <ShoppingBag size={64} className="text-green-600" />
            </div>
            <div className="flex items-center space-x-3 mb-2">
               <div className="bg-green-100 p-2 rounded-lg text-green-600">
                  <Store size={20} />
               </div>
               <span className="text-sm font-semibold text-green-900">Макс. трафик</span>
            </div>
            <div className="mt-2">
               <h3 className="text-xl font-bold text-gray-900">{leaders.traffic.name}</h3>
               <p className="text-2xl font-bold text-green-700 mt-1">{leaders.traffic.salesCount.toLocaleString()} <span className="text-sm font-normal text-green-600">транзакций</span></p>
            </div>
         </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
         <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Эффективность точек</h3>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
               <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                  <tr>
                     <th className="px-6 py-4 font-semibold">Точка</th>
                     <th className="px-6 py-4 font-semibold text-right">Чеков</th>
                     <th className="px-6 py-4 font-semibold text-right">Выручка</th>
                     <th className="px-6 py-4 font-semibold text-right">Ср. чек</th>
                     <th className="px-6 py-4 font-semibold text-right">Начисл.</th>
                     <th className="px-6 py-4 font-semibold text-right">Списано</th>
                     <th className="px-6 py-4 font-semibold text-right">Клиентов</th>
                     <th className="px-6 py-4 font-semibold text-right">Новые</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {processedData.map((outlet) => (
                     <tr key={outlet.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center">
                           <Store size={16} className="text-gray-400 mr-2" />
                           {outlet.name}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">{outlet.salesCount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(outlet.revenue)}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{formatCurrency(outlet.avgCheck)}</td>
                        <td className="px-6 py-4 text-right text-green-600">+{outlet.accruedPoints.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-red-500">-{outlet.redeemedPoints.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-gray-600">{outlet.customerCount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              +{outlet.newClients}
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
               {/* Summary Footer */}
               <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr className="font-bold text-gray-900">
                     <td className="px-6 py-4">ИТОГО</td>
                     <td className="px-6 py-4 text-right">{totals.salesCount.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right">{formatCurrency(totals.revenue)}</td>
                     <td className="px-6 py-4 text-right text-purple-700">{formatCurrency(totals.avgCheck)}</td>
                     <td className="px-6 py-4 text-right text-green-700">+{totals.accruedPoints.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right text-red-700">-{totals.redeemedPoints.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right">{totals.customerCount.toLocaleString()}</td>
                     <td className="px-6 py-4 text-right">+{totals.newClients.toLocaleString()}</td>
                  </tr>
               </tfoot>
            </table>
         </div>
      </div>
    </div>
  );
};

export default OutletActivity;