import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Calendar, ChevronDown, Info } from 'lucide-react';

// --- Types for this component ---
type RecencyGranularity = 'дни' | 'недели' | 'месяцы';
type ActivityPeriod = 'week' | 'month' | 'quarter' | 'year';
type ActivityMetric = 'sales' | 'revenue' | 'avg_check';

const ByTimeAnalytics: React.FC = () => {
  // --- State: Time Since Last Purchase ---
  const [recencyUnit, setRecencyUnit] = useState<RecencyGranularity>('дни');
  const [recencyDepth, setRecencyDepth] = useState<number>(30); // Default 30 units

  // --- State: Customer Activity & Heatmap ---
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('month');
  const [activityMetric, setActivityMetric] = useState<ActivityMetric>('revenue');

  // --- Mock Data Generators ---
  
  // 1. Recency Data Generator
  const recencyData = useMemo(() => {
    const data = [];
    const max = recencyUnit === 'дни' ? recencyDepth : (recencyUnit === 'недели' ? recencyDepth : recencyDepth);
    
    // Generate a decaying distribution curve
    for (let i = 1; i <= max; i++) {
      let val = 0;
      if (recencyUnit === 'дни') val = Math.floor(1000 * Math.exp(-0.1 * i) + Math.random() * 50);
      if (recencyUnit === 'недели') val = Math.floor(500 * Math.exp(-0.2 * i) + Math.random() * 20);
      if (recencyUnit === 'месяцы') val = Math.floor(200 * Math.exp(-0.1 * i) + Math.random() * 10);
      
      data.push({
        label: i.toString(),
        count: val
      });
    }
    return data;
  }, [recencyUnit, recencyDepth]);

  // 2. Activity Data Generator (Day of Week & Hour)
  const { dayOfWeekData, hourOfDayData, heatmapData } = useMemo(() => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const heatmap = [];
    
    // Generate Heatmap Data (7 days x 24 hours)
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        // Create peak patterns (lunch: 12-14, dinner: 18-21, weekends busy)
        let base = 10;
        if (h >= 12 && h <= 14) base += 40;
        if (h >= 18 && h <= 21) base += 50;
        if (d >= 5) base *= 1.5; // Weekends
        
        const randomFactor = Math.random() * 20;
        const val = Math.floor(base + randomFactor);
        
        heatmap.push({
          dayIndex: d,
          day: days[d],
          hour: h,
          value: activityMetric === 'revenue' ? val * 150 : (activityMetric === 'avg_check' ? 500 + Math.random() * 200 : val)
        });
      }
    }

    // Aggregate for charts
    const dayData = days.map((day, idx) => ({
      name: day,
      value: heatmap.filter(item => item.dayIndex === idx).reduce((acc, curr) => acc + curr.value, 0)
    }));

    const hourData = Array.from({ length: 24 }, (_, i) => ({
      name: i.toString().padStart(2, '0'),
      value: heatmap.filter(item => item.hour === i).reduce((acc, curr) => acc + curr.value, 0)
    }));

    // For avg check, we need to average the aggregates, not sum them, but for visual simplicity we'll just sum or take avg logic here
    if (activityMetric === 'avg_check') {
       dayData.forEach(d => d.value = Math.floor(d.value / 24));
       hourData.forEach(h => h.value = Math.floor(h.value / 7));
    }

    return { dayOfWeekData: dayData, hourOfDayData: hourData, heatmapData: heatmap };
  }, [activityPeriod, activityMetric]);

  // --- Helper for Heatmap Color ---
  const getHeatmapColor = (value: number, max: number) => {
    // Simple interpolation from very light purple to dark purple
    const intensity = Math.min(value / max, 1);
    if (intensity < 0.2) return '#F3E8FF'; // 50
    if (intensity < 0.4) return '#E9D5FF'; // 200
    if (intensity < 0.6) return '#C084FC'; // 400
    if (intensity < 0.8) return '#9333EA'; // 600
    return '#6B21A8'; // 800
  };

  const maxHeatmapValue = Math.max(...heatmapData.map(d => d.value));

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      <div className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Аналитика по времени</h2>
        <p className="text-gray-500">Анализ частоты покупок и временных паттернов поведения клиентов.</p>
      </div>

      {/* SECTION 1: Time Since Last Purchase */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
          <div>
             <h3 className="text-lg font-bold text-gray-900 flex items-center">
               Время с последней покупки
               <Info size={16} className="ml-2 text-gray-400 cursor-help" />
             </h3>
             <p className="text-xs text-gray-500 mt-1">Распределение клиентов по давности последнего заказа.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
             {/* Granularity Switcher */}
             <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
                {(['дни', 'недели', 'месяцы'] as RecencyGranularity[]).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => {
                        setRecencyUnit(unit);
                        setRecencyDepth(unit === 'дни' ? 30 : (unit === 'недели' ? 12 : 12)); // reset depth reasonable default
                    }}
                    className={`px-4 py-1.5 rounded-md capitalize transition-all ${recencyUnit === unit ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {unit}
                  </button>
                ))}
             </div>

             {/* Depth Slider */}
             <div className="flex items-center space-x-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
               <span className="text-sm text-gray-600 whitespace-nowrap">Глубина анализа:</span>
               <input 
                 type="range" 
                 min="5" 
                 max={recencyUnit === 'дни' ? 90 : 24} 
                 value={recencyDepth} 
                 onChange={(e) => setRecencyDepth(Number(e.target.value))}
                 className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
               />
               <span className="text-sm font-semibold text-purple-700 w-8 text-right">{recencyDepth}</span>
             </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
             <BarChart data={recencyData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                  label={{ value: `Время (${recencyUnit}) назад`, position: 'insideBottom', offset: -5, fill: '#9CA3AF', fontSize: 12 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  formatter={(value: number) => [`${value} Клиентов`, 'Кол-во']}
                  labelFormatter={(label) => `${label} ${recencyUnit} назад`}
                />
                <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={50} />
             </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 2: Customer Activity & Heatmap */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-8">
        
        {/* Controls Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 border-b border-gray-100 pb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Активность клиентов</h3>
            <p className="text-xs text-gray-500 mt-1">Определение пикового времени покупок и активности.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
             {/* Period Selector */}
             <div className="relative">
                <select 
                  className="appearance-none bg-white border border-gray-200 px-4 py-2 pr-8 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={activityPeriod}
                  onChange={(e) => setActivityPeriod(e.target.value as ActivityPeriod)}
                >
                  <option value="week">Эта неделя</option>
                  <option value="month">Этот месяц</option>
                  <option value="quarter">Этот квартал</option>
                  <option value="year">Этот год</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
             </div>

             {/* Metric Tabs */}
             <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
                <button onClick={() => setActivityMetric('sales')} className={`px-4 py-1.5 rounded-md capitalize transition-all ${activityMetric === 'sales' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Продажи</button>
                <button onClick={() => setActivityMetric('revenue')} className={`px-4 py-1.5 rounded-md capitalize transition-all ${activityMetric === 'revenue' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Выручка</button>
                <button onClick={() => setActivityMetric('avg_check')} className={`px-4 py-1.5 rounded-md capitalize transition-all ${activityMetric === 'avg_check' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Ср. чек</button>
             </div>
          </div>
        </div>

        {/* Aggregates Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {/* Activity by Day of Week */}
           <div className="h-56">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Активность по дням</h4>
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
           
           {/* Activity by Hour */}
           <div className="h-56">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">Активность по часам</h4>
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={hourOfDayData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} interval={2} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="#34D399" radius={[4, 4, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Heatmap Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Тепловая карта (День x Час)</h4>
          <div className="overflow-x-auto">
             <div className="min-w-[800px]">
                {/* Header Row (Hours) */}
                <div className="grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1 mb-2">
                   <div className="text-xs text-gray-400 font-medium"></div>
                   {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="text-[10px] text-gray-400 text-center font-medium">
                        {i.toString().padStart(2, '0')}
                      </div>
                   ))}
                </div>

                {/* Rows (Days) */}
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, dIdx) => (
                   <div key={day} className="grid grid-cols-[60px_repeat(24,minmax(0,1fr))] gap-1 mb-1 items-center">
                      <div className="text-xs text-gray-600 font-medium">{day}</div>
                      {heatmapData
                        .filter(d => d.dayIndex === dIdx)
                        .map((cell, cIdx) => (
                          <div 
                             key={cIdx} 
                             className="h-8 rounded-sm hover:ring-2 hover:ring-blue-400 transition-all relative group cursor-default"
                             style={{ backgroundColor: getHeatmapColor(cell.value, maxHeatmapValue) }}
                          >
                             {/* Tooltip */}
                             <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap z-10">
                                {day} {cell.hour}:00 - {activityMetric === 'avg_check' || activityMetric === 'revenue' ? '₽' : ''}{cell.value.toLocaleString()}
                             </div>
                          </div>
                      ))}
                   </div>
                ))}
             </div>
          </div>
          <div className="flex justify-end mt-2 items-center space-x-2 text-xs text-gray-500">
             <span>Низк.</span>
             <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#F3E8FF] to-[#6B21A8]"></div>
             <span>Выс.</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ByTimeAnalytics;