import React from 'react';
import { TrendingUp, User, BarChart2 } from 'lucide-react';
import { KPIData } from '../types';

interface StatCardProps {
  data: KPIData;
}

const StatCard: React.FC<StatCardProps> = ({ data }) => {
  const getIcon = () => {
    switch (data.iconType) {
      case 'chart':
        return <TrendingUp size={20} className="text-purple-500" />;
      case 'user':
        return <User size={20} className="text-blue-500" />;
      case 'bar':
        return <BarChart2 size={20} className="text-green-500" />;
      case 'currency':
      default:
        return <TrendingUp size={20} className="text-purple-500" />;
    }
  };

  const getIconBg = () => {
    switch (data.iconType) {
      case 'chart': return 'bg-purple-50';
      case 'user': return 'bg-blue-50';
      case 'bar': return 'bg-green-50';
      default: return 'bg-gray-50';
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-gray-600">{data.label}</span>
        <div className={`p-2 rounded-lg ${getIconBg()}`}>
          {getIcon()}
        </div>
      </div>
      <div>
        <h3 className="text-2xl font-bold text-gray-900">{data.value}</h3>
      </div>
    </div>
  );
};

export default StatCard;