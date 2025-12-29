
import React, { useState, useEffect } from 'react';
import { User, ViewState, Promo } from './types';
import { MOCK_USER, MOCK_MERCHANT_CONFIG, PROMOS } from './constants';
import QRCodeOverlay from './components/QRCodeOverlay';
import TransactionHistory from './components/TransactionHistory';
import ReviewModal from './components/ReviewModal';
import Onboarding from './components/Onboarding';
import PromoDetailModal from './components/PromoDetailModal';
import { 
  QrCode, 
  Gift, 
  UserPlus, 
  Settings, 
  ChevronLeft,
  Bell,
  ChevronRight,
  Wallet,
  Percent,
  Share,
  Copy,
  Check,
  Info,
  MessageCircleQuestion,
  Loader2,
  ScanLine,
  Trophy,
  BellOff,
  Sparkles,
  Zap,
  Tag,
  ShoppingBag,
  Package,
  Coins,
  ArrowRight,
  X
} from 'lucide-react';

const App: React.FC = () => {
  // Set initial view to ONBOARDING for testing the new flow
  const [view, setView] = useState<ViewState>('ONBOARDING');
  const [user, setUser] = useState<User>(MOCK_USER);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  
  // Promo Code State
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  // Toast states
  const [showLinkCopiedToast, setShowLinkCopiedToast] = useState(false);
  const [showCodeCopiedToast, setShowCodeCopiedToast] = useState(false);
  
  // Notification Alert State
  const [showNotificationAlert, setShowNotificationAlert] = useState(false);
  
  // Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isAllBonusesOpen, setIsAllBonusesOpen] = useState(false);
  
  // Selected Promo for Details
  const [selectedPromo, setSelectedPromo] = useState<Promo | null>(null);

  // Claimed Bonuses State (Local session state)
  const [claimedBonusIds, setClaimedBonusIds] = useState<Set<string>>(new Set());

  // --- CALCULATION OF AVAILABLE BONUSES ---
  const bonusPromosTotal = PROMOS.filter(p => p.type === 'bonus');
  const unclaimedBonusCount = bonusPromosTotal.filter(p => !claimedBonusIds.has(p.id)).length;

  // --- TEST CODE START ---
  // Simulate opening the review modal shortly after app load for testing purposes
  // Only if we are not in onboarding
  useEffect(() => {
    if (view === 'HOME') {
        const timer = setTimeout(() => {
            setIsReviewModalOpen(true);
        }, 3000); 
        return () => clearTimeout(timer);
    }
  }, [view]);
  // --- TEST CODE END ---

  const handleRegistrationComplete = (userData: Partial<User>) => {
      // Merge new onboarding data with mock user structure
      setUser(prev => ({
          ...prev,
          ...userData,
          // Since it's a new registration in this flow, we might reset balance or keep mock for demo
          name: userData.name || prev.name,
      }));
      setView('HOME');
  };

  const inviteLink = `https://t.me/loyalty_bot?start=ref_${user.id}`;
  const inviteCode = `REF-${user.id.toUpperCase()}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setShowCodeCopiedToast(true);
    setTimeout(() => setShowCodeCopiedToast(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Приглашение',
          text: MOCK_MERCHANT_CONFIG.referralDescription || `Используй мой код ${inviteCode} и получи бонусы!`,
          url: inviteLink,
        });
      } catch (err) {
        console.log('Share dismissed', err);
      }
    } else {
      // Fallback if share is not supported
      navigator.clipboard.writeText(inviteLink);
      setShowLinkCopiedToast(true);
      setTimeout(() => setShowLinkCopiedToast(false), 2000);
    }
  };

  const handleSupport = () => {
    // Logic to open support chat
    console.log("Opening support chat");
  };

  const getFormattedDate = () => {
    const date = new Date();
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
  };

  const handleApplyPromo = () => {
    if (!promoCode.trim()) return;

    setPromoStatus('loading');
    
    // Mock API call simulation
    setTimeout(() => {
        const code = promoCode.trim().toUpperCase();
        if (code === 'WELCOME' || code === 'PROMO2024') {
            setPromoStatus('success');
            // Mock adding transaction
            setUser(prev => ({
                ...prev,
                balance: prev.balance + 100,
                transactions: [{
                    id: Date.now().toString(),
                    title: 'Промокод',
                    description: code,
                    date: getFormattedDate(),
                    amount: 0,
                    cashback: 100,
                    type: 'promo'
                }, ...prev.transactions]
            }));
            setPromoCode('');
            // Reset status after a delay
            setTimeout(() => setPromoStatus('idle'), 3000);
        } else {
            setPromoStatus('error');
            setTimeout(() => setPromoStatus('idle'), 3000);
        }
    }, 1000);
  };

  const handleClaimBonus = (id: string, amount: number) => {
      if (claimedBonusIds.has(id)) return;
      
      const promo = PROMOS.find(p => p.id === id);
      const promoTitle = promo ? promo.title : 'Бонус';

      // Update local UI state
      setClaimedBonusIds(prev => new Set(prev).add(id));

      // Update User Balance (Mock)
      setTimeout(() => {
          setUser(prev => ({
              ...prev,
              balance: prev.balance + amount,
              transactions: [{
                  id: Date.now().toString(),
                  title: 'Акция',
                  description: promoTitle,
                  date: getFormattedDate(),
                  amount: 0,
                  cashback: amount,
                  type: 'campaign'
              }, ...prev.transactions]
          }));
      }, 300); // Slight delay for animation feel
  };
  
  const handleNotificationToggle = () => {
    if (user.notificationConsent) {
      // If currently ON, ask for confirmation to turn OFF
      setShowNotificationAlert(true);
    } else {
      // If currently OFF, just turn ON
      setUser(prev => ({ ...prev, notificationConsent: true }));
    }
  };

  const confirmTurnOffNotifications = () => {
    setUser(prev => ({ ...prev, notificationConsent: false }));
    setShowNotificationAlert(false);
  };

  const renderHome = () => (
    <div className="flex flex-col min-h-screen pb-safe">
      
      {/* Header Area */}
      <div className="bg-ios-bg px-5 pt-8 pb-4 flex justify-between items-end sticky top-0 z-10 backdrop-blur-xl bg-ios-bg/80">
        <div className="flex-1 min-w-0 mr-4">
           <div className="text-gray-500 text-sm font-medium mb-1">Добрый день,</div>
           <h1 className="text-3xl font-bold text-gray-900 leading-tight truncate">{user.name}</h1>
        </div>
        <button 
            onClick={() => setView('SETTINGS')}
            className="w-10 h-10 bg-white rounded-full shadow-card flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors shrink-0"
        >
            <Settings size={22} />
        </button>
      </div>

      <div className="px-5 space-y-6">
        
        {/* Main Card - Gradient Blue */}
        <div className="w-full bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-soft relative overflow-hidden transform transition-transform active:scale-[0.99]">
           {/* Decorative circles */}
           <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
           <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-400 opacity-20 rounded-full -ml-8 -mb-8 blur-2xl"></div>
           
           <div className="relative z-10 flex flex-col h-40 justify-between">
               <div className="flex justify-between items-start">
                   <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase border border-white/10">
                       {user.currentLevel}
                   </div>
                   <Wallet className="opacity-70" />
               </div>
               
               <div>
                   <div className="text-blue-100 text-sm font-medium mb-1">Ваш баланс</div>
                   <div className="text-4xl font-bold tracking-tight">
                       {user.balance.toLocaleString()} <span className="text-2xl opacity-70">Б</span>
                   </div>
               </div>

               <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                        <Percent size={12} />
                    </div>
                    <span className="text-sm font-medium">{user.cashbackPercent}% возвращается баллами</span>
               </div>
           </div>
        </div>

        {/* Primary Action Button */}
        <button 
          onClick={() => setIsQRModalOpen(true)}
          className="w-full bg-gray-900 text-white h-14 rounded-2xl shadow-lg flex items-center justify-center space-x-3 active:scale-[0.98] transition-all"
        >
          <QrCode size={20} />
          <span className="font-semibold text-lg">Показать карту</span>
        </button>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 gap-4">
            <button 
               onClick={() => setView('PROMOS')}
               className="bg-white p-4 rounded-2xl shadow-card flex flex-col justify-between h-28 active:scale-[0.98] transition-transform relative"
            >
                {/* Counter Badge for Unclaimed Bonuses */}
                {unclaimedBonusCount > 0 && (
                    <div className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in duration-300">
                        {unclaimedBonusCount}
                    </div>
                )}
                
                <div className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center">
                    <Gift size={22} />
                </div>
                <div className="text-left">
                    <div className="font-bold text-gray-900 text-lg">Акции</div>
                    <div className="text-xs text-gray-400">Спецпредложения</div>
                </div>
            </button>

            {MOCK_MERCHANT_CONFIG.hasReferralProgram && (
               <button 
                  onClick={() => setView('INVITE')}
                  className="bg-white p-4 rounded-2xl shadow-card flex flex-col justify-between h-28 active:scale-[0.98] transition-transform"
               >
                   <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                       <UserPlus size={22} />
                   </div>
                   <div className="text-left">
                       <div className="font-bold text-gray-900 text-lg">Друзья</div>
                       <div className="text-xs text-gray-400">Получите бонусы</div>
                   </div>
               </button>
            )}
        </div>

        {/* Promo Code Input */}
        <div className={`bg-white p-1.5 rounded-2xl shadow-card flex items-center pr-1.5 transition-colors border ${promoStatus === 'error' ? 'border-red-300 bg-red-50' : promoStatus === 'success' ? 'border-green-300 bg-green-50' : 'border-transparent'}`}>
            <input 
                type="text" 
                placeholder={promoStatus === 'success' ? 'Промокод применен!' : promoStatus === 'error' ? 'Неверный код' : 'Ввести промокод'}
                value={promoCode}
                disabled={promoStatus !== 'idle'}
                onChange={(e) => {
                    setPromoCode(e.target.value);
                    if (promoStatus === 'error') setPromoStatus('idle');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                className="flex-1 px-4 py-3 bg-transparent outline-none text-gray-900 font-medium placeholder-gray-400 disabled:text-gray-500"
            />
            <button 
                onClick={handleApplyPromo}
                disabled={promoStatus !== 'idle' || !promoCode}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${promoStatus === 'success' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
            >
                {promoStatus === 'loading' ? (
                    <Loader2 size={20} className="animate-spin text-gray-500" />
                ) : promoStatus === 'success' ? (
                    <Check size={20} />
                ) : (
                    <ChevronRight size={20} />
                )}
            </button>
        </div>

        {/* Transaction History Section */}
        <div className="pb-8">
            <TransactionHistory 
                transactions={user.transactions.slice(0, 4)} 
                onShowAll={() => setView('HISTORY')}
            />
        </div>

      </div>
    </div>
  );

  const renderHistory = () => (
      <div className="min-h-screen bg-ios-bg pb-safe">
         <div className="sticky top-0 bg-ios-bg/90 backdrop-blur-md z-20 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <button onClick={() => setView('HOME')} className="p-2 -ml-2 text-ios-blue flex items-center space-x-1 hover:opacity-70 transition-opacity z-10">
                <ChevronLeft size={24} />
                <span className="font-medium text-lg">Назад</span>
            </button>
            <div className="w-10" />
         </div>

         <div className="px-5 py-6">
            <TransactionHistory 
                transactions={user.transactions} 
                title="Ваши операции"
                titleClassName="text-3xl font-bold text-gray-900"
                headerClassName="mb-6"
            />
         </div>
      </div>
  );

  // --- NEW RENDER PROMOS LOGIC: "MARKETPLACE SHOWCASE" CONCEPT ---
  const renderPromos = () => {
    // SORTING: Unclaimed first, then Claimed
    const bonusPromos = PROMOS.filter(p => p.type === 'bonus').sort((a, b) => {
        const isClaimedA = claimedBonusIds.has(a.id);
        const isClaimedB = claimedBonusIds.has(b.id);
        if (isClaimedA === isClaimedB) return 0;
        return isClaimedA ? 1 : -1; // false (unclaimed) comes first
    });

    const productPromos = PROMOS.filter(p => p.type !== 'bonus');

    // --- CAROUSEL ITEM (Bonus) ---
    const renderBonusCard = (promo: Promo, isVertical = false) => {
        const isClaimed = claimedBonusIds.has(promo.id);
        
        return (
            <div 
                key={promo.id} 
                className={`${isVertical ? 'w-full mb-4' : 'min-w-[85%] sm:min-w-[300px] snap-center'} rounded-[24px] p-5 relative overflow-hidden flex flex-col justify-between h-[160px] shadow-lg bg-gradient-to-r ${promo.color || 'from-violet-500 to-fuchsia-500'} text-white active:scale-[0.99] transition-transform`}
            >
                <div className="z-10 flex justify-between items-start">
                    <div className="bg-black/20 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center space-x-1.5 self-start">
                        <Gift size={12} className="text-white" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Подарок</span>
                    </div>
                    {/* Decorative Icon in background */}
                    <Sparkles className="absolute -right-2 -bottom-4 text-white/20 w-32 h-32 rotate-12 pointer-events-none" />
                </div>

                <div className="z-10 mt-auto">
                    <h3 className="text-[18px] font-bold leading-tight mb-3 pr-8">{promo.title}</h3>
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline space-x-1">
                            <span className="text-3xl font-black">{promo.bonusAmount}</span>
                            <span className="text-sm font-medium opacity-80 uppercase">баллов</span>
                        </div>
                        
                        <button 
                            onClick={() => handleClaimBonus(promo.id, promo.bonusAmount || 0)}
                            disabled={isClaimed}
                            className={`h-9 px-4 rounded-full flex items-center justify-center shadow-md text-[13px] font-bold transition-all duration-300 ${
                                isClaimed 
                                    ? 'bg-green-500 text-white w-auto gap-1.5 pl-3' 
                                    : 'bg-white text-gray-900 hover:bg-gray-50 active:scale-95'
                            }`}
                        >
                            {isClaimed ? (
                                <>
                                    <Check size={16} strokeWidth={3} className="animate-in zoom-in duration-300" />
                                    <span className="animate-in fade-in duration-300">Получено</span>
                                </>
                            ) : (
                                'Забрать'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // --- GRID ITEM (Product/Offer) ---
    const renderGridCard = (promo: Promo) => {
        let IconComponent = ShoppingBag;
        let badgeText = '';
        let badgeColor = 'bg-gray-900 text-white';

        // Styling logic
        if (promo.type === 'multiplier' && promo.multiplier) {
            IconComponent = Zap;
            badgeText = `x${promo.multiplier} Баллов`;
            badgeColor = 'bg-purple-600 text-white';
        } else if (promo.type === 'bundle' && promo.bundleLabel) {
            IconComponent = Package;
            badgeText = promo.bundleLabel || 'Акция';
            badgeColor = 'bg-pink-500 text-white';
        } else if (promo.type === 'discount' && promo.oldPrice && promo.price) {
             IconComponent = Tag;
             badgeText = `${promo.price} ₽`;
             badgeColor = 'bg-gray-900 text-white';
        } else if (promo.type === 'cashback' && promo.cashbackPercent) {
             IconComponent = Percent;
             badgeText = `${promo.cashbackPercent}% Кэшбэк`;
             badgeColor = 'bg-emerald-600 text-white';
        } else if (promo.type === 'fixed_bonus' && promo.bonusAmount) {
             IconComponent = Coins;
             badgeText = `+${promo.bonusAmount} Б`;
             badgeColor = 'bg-yellow-500 text-white';
        }

        return (
            <div key={promo.id} className="flex flex-col bg-white rounded-[20px] shadow-card overflow-hidden active:scale-[0.98] transition-transform h-full">
                {/* Image Area (Simulated with Color) */}
                <div className={`h-[110px] w-full ${promo.color || 'bg-gray-100'} relative flex items-center justify-center`}>
                     <IconComponent size={40} className="text-gray-900/50 mix-blend-multiply" />
                     
                     {/* Floating Badge */}
                     <div className={`absolute top-2 right-2 px-2.5 py-1 rounded-[8px] text-[11px] font-bold shadow-sm ${badgeColor}`}>
                         {badgeText}
                     </div>
                </div>

                {/* Content Area */}
                <div className="p-3 flex-1 flex flex-col">
                    <h3 className="text-[14px] font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{promo.title}</h3>
                    <div className="mt-auto pt-2">
                        <button 
                            onClick={() => setSelectedPromo(promo)}
                            className="w-full py-2 rounded-[10px] bg-gray-50 text-blue-600 text-xs font-bold hover:bg-blue-50 transition-colors"
                        >
                            Подробнее
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F5F5F7] pb-safe">
            {/* Header: Exact match to Invite screen */}
            <div className="sticky top-0 z-30 bg-[#F5F5F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
                <button 
                    onClick={() => setView('HOME')} 
                    className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
                >
                    <ChevronLeft size={22} className="stroke-[2.5]" />
                    <span className="text-[17px] font-normal">Назад</span>
                </button>
                <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">
                    Акции
                </span>
                <div className="w-10"></div> {/* Spacer for centering */}
            </div>
            
            <div className="space-y-8 pb-10 pt-4">
                
                {/* Horizontal Scroll: Bonuses */}
                {bonusPromos.length > 0 && (
                    <div className="space-y-4">
                        <div className="px-5 flex items-center justify-between">
                             <div className="flex items-center space-x-2">
                                <h2 className="text-[22px] font-bold text-gray-900">Ваши бонусы</h2>
                                {unclaimedBonusCount > 0 && (
                                    <div className="bg-red-500 text-white text-[12px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in">
                                        {unclaimedBonusCount}
                                    </div>
                                )}
                             </div>
                             <button 
                                onClick={() => setIsAllBonusesOpen(true)}
                                className="text-[15px] font-medium text-blue-600 active:opacity-50"
                             >
                                 Все
                             </button>
                        </div>
                        
                        {/* Scroll Container */}
                        <div className="flex overflow-x-auto gap-4 px-5 pb-4 snap-x hide-scrollbar">
                            {bonusPromos.map(p => renderBonusCard(p))}
                        </div>
                    </div>
                )}

                {/* Masonry Grid: Products */}
                {productPromos.length > 0 && (
                     <div className="px-4">
                        <h2 className="text-[22px] font-bold text-gray-900 mb-4 px-1">Спецпредложения</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {productPromos.map(renderGridCard)}
                        </div>
                    </div>
                )}
            </div>

            {/* ALL BONUSES MODAL */}
            {isAllBonusesOpen && (
                <div className="fixed inset-0 z-50 bg-[#F5F5F7] flex flex-col animate-in slide-in-from-bottom-full duration-300">
                    {/* Modal Header */}
                    <div className="sticky top-0 z-30 bg-[#F5F5F7]/90 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
                        <div className="w-10"></div>
                        <span className="text-[17px] font-semibold text-black">
                            Все бонусы
                        </span>
                        <button 
                            onClick={() => setIsAllBonusesOpen(false)} 
                            className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center active:opacity-60 transition-opacity"
                        >
                            <X size={18} className="text-gray-600" />
                        </button>
                    </div>
                    
                    {/* Modal Content - Vertical List */}
                    <div className="flex-1 overflow-y-auto px-5 py-6 pb-20">
                        {bonusPromos.map(p => renderBonusCard(p, true))}
                    </div>
                </div>
            )}
        </div>
    );
  };

  const renderInvite = () => (
      <div className="min-h-screen bg-[#F2F2F7] flex flex-col">
         {/* Standard iOS Navbar */}
         <div className="sticky top-0 z-30 bg-[#F2F2F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
            <button 
                onClick={() => setView('HOME')} 
                className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
            >
                <ChevronLeft size={22} className="stroke-[2.5]" />
                <span className="text-[17px] font-normal">Назад</span>
            </button>
            <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">
                Пригласить друга
            </span>
            <div className="w-10"></div> {/* Spacer for centering */}
         </div>

         <div className="flex-1 overflow-y-auto pb-32">
             
             {/* Hero Section */}
             <div className="flex flex-col items-center pt-8 pb-8">
                <div className="w-[88px] h-[88px] bg-white rounded-[22px] shadow-sm flex items-center justify-center mb-5">
                    <Gift size={44} className="text-blue-500" />
                </div>
                <h2 className="text-[22px] font-bold text-gray-900 text-center leading-tight mb-2">
                    Бонусы для друзей
                </h2>
                <p className="text-[15px] text-gray-500 text-center max-w-[280px] leading-snug">
                    Делитесь кодом и получайте награды
                </p>
             </div>

             {/* Description Group */}
             <div className="px-4 mb-6">
                 <div className="pl-4 mb-2">
                    <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">
                        Условия
                    </span>
                 </div>
                 <div className="bg-white rounded-[18px] px-4 py-4 shadow-sm">
                    <div className="flex items-start space-x-3">
                         <div className="mt-0.5">
                             <Info size={18} className="text-gray-400" />
                         </div>
                         <p className="text-[15px] text-gray-900 leading-relaxed">
                            {MOCK_MERCHANT_CONFIG.referralDescription || "Приглашайте друзей и получайте бонусы за их покупки."}
                         </p>
                    </div>
                 </div>
             </div>

             {/* Code Group */}
             <div className="px-4">
                 <div className="pl-4 mb-2">
                    <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">
                        Ваш пригласительный код
                    </span>
                 </div>
                 <button 
                    onClick={handleCopyCode}
                    className="w-full bg-white rounded-[18px] px-4 py-3 shadow-sm flex items-center justify-between active:bg-gray-100 transition-colors group"
                 >
                     <div className="flex flex-col items-start">
                         <span className="text-[20px] font-semibold text-gray-900 font-mono tracking-wide">
                            {inviteCode}
                         </span>
                         <span className={`text-[13px] font-medium mt-0.5 transition-colors ${showCodeCopiedToast ? 'text-green-500' : 'text-blue-500'}`}>
                            {showCodeCopiedToast ? 'Скопировано' : 'Нажмите, чтобы скопировать'}
                         </span>
                     </div>
                     <div className="w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                        {showCodeCopiedToast ? (
                            <Check size={18} className="text-green-500" />
                        ) : (
                            <Copy size={18} className="text-blue-500" />
                        )}
                     </div>
                 </button>
             </div>

         </div>

         {/* Fixed Footer with Blur */}
         <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/80 backdrop-blur-xl border-t border-gray-300/50 z-20 pb-safe">
             <button 
                onClick={handleShare}
                className="w-full bg-[#007AFF] text-white h-[50px] rounded-[14px] font-semibold text-[17px] active:opacity-90 transition-opacity flex items-center justify-center space-x-2"
            >
                <Share size={20} className="stroke-[2.5]" />
                <span>Поделиться ссылкой</span>
            </button>
         </div>
      </div>
  );

  const renderAbout = () => (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col pb-safe">
        {/* Navbar */}
        <div className="sticky top-0 z-30 bg-[#F2F2F7]/80 backdrop-blur-xl border-b border-gray-300/50 px-4 py-3 flex items-center justify-between">
           <button 
               onClick={() => setView('SETTINGS')} 
               className="flex items-center space-x-1 text-blue-500 active:opacity-60 transition-opacity"
           >
               <ChevronLeft size={22} className="stroke-[2.5]" />
               <span className="text-[17px] font-normal">Назад</span>
           </button>
           <span className="text-[17px] font-semibold text-black absolute left-1/2 -translate-x-1/2">
               О программе
           </span>
           <div className="w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
            
            {/* How it Works */}
            <section>
                <div className="pl-4 mb-2">
                   <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Как использовать</span>
                </div>
                <div className="bg-white rounded-[18px] p-5 shadow-sm flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <ScanLine size={24} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Покажите QR-код</h3>
                        <p className="text-[15px] text-gray-500 leading-relaxed">
                            При оплате на кассе покажите QR-код из приложения. Если сканер недоступен, вы можете продиктовать цифровой код, указанный под QR-кодом.
                        </p>
                    </div>
                </div>
            </section>

            {/* Levels */}
            <section>
                <div className="pl-4 mb-2">
                   <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Уровни лояльности</span>
                </div>
                <div className="bg-white rounded-[18px] overflow-hidden shadow-sm">
                    {MOCK_MERCHANT_CONFIG.levels.map((level, index) => {
                        const isCurrent = user.currentLevel === level.name;
                        return (
                        <div key={level.name} className={`flex items-center justify-between p-4 ${index !== MOCK_MERCHANT_CONFIG.levels.length - 1 ? 'border-b border-gray-100' : ''} ${isCurrent ? 'bg-blue-50/50' : ''}`}>
                            <div className="flex items-center space-x-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCurrent ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {isCurrent ? <Check size={20} /> : <Trophy size={18} />}
                                </div>
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <div className={`font-semibold ${isCurrent ? 'text-blue-700' : 'text-gray-900'}`}>{level.name}</div>
                                        {isCurrent && (
                                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">ВЫ ЗДЕСЬ</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                        {level.threshold === 0 ? 'Базовый уровень' : `от ${level.threshold.toLocaleString()} ₽`}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[15px] font-bold text-gray-900">{level.cashbackPercent}%</span>
                                <span className="text-[11px] text-gray-400">кэшбэк</span>
                                <span className="text-[11px] text-blue-600 mt-0.5 font-medium">Списание {level.writeOffPercent}%</span>
                            </div>
                        </div>
                    )})}
                </div>
            </section>

            {/* Notifications Warning */}
            <section>
                <div className="pl-4 mb-2">
                   <span className="text-[13px] uppercase text-gray-400 font-medium tracking-wide">Важно знать</span>
                </div>
                <div className="bg-white rounded-[18px] p-5 shadow-sm">
                    <div className="flex items-start space-x-3 mb-3">
                         <BellOff size={20} className="text-orange-500 shrink-0 mt-0.5" />
                         <h3 className="font-semibold text-gray-900">Рассылки и уведомления</h3>
                    </div>
                    <p className="text-[15px] text-gray-500 leading-relaxed">
                        Вы можете отключить уведомления в настройках, но тогда вы рискуете пропустить:
                    </p>
                    <ul className="mt-3 space-y-2">
                        {['Персональные подарочные баллы', 'Уведомления о сгорании бонусов', 'Акции и специальные предложения'].map((item, i) => (
                            <li key={i} className="flex items-center space-x-2 text-[14px] text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

        </div>
    </div>
  );

  const renderSettings = () => (
      <div className="min-h-screen bg-ios-bg pb-safe relative">
         <div className="sticky top-0 bg-ios-bg/90 backdrop-blur-md z-20 px-4 py-3 border-b border-gray-200 flex items-center">
            <button onClick={() => setView('HOME')} className="p-2 -ml-2 text-ios-blue flex items-center space-x-1 hover:opacity-70 transition-opacity">
                <ChevronLeft size={24} />
                <span className="font-medium text-lg">Назад</span>
            </button>
         </div>

          <div className="px-5 py-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Настройки</h2>
              
              <div className="bg-white rounded-2xl shadow-card overflow-hidden mb-6">
                  <div className="p-4 flex items-center justify-between border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white">
                              <Bell size={16} />
                          </div>
                          <span className="font-medium text-gray-900">Уведомления</span>
                      </div>
                      <button 
                        onClick={handleNotificationToggle}
                        className={`w-12 h-7 rounded-full transition-colors duration-200 ease-in-out p-1 ${user.notificationConsent ? 'bg-green-500' : 'bg-gray-200'}`}
                      >
                          <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${user.notificationConsent ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                  </div>
                  <div 
                    onClick={() => setView('ABOUT')}
                    className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                       <span className="font-medium text-gray-900">О программе</span>
                       <ChevronRight size={20} className="text-gray-300" />
                  </div>
              </div>

              <button 
                onClick={handleSupport}
                className="w-full bg-white text-[#007AFF] font-semibold p-4 rounded-2xl shadow-card flex items-center justify-center space-x-2 active:bg-gray-50 transition-colors"
              >
                  <MessageCircleQuestion size={20} />
                  <span>Написать в поддержку</span>
              </button>
              
              <p className="text-center text-gray-400 text-xs mt-6">...</p>
          </div>

          {/* iOS Style Confirmation Alert */}
          {showNotificationAlert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setShowNotificationAlert(false)} />
                <div className="relative bg-white/90 backdrop-blur-xl rounded-[14px] w-full max-w-[270px] text-center overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 pt-5">
                        <h3 className="text-[17px] font-semibold text-gray-900 mb-1">Выключить уведомления?</h3>
                        <p className="text-[13px] leading-snug text-gray-500">
                            Мы не сможем уведомлять вас об акциях, спец. предложениях, подарочных баллах и сгорании бонусов.
                        </p>
                    </div>
                    <div className="flex border-t border-gray-300/50">
                        <button 
                            onClick={() => setShowNotificationAlert(false)}
                            className="flex-1 py-3 text-[17px] text-blue-500 font-normal active:bg-gray-200 transition-colors border-r border-gray-300/50"
                        >
                            Отмена
                        </button>
                        <button 
                            onClick={confirmTurnOffNotifications}
                            className="flex-1 py-3 text-[17px] text-red-500 font-semibold active:bg-gray-200 transition-colors"
                        >
                            Выключить
                        </button>
                    </div>
                </div>
            </div>
          )}
      </div>
  );

  return (
    <div className="bg-ios-bg min-h-screen text-gray-900 font-sans mx-auto max-w-md shadow-2xl overflow-hidden relative selection:bg-blue-100">
      {view === 'ONBOARDING' && (
          <Onboarding onComplete={handleRegistrationComplete} />
      )}
      
      {view !== 'ONBOARDING' && (
        <>
            {view === 'HOME' && renderHome()}
            {view === 'PROMOS' && renderPromos()}
            {view === 'SETTINGS' && renderSettings()}
            {view === 'INVITE' && renderInvite()}
            {view === 'HISTORY' && renderHistory()}
            {view === 'ABOUT' && renderAbout()}

            <QRCodeOverlay 
                isOpen={isQRModalOpen} 
                onClose={() => setIsQRModalOpen(false)} 
                user={user}
                config={MOCK_MERCHANT_CONFIG}
            />
            
            <ReviewModal 
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                config={MOCK_MERCHANT_CONFIG}
            />

            <PromoDetailModal
                promo={selectedPromo}
                onClose={() => setSelectedPromo(null)}
            />
        </>
      )}
    </div>
  );
};

export default App;
