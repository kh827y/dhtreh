import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { SalesDataPoint } from '../../types';

interface DynamicsChartProps {
  data: SalesDataPoint[];
}

const DynamicsChart: React.FC<DynamicsChartProps> = ({ data }) => {
  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend 
            verticalAlign="top" 
            height={36} 
            iconType="circle"
            wrapperStyle={{ paddingBottom: '20px', fontSize: '14px', color: '#4B5563' }}
          />
          <Line
            name="Регистрации"
            type="monotone"
            dataKey="registrations"
            stroke="#60A5FA" // Blue
            strokeWidth={2}
            dot={{ r: 4, fill: '#60A5FA', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
          <Line
            name="Продажи"
            type="monotone"
            dataKey="sales"
            stroke="#8B5CF6" // Purple
            strokeWidth={2}
            dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
          <Line
            name="Сумма"
            type="monotone"
            dataKey="amount"
            stroke="#34D399" // Green
            strokeWidth={2}
            dot={{ r: 4, fill: '#34D399', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DynamicsChart;