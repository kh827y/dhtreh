
import React from 'react';
import { Promo } from '../types';

interface PromoDetailModalProps {
  promo: Promo | null;
  onClose: () => void;
}

const PromoDetailModal: React.FC<PromoDetailModalProps> = ({ promo, onClose }) => {
  if (!promo) return null;

  // Generate the core logic text based on promo type
  const getPromoText = () => {
    switch (promo.type) {
        case 'discount':
            return `Специальная цена ${promo.price}₽ на товар "${promo.title}"`;
        case 'bonus':
        case 'fixed_bonus':
            return `Получите ${promo.bonusAmount} бонусов за покупку товара "${promo.title}"`;
        case 'multiplier':
            return `Умножаем кэшбэк баллами на ${promo.multiplier} за покупку в категории "${promo.title}" (товары: Тыквенный латте, Глинтвейн, Яблочный пирог)`;
        case 'cashback':
            return `Повышенный кэшбэк ${promo.cashbackPercent}% на товар "${promo.title}"`;
        case 'bundle':
            return `Купите 2 получите 1 бесплатно в категории "${promo.title}" (товары: Клубничный, Шоколадный, Ванильный)`;
        default:
            return promo.description || 'Специальное предложение';
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Dimmed Background */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* iOS Alert Style Box */}
      <div className="relative z-10 w-[270px] bg-white/90 backdrop-blur-xl rounded-[14px] shadow-lg animate-in zoom-in-95 duration-200 overflow-hidden text-center">
        
        <div className="p-4 pt-5">
            <h3 className="text-[17px] font-semibold text-gray-900 mb-1">
                {promo.title}
            </h3>
            
            <p className="text-[13px] text-gray-800 leading-snug mb-3 font-medium">
                {getPromoText()}
            </p>

            {promo.duration && (
                <p className="text-[12px] text-gray-500 leading-tight">
                    Время проведения акции:<br/>
                    {promo.duration}
                </p>
            )}
        </div>

        {/* Action Button (iOS Style) */}
        <div className="border-t border-gray-300/60 backdrop-blur-xl">
            <button 
                onClick={onClose}
                className="w-full py-3 text-[17px] text-[#007AFF] font-normal hover:bg-black/5 active:bg-black/10 transition-colors"
            >
                Понятно
            </button>
        </div>

      </div>
    </div>
  );
};

export default PromoDetailModal;
