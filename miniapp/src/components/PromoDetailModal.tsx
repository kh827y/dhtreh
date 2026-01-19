"use client";

import React from "react";

export type PromoDetail = {
  id: string;
  title: string;
  description?: string | null;
  duration?: string | null;
  categories?: string[];
  products?: string[];
};

interface PromoDetailModalProps {
  promo: PromoDetail | null;
  onClose: () => void;
}

const PromoDetailModal: React.FC<PromoDetailModalProps> = ({ promo, onClose }) => {
  if (!promo) return null;

  const categories = Array.isArray(promo.categories) ? promo.categories.filter(Boolean) : [];
  const products = Array.isArray(promo.products) ? promo.products.filter(Boolean) : [];
  const description = promo.description?.trim() || "Специальное предложение";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 w-[270px] bg-white/90 backdrop-blur-xl rounded-[14px] shadow-lg animate-in zoom-in-95 duration-200 overflow-hidden text-center">
        <div className="p-4 pt-5">
          <h3 className="text-[17px] font-semibold text-gray-900 mb-2">{promo.title}</h3>

          <div className="max-h-[220px] overflow-y-auto hide-scrollbar space-y-3">
            <p className="text-[13px] text-gray-800 leading-snug font-medium">{description}</p>

            {categories.length > 0 && (
              <div className="text-[12px] text-gray-700 leading-snug text-left">
                <div className="font-semibold text-gray-900 mb-1">Категории</div>
                <div className="text-gray-600">{categories.join(", ")}</div>
              </div>
            )}

            {products.length > 0 && (
              <div className="text-[12px] text-gray-700 leading-snug text-left">
                <div className="font-semibold text-gray-900 mb-1">Товары</div>
                <div className="text-gray-600">{products.join(", ")}</div>
              </div>
            )}

            {promo.duration && (
              <p className="text-[12px] text-gray-500 leading-tight">
                Время проведения акции:<br />
                {promo.duration}
              </p>
            )}
          </div>
        </div>

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
