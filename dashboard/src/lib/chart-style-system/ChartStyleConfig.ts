/**
 * Единая конфигурация стилей для всех графиков PocketAnalyst
 * Извлечена из существующих реализаций и зафиксирована как источник правды
 */

export const ChartStyleConfig = {
  // === КОНТЕЙНЕРЫ И РАЗМЕРЫ ===
  container: {
    // Базовые размеры контейнеров
    default: {
      width: '100%',
      height: 360,
    },
    compact: {
      width: '100%', 
      height: 280,
    },
    metric: {
      width: '100%',
      height: 128, // h-32 для метрических карточек
    },
    expanded: {
      width: '100%',
      height: 384, // h-96
    },
  },

  // === ОТСТУПЫ И PADDING ===
  spacing: {
    container: {
      padding: '16px', // p-4
    },
    card: {
      padding: '20px', // p-5 для метрических карточек
    },
    chart: {
      padding: 0, // Без внутренних отступов для графиков
    },
  },

  // === BORDER RADIUS ===
  borderRadius: {
    container: '16px', // rounded-2xl
    card: '16px', // rounded-2xl
    button: '8px', // rounded-lg
    small: '4px', // rounded
  },

  // === ТИПОГРАФИЯ ===
  typography: {
    title: {
      fontSize: '14px', // text-sm
      fontWeight: 500, // font-medium
      color: 'rgba(255, 255, 255, 0.95)', // text-white
      lineHeight: '1.4',
    },
    label: {
      fontSize: '11px', // text-xs
      fontWeight: 400,
      color: 'rgba(226, 232, 240, 0.9)', // DARK_THEME.textColor
      lineHeight: '1.3',
    },
    value: {
      fontSize: '18px', // text-2xl для метрик
      fontWeight: 700, // font-bold
      color: 'rgba(255, 255, 255, 0.95)', // text-white
      lineHeight: '1.2',
    },
    metric: {
      fontSize: '24px', // text-3xl для больших метрик
      fontWeight: 700, // font-bold
      color: 'rgba(255, 255, 255, 0.95)', // text-white
      lineHeight: '1.2',
    },
  },

  // === ЦВЕТОВАЯ ПАЛИТРА ===
  colors: {
    // Основная палитра (из DARK_THEME)
    primary: '#10b981', // lime-400
    secondary: '#3b82f6', // blue-400
    accent: '#a78bfa', // purple-400 (из cyberMidnight)
    
    // Дополнительные цвета
    success: '#10b981',
    warning: '#f59e0b', // amber-500
    error: '#ef4444', // red-500
    info: '#3b82f6',
    
    // Фоны и границы
    background: 'rgba(0, 0, 0, 0)', // прозрачный
    cardBackground: 'rgba(255, 255, 255, 0.1)', // white/10
    cardBorder: 'rgba(255, 255, 255, 0.2)', // white/20
    grid: 'rgba(34, 197, 94, 0.1)', // rgba(34,197,94,0.1)
    gridAlternative: 'rgba(148, 163, 184, 0.18)', // cyberMidnight.gridColor
    
    // Текст
    textPrimary: 'rgba(255, 255, 255, 0.95)', // text-white
    textSecondary: 'rgba(226, 232, 240, 0.9)', // DARK_THEME.textColor
    textMuted: 'rgba(148, 163, 184, 0.7)', // slate-400
    
    // Glow эффекты
    glowPrimary: 'rgba(16, 185, 129, 0.6)', // DARK_THEME.glowColor
    glowSecondary: 'rgba(59, 130, 246, 0.6)',
    glowAccent: 'rgba(167, 139, 250, 0.55)', // cyberMidnight.glowPrimary
  },

  // === GRID И ОСИ ===
  grid: {
    show: true,
    color: 'rgba(34, 197, 94, 0.1)', // DARK_THEME.gridColor
    lineWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    
    // Отступы для grid
    left: '3%',
    right: '4%', 
    top: '3%',
    bottom: '3%',
    containLabel: true,
  },

  // === ОСИ КООРДИНАТ ===
  axes: {
    x: {
      type: 'category',
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(34, 197, 94, 0.1)',
        },
      },
      axisLabel: {
        show: true,
        color: 'rgba(226, 232, 240, 0.9)',
        fontSize: 11,
      },
      axisTick: {
        show: false,
      },
    },
    y: {
      type: 'value',
      position: 'left',
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(34, 197, 94, 0.1)',
        },
      },
      axisLabel: {
        show: true,
        color: 'rgba(226, 232, 240, 0.9)',
        fontSize: 11,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(34, 197, 94, 0.1)',
        },
      },
      axisTick: {
        show: false,
      },
    },
  },

  // === TOOLTIP ===
  tooltip: {
    show: true,
    trigger: 'axis',
    backgroundColor: 'rgba(2, 6, 23, 0.92)', // из BarChartModule
    borderColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    textStyle: {
      color: 'rgba(226, 232, 240, 0.9)',
      fontSize: 12,
    },
    padding: [8, 12],
    borderRadius: 8,
    
    // Форматирование
    formatter: (params: any[]) => {
      const time = params[0]?.axisValue || '';
      return `
        <div style="padding: 8px;">
          <div style="color: rgba(226, 232, 240, 0.9); margin-bottom: 4px; font-size: 12px;">${time}</div>
          ${params.map(p => `
            <div style="display: flex; align-items: center; margin: 2px 0;">
              <span style="display: inline-block; width: 10px; height: 2px; background: ${p.color}; margin-right: 8px;"></span>
              <span style="color: rgba(226, 232, 240, 0.9); font-size: 12px;">${p.seriesName}: ${Number(p.value).toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      `;
    },
  },

  // === ANIMATION И TRANSITIONS ===
  animation: {
    enabled: true,
    duration: 1500,
    easing: 'cubicOut',
    delay: 0,
    
    // Hover эффекты
    hover: {
      enabled: true,
      animationDuration: 300,
      brightness: 1.1,
    },
  },

  // === LEGEND ===
  legend: {
    show: true,
    position: 'top',
    textStyle: {
      color: 'rgba(226, 232, 240, 0.9)',
      fontSize: 12,
    },
    itemGap: 16,
    itemWidth: 14,
    itemHeight: 14,
  },

  // === SERIES СТИЛИ ===
  series: {
    line: {
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 2,
        shadowColor: 'rgba(16, 185, 129, 0.6)',
        shadowBlur: 10,
        shadowOffsetY: 0,
      },
      areaStyle: {
        opacity: 0.3,
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' },
          ],
        },
      },
    },
    bar: {
      barWidth: '60%',
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        shadowColor: 'rgba(16, 185, 129, 0.4)',
        shadowBlur: 8,
        shadowOffsetY: 2,
      },
    },
  },

  // === GLASSMORPHISM ЭФФЕКТЫ ===
  glassmorphism: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  },

  // === INTERACTIVE ЭЛЕМЕНТЫ ===
  interactive: {
    button: {
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: 'rgba(255, 255, 255, 0.95)',
      hover: {
        background: 'rgba(255, 255, 255, 0.2)',
      },
    },
    select: {
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: 'rgba(255, 255, 255, 0.95)',
    },
  },
} as const;

// Типы для TypeScript
export type ChartStyleConfigType = typeof ChartStyleConfig;
export type ContainerSize = keyof typeof ChartStyleConfig.container;
export type ColorPalette = keyof typeof ChartStyleConfig.colors;
