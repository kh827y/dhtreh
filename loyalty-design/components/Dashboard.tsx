import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShoppingBag, 
  CreditCard,
  Coins,
  Activity,
  Calendar as CalendarIcon,
  Check,
  Clock,
  UserPlus
} from 'lucide-react';
import { 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell,
  ComposedChart,
  Bar,
  Line
} from 'recharts';

// --- Types ---

type TimeFilter = 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
type ChartMetric = 'revenue' | 'registrations';

interface DashboardKPI {
  id: string;
  label: string;
  value: string;
  trendValue?: string; // e.g. "+12%"
  trendDirection?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: string; // tailwind color class base
}

const Dashboard: React.FC = () => {
  const [filter, setFilter] = useState<TimeFilter>('month');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  
  // State for custom date inputs
  const [customStart, setCustomStart] = useState('2023-12-01');
  const [customEnd, setCustomEnd] = useState('2023-12-31');
  
  // State for the displayed label (updated only on Apply or Quick Filter click)
  const [displayLabel, setDisplayLabel] = useState('Декабрь 2023');

  // --- Mock Data Generator ---
  const dashboardData = useMemo(() => {
    // Multipliers to simulate different data scales
    let multiplier = 1;
    let label = displayLabel;
    
    switch(filter) {
        case 'yesterday': 
            multiplier = 0.03; 
            label = 'Вчера'; 
            break;
        case 'week': 
            multiplier = 0.25; 
            label = 'Эта неделя'; 
            break;
        case 'month': 
            multiplier = 1; 
            label = 'Декабрь 2023'; 
            break;
        case 'quarter': 
            multiplier = 3; 
            label = '4 Квартал 2023'; 
            break;
        case 'year': 
            multiplier = 12; 
            label = '2023 год'; 
            break;
        case 'custom':
            multiplier = 1.5;
            // Label is handled by state, but we ensure logic reflects custom nature
            break;
    }

    // 1. Key Metrics (Financials)
    const revenue = Math.floor(2450000 * multiplier);
    const checks = Math.floor(1850 * multiplier);
    const newClientsTotal = Math.floor(145 * multiplier); 
    const avgCheck = Math.floor(1324 + (Math.random() * 100 - 50)); 
    const pointsBurned = Math.floor(45000 * multiplier);

    const kpis: DashboardKPI[] = [
      {
        id: 'revenue',
        label: 'Выручка',
        value: `${revenue.toLocaleString()} ₽`,
        trendValue: '+12.5%',
        trendDirection: 'up',
        icon: <CreditCard size={20} />,
        color: 'purple'
      },
      {
        id: 'registrations',
        label: 'Регистрации',
        value: `+${newClientsTotal.toLocaleString()}`,
        trendValue: '+8.4%',
        trendDirection: 'up',
        icon: <UserPlus size={20} />,
        color: 'emerald'
      },
      {
        id: 'avg_check',
        label: 'Средний чек',
        value: `${avgCheck.toLocaleString()} ₽`,
        trendValue: '-2.1%',
        trendDirection: 'down',
        icon: <TrendingUp size={20} />,
        color: 'blue'
      },
      {
        id: 'points',
        label: 'Списано баллов',
        value: pointsBurned.toLocaleString(),
        trendValue: '+8%',
        trendDirection: 'up',
        icon: <Coins size={20} />,
        color: 'orange'
      }
    ];

    // 2. Main Chart Data (Revenue Dynamics + Registrations)
    let trendPoints = 12;
    // Adjust data points based on filter for realism
    if (filter === 'yesterday') trendPoints = 24; // Hours
    if (filter === 'week') trendPoints = 7; // Days
    if (filter === 'month') trendPoints = 30; // Days
    if (filter === 'quarter') trendPoints = 12; // Weeks approx
    if (filter === 'year') trendPoints = 12; // Months
    if (filter === 'custom') trendPoints = 15; // Mock for custom
    
    const trendData = Array.from({ length: trendPoints }).map((_, i) => {
        let name = `${i+1}`;
        if (filter === 'yesterday') name = `${i}:00`;
        if (filter === 'week') {
            const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
            name = days[i % 7];
        }
        if (filter === 'year') {
            const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
            name = months[i];
        }
        
        // Simulating some peaks for registrations
        const regBase = Math.floor(newClientsTotal / trendPoints);
        const isPeak = Math.random() > 0.8;
        
        // Simulating prev registrations (slightly lower usually for "growth" trend)
        const prevRegBase = Math.floor(regBase * 0.9);
        
        return {
            name: name,
            revenue: Math.floor(revenue / trendPoints + (Math.random() * revenue/(trendPoints*2)) - revenue/(trendPoints*4)),
            prevRevenue: Math.floor(revenue / trendPoints + (Math.random() * revenue/(trendPoints*3)) - revenue/(trendPoints*5)),
            registrations: isPeak ? regBase * 3 : Math.max(0, Math.floor(regBase + (Math.random() * 5 - 2))),
            prevRegistrations: Math.max(0, Math.floor(prevRegBase + (Math.random() * 3 - 1)))
        };
    });

    // 3. Loyalty Health Metrics
    const loyaltyMetrics = {
        avgPurchasesPerClient: (3.2 + Math.random()).toFixed(1),
        avgDaysBetweenVisits: Math.floor(14 + Math.random() * 4),
        retentionRate: 72,
        activeBase: Math.floor(checks * 0.7)
    };

    // 4. New vs Returning (Pie Data)
    const compositionData = [
        { name: 'Повторные', value: Math.floor(checks * 0.75), color: '#8B5CF6' },
        { name: 'Новые', value: Math.floor(checks * 0.25), color: '#34D399' },
    ];

    return { label, kpis, trendData, loyaltyMetrics, compositionData, totalChecks: checks };
  }, [filter, displayLabel]); // Re-run when filter or explicit label changes

  // Handlers
  const handleQuickFilter = (f: TimeFilter) => {
      setFilter(f);
      // Reset label for quick filters
      if (f === 'yesterday') setDisplayLabel('Вчера');
      if (f === 'week') setDisplayLabel('Эта неделя');
      if (f === 'month') setDisplayLabel('Декабрь 2023');
      if (f === 'quarter') setDisplayLabel('4 Квартал 2023');
      if (f === 'year') setDisplayLabel('2023 год');
  };

  const handleApplyCustom = () => {
      if (!customStart || !customEnd) return;
      
      const formatDate = (d: string) => d.split('-').reverse().join('.');
      setDisplayLabel(`${formatDate(customStart)} - ${formatDate(customEnd)}`);
      setFilter('custom'); // Ensure filter is set to custom mode
      // Logic to fetch real data would go here
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* 1. Header & Filters */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center space-y-4 xl:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Сводный отчет</h2>
           <p className="text-gray-500 mt-1">Ключевые показатели эффективности за <span className="font-medium text-gray-900">{dashboardData.label}</span>.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
           {/* Filter Group */}
           <div className="bg-white p-1 rounded-xl border border-gray-200 flex flex-wrap shadow-sm">
              {(['yesterday', 'week', 'month', 'quarter', 'year'] as TimeFilter[]).map((t) => (
                 <button
                   key={t}
                   onClick={() => handleQuickFilter(t)}
                   className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      filter === t 
                      ? 'bg-gray-900 text-white shadow-md' 
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                   }`}
                 >
                    {t === 'yesterday' && 'Вчера'}
                    {t === 'week' && 'Неделя'}
                    {t === 'month' && 'Месяц'}
                    {t === 'quarter' && 'Квартал'}
                    {t === 'year' && 'Год'}
                 </button>
              ))}
              
              {/* Custom Filter Toggle */}
              <button
                 onClick={() => setFilter('custom')}
                 className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    filter === 'custom'
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                 }`}
              >
                 Произвольный
              </button>
           </div>

           {/* Custom Date Inputs - Visible only when 'custom' is active */}
           {filter === 'custom' && (
               <div className="flex items-center space-x-2 bg-white p-1.5 rounded-xl border border-purple-200 shadow-sm animate-fade-in ring-2 ring-purple-50">
                  <div className="flex items-center px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs text-gray-400 mr-2">От</span>
                      <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-32"
                      />
                  </div>
                  <div className="flex items-center px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs text-gray-400 mr-2">До</span>
                      <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none w-32"
                      />
                  </div>
                  <button 
                    onClick={handleApplyCustom}
                    className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    title="Применить период"
                  >
                     <Check size={16} />
                  </button>
               </div>
           )}
        </div>
      </div>

      {/* 2. Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         {dashboardData.kpis.map((kpi) => (
            <div key={kpi.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex justify-between items-start mb-4">
                  <div className={`p-2.5 rounded-xl bg-${kpi.color}-50 text-${kpi.color}-600`}>
                     {kpi.icon}
                  </div>
                  {kpi.trendValue && (
                      <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${
                          kpi.trendDirection === 'up' ? 'bg-green-50 text-green-700' : 
                          kpi.trendDirection === 'down' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                         {kpi.trendDirection === 'up' ? <TrendingUp size={12} className="mr-1"/> : 
                          kpi.trendDirection === 'down' ? <TrendingDown size={12} className="mr-1"/> : null}
                         {kpi.trendValue}
                      </div>
                  )}
               </div>
               <div>
                  <span className="text-sm font-medium text-gray-500">{kpi.label}</span>
                  <div className="flex items-baseline mt-1">
                     <h3 className="text-2xl font-bold text-gray-900">{kpi.value}</h3>
                  </div>
               </div>
            </div>
         ))}
      </div>

      {/* 3. Main Chart & Loyalty Composition */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         
         {/* Main Chart: Revenue OR Registrations */}
         <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
               <div>
                   <h3 className="text-lg font-bold text-gray-900">
                      {chartMetric === 'revenue' ? 'Динамика выручки' : 'Динамика регистраций'}
                   </h3>
                   <p className="text-xs text-gray-500 mt-1">Сравнение с предыдущим периодом</p>
               </div>
               
               <div className="flex items-center space-x-3">
                  {/* Chart Toggle */}
                  <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
                      <button 
                        onClick={() => setChartMetric('revenue')}
                        className={`px-3 py-1.5 rounded-md transition-all ${chartMetric === 'revenue' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Выручка
                      </button>
                      <button 
                        onClick={() => setChartMetric('registrations')}
                        className={`px-3 py-1.5 rounded-md transition-all ${chartMetric === 'registrations' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Регистрации
                      </button>
                  </div>
               </div>
            </div>

            {/* Legend (Visual only) */}
            <div className="flex items-center space-x-4 text-xs font-medium mb-4">
                <div className="flex items-center text-gray-700">
                    <span className={`w-2.5 h-2.5 rounded-sm mr-2 ${chartMetric === 'revenue' ? 'bg-purple-600' : 'bg-emerald-500'}`}></span>
                    Текущий период
                </div>
                <div className="flex items-center text-gray-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 mr-2 border border-gray-300"></span>
                    Прошлый период
                </div>
            </div>

            <div className="flex-1 min-h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dashboardData.trendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15}/>
                           <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                     <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                        dy={10} 
                        interval="preserveStartEnd"
                     />
                     <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                        tickFormatter={(value) => chartMetric === 'revenue' ? `${(value / 1000).toFixed(0)}k` : value}
                     />
                     <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                        formatter={(value: number, name: string) => {
                            if (name === 'registrations') return [`${value} чел.`, 'Регистрации'];
                            if (name === 'prevRegistrations') return [`${value} чел.`, 'Прошлые регистрации'];
                            if (name === 'revenue') return [`${value.toLocaleString()} ₽`, 'Выручка'];
                            if (name === 'prevRevenue') return [`${value.toLocaleString()} ₽`, 'Прошлая выручка'];
                            return [value, name];
                        }}
                     />
                     
                     {/* Revenue Layers */}
                     {chartMetric === 'revenue' && (
                        <>
                            <Area 
                                type="monotone" 
                                dataKey="prevRevenue" 
                                stroke="#E5E7EB" 
                                strokeWidth={2} 
                                fill="transparent" 
                                strokeDasharray="5 5"
                                isAnimationActive={false}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="revenue" 
                                stroke="#8B5CF6" 
                                strokeWidth={3} 
                                fill="url(#colorRevenue)" 
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                        </>
                     )}

                     {/* Registration Layers */}
                     {chartMetric === 'registrations' && (
                        <>
                            <Line 
                                type="monotone" 
                                dataKey="prevRegistrations" 
                                stroke="#E5E7EB" 
                                strokeWidth={2} 
                                dot={false}
                                strokeDasharray="5 5"
                                isAnimationActive={false}
                            />
                            <Bar 
                                dataKey="registrations" 
                                fill="#34D399" 
                                barSize={20} 
                                radius={[4, 4, 0, 0]}
                            />
                        </>
                     )}
                  </ComposedChart>
               </ResponsiveContainer>
            </div>
         </div>

         {/* Customer Composition (Pie Chart) */}
         <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Структура продаж</h3>
            <p className="text-xs text-gray-500 mb-6">Доля покупок по типу клиента</p>
            
            <div className="flex-1 flex flex-col justify-center items-center">
                <div className="h-[220px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={dashboardData.compositionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {dashboardData.compositionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip 
                                cursor={{fill: 'transparent'}}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold text-gray-900">{dashboardData.totalChecks.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">чеков</span>
                    </div>
                </div>
                
                <div className="w-full mt-6 space-y-3">
                    {dashboardData.compositionData.map((item, index) => {
                        const percent = Math.round((item.value / dashboardData.totalChecks) * 100);
                        return (
                            <div key={index} className="flex items-center justify-between text-sm">
                                <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                                    <span className="text-gray-600">{item.name}</span>
                                </div>
                                <div className="font-semibold text-gray-900">
                                    {percent}%
                                    <span className="text-gray-400 font-normal ml-1">({item.value})</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
         </div>
      </div>

      {/* 4. Loyalty Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         
         {/* Metric 1: Avg Purchases */}
         <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
            <div className="flex justify-between items-start">
               <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Покупок на клиента</h3>
                  <div className="mt-2 flex items-baseline space-x-2">
                     <span className="text-3xl font-bold text-gray-900">{dashboardData.loyaltyMetrics.avgPurchasesPerClient}</span>
                     <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">+0.3</span>
                  </div>
               </div>
               <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ShoppingBag size={24} />
               </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4">
               <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '65%' }}></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Среднее количество чеков на одного уникального клиента за период.</p>
         </div>

         {/* Metric 2: Frequency */}
         <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
            <div className="flex justify-between items-start">
               <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Частота визитов</h3>
                  <div className="mt-2 flex items-baseline space-x-2">
                     <span className="text-3xl font-bold text-gray-900">{dashboardData.loyaltyMetrics.avgDaysBetweenVisits}</span>
                     <span className="text-sm font-medium text-gray-400">дней</span>
                  </div>
               </div>
               <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
                  <Clock size={24} />
               </div>
            </div>
            <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs font-medium text-green-600 flex items-center">
                   <TrendingDown size={12} className="mr-1" />
                   -1.2 дня
                </span>
                <span className="text-xs text-gray-400">ср. время между покупками</span>
            </div>
            <p className="text-xs text-gray-400 mt-auto pt-2">
               Чем меньше это число, тем чаще клиенты возвращаются к вам.
            </p>
         </div>

         {/* Metric 3: Active Base / Retention */}
         <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-[160px]">
            <div className="flex justify-between items-start">
               <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Активная база</h3>
                  <div className="mt-2 flex items-baseline space-x-2">
                     <span className="text-3xl font-bold text-gray-900">{dashboardData.loyaltyMetrics.activeBase}</span>
                     <span className="text-sm font-medium text-gray-400">клиентов</span>
                  </div>
               </div>
               <div className="p-3 bg-pink-50 text-pink-600 rounded-xl">
                  <Activity size={24} />
               </div>
            </div>
            
            <div className="flex items-center justify-between mt-auto pt-2">
                <div className="text-xs">
                    <span className="text-gray-500 block">Удержание (Retention)</span>
                    <span className="text-gray-900 font-bold text-sm">{dashboardData.loyaltyMetrics.retentionRate}%</span>
                </div>
                <div className="text-xs text-right">
                    <span className="text-gray-500 block">Отток (Churn)</span>
                    <span className="text-red-500 font-bold text-sm">{100 - dashboardData.loyaltyMetrics.retentionRate}%</span>
                </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 flex overflow-hidden">
               <div className="bg-green-500 h-full" style={{ width: `${dashboardData.loyaltyMetrics.retentionRate}%` }}></div>
               <div className="bg-red-400 h-full" style={{ width: `${100 - dashboardData.loyaltyMetrics.retentionRate}%` }}></div>
            </div>
         </div>

      </div>

    </div>
  );
};

export default Dashboard;