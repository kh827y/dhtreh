
import React, { useEffect, useState } from 'react';
import { User, MerchantConfig } from '../types';
import { X, RefreshCw, Copy, Check, ScanLine } from 'lucide-react';

interface QRCodeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  config: MerchantConfig;
}

const QRCodeOverlay: React.FC<QRCodeOverlayProps> = ({ isOpen, onClose, user, config }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [qrSeed, setQrSeed] = useState(Date.now());
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    setTimeLeft(60);
    setQrSeed(Date.now());

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setQrSeed(Date.now());
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const handleRefresh = () => {
    setQrSeed(Date.now());
    setTimeLeft(60);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  // --- LOGIC CONFIGURATION ---
  
  // Example: Manual code exists. Change to null or false to test layout without it.
  // Generate a 9-digit number based on the seed
  const codeNum = (qrSeed % 900000000) + 100000000;
  const manualCode = codeNum.toString().replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  const showManualCode = true; 

  // Level Calculation
  const currentLevelIndex = config.levels.findIndex(l => l.name === user.currentLevel);
  const nextLevel = config.levels[currentLevelIndex + 1];
  
  let progressPercent = 0;
  let pointsToNext = 0;

  if (nextLevel) {
    const currentLevelThreshold = config.levels[currentLevelIndex].threshold;
    const range = nextLevel.threshold - currentLevelThreshold;
    const progress = user.totalSpent - currentLevelThreshold;
    progressPercent = Math.min(100, Math.max(0, (progress / range) * 100));
    pointsToNext = nextLevel.threshold - user.totalSpent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 safe-area-bottom">
      {/* Darkened Blur Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-xl transition-opacity animate-in fade-in duration-300" 
        onClick={onClose} 
      />

      {/* Main Card Container */}
      <div className="relative z-10 w-full max-w-[360px] bg-white rounded-[32px] shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden flex flex-col">
        
        {/* Header Section */}
        <div className="relative px-6 pt-6 pb-2 text-center">
            {/* Close Button */}
            <button 
               onClick={onClose}
               className="absolute top-6 right-6 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors z-20"
            >
                <X size={20} />
            </button>

            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight truncate px-8">{user.name}</h2>
            <div className="inline-flex items-center space-x-1 mt-1">
                <span className="text-sm font-medium text-gray-400">Статус:</span>
                <span className="text-sm font-bold text-blue-600 uppercase tracking-wide">{user.currentLevel}</span>
            </div>
        </div>

        {/* QR Section */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
            
            {/* QR Container - optimized for density */}
            <div className="relative bg-white p-4 rounded-[28px] border-2 border-dashed border-gray-200 shadow-sm mb-4">
                 {/* Visual markers for scanner targeting */}
                 <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-900 opacity-[0.03] w-40 h-40" />
                 
                 {/* High resolution request (600x600) to ensure dense JWTs are crisp when scaled down */}
                 <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&color=000000&bgcolor=ffffff&data=LOYALTY_JWT_TOKEN_${user.id}_${qrSeed}`} 
                    alt="QR Code" 
                    className="w-64 h-64 object-contain rounded-lg"
                    style={{ imageRendering: 'pixelated' }} 
                />
            </div>

            {/* Manual Code (Optional) */}
            {showManualCode ? (
                <button 
                    onClick={() => handleCopyCode(manualCode)}
                    className="flex items-center space-x-2.5 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors group mb-2"
                >
                    <span className="font-mono text-[19px] font-bold text-gray-800 tracking-widest truncate max-w-[200px]">{manualCode}</span>
                    {isCopied ? (
                        <Check size={18} className="text-green-500 shrink-0" />
                    ) : (
                        <Copy size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                    )}
                </button>
            ) : (
                <div className="h-4"></div> /* Spacer if no code */
            )}

            {/* Timer / Refresh Action */}
            <div className="w-full max-w-[280px]">
                <button 
                    onClick={handleRefresh}
                    className="w-full relative overflow-hidden bg-gray-900 text-white h-[52px] rounded-2xl font-semibold flex items-center justify-center space-x-2.5 active:scale-[0.98] transition-all shadow-lg shadow-gray-200"
                >
                    <div 
                        className="absolute bottom-0 left-0 h-[3px] bg-blue-500 transition-all duration-1000 ease-linear"
                        style={{ width: `${(timeLeft / 60) * 100}%` }}
                    />
                    <RefreshCw size={18} className={timeLeft < 10 ? "animate-spin text-blue-400" : "text-gray-400"} />
                    <span className="text-[17px]">Обновить код</span>
                </button>
                <div className="text-center mt-2">
                    <span className="text-xs text-gray-400 font-medium">Код обновится через {timeLeft} сек</span>
                </div>
            </div>
        </div>

        {/* Footer Stats & Progress */}
        <div className="bg-[#F9F9FB] border-t border-gray-100">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
                <div className="p-4 flex flex-col items-center">
                    <span className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Баланс</span>
                    <span className="text-xl font-black text-gray-900">{user.balance} Б</span>
                </div>
                <div className="p-4 flex flex-col items-center">
                    <span className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Кэшбэк</span>
                    <span className="text-xl font-black text-blue-600">{user.cashbackPercent}%</span>
                </div>
            </div>

            {/* Conditional Progress Bar */}
            {nextLevel && (
                <div className="p-5 pt-4">
                    <div className="flex justify-between items-end mb-2">
                         <span className="text-xs font-semibold text-gray-500">
                            До статуса <span className="text-gray-900">{nextLevel.name}</span>
                         </span>
                         <span className="text-xs font-bold text-gray-900 bg-white px-2 py-0.5 rounded-md shadow-sm border border-gray-100">
                            {pointsToNext.toLocaleString()} ₽
                         </span>
                    </div>
                    <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default QRCodeOverlay;
