import React, { useState, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { Users, ChevronDown, Filter } from 'lucide-react';

const ClientPortrait: React.FC = () => {
  const [selectedAudience, setSelectedAudience] = useState('Все клиенты');
  const [combinedMetric, setCombinedMetric] = useState<'clients' | 'avg_check' | 'revenue'>('clients');

  // --- Mock Data ---

  // 1. Gender Data
  const genderStats = {
    male: { share: 45, avgCheck: 650, sales: 1200, revenue: 780000, color: '#60A5FA' },
    female: { share: 55, avgCheck: 820, sales: 1800, revenue: 1476000, color: '#F472B6' }
  };

  const genderChartData = [
    { name: 'Мужчины', value: genderStats.male.share, color: genderStats.male.color },
    { name: 'Женщины', value: genderStats.female.share, color: genderStats.female.color },
  ];

  // 2. Age Data (General)
  const ageChartData = [
    { age: '18-24', clients: 150, avgCheck: 400, sales: 300, revenue: 120000 },
    { age: '25-34', clients: 450, avgCheck: 750, sales: 1200, revenue: 900000 },
    { age: '35-44', clients: 300, avgCheck: 950, sales: 900, revenue: 855000 },
    { age: '45-54', clients: 200, avgCheck: 800, sales: 500, revenue: 400000 },
    { age: '55+', clients: 100, avgCheck: 600, sales: 250, revenue: 150000 },
  ];

  // 3. Gender x Age Detailed Data
  const combinedData = useMemo(() => {
    // Generating granular data for ages 20-50
    const data = [];
    for (let i = 20; i <= 50; i += 2) {
      // Men logic
      const mClients = Math.floor(20 + Math.random() * 30 + (i > 25 && i < 40 ? 40 : 0));
      const mCheck = Math.floor(500 + Math.random() * 300);
      
      // Women logic
      const fClients = Math.floor(25 + Math.random() * 35 + (i > 25 && i < 40 ? 50 : 0));
      const fCheck = Math.floor(600 + Math.random() * 400);

      data.push({
        age: i.toString(),
        male_clients: mClients,
        male_avg_check: mCheck,
        male_revenue: mClients * mCheck,
        female_clients: fClients,
        female_avg_check: fCheck,
        female_revenue: fClients * fCheck,
      });
    }
    return data;
  }, [selectedAudience]); // Re-generate if audience changes (mock)

  const formatCurrency = (val: number) => `₽${val.toLocaleString()}`;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Портрет клиента</h2>
           <p className="text-gray-500">Демографический анализ и сегментация.</p>
        </div>
        
        <div className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
           <Filter size={18} className="text-purple-600" />
           <span className="text-sm font-medium text-gray-500">Аудитория:</span>
           <div className="relative">
             <select 
                value={selectedAudience}
                onChange={(e) => setSelectedAudience(e.target.value)}
                className="appearance-none bg-transparent pr-8 text-sm font-semibold text-gray-900 focus:outline-none cursor-pointer"
             >
               <option>Все клиенты</option>
               <option>Топ покупатели</option>
               <option>Новые посетители</option>
               <option>Потерянные</option>
             </select>
             <ChevronDown size={14} className="absolute right-0 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
           </div>
        </div>
      </div>

      {/* Row 1: Gender Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gender Share Chart */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
           <h3 className="text-lg font-bold text-gray-900 self-start mb-4">Распределение по полу</h3>
           <div className="h-48 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {genderChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `${val}%`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <Users size={24} className="text-gray-400 mb-1" />
                 <span className="text-sm font-semibold text-gray-500">Всего</span>
              </div>
           </div>
           <div className="flex w-full justify-around mt-4">
              {genderChartData.map(g => (
                <div key={g.name} className="flex items-center space-x-2">
                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }}></div>
                   <span className="text-sm font-medium text-gray-700">{g.name} <span className="text-gray-400">({g.value}%)</span></span>
                </div>
              ))}
           </div>
        </div>

        {/* Gender Metrics Comparison */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
           <h3 className="text-lg font-bold text-gray-900 mb-6">Сравнение по полу</h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Avg Check */}
              <div className="bg-gray-50 rounded-lg p-4">
                 <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Средний чек</span>
                 <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-blue-600">Мужчины</span>
                       <span className="text-lg font-bold text-gray-900">{formatCurrency(genderStats.male.avgCheck)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: '70%' }}></div>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-pink-500">Женщины</span>
                       <span className="text-lg font-bold text-gray-900">{formatCurrency(genderStats.female.avgCheck)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-pink-400 h-1.5 rounded-full" style={{ width: '90%' }}></div>
                    </div>
                 </div>
              </div>

              {/* Sales Count */}
              <div className="bg-gray-50 rounded-lg p-4">
                 <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Кол-во продаж</span>
                 <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-blue-600">Мужчины</span>
                       <span className="text-lg font-bold text-gray-900">{genderStats.male.sales}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: '60%' }}></div>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-pink-500">Женщины</span>
                       <span className="text-lg font-bold text-gray-900">{genderStats.female.sales}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-pink-400 h-1.5 rounded-full" style={{ width: '85%' }}></div>
                    </div>
                 </div>
              </div>

               {/* Revenue */}
               <div className="bg-gray-50 rounded-lg p-4">
                 <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Общая выручка</span>
                 <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-blue-600">Мужчины</span>
                       <span className="text-lg font-bold text-gray-900">{formatCurrency(genderStats.male.revenue)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: '55%' }}></div>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-pink-500">Женщины</span>
                       <span className="text-lg font-bold text-gray-900">{formatCurrency(genderStats.female.revenue)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                       <div className="bg-pink-400 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Row 2: Age Analytics */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-6">Аналитика по возрасту</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ageChartData} barSize={40}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
               <XAxis dataKey="age" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
               <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
               <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} unit="₽" />
               <Tooltip 
                 cursor={{ fill: 'transparent' }} 
                 contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
               />
               <Legend iconType="circle" />
               <Bar yAxisId="left" dataKey="clients" name="Клиенты" fill="#A78BFA" radius={[4, 4, 0, 0]} />
               <Bar yAxisId="right" dataKey="avgCheck" name="Ср. чек" fill="#34D399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Gender x Age Combined */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
           <div>
             <h3 className="text-lg font-bold text-gray-900">Детальная демография (Пол x Возраст)</h3>
             <p className="text-xs text-gray-500 mt-1">Гранулярная разбивка по возрасту и полу.</p>
           </div>
           
           {/* Metric Tabs */}
           <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
              <button
                 onClick={() => setCombinedMetric('clients')}
                 className={`px-4 py-1.5 rounded-md transition-all ${combinedMetric === 'clients' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                 Клиенты
              </button>
              <button
                 onClick={() => setCombinedMetric('avg_check')}
                 className={`px-4 py-1.5 rounded-md transition-all ${combinedMetric === 'avg_check' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                 Ср. чек
              </button>
              <button
                 onClick={() => setCombinedMetric('revenue')}
                 className={`px-4 py-1.5 rounded-md transition-all ${combinedMetric === 'revenue' ? 'bg-white shadow-sm text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                 Выручка
              </button>
           </div>
         </div>

         <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={combinedData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="age" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} label={{ value: 'Возраст', position: 'insideBottom', offset: -5, fontSize: 12, fill: '#9CA3AF' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                  <Tooltip 
                     cursor={{ fill: '#F3F4F6' }}
                     contentStyle={{ borderRadius: '8px' }}
                     formatter={(value: number) => combinedMetric !== 'clients' ? formatCurrency(value) : value}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle"/>
                  <Bar 
                    dataKey={`male_${combinedMetric}`} 
                    name="Мужчины" 
                    fill="#60A5FA" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Bar 
                    dataKey={`female_${combinedMetric}`} 
                    name="Женщины" 
                    fill="#F472B6" 
                    radius={[4, 4, 0, 0]} 
                  />
               </BarChart>
            </ResponsiveContainer>
         </div>
      </div>
    </div>
  );
};

export default ClientPortrait;