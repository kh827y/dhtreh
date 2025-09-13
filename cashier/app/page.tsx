'use client';

import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  QrCode, 
  User, 
  Plus, 
  Minus,
  Receipt,
  CheckCircle,
  XCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  DollarSign,
  Percent,
  Gift,
  History
} from 'lucide-react';

export default function CashierPage() {
  const [activeMode, setActiveMode] = useState<'scan' | 'manual'>('scan');
  const [customerData, setCustomerData] = useState<any>(null);
  const [transactionAmount, setTransactionAmount] = useState('');
  const [pointsToAdd, setPointsToAdd] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Расчет баллов на основе суммы покупки
  useEffect(() => {
    if (transactionAmount) {
      const amount = parseFloat(transactionAmount);
      if (!isNaN(amount)) {
        // 5% кэшбек по умолчанию
        setPointsToAdd(Math.floor(amount * 0.05));
      }
    } else {
      setPointsToAdd(0);
    }
  }, [transactionAmount]);

  const handleScanQR = () => {
    setShowScanner(true);
    // Имитация сканирования QR
    setTimeout(() => {
      setCustomerData({
        id: 'C123456',
        name: 'Иван Иванов',
        phone: '+7 (999) 123-45-67',
        balance: 2450,
        level: 'Золотой',
        lastVisit: '2 дня назад'
      });
      setShowScanner(false);
    }, 2000);
  };

  const handlePhoneLookup = () => {
    if (phoneNumber.length < 10) return;
    
    setIsProcessing(true);
    // Имитация поиска по телефону
    setTimeout(() => {
      setCustomerData({
        id: 'C789012',
        name: 'Мария Петрова',
        phone: phoneNumber,
        balance: 1850,
        level: 'Серебряный',
        lastVisit: 'Вчера'
      });
      setIsProcessing(false);
    }, 1000);
  };

  const handleEarnPoints = () => {
    if (!customerData || !pointsToAdd) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      const newBalance = customerData.balance + pointsToAdd;
      setCustomerData({ ...customerData, balance: newBalance });
      setLastTransaction({
        type: 'earn',
        amount: pointsToAdd,
        total: transactionAmount,
        time: new Date().toLocaleTimeString('ru-RU')
      });
      setTransactionAmount('');
      setPointsToAdd(0);
      setIsProcessing(false);
    }, 1500);
  };

  const handleRedeemPoints = () => {
    if (!customerData || !pointsToRedeem || pointsToRedeem > customerData.balance) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      const newBalance = customerData.balance - pointsToRedeem;
      setCustomerData({ ...customerData, balance: newBalance });
      setLastTransaction({
        type: 'redeem',
        amount: pointsToRedeem,
        discount: pointsToRedeem,
        time: new Date().toLocaleTimeString('ru-RU')
      });
      setPointsToRedeem(0);
      setIsProcessing(false);
    }, 1500);
  };

  const resetTransaction = () => {
    setCustomerData(null);
    setTransactionAmount('');
    setPointsToAdd(0);
    setPointsToRedeem(0);
    setPhoneNumber('');
    setLastTransaction(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CreditCard className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">Кассовый терминал</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Касса #1</span>
              <span className="text-sm text-gray-500">Оператор: Анна К.</span>
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Выход
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Panel - Customer Info */}
        <div className="w-1/3 bg-white border-r p-6">
          <h2 className="text-lg font-semibold mb-4">Идентификация клиента</h2>
          
          {/* Mode Selector */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveMode('scan')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                activeMode === 'scan' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <QrCode className="h-4 w-4 inline mr-2" />
              QR-код
            </button>
            <button
              onClick={() => setActiveMode('manual')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                activeMode === 'manual' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Search className="h-4 w-4 inline mr-2" />
              Телефон
            </button>
          </div>

          {/* Identification */}
          {activeMode === 'scan' ? (
            <div className="space-y-4">
              {showScanner ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <div className="animate-pulse">
                    <QrCode className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500">Сканирование QR-кода...</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleScanQR}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <QrCode className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 font-medium">Нажмите для сканирования QR</p>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="tel"
                placeholder="+7 (___) ___-__-__"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handlePhoneLookup}
                disabled={phoneNumber.length < 10 || isProcessing}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Поиск...' : 'Найти клиента'}
              </button>
            </div>
          )}

          {/* Customer Info */}
          {customerData && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-gray-900">Клиент найден</span>
                </div>
                <button 
                  onClick={resetTransaction}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Сбросить
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Имя:</span>
                  <span className="font-medium">{customerData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Телефон:</span>
                  <span className="font-medium">{customerData.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Уровень:</span>
                  <span className="font-medium text-amber-600">{customerData.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Последний визит:</span>
                  <span className="font-medium">{customerData.lastVisit}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Баланс:</span>
                    <span className="text-xl font-bold text-green-600">
                      {customerData.balance} баллов
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Middle Panel - Transaction */}
        <div className="flex-1 p-6">
          <h2 className="text-lg font-semibold mb-4">Операция</h2>

          {customerData ? (
            <div className="space-y-6">
              {/* Transaction Amount */}
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сумма покупки (₽)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {pointsToAdd > 0 && (
                  <div className="mt-3 flex items-center text-green-600">
                    <ArrowUpCircle className="h-5 w-5 mr-2" />
                    <span className="font-medium">Будет начислено: {pointsToAdd} баллов</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleEarnPoints}
                  disabled={!transactionAmount || isProcessing}
                  className="bg-green-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="h-5 w-5" />
                  <span>Начислить баллы</span>
                </button>
                <button
                  onClick={() => {/* Открыть модал списания */}}
                  disabled={customerData.balance === 0 || isProcessing}
                  className="bg-orange-600 text-white py-4 px-6 rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  <Minus className="h-5 w-5" />
                  <span>Списать баллы</span>
                </button>
              </div>

              {/* Redeem Points Section */}
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Списать баллов
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="0"
                    max={customerData.balance}
                    value={pointsToRedeem}
                    onChange={(e) => setPointsToRedeem(Math.min(parseInt(e.target.value) || 0, customerData.balance))}
                    className="flex-1 px-4 py-3 border rounded-lg text-xl font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => setPointsToRedeem(customerData.balance)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Все баллы
                  </button>
                </div>
                {pointsToRedeem > 0 && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center text-orange-600">
                      <ArrowDownCircle className="h-5 w-5 mr-2" />
                      <span className="font-medium">Скидка: {pointsToRedeem} ₽</span>
                    </div>
                    <button
                      onClick={handleRedeemPoints}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50"
                    >
                      Применить
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-3">
                <button className="p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col items-center space-y-1">
                  <Gift className="h-6 w-6 text-purple-600" />
                  <span className="text-xs">Подарочная карта</span>
                </button>
                <button className="p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col items-center space-y-1">
                  <Percent className="h-6 w-6 text-blue-600" />
                  <span className="text-xs">Промокод</span>
                </button>
                <button className="p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col items-center space-y-1">
                  <History className="h-6 w-6 text-gray-600" />
                  <span className="text-xs">История</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <User className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Сначала идентифицируйте клиента</p>
                <p className="text-gray-400 text-sm mt-2">Отсканируйте QR-код или введите номер телефона</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Transaction History */}
        <div className="w-1/3 bg-gray-50 border-l p-6">
          <h2 className="text-lg font-semibold mb-4">Последние операции</h2>
          
          {lastTransaction && (
            <div className="mb-4 p-4 bg-white rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Только что</span>
                {lastTransaction.type === 'earn' ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-orange-500" />
                )}
              </div>
              <div className="space-y-1">
                {lastTransaction.type === 'earn' ? (
                  <>
                    <p className="font-medium">Начислено баллов</p>
                    <p className="text-2xl font-bold text-green-600">+{lastTransaction.amount}</p>
                    <p className="text-sm text-gray-500">Сумма покупки: {lastTransaction.total} ₽</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Списано баллов</p>
                    <p className="text-2xl font-bold text-orange-600">-{lastTransaction.amount}</p>
                    <p className="text-sm text-gray-500">Скидка: {lastTransaction.discount} ₽</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Transaction List */}
          <div className="space-y-3">
            {[
              { time: '10:32', customer: 'Петр С.', type: 'earn', amount: 125, total: 2500 },
              { time: '10:28', customer: 'Ольга К.', type: 'redeem', amount: 500, discount: 500 },
              { time: '10:15', customer: 'Алексей М.', type: 'earn', amount: 85, total: 1700 },
              { time: '09:54', customer: 'Елена В.', type: 'earn', amount: 210, total: 4200 },
              { time: '09:42', customer: 'Дмитрий Р.', type: 'redeem', amount: 1000, discount: 1000 },
            ].map((transaction, i) => (
              <div key={i} className="bg-white rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-500">{transaction.time}</span>
                  <span className="font-medium">{transaction.customer}</span>
                </div>
                {transaction.type === 'earn' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-green-600">+{transaction.amount} баллов</span>
                    <span className="text-gray-500">{transaction.total} ₽</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-orange-600">-{transaction.amount} баллов</span>
                    <span className="text-gray-500">-{transaction.discount} ₽</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Daily Stats */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Статистика за сегодня</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500">Операций</p>
                <p className="text-xl font-bold">47</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500">Начислено</p>
                <p className="text-xl font-bold text-green-600">3,845</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500">Списано</p>
                <p className="text-xl font-bold text-orange-600">2,150</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-gray-500">Новых</p>
                <p className="text-xl font-bold text-blue-600">8</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
