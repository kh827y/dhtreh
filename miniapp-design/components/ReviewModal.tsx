
import React, { useState } from 'react';
import { Star, X, MapPin, Send, MessageSquareHeart } from 'lucide-react';
import { MerchantConfig } from '../types';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MerchantConfig;
}

const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, onClose, config }) => {
  const [step, setStep] = useState<'RATING' | 'SHARE'>('RATING');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (rating === 0) return;

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      
      // If rating is high enough, ask to share
      if (rating >= config.reviewTriggerThreshold) {
        setStep('SHARE');
      } else {
        // Otherwise just close (negative feedback stays internal)
        handleClose();
      }
    }, 800);
  };

  const handleClose = () => {
    // Reset state after animation
    onClose();
    setTimeout(() => {
        setStep('RATING');
        setRating(0);
        setComment('');
    }, 300);
  };

  const handleExternalLink = (url: string) => {
      // Logic to open URL would go here
      console.log('Opening:', url);
      // We can close the modal after they click a link
      handleClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 safe-area-bottom">
      {/* Darkened Blur Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300" 
        onClick={handleClose} 
      />

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-[340px] bg-white rounded-[28px] shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden flex flex-col p-6">
        
        <button 
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors z-20"
        >
            <X size={18} />
        </button>

        {step === 'RATING' ? (
            <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mb-4 text-yellow-500">
                    <Star fill="currentColor" size={28} />
                </div>
                
                <h2 className="text-xl font-bold text-gray-900 mb-2">Оцените визит</h2>
                <p className="text-sm text-gray-500 mb-6">Как вам обслуживание и качество?</p>

                {/* Stars Input */}
                <div className="flex space-x-2 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button 
                            key={star}
                            onClick={() => setRating(star)}
                            className="transition-transform active:scale-90 focus:outline-none"
                        >
                            <Star 
                                size={36} 
                                className={`${rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} transition-colors duration-200`} 
                                strokeWidth={rating >= star ? 0 : 1.5}
                            />
                        </button>
                    ))}
                </div>

                {/* Comment Input */}
                <textarea
                    placeholder="Расскажите подробнее (необязательно)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm text-gray-900 placeholder-gray-400 resize-none outline-none focus:ring-2 focus:ring-blue-100 transition-all mb-4 h-24"
                />

                <button
                    onClick={handleSubmit}
                    disabled={rating === 0 || isSubmitting}
                    className={`w-full py-3.5 rounded-xl font-semibold text-[17px] flex items-center justify-center space-x-2 transition-all active:scale-[0.98] ${
                        rating > 0 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isSubmitting ? (
                         <span className="animate-pulse">Отправка...</span>
                    ) : (
                        <>
                            <span>Отправить</span>
                            <Send size={18} />
                        </>
                    )}
                </button>
            </div>
        ) : (
            <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                    <MessageSquareHeart fill="currentColor" size={32} />
                </div>
                
                <h2 className="text-xl font-bold text-gray-900 mb-2">Спасибо за оценку!</h2>
                <p className="text-[15px] text-gray-500 leading-relaxed mb-6">
                    Мы очень рады, что вам понравилось. Пожалуйста, поделитесь впечатлениями в картах — это очень поможет нам.
                </p>

                <div className="w-full space-y-3">
                    <button 
                        onClick={() => handleExternalLink('https://yandex.ru/maps')}
                        className="w-full bg-[#F2F2F7] hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-medium text-[15px] flex items-center justify-center space-x-2 transition-colors active:scale-[0.98]"
                    >
                        <span className="text-red-500 font-bold">Я</span>
                        <span>Яндекс Карты</span>
                    </button>
                    <button 
                        onClick={() => handleExternalLink('https://2gis.ru')}
                        className="w-full bg-[#F2F2F7] hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-medium text-[15px] flex items-center justify-center space-x-2 transition-colors active:scale-[0.98]"
                    >
                        <span className="text-green-500 font-extrabold">2</span>
                        <span>2ГИС</span>
                    </button>
                    <button 
                        onClick={() => handleExternalLink('https://www.google.com/maps')}
                        className="w-full bg-[#F2F2F7] hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-medium text-[15px] flex items-center justify-center space-x-2 transition-colors active:scale-[0.98]"
                    >
                        <span className="text-blue-500 font-bold">G</span>
                        <span>Google Карты</span>
                    </button>
                </div>

                <button 
                    onClick={handleClose}
                    className="mt-4 text-gray-400 text-sm font-medium p-2 hover:text-gray-600 transition-colors"
                >
                    Закрыть
                </button>
            </div>
        )}

      </div>
    </div>
  );
};

export default ReviewModal;
