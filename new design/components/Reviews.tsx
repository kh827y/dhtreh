import React, { useState, useMemo } from 'react';
import { 
  MessageSquare, 
  Star, 
  Store, 
  User, 
  Monitor, 
  Filter, 
  Settings, 
  MapPin, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Save,
  Power
} from 'lucide-react';

interface Review {
  id: string;
  clientName: string;
  rating: number;
  comment: string;
  sourceType: 'staff' | 'device';
  sourceName: string;
  outlet: string;
  date: string;
}

const Reviews: React.FC = () => {
  // Mechanics State
  const [isEnabled, setIsEnabled] = useState(true);

  // Filters State
  const [filterOutlet, setFilterOutlet] = useState('all');
  const [filterStaff, setFilterStaff] = useState('all');
  const [filterDevice, setFilterDevice] = useState('all');
  const [onlyWithComments, setOnlyWithComments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Settings State
  const [offerExternal, setOfferExternal] = useState(true);
  const [minRating, setMinRating] = useState<string>('5');
  const [platforms, setPlatforms] = useState({
    yandex: true,
    google: false,
    gis: true
  });

  // Mock Data
  const reviews: Review[] = [
    { id: '1', clientName: 'Иван Петров', rating: 5, comment: 'Отличный сервис, спасибо Алисе за помощь в выборе!', sourceType: 'staff', sourceName: 'Алиса Фриман', outlet: 'Флагманский магазин', date: '28.12.2023 14:30' },
    { id: '2', clientName: 'Елена Смирнова', rating: 4, comment: 'Вкусно, но пришлось долго ждать заказ.', sourceType: 'device', sourceName: 'Касса №2', outlet: 'ТЦ Сити Молл', date: '28.12.2023 12:15' },
    { id: '3', clientName: 'Дмитрий К.', rating: 5, comment: '', sourceType: 'device', sourceName: 'Терминал самообслуживания', outlet: 'Киоск Аэропорт', date: '27.12.2023 18:45' },
    { id: '4', clientName: 'Мария В.', rating: 2, comment: 'Кофе был холодный.', sourceType: 'staff', sourceName: 'Боб Смит', outlet: 'Флагманский магазин', date: '27.12.2023 09:20' },
    { id: '5', clientName: 'Сергей', rating: 5, comment: 'Все супер!', sourceType: 'staff', sourceName: 'Иван Райт', outlet: 'Киоск Аэропорт', date: '26.12.2023 16:00' },
    { id: '6', clientName: 'Ольга', rating: 5, comment: '', sourceType: 'device', sourceName: 'Касса №1', outlet: 'ТЦ Сити Молл', date: '26.12.2023 13:10' },
    { id: '7', clientName: 'Павел', rating: 3, comment: 'Мало места в зале.', sourceType: 'staff', sourceName: 'Чарли Дэвис', outlet: 'ТЦ Сити Молл', date: '25.12.2023 19:30' },
    { id: '8', clientName: 'Анна', rating: 4, comment: 'Хорошее место.', sourceType: 'staff', sourceName: 'Диана Принс', outlet: 'ТЦ Сити Молл', date: '25.12.2023 15:40' },
    { id: '9', clientName: 'Виктор', rating: 1, comment: 'Грубый персонал!', sourceType: 'staff', sourceName: 'Анна Ли', outlet: 'Филиал Пригород', date: '24.12.2023 10:00' },
    { id: '10', clientName: 'Екатерина', rating: 5, comment: 'Любимая кофейня!', sourceType: 'device', sourceName: 'Касса №1', outlet: 'Флагманский магазин', date: '24.12.2023 08:45' },
  ];

  // Filtering Logic
  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (onlyWithComments && !r.comment) return false;
      if (filterOutlet !== 'all' && r.outlet !== filterOutlet) return false;
      if (filterStaff !== 'all' && (r.sourceType !== 'staff' || r.sourceName !== filterStaff)) return false;
      if (filterDevice !== 'all' && (r.sourceType !== 'device' || r.sourceName !== filterDevice)) return false;
      return true;
    });
  }, [reviews, onlyWithComments, filterOutlet, filterStaff, filterDevice]);

  // Stats Calculation based on filtered data
  const stats = useMemo(() => {
    if (filteredReviews.length === 0) {
      return { count: 0, average: '0.0' };
    }
    const sum = filteredReviews.reduce((acc, curr) => acc + curr.rating, 0);
    const avg = (sum / filteredReviews.length).toFixed(1);
    return { count: filteredReviews.length, average: avg };
  }, [filteredReviews]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredReviews.length / itemsPerPage);
  const paginatedReviews = filteredReviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Unique lists for filters
  const outlets = Array.from(new Set(reviews.map(r => r.outlet)));
  const staff = Array.from(new Set(reviews.filter(r => r.sourceType === 'staff').map(r => r.sourceName)));
  const devices = Array.from(new Set(reviews.filter(r => r.sourceType === 'device').map(r => r.sourceName)));

  const handleSaveSettings = () => {
    alert('Настройки сбора отзывов сохранены!');
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Отзывы</h2>
        <p className="text-gray-500 mt-1">Мониторинг обратной связи от клиентов и управление репутацией.</p>
      </div>

      {/* Main Activation Toggle */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${isEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
               <Power size={24} />
            </div>
            <div>
               <h3 className="text-lg font-bold text-gray-900">Сбор отзывов</h3>
               <p className="text-sm text-gray-500">
                  {isEnabled 
                    ? 'Активно. Клиентам предлагается оценить обслуживание после покупки.' 
                    : 'Отключено. Сбор оценок и отзывов приостановлен.'}
               </p>
            </div>
         </div>
         <button 
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${isEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
         >
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm ${isEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
         </button>
      </div>

      {/* Content Area - Disabled visually if toggle is off */}
      <div className={`space-y-8 transition-opacity duration-300 ${isEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        
        {/* Settings Card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
           <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                 <MapPin className="text-purple-600" size={24} />
                 <h3 className="text-lg font-bold text-gray-900">Сбор отзывов на картах</h3>
              </div>
              <button 
                 onClick={handleSaveSettings}
                 className="flex items-center space-x-2 text-sm text-purple-600 font-medium hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                 <Save size={16} />
                 <span>Сохранить настройки</span>
              </button>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <div className="space-y-4">
                 <label className="flex items-center justify-between cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div>
                       <span className="block font-medium text-gray-900">Предлагать поделиться отзывом</span>
                       <span className="text-sm text-gray-500">Показывать предложение оставить отзыв на картах после высокой оценки.</span>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${offerExternal ? 'bg-green-500' : 'bg-gray-300'}`}>
                       <input 
                          type="checkbox" 
                          checked={offerExternal}
                          onChange={(e) => setOfferExternal(e.target.checked)}
                          className="sr-only" 
                       />
                       <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${offerExternal ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                 </label>

                 <div className={`transition-opacity duration-200 ${!offerExternal ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Минимальная оценка для предложения</label>
                    <div className="flex space-x-2">
                       {['5', '4+', '3+', '2+', '1+'].map((val) => (
                          <button
                             key={val}
                             onClick={() => setMinRating(val)}
                             className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                minRating === val 
                                   ? 'bg-purple-600 text-white border-purple-600' 
                                   : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                             }`}
                          >
                             {val === '5' ? '⭐️ 5' : `⭐️ ${val}`}
                          </button>
                       ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                       Клиентам, поставившим оценку ниже выбранной, предложение оставить отзыв на картах показано не будет.
                    </p>
                 </div>
              </div>

              <div className={`space-y-4 transition-opacity duration-200 ${!offerExternal ? 'opacity-50 pointer-events-none' : ''}`}>
                 <span className="block text-sm font-medium text-gray-700">Платформы для размещения</span>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.yandex ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                       <input 
                          type="checkbox" 
                          checked={platforms.yandex}
                          onChange={(e) => setPlatforms({...platforms, yandex: e.target.checked})}
                          className="rounded text-red-600 focus:ring-red-500"
                       />
                       <span className="font-medium text-gray-900">Яндекс</span>
                    </label>
                    
                    <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.gis ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                       <input 
                          type="checkbox" 
                          checked={platforms.gis}
                          onChange={(e) => setPlatforms({...platforms, gis: e.target.checked})}
                          className="rounded text-green-600 focus:ring-green-500"
                       />
                       <span className="font-medium text-gray-900">2ГИС</span>
                    </label>

                    <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${platforms.google ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                       <input 
                          type="checkbox" 
                          checked={platforms.google}
                          onChange={(e) => setPlatforms({...platforms, google: e.target.checked})}
                          className="rounded text-blue-600 focus:ring-blue-500"
                       />
                       <span className="font-medium text-gray-900">Google</span>
                    </label>
                 </div>
                 <div className="flex items-center space-x-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <ExternalLink size={14} />
                    <span>Клиент сможет выбрать удобную платформу из отмеченных. Ссылки настраиваются в разделе "Торговые точки".</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
           
           {/* Filters & Stats Bar */}
           <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col xl:flex-row justify-between items-center gap-6">
              
              {/* Left: Summary Stats */}
              <div className="flex items-center gap-6 w-full xl:w-auto">
                 <div className="flex items-center space-x-3">
                    <div className="bg-white p-2 rounded-lg border border-gray-200 text-gray-500">
                       <Filter size={20} />
                    </div>
                    <div>
                       <span className="block text-xs text-gray-500 uppercase font-bold">Найдено</span>
                       <span className="text-lg font-bold text-gray-900">{stats.count}</span>
                    </div>
                 </div>
                 
                 <div className="w-px h-10 bg-gray-300 hidden sm:block"></div>

                 <div className="flex items-center space-x-3">
                     <div className="bg-yellow-100 p-2 rounded-lg border border-yellow-200 text-yellow-600">
                       <Star size={20} className="fill-yellow-600" />
                    </div>
                    <div>
                       <span className="block text-xs text-gray-500 uppercase font-bold">Ср. оценка</span>
                       <span className="text-lg font-bold text-gray-900">{stats.average}</span>
                    </div>
                 </div>
              </div>
              
              {/* Right: Filters */}
              <div className="flex flex-wrap items-center justify-end gap-3 w-full xl:w-auto">
                 <select 
                    value={filterOutlet}
                    onChange={(e) => setFilterOutlet(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                 >
                    <option value="all">Все точки</option>
                    {outlets.map(o => <option key={o} value={o}>{o}</option>)}
                 </select>

                 <select 
                    value={filterStaff}
                    onChange={(e) => setFilterStaff(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                 >
                    <option value="all">Все сотрудники</option>
                    {staff.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>

                 <select 
                    value={filterDevice}
                    onChange={(e) => setFilterDevice(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                 >
                    <option value="all">Все устройства</option>
                    {devices.map(d => <option key={d} value={d}>{d}</option>)}
                 </select>

                 <label className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input 
                       type="checkbox" 
                       checked={onlyWithComments}
                       onChange={(e) => setOnlyWithComments(e.target.checked)}
                       className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex items-center space-x-1.5 text-sm text-gray-700">
                       <MessageCircle size={14} />
                       <span>Только с комментарием</span>
                    </div>
                 </label>
              </div>
           </div>

           {/* Table */}
           <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                 <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                    <tr>
                       <th className="px-6 py-4 font-semibold w-48">Клиент</th>
                       <th className="px-6 py-4 font-semibold w-32">Оценка</th>
                       <th className="px-6 py-4 font-semibold min-w-[300px]">Комментарий</th>
                       <th className="px-6 py-4 font-semibold w-48">Источник</th>
                       <th className="px-6 py-4 font-semibold w-48">Точка</th>
                       <th className="px-6 py-4 font-semibold w-40 text-right">Дата</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {paginatedReviews.length === 0 ? (
                       <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                             <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
                             <p>Нет отзывов, соответствующих выбранным фильтрам.</p>
                          </td>
                       </tr>
                    ) : (
                       paginatedReviews.map((review) => (
                          <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                             <td className="px-6 py-4 font-medium text-gray-900">
                                <div className="flex items-center space-x-2">
                                   <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold">
                                      {review.clientName.charAt(0)}
                                   </div>
                                   <span>{review.clientName}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex items-center">
                                   {Array.from({ length: 5 }).map((_, i) => (
                                      <Star 
                                         key={i} 
                                         size={14} 
                                         className={`${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                                      />
                                   ))}
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                {review.comment ? (
                                   <p className="text-gray-700 whitespace-normal break-words max-w-[400px]">
                                      {review.comment}
                                   </p>
                                ) : (
                                   <span className="text-gray-400 italic text-xs">Без комментария</span>
                                )}
                             </td>
                             <td className="px-6 py-4 text-gray-600">
                                <div className="flex items-center space-x-2">
                                   {review.sourceType === 'staff' ? (
                                      <User size={14} className="text-blue-500" />
                                   ) : (
                                      <Monitor size={14} className="text-purple-500" />
                                   )}
                                   <span className="truncate max-w-[150px]" title={review.sourceName}>{review.sourceName}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4 text-gray-600">
                                <div className="flex items-center space-x-2">
                                   <Store size={14} className="text-gray-400" />
                                   <span className="truncate max-w-[150px]" title={review.outlet}>{review.outlet}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4 text-right text-gray-500 text-xs whitespace-nowrap">
                                {review.date}
                             </td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
           </div>

           {/* Pagination */}
           {totalPages > 1 && (
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                 <span className="text-sm text-gray-500">
                    Показано {Math.min((currentPage - 1) * itemsPerPage + 1, filteredReviews.length)} - {Math.min(currentPage * itemsPerPage, filteredReviews.length)} из {filteredReviews.length}
                 </span>
                 <div className="flex items-center space-x-2">
                    <button 
                       onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                       disabled={currentPage === 1}
                       className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                       <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium text-gray-900">
                       Стр. {currentPage}
                    </span>
                    <button 
                       onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                       disabled={currentPage === totalPages}
                       className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                       <ChevronRight size={16} />
                    </button>
                 </div>
              </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default Reviews;