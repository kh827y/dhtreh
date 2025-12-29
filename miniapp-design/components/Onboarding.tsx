
import React, { useState } from 'react';
import { User, UserLevel } from '../types';
import { Phone, Check, ChevronRight, User as UserIcon, Calendar, Gift, AlertCircle } from 'lucide-react';

interface OnboardingProps {
  onComplete: (userData: Partial<User>) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [formData, setFormData] = useState({
    name: '',
    gender: 'male' as 'male' | 'female',
    birthDate: '',
    inviteCode: ''
  });
  
  const [hasConsented, setHasConsented] = useState(false);
  const [isSimulatingRequest, setIsSimulatingRequest] = useState(false);
  const [showFakeTelegramPopup, setShowFakeTelegramPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleStartFlow = () => {
    if (!formData.name.trim()) {
      setError('Пожалуйста, введите ваше имя');
      return;
    }
    if (!formData.birthDate) {
      setError('Укажите дату рождения');
      return;
    }

    // Date Validation
    const [yearStr, monthStr, dayStr] = formData.birthDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const currentYear = new Date().getFullYear();

    // Check basic ranges
    const isRangeValid = 
        !isNaN(year) && !isNaN(month) && !isNaN(day) &&
        year >= 1900 && year <= currentYear &&
        month >= 1 && month <= 12 &&
        day >= 1 && day <= 31;

    // Check strict calendar validity (e.g., February 30th)
    const dateObj = new Date(year, month - 1, day);
    const isCalendarValid = 
        dateObj.getFullYear() === year && 
        dateObj.getMonth() === month - 1 && 
        dateObj.getDate() === day;

    if (!isRangeValid || !isCalendarValid) {
        setError('Укажите корректную дату рождения');
        return;
    }

    if (!hasConsented) {
      setError('Необходимо согласие на обработку данных');
      return;
    }

    // Step 1: Open the "Fake" Telegram native popup
    setShowFakeTelegramPopup(true);
  };

  const handleFakeTelegramResponse = (allowed: boolean) => {
    setShowFakeTelegramPopup(false);

    if (allowed) {
      setIsSimulatingRequest(true);
      // Simulate network delay for binding
      setTimeout(() => {
        onComplete({
          name: formData.name,
          gender: formData.gender,
          birthDate: formData.birthDate,
          phone: '+79991234567', // Simulated phone number from Telegram
        });
      }, 1500);
    } else {
      setError('Не удалось привязать номер. Доступ отклонен.');
    }
  };

  return (
    <div className="min-h-screen bg-ios-bg flex flex-col relative pb-safe">
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-32">
        
        {/* Header */}
        <div className="mb-8 text-center animate-in slide-in-from-bottom-4 fade-in duration-500">
           <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-blue-200 mb-6 rotate-3">
              <Gift className="text-white w-10 h-10" />
           </div>
           <h1 className="text-3xl font-bold text-gray-900 mb-2">Добро пожаловать</h1>
           <p className="text-gray-500 leading-relaxed">
             Заполните анкету, чтобы продолжить.
           </p>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-3xl p-1 shadow-card space-y-1 animate-in slide-in-from-bottom-8 fade-in duration-500 delay-100">
            
            {/* Name Input */}
            <div className="relative px-4 py-3 border-b border-gray-100">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Имя</label>
                <div className="flex items-center space-x-3">
                    <UserIcon size={20} className="text-gray-300" />
                    <input 
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Как к вам обращаться?"
                        className="w-full text-lg font-medium text-gray-900 placeholder-gray-300 outline-none"
                    />
                </div>
            </div>

            {/* Gender Toggle */}
            <div className="relative px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Пол</label>
                <div className="bg-gray-100 p-1 rounded-lg flex space-x-1">
                    <button 
                        onClick={() => handleInputChange('gender', 'male')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${formData.gender === 'male' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Мужской
                    </button>
                    <button 
                        onClick={() => handleInputChange('gender', 'female')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${formData.gender === 'female' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Женский
                    </button>
                </div>
            </div>

            {/* Date of Birth */}
            <div className="relative px-4 py-3 border-b border-gray-100">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Дата рождения</label>
                <div className="flex items-center space-x-3">
                    <Calendar size={20} className="text-gray-300" />
                    <input 
                        type="date"
                        value={formData.birthDate}
                        onChange={(e) => handleInputChange('birthDate', e.target.value)}
                        className="w-full text-lg font-medium text-gray-900 bg-transparent outline-none"
                    />
                </div>
            </div>

            {/* Invite Code */}
            <div className="relative px-4 py-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Код приглашения (если есть)</label>
                <div className="flex items-center space-x-3">
                    <Gift size={20} className="text-gray-300" />
                    <input 
                        type="text"
                        value={formData.inviteCode}
                        onChange={(e) => handleInputChange('inviteCode', e.target.value)}
                        placeholder="REF-12345"
                        className="w-full text-lg font-medium text-gray-900 placeholder-gray-300 outline-none uppercase"
                    />
                </div>
            </div>
        </div>

        {/* Error Message */}
        {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-2xl flex items-center space-x-3 text-red-600 animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">{error}</span>
            </div>
        )}

      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-ios-bg/80 backdrop-blur-xl border-t border-gray-200 z-20 pb-safe">
         
         {/* Consent Checkbox */}
         <div 
            className="flex items-start justify-center space-x-2.5 mb-4 px-2 cursor-pointer active:opacity-70 transition-opacity"
            onClick={() => {
                setHasConsented(!hasConsented);
                if (error) setError(null);
            }}
         >
             <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-[6px] border-[1.5px] flex items-center justify-center transition-all duration-200 ${hasConsented ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-gray-400/60'}`}>
                 <Check size={14} className={`text-white transition-transform duration-200 ${hasConsented ? 'scale-100' : 'scale-0'}`} strokeWidth={3} />
             </div>
             <p className="text-[12px] text-gray-500 leading-snug">
                Даю согласие на <a href="#" className="text-blue-600 font-medium hover:text-blue-700 transition-colors" onClick={e => e.stopPropagation()}>обработку персональных данных</a>
             </p>
         </div>

         <button 
            onClick={handleStartFlow}
            disabled={isSimulatingRequest || !hasConsented}
            className={`w-full h-[56px] rounded-2xl font-bold text-[17px] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-70 disabled:scale-100 ${hasConsented ? 'bg-[#0088cc] text-white shadow-blue-200' : 'bg-gray-300 text-gray-500 shadow-none'}`}
         >
             {isSimulatingRequest ? (
                 <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Привязка номера...</span>
                 </>
             ) : (
                 <>
                    <Phone size={20} className={hasConsented ? "fill-white/20" : "opacity-50"} />
                    <span>Привязать телефон</span>
                 </>
             )}
         </button>
      </div>

      {/* Fake Telegram Native Popup Simulation */}
      {showFakeTelegramPopup && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
              
              {/* Telegram-style Bottom Sheet / Alert */}
              <div className="relative bg-[#1c1c1d] w-full max-w-[320px] rounded-t-[14px] sm:rounded-[14px] overflow-hidden text-center shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
                  <div className="pt-6 pb-4 px-4">
                      <div className="w-12 h-12 mx-auto bg-blue-500 rounded-full flex items-center justify-center mb-4">
                         <Phone className="text-white" size={24} />
                      </div>
                      <h3 className="text-white font-bold text-[17px] mb-1">
                          LoyaltyBot запрашивает доступ
                      </h3>
                      <p className="text-white/60 text-[13px] leading-snug px-2">
                          Бот хочет получить доступ к вашему номеру телефона для регистрации в программе лояльности.
                      </p>
                  </div>
                  
                  <div className="flex border-t border-white/10 mt-2">
                       <button 
                          onClick={() => handleFakeTelegramResponse(false)}
                          className="flex-1 py-3.5 text-[17px] text-blue-400 font-normal hover:bg-white/5 transition-colors border-r border-white/10"
                       >
                           Отклонить
                       </button>
                       <button 
                          onClick={() => handleFakeTelegramResponse(true)}
                          className="flex-1 py-3.5 text-[17px] text-blue-400 font-bold hover:bg-white/5 transition-colors"
                       >
                           Поделиться
                       </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default Onboarding;
