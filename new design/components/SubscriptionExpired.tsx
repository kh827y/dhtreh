import React from 'react';
import { Lock, CreditCard, AlertTriangle } from 'lucide-react';

interface SubscriptionExpiredProps {
  onRenew: () => void;
}

const SubscriptionExpired: React.FC<SubscriptionExpiredProps> = ({ onRenew }) => {
  
  const handleRenew = () => {
    onRenew();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6b7280 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden relative z-10">
        
        {/* Status Bar */}
        <div className="bg-red-500 h-2 w-full"></div>
        
        <div className="p-8">
          <div className="flex flex-col items-center text-center">
            
            {/* Icon */}
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 ring-8 ring-red-50/50">
              <Lock className="h-10 w-10 text-red-500" />
            </div>

            {/* Main Message */}
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Доступ приостановлен</h1>
            <p className="text-gray-500 mb-8 max-w-sm">
              Срок действия вашей подписки истек. Функции панели управления временно заблокированы.
            </p>

            {/* Plan Details Card */}
            <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 mb-8 text-left">
               <div className="flex justify-between items-start mb-4 border-b border-gray-200 pb-3">
                  <div>
                     <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ваш тариф</span>
                     <div className="font-bold text-gray-900 text-lg">Business Pro</div>
                  </div>
                  <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-md font-medium">
                     Истек
                  </span>
               </div>
               
               <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                     <span>Дата окончания:</span>
                     <span className="font-medium text-gray-900">Вчера, 23:59</span>
                  </div>
               </div>
            </div>

            {/* Actions */}
            <div className="w-full space-y-3">
               <button 
                  onClick={handleRenew}
                  className="w-full flex items-center justify-center py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
               >
                  <CreditCard className="mr-2 h-5 w-5" />
                  Оплатить и возобновить
               </button>
            </div>

          </div>
        </div>

        {/* Footer info */}
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 text-center">
           <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
              <AlertTriangle size={12} className="text-amber-500" />
              <span>Данные ваших клиентов сохраняются в течение 90 дней после блокировки.</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionExpired;