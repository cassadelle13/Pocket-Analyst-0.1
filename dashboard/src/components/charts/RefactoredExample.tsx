/**
 * Пример рефакторинга существующего графика с использованием ChartStyleSystem
 * ДО: Кастомные стили и разный код в каждом компоненте
 * ПОСЛЕ: Единый стиль через ChartTemplate и ChartStyleConfig
 */

import React from 'react';
import { ChartTemplates, ChartDataPoint } from '../../lib/chart-style-system/ChartTemplates';
import { ChartStyleConfig } from '../../lib/chart-style-system/ChartStyleConfig';

// Mock данные для примера
const mockData: ChartDataPoint[] = [
  { date: 'Jan 01', revenue: 45000, users: 2500, conversion: 2.5 },
  { date: 'Jan 02', revenue: 48000, users: 2600, conversion: 2.8 },
  { date: 'Jan 03', revenue: 52000, users: 2800, conversion: 3.1 },
  { date: 'Jan 04', revenue: 49000, users: 2700, conversion: 2.9 },
  { date: 'Jan 05', revenue: 55000, users: 3000, conversion: 3.3 },
  { date: 'Jan 06', revenue: 58000, users: 3200, conversion: 3.5 },
  { date: 'Jan 07', revenue: 62000, users: 3500, conversion: 3.8 },
];

// === ДО: Старый подход с кастомными стилями ===
export const OldRevenueChart = () => {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4" style={{ width: '100%', height: 360 }}>
      <div className="text-lg font-semibold mb-4" style={{ color: '#333' }}>
        Revenue Trend
      </div>
      {/* Здесь был бы кастомный код графика с inline стилями */}
      <div style={{ 
        background: '#f9f9f9', 
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        height: '300px'
      }}>
        <div className="text-center text-gray-500 mt-20">
          Старый график с кастомными стилями
        </div>
      </div>
    </div>
  );
};

// === ПОСЛЕ: Новый подход с единой системой стилей ===
export const NewRevenueChart = () => {
  return (
    <ChartTemplates.LineChartSingle
      data={mockData}
      xKey="date"
      yKey="revenue"
      options={{
        title: "Revenue Trend",
        size: "default"
      }}
    />
  );
};

// === Примеры других графиков с единой стилизацией ===

export const MultiMetricChart = () => {
  return (
    <ChartTemplates.LineChartMulti
      data={mockData}
      xKey="date"
      yKeys={["revenue", "users"]}
      options={{
        title: "Revenue & Users Trend",
        size: "default"
      }}
    />
  );
};

export const ComparisonBarChart = () => {
  return (
    <ChartTemplates.BarChartGrouped
      data={mockData}
      xKey="date"
      yKeys={["revenue", "users"]}
      options={{
        title: "Daily Performance Comparison",
        size: "default"
      }}
    />
  );
};

export const GrowthAreaChart = () => {
  return (
    <ChartTemplates.GrowthChart
      data={mockData}
      xKey="date"
      growthKey="conversion"
      options={{
        title: "Conversion Rate Growth",
        size: "compact"
      }}
    />
  );
};

export const RealTimeMetricsChart = () => {
  return (
    <ChartTemplates.RealTimeChart
      data={mockData}
      xKey="date"
      metricKeys={["revenue", "users", "conversion"]}
      options={{
        title: "Real-time Dashboard",
        size: "default"
      }}
    />
  );
};

// === Демонстрация преимуществ ===

export const StyleComparison = () => {
  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: ChartStyleConfig.typography.title.color }}>
          Chart Style System - Сравнение подходов
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Старый подход */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-red-600">❌ ДО: Кастомные стили</h3>
            <OldRevenueChart />
            <div className="mt-4 text-sm text-gray-600">
              <p>• Разные стили в каждом компоненте</p>
              <p>• Дублирование кода</p>
              <p>• Сложно поддерживать</p>
              <p>• Несоответствие бренду</p>
            </div>
          </div>
          
          {/* Новый подход */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-green-600">✅ ПОСЛЕ: Единая система</h3>
            <NewRevenueChart />
            <div className="mt-4 text-sm text-gray-600">
              <p>• Единый стиль для всех графиков</p>
              <p>• Переиспользование компонентов</p>
              <p>• Легко поддерживать</p>
              <p>• 100% бренд соответствие</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Примеры различных типов графиков */}
      <div>
        <h3 className="text-xl font-semibold mb-4" style={{ color: ChartStyleConfig.typography.title.color }}>
          📊 Все графики используют одинаковый стиль
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MultiMetricChart />
          <ComparisonBarChart />
          <GrowthAreaChart />
          <RealTimeMetricsChart />
        </div>
      </div>
      
      {/* Преимущества системы */}
      <div>
        <h3 className="text-xl font-semibold mb-4" style={{ color: ChartStyleConfig.typography.title.color }}>
          🚀 Преимущества Chart Style System
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border" style={{ 
            background: ChartStyleConfig.glassmorphism.background,
            borderColor: ChartStyleConfig.glassmorphism.border
          }}>
            <h4 className="font-semibold mb-2" style={{ color: ChartStyleConfig.colors.primary }}>
              Единый источник правды
            </h4>
            <p className="text-sm" style={{ color: ChartStyleConfig.colors.textSecondary }}>
              Все стили определены в ChartStyleConfig
            </p>
          </div>
          
          <div className="p-4 rounded-lg border" style={{ 
            background: ChartStyleConfig.glassmorphism.background,
            borderColor: ChartStyleConfig.glassmorphism.border
          }}>
            <h4 className="font-semibold mb-2" style={{ color: ChartStyleConfig.colors.primary }}>
              25 готовых шаблонов
            </h4>
            <p className="text-sm" style={{ color: ChartStyleConfig.colors.textSecondary }}>
              Line, Bar, Area, Mixed и специализированные графики
            </p>
          </div>
          
          <div className="p-4 rounded-lg border" style={{ 
            background: ChartStyleConfig.glassmorphism.background,
            borderColor: ChartStyleConfig.glassmorphism.border
          }}>
            <h4 className="font-semibold mb-2" style={{ color: ChartStyleConfig.colors.primary }}>
              Простое добавление
            </h4>
            <p className="text-sm" style={{ color: ChartStyleConfig.colors.textSecondary }}>
              Новые графики без написания CSS кода
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
