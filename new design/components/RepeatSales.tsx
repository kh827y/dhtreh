import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell
} from 'recharts';
import { Calendar, Store, Filter, EyeOff } from 'lucide-react';
import { KPIData } from '../types';
import StatCard from './StatCard';

const RepeatSales: React.FC = () => {
  // --- State ---
  const [period, setPeriod] = useState('Месяц');
  const [outlet, setOutlet] = useState('Все точки');
  const [hideThreshold, setHideThreshold] = useState(3.0); // Percentage threshold

  // --- Mock Data ---

  // 1. KPI Data
  const kpiStats: KPIData[] = [
    { label: 'Повторные покупатели', value: '854', trend: 'up', iconType: 'user' },
    { label: 'Новые покупатели', value: '142', trend: 'neutral', iconType: 'user' },
    { label: 'Уникальные покупатели', value: '996', trend: 'up', iconType: 'bar' },
  ];

  // 2. Purchase Frequency Distribution Data (Raw)
  const rawFrequencyData = [
    { purchases: 1, count: 450, share: 45.2 },
    { purchases: 2, count: 210, share: 21.1 },
    { purchases: 3, count: 120, share: 12.0 },
    { purchases: 4, count: 80, share: 8.0 },
    { purchases: 5, count: 50, share: 5.0 },
    { purchases: 6, count: 35, share: 3.5 },
    { purchases: 7, count: 20, share: 2.0 },
    { purchases: 8, count: 15, share: 1.5 },
    { purchases: 9, count: 10, share: 1.0 },
    { purchases: '10+', count: 6, share: 0.6 },
  ];

  // Filtered Data based on threshold
  const filteredData = useMemo(() => {
    return rawFrequencyData.filter(item => item.share >= hideThreshold);
  }, [hideThreshold]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Повторные продажи</h2>
           <p className="text-gray-500">Анализ удержания клиентов и частоты покупок.</p>
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
                 value={outlet}
                 onChange={(e) => setOutlet(e.target.value)}
                 className="bg-transparent text-sm text-gray-700 font-medium focus:outline-none cursor-pointer pr-4"
              >
                 <option>Все точки</option>
                 <option>Центральный магазин</option>
                 <option>ТЦ Плаза</option>
                 <option>Аэропорт</option>
              </select>
           </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpiStats.map((kpi, idx) => (
          <StatCard key={idx} data={kpi} />
        ))}
      </div>

      {/* Purchase Frequency Chart */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 space-y-4 md:space-y-0">
            <div>
               <h3 className="text-lg font-bold text-gray-900">Частота покупок</h3>
               <p className="text-xs text-gray-500 mt-1">Доля клиентов по количеству покупок за выбранный период.</p>
            </div>

            {/* Threshold Slider */}
            <div className="flex items-center space-x-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
               <div className="flex items-center space-x-2 text-gray-600">
                  <EyeOff size={16} />
                  <span className="text-xs font-medium uppercase tracking-wide">Скрыть долю ниже</span>
               </div>
               <input 
                  type="range" 
                  min="0" 
                  max="10" 
                  step="0.5"
                  value={hideThreshold}
                  onChange={(e) => setHideThreshold(Number(e.target.value))}
                  className="w-32 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-purple-600"
               />
               <span className="text-sm font-bold text-purple-700 w-12">{hideThreshold.toFixed(1)}%</span>
            </div>
         </div>

         <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={filteredData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis 
                     dataKey="purchases" 
                     axisLine={false} 
                     tickLine={false} 
                     tick={{ fill: '#6B7280', fontSize: 14 }}
                     label={{ value: 'Количество покупок', position: 'insideBottom', offset: -10, fill: '#9CA3AF', fontSize: 12 }} 
                  />
                  <YAxis 
                     axisLine={false} 
                     tickLine={false} 
                     tick={{ fill: '#6B7280', fontSize: 12 }}
                     unit="%"
                  />
                  <Tooltip 
                     cursor={{ fill: '#F3F4F6', radius: 4 }}
                     contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                     formatter={(value: number, name: string, props: any) => [
                        <div className="flex flex-col">
                           <span className="font-bold text-gray-900">{value}%</span>
                           <span className="text-xs text-gray-500 font-normal">{props.payload.count} клиентов</span>
                        </div>, 
                        ''
                     ]}
                     labelFormatter={(label) => `Покупки: ${label}`}
                  />
                  <Bar dataKey="share" radius={[4, 4, 0, 0]} maxBarSize={60}>
                     {filteredData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#60A5FA' : '#8B5CF6'} />
                     ))}
                     <LabelList dataKey="share" position="top" formatter={(val: number) => `${val}%`} fill="#6B7280" fontSize={12} />
                  </Bar>
               </BarChart>
            </ResponsiveContainer>
         </div>
      </div>

    </div>
  );
};

export default RepeatSales;