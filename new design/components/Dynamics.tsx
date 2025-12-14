import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ComposedChart, Bar, Line, Legend, ReferenceLine
} from 'recharts';
import { Calendar, Coins, ArrowUpRight, ArrowDownRight, MinusCircle } from 'lucide-react';

type Granularity = 'дни' | 'недели' | 'месяцы';

const Dynamics: React.FC = () => {
  const [period, setPeriod] = useState('Месяц');
  const [granularity, setGranularity] = useState<Granularity>('дни');
  
  // Visibility State for Chart Metrics
  const [visibleMetrics, setVisibleMetrics] = useState({
     accrued: true,
     redeemedVis: true,
     expiredVis: true,
     balance: true
  });

  // --- Mock Data Generators ---

  // Generate data based on granularity
  const dynamicsData = useMemo(() => {
    const data = [];
    const count = granularity === 'дни' ? 30 : (granularity === 'недели' ? 12 : 12);
    
    let currentBalance = 15000;

    for (let i = 1; i <= count; i++) {
      const label = granularity === 'дни' ? `${i} Дек` : (granularity === 'недели' ? `Н${i}` : `Месяц ${i}`);
      
      // Random generation with some sparse data to look realistic like screenshot
      const hasAccrual = Math.random() > 0.3;
      const hasRedemption = Math.random() > 0.6;
      const hasExpiration = i % 6 === 0; // Occasional expiration

      const avgCheck = Math.floor(500 + Math.random() * 200 + (i * 2));
      
      const accrued = hasAccrual ? Math.floor(100 + Math.random() * 400) : 0;
      const redeemed = hasRedemption ? Math.floor(50 + Math.random() * 300) : 0;
      const expired = hasExpiration ? Math.floor(20 + Math.random() * 80) : 0;
      
      currentBalance = currentBalance + accrued - redeemed - expired;

      data.push({
        label,
        avgCheck,
        accrued,
        redeemed,
        expired,
        balance: currentBalance
      });
    }
    return data;
  }, [granularity]);

  const totals = useMemo(() => {
    return dynamicsData.reduce((acc, curr) => ({
      accrued: acc.accrued + curr.accrued,
      redeemed: acc.redeemed + curr.redeemed,
      expired: acc.expired + curr.expired,
      balance: curr.balance // take last
    }), { accrued: 0, redeemed: 0, expired: 0, balance: 0 });
  }, [dynamicsData]);

  // Prepare chart data with negative values for visual representation
  const chartData = useMemo(() => {
    return dynamicsData.map(d => ({
      ...d,
      redeemedVis: -d.redeemed,
      expiredVis: -d.expired
    }));
  }, [dynamicsData]);

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  const toggleMetric = (dataKey: string) => {
      // Recharts Legend onClick returns data object including dataKey
      if (!dataKey) return;
      
      // Map legend values to state keys if needed, or rely on them matching
      setVisibleMetrics(prev => ({
          ...prev,
          [dataKey as keyof typeof prev]: !prev[dataKey as keyof typeof prev]
      }));
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Динамика</h2>
           <p className="text-gray-500">Отслеживание изменения ключевых показателей.</p>
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

           {/* Granularity Tabs */}
           <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
              {(['дни', 'недели', 'месяцы'] as Granularity[]).map((g) => (
                 <button
                   key={g}
                   onClick={() => setGranularity(g)}
                   className={`px-4 py-1.5 rounded-md capitalize transition-all ${granularity === g ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                   {g}
                 </button>
              ))}
           </div>
        </div>
      </div>

      {/* SECTION 1: Average Check Analysis */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
         <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900">Динамика среднего чека</h3>
            <p className="text-xs text-gray-500 mt-1">Тенденция изменения среднего чека на одного клиента.</p>
         </div>

         <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={dynamicsData}>
                  <defs>
                     <linearGradient id="colorAvgCheck" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                     </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} unit="₽" />
                  <Tooltip 
                     contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                     formatter={(val: number) => [formatCurrency(val), 'Ср. чек']}
                  />
                  <Area 
                     type="monotone" 
                     dataKey="avgCheck" 
                     stroke="#8B5CF6" 
                     strokeWidth={2}
                     fillOpacity={1} 
                     fill="url(#colorAvgCheck)" 
                     activeDot={{ r: 6 }}
                  />
               </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      {/* SECTION 2: Points Economy */}
      <div className="space-y-6">
         <div className="flex items-center space-x-2">
            <Coins className="text-yellow-500" size={24} />
            <h3 className="text-xl font-bold text-gray-900">Экономика баллов</h3>
         </div>

         {/* Points Cards */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Accrued */}
            <div className={`bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-opacity ${!visibleMetrics.accrued ? 'opacity-50' : ''}`}>
               <span className="text-sm font-medium text-gray-500">Начислено</span>
               <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-green-600">+{totals.accrued.toLocaleString()}</span>
                  <div className="bg-green-100 p-1.5 rounded-full">
                     <ArrowUpRight size={16} className="text-green-600" />
                  </div>
               </div>
            </div>

            {/* Redeemed */}
            <div className={`bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-opacity ${!visibleMetrics.redeemedVis ? 'opacity-50' : ''}`}>
               <span className="text-sm font-medium text-gray-500">Списано</span>
               <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-orange-500">-{totals.redeemed.toLocaleString()}</span>
                  <div className="bg-orange-100 p-1.5 rounded-full">
                     <ArrowDownRight size={16} className="text-orange-500" />
                  </div>
               </div>
            </div>

             {/* Expired */}
             <div className={`bg-white p-5 rounded-xl border border-gray-100 shadow-sm transition-opacity ${!visibleMetrics.expiredVis ? 'opacity-50' : ''}`}>
               <span className="text-sm font-medium text-gray-500">Сгорело</span>
               <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-gray-500">{totals.expired.toLocaleString()}</span>
                  <div className="bg-gray-100 p-1.5 rounded-full">
                     <MinusCircle size={16} className="text-gray-500" />
                  </div>
               </div>
            </div>

            {/* Current Balance (Line) */}
            <div className={`bg-gradient-to-br from-purple-600 to-indigo-700 p-5 rounded-xl shadow-md text-white transition-opacity ${!visibleMetrics.balance ? 'opacity-50' : ''}`}>
               <span className="text-sm font-medium text-purple-100">Общий баланс</span>
               <div className="mt-2">
                  <span className="text-2xl font-bold">{totals.balance.toLocaleString()}</span>
               </div>
               <div className="mt-2 text-xs text-purple-200">Текущие активные баллы</div>
            </div>
         </div>

         {/* Points Chart */}
         <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h4 className="text-lg font-bold text-gray-900 mb-6">Движение баллов</h4>
            <div className="h-[400px]">
               <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} stackOffset="sign">
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                     <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                     
                     <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                     <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                     
                     <Tooltip 
                        cursor={{ fill: '#F9FAFB', opacity: 0.5 }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        formatter={(value: number, name: string) => {
                           const absValue = Math.abs(value);
                           if (name === 'Списано' || name === 'Сгорело') return [absValue.toLocaleString(), name];
                           return [value.toLocaleString(), name];
                        }}
                     />
                     <Legend 
                        verticalAlign="top" 
                        height={36} 
                        iconType="circle" 
                        onClick={(e) => toggleMetric(e.dataKey)}
                        formatter={(value, entry: any) => {
                             const key = entry.dataKey;
                             const isHidden = !visibleMetrics[key as keyof typeof visibleMetrics];
                             return <span style={{ color: isHidden ? '#AAA' : '#374151', textDecoration: isHidden ? 'line-through' : 'none', cursor: 'pointer' }}>{value}</span>;
                        }}
                     />
                     <ReferenceLine yAxisId="left" y={0} stroke="#E5E7EB" strokeWidth={2} />

                     <Bar 
                        yAxisId="left" 
                        dataKey="accrued" 
                        name="Начислено" 
                        stackId="stack" 
                        fill="#34D399" 
                        radius={[4, 4, 0, 0]} 
                        barSize={20} 
                        hide={!visibleMetrics.accrued}
                     />
                     <Bar 
                        yAxisId="left" 
                        dataKey="redeemedVis" 
                        name="Списано" 
                        stackId="stack" 
                        fill="#FB923C" 
                        radius={[0, 0, 4, 4]} 
                        barSize={20} 
                        hide={!visibleMetrics.redeemedVis}
                     />
                     <Bar 
                        yAxisId="left" 
                        dataKey="expiredVis" 
                        name="Сгорело" 
                        stackId="stack" 
                        fill="#F87171" 
                        radius={[0, 0, 4, 4]} 
                        barSize={20} 
                        hide={!visibleMetrics.expiredVis}
                     />
                     
                     <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="balance" 
                        name="Баланс" 
                        stroke="#A855F7" 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: '#A855F7' }} 
                        activeDot={{ r: 6, fill: '#A855F7', stroke: '#fff', strokeWidth: 2 }} 
                        hide={!visibleMetrics.balance}
                     />
                  </ComposedChart>
               </ResponsiveContainer>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Dynamics;