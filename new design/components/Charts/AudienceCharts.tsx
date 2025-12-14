import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';
import { DemographicsData } from '../../types';

interface AudienceChartsProps {
  data: DemographicsData;
}

const AudienceCharts: React.FC<AudienceChartsProps> = ({ data }) => {
  return (
    <div className="flex flex-col space-y-8">
      {/* Gender Profile */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-4">Пол</h4>
        <div className="flex items-center">
          <div className="w-1/2 h-40 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.gender}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  {data.gender.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
             {/* Center Text (Approximate) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 rounded-full border-4 border-gray-50"></div>
            </div>
          </div>
          <div className="w-1/2 space-y-3">
             {data.gender.map((g, idx) => (
                 <div key={idx} className="flex items-center justify-between text-sm">
                     <div className="flex items-center space-x-2">
                         <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }}></div>
                         <span className="text-gray-600">{g.name}</span>
                     </div>
                     <span className="font-semibold text-gray-900">{g.value}%</span>
                 </div>
             ))}
          </div>
        </div>
      </div>

      {/* Age & Check */}
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-gray-800 mb-4">Возраст и Чек</h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.age}
              margin={{ top: 0, right: 0, left: -25, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis 
                dataKey="age" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
              />
              <YAxis 
                 axisLine={false}
                 tickLine={false}
                 tick={{ fill: '#9CA3AF', fontSize: 10 }}
              />
              <Bar dataKey="value" stackId="a" fill="#6EE7B7" radius={[0, 0, 4, 4]} />
              <Bar dataKey="secondaryValue" stackId="a" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AudienceCharts;