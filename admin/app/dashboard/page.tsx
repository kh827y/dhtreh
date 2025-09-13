'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  Gift, 
  Settings,
  BarChart3,
  Bell,
  Store,
  UserCheck,
  DollarSign,
  Activity,
  ShoppingBag,
  Star,
  MessageSquare,
  Target,
  Zap
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalMerchants: 342,
    activeCustomers: 15420,
    totalTransactions: 48395,
    totalRevenue: 1285000,
    monthlyGrowth: 12.5,
    activeSubscriptions: 298,
    avgRating: 4.6,
    activeCampaigns: 24
  });

  const [loading, setLoading] = useState(false);

  const StatCard = ({ title, value, icon: Icon, change, color = "blue" }: any) => {
    const colors: any = {
      blue: "bg-blue-500",
      green: "bg-green-500",
      purple: "bg-purple-500",
      orange: "bg-orange-500",
      pink: "bg-pink-500",
      yellow: "bg-yellow-500"
    };

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">{value}</p>
            {change !== undefined && (
              <div className="flex items-center mt-2">
                <TrendingUp className={`h-4 w-4 mr-1 ${change > 0 ? 'text-green-500' : 'text-red-500'}`} />
                <span className={`text-sm font-medium ${change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change > 0 ? '+' : ''}{change}%
                </span>
                <span className="text-xs text-gray-500 ml-1">vs last month</span>
              </div>
            )}
          </div>
          <div className={`${colors[color]} bg-opacity-10 rounded-lg p-3`}>
            <Icon className={`h-6 w-6 ${colors[color].replace('bg-', 'text-')}`} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Панель управления
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Добро пожаловать в систему управления программой лояльности
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button className="relative p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <Bell className="h-5 w-5" />
                <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Активные мерчанты"
            value={stats.totalMerchants.toLocaleString()}
            icon={Store}
            change={8.2}
            color="blue"
          />
          <StatCard
            title="Активные клиенты"
            value={stats.activeCustomers.toLocaleString()}
            icon={Users}
            change={stats.monthlyGrowth}
            color="green"
          />
          <StatCard
            title="Транзакций за месяц"
            value={stats.totalTransactions.toLocaleString()}
            icon={Activity}
            change={15.3}
            color="purple"
          />
          <StatCard
            title="Общий доход"
            value={`₽${(stats.totalRevenue / 1000).toFixed(0)}K`}
            icon={DollarSign}
            change={22.4}
            color="orange"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Активные подписки"
            value={stats.activeSubscriptions}
            icon={CreditCard}
            color="pink"
          />
          <StatCard
            title="Средний рейтинг"
            value={stats.avgRating}
            icon={Star}
            color="yellow"
          />
          <StatCard
            title="Активные кампании"
            value={stats.activeCampaigns}
            icon={Target}
            color="blue"
          />
          <StatCard
            title="Скорость обработки"
            value="<100ms"
            icon={Zap}
            color="green"
          />
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Быстрые действия
            </h3>
            <div className="space-y-3">
              <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center">
                <UserCheck className="h-5 w-5 mr-3 text-blue-500" />
                <span className="text-sm font-medium">Добавить мерчанта</span>
              </button>
              <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center">
                <Gift className="h-5 w-5 mr-3 text-green-500" />
                <span className="text-sm font-medium">Создать кампанию</span>
              </button>
              <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center">
                <MessageSquare className="h-5 w-5 mr-3 text-purple-500" />
                <span className="text-sm font-medium">Массовая рассылка</span>
              </button>
              <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center">
                <BarChart3 className="h-5 w-5 mr-3 text-orange-500" />
                <span className="text-sm font-medium">Экспорт отчетов</span>
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Последняя активность
            </h3>
            <div className="space-y-4">
              {[
                { 
                  merchant: 'Кофейня "Арома"', 
                  action: 'Запущена новая акция "Счастливые часы"', 
                  time: '5 мин назад',
                  icon: Gift,
                  color: 'text-blue-500'
                },
                { 
                  merchant: 'Ресторан "Вкусно"', 
                  action: 'Подписка продлена на тариф Premium', 
                  time: '12 мин назад',
                  icon: CreditCard,
                  color: 'text-green-500'
                },
                { 
                  merchant: 'Салон "Красота"', 
                  action: '500 баллов начислено 28 клиентам', 
                  time: '28 мин назад',
                  icon: Star,
                  color: 'text-yellow-500'
                },
                { 
                  merchant: 'Магазин "Стиль"', 
                  action: 'Новый отзыв с рейтингом 5★', 
                  time: '1 час назад',
                  icon: MessageSquare,
                  color: 'text-purple-500'
                },
                { 
                  merchant: 'Пекарня "Хлеб"', 
                  action: 'Сформирован месячный отчет', 
                  time: '2 часа назад',
                  icon: BarChart3,
                  color: 'text-orange-500'
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex-shrink-0 mt-1">
                      <Icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.merchant}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.action}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="text-xs text-gray-400">{item.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
