import React, { useState, useMemo } from 'react';
import { Info, Settings2, HelpCircle, X, Sliders } from 'lucide-react';

interface RFMCombination {
  r: number;
  f: number;
  m: number;
  count: number;
}

const RFMAnalysis: React.FC = () => {
  const [showInfo, setShowInfo] = useState(true);
  const [mode, setMode] = useState<'Auto' | 'Manual'>('Auto');
  
  // Settings State
  const [lostRecencyDays, setLostRecencyDays] = useState(90);
  const [loyalFreqCount, setLoyalFreqCount] = useState(10);
  const [loyalMoneyAmount, setLoyalMoneyAmount] = useState(50000);

  // Mock Combinations Data
  const combinations: RFMCombination[] = useMemo(() => {
    // Generate some random distributions
    const combos = [];
    for (let r = 1; r <= 5; r++) {
      for (let f = 1; f <= 5; f++) {
        for (let m = 1; m <= 5; m++) {
          // Weight logic: 5-5-5 is rare, 1-1-1 is common, etc.
          let weight = 10;
          if (r === 5 && f === 5 && m === 5) weight = 2; // VIPs are few
          if (r === 1 && f === 1 && m === 1) weight = 50; // Lost cheap customers are many
          
          if (Math.random() > 0.3) {
             combos.push({
               r, f, m,
               count: Math.floor(Math.random() * weight) + 1
             });
          }
        }
      }
    }
    return combos.sort((a, b) => b.count - a.count);
  }, []);

  // Aggregated Data for the Matrix Table
  const getAggregatedCounts = (type: 'r' | 'f' | 'm', score: number) => {
    return combinations
      .filter(c => c[type] === score)
      .reduce((sum, curr) => sum + curr.count, 0);
  };

  // Helper to get range labels based on settings (Dynamic visualization of settings)
  const getRangeLabel = (type: 'r' | 'f' | 'm', score: number) => {
    // Even in Auto mode, we display the values derived from the (simulated) system calculation
    // which effectively matches the current state variables in this mock.

    if (type === 'r') {
      // Recency: Score 1 is bad (> lostRecencyDays), Score 5 is good (recent, e.g., < 14 days)
      const bestLimit = 14; 
      const worstLimit = lostRecencyDays;
      const spread = worstLimit - bestLimit;
      const step = Math.round(spread / 3);

      if (score === 5) return `< ${bestLimit} дн.`;
      if (score === 1) return `> ${worstLimit} дн.`;
      
      // Interpolate 2, 3, 4
      // Score 4 is close to 5, Score 2 is close to 1
      if (score === 4) return `${bestLimit} - ${bestLimit + step} дн.`;
      if (score === 3) return `${bestLimit + step} - ${bestLimit + 2 * step} дн.`;
      if (score === 2) return `${bestLimit + 2 * step} - ${worstLimit} дн.`;
    }

    if (type === 'f') {
      // Frequency: Score 5 is good (> loyalFreqCount), Score 1 is bad (1 order)
      const min = 1;
      const max = loyalFreqCount;
      
      if (score === 5) return `> ${max} зак.`;
      if (score === 1) return `1 зак.`;

      // Simple interpolation
      // If max is 10: 1, 2-4, 5-7, 8-9, 10+
      const range = max - min;
      const step = range / 4; 
      
      const low = Math.ceil(min + (score - 1) * step);
      const high = Math.floor(min + score * step);
      
      if (low === high) return `${low} зак.`;
      return `${low} - ${high} зак.`;
    }

    if (type === 'm') {
      // Monetary: Score 5 is good (> loyalMoneyAmount)
      const min = 500;
      const max = loyalMoneyAmount;
      
      if (score === 5) return `> ${max.toLocaleString()} ₽`;
      if (score === 1) return `< ${min} ₽`;

      // Linear interpolation for display purposes
      const step = (max - min) / 4;
      const low = Math.round(min + (score - 2) * step);
      const high = Math.round(min + (score - 1) * step);

      // Formatting
      const format = (n: number) => (n > 1000 ? `${(n/1000).toFixed(1)}k` : n);
      return `${format(low)} - ${format(high)} ₽`;
    }
    return '-';
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">RFM Анализ</h2>
        <p className="text-gray-500">Сегментация клиентов на основе покупательского поведения.</p>
      </div>

      {/* Educational Banner */}
      {showInfo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 relative">
           <button 
             onClick={() => setShowInfo(false)}
             className="absolute top-4 right-4 text-blue-400 hover:text-blue-600"
           >
             <X size={18} />
           </button>
           <div className="flex items-start space-x-4">
              <div className="bg-blue-100 p-2 rounded-lg">
                 <HelpCircle className="text-blue-600" size={24} />
              </div>
              <div className="space-y-2">
                 <h3 className="font-bold text-blue-900 text-lg">Что такое RFM?</h3>
                 <p className="text-blue-800 text-sm max-w-4xl leading-relaxed">
                   RFM — это маркетинговый метод, используемый для количественной оценки и группировки клиентов на основе давности (Recency), частоты (Frequency) и денежной суммы (Monetary) их транзакций для выявления лучших клиентов и проведения целевых кампаний.
                 </p>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                    <div className="bg-white/60 p-3 rounded-lg">
                       <span className="font-bold text-blue-900 block mb-1">Давность (R)</span>
                       <span className="text-xs text-blue-700">Как давно клиент совершал покупку. Балл 5 = Недавно.</span>
                    </div>
                    <div className="bg-white/60 p-3 rounded-lg">
                       <span className="font-bold text-blue-900 block mb-1">Частота (F)</span>
                       <span className="text-xs text-blue-700">Как часто клиент совершает покупки. Балл 5 = Часто.</span>
                    </div>
                    <div className="bg-white/60 p-3 rounded-lg">
                       <span className="font-bold text-blue-900 block mb-1">Деньги (M)</span>
                       <span className="text-xs text-blue-700">Сколько денег тратит клиент. Балл 5 = Много.</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Settings Section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
           <div className="flex items-center space-x-2">
              <Settings2 size={18} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900">Конфигурация</h3>
           </div>
           
           <div className="flex bg-gray-200 rounded-lg p-1">
              <button 
                onClick={() => setMode('Auto')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'Auto' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
              >
                Авто
              </button>
              <button 
                onClick={() => setMode('Manual')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'Manual' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
              >
                Вручную
              </button>
           </div>
        </div>
        
        <div className={`p-6 grid grid-cols-1 md:grid-cols-3 gap-8 transition-opacity duration-300 ${mode === 'Auto' ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
           {/* Recency Setting */}
           <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700 flex justify-between">
                <span>Верхний предел Давности</span>
                <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">Риск оттока</span>
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  value={lostRecencyDays}
                  onChange={(e) => setLostRecencyDays(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">дней</span>
              </div>
              <p className="text-xs text-gray-500">Клиенты, не покупавшие дольше этого срока, получают R=1.</p>
           </div>

           {/* Frequency Setting */}
           <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700 flex justify-between">
                <span>Нижний предел Частоты</span>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Лояльный</span>
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  value={loyalFreqCount}
                  onChange={(e) => setLoyalFreqCount(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">заказов</span>
              </div>
              <p className="text-xs text-gray-500">Клиенты с большим количеством заказов получают F=5.</p>
           </div>

           {/* Monetary Setting */}
           <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700 flex justify-between">
                <span>Нижний предел Денег</span>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Лояльный</span>
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  value={loyalMoneyAmount}
                  onChange={(e) => setLoyalMoneyAmount(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₽</span>
              </div>
              <p className="text-xs text-gray-500">Клиенты с тратами больше этой суммы получают M=5.</p>
           </div>
        </div>
        {mode === 'Auto' && (
           <div className="px-6 pb-4 -mt-2">
             <p className="text-xs text-purple-600 font-medium flex items-center">
               <Sliders size={12} className="mr-1" /> 
               Используется автоматическая оптимизация границ на основе исторических данных.
             </p>
           </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* RFM Groups Matrix */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
           <h3 className="font-bold text-gray-900 mb-6">Распределение RFM групп</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Балл</th>
                    <th className="px-4 py-3">
                       <div className="font-bold text-gray-700">Давность (R)</div>
                       <div className="font-normal text-gray-400 capitalize">Дней с посл. покупки</div>
                    </th>
                    <th className="px-4 py-3">
                       <div className="font-bold text-gray-700">Частота (F)</div>
                       <div className="font-normal text-gray-400 capitalize">Всего транзакций</div>
                    </th>
                    <th className="px-4 py-3 rounded-tr-lg">
                       <div className="font-bold text-gray-700">Деньги (M)</div>
                       <div className="font-normal text-gray-400 capitalize">Сумма покупок</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[5, 4, 3, 2, 1].map(score => (
                    <tr key={score} className="hover:bg-gray-50/50">
                      <td className="px-4 py-4 font-bold text-lg text-gray-900 w-16 text-center bg-gray-50/30">
                        {score}
                      </td>
                      {['r', 'f', 'm'].map((metric) => (
                        <td key={metric} className="px-4 py-4">
                           <div className="flex flex-col">
                              <span className="text-gray-900 font-medium">{getRangeLabel(metric as 'r'|'f'|'m', score)}</span>
                              <div className="flex items-center mt-1 space-x-2">
                                <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                                  {getAggregatedCounts(metric as 'r'|'f'|'m', score)} клиентов
                                </span>
                              </div>
                           </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>

        {/* Detailed Combinations */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col h-[600px]">
           <h3 className="font-bold text-gray-900 mb-2">Детальные комбинации</h3>
           <p className="text-xs text-gray-500 mb-4">Сегменты по R-F-M баллам.</p>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <table className="w-full text-sm">
                 <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                       <th className="pb-2 text-left pl-2">Комбинация</th>
                       <th className="pb-2 text-right pr-2">Клиенты</th>
                       <th className="pb-2 text-right pr-2">Доля</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {combinations.map((combo) => {
                       const totalClients = combinations.reduce((acc, c) => acc + c.count, 0);
                       const share = ((combo.count / totalClients) * 100).toFixed(1);
                       
                       // Color coding the combination badge
                       let badgeColor = 'bg-gray-100 text-gray-600';
                       const avgScore = (combo.r + combo.f + combo.m) / 3;
                       if (avgScore >= 4) badgeColor = 'bg-green-100 text-green-700';
                       else if (avgScore <= 2) badgeColor = 'bg-red-100 text-red-700';
                       else badgeColor = 'bg-yellow-100 text-yellow-700';

                       return (
                          <tr key={`${combo.r}-${combo.f}-${combo.m}`} className="group hover:bg-gray-50">
                             <td className="py-2.5 pl-2">
                                <span className={`font-mono font-bold px-2 py-1 rounded text-xs ${badgeColor}`}>
                                   {combo.r}-{combo.f}-{combo.m}
                                </span>
                             </td>
                             <td className="py-2.5 text-right font-medium text-gray-900 pr-2">
                                {combo.count}
                             </td>
                             <td className="py-2.5 text-right text-gray-500 text-xs pr-2">
                                {share}%
                             </td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
  );
};

export default RFMAnalysis;