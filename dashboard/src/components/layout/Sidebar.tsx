"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  HomeIcon,
  LayoutDashboardIcon,
  LineChartIcon,
  BarChart3Icon,
  SettingsIcon,
  UsersIcon,
  ActivityIcon,
  ChevronDown,
  ChevronRight,
  Library,
  MoreVertical,
  Download,
  Upload,
  Sparkles,
  Settings2,
  Brain,
  Beaker,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useRole } from "../../providers";
import { useDemoMode } from "../../context/DemoContext";
import { chartLibrary } from "../../config/library";

const menuItems = [
  { name: "Home", href: "/home", icon: HomeIcon },
  { name: "AI Insights", href: "/ai-insights", icon: Brain },
  { name: "Analytics", href: "/analytics", icon: BarChart3Icon },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { name: "Chart Builder", href: "/chart-builder", icon: LineChartIcon },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

const analyticsSubItems = [
  { name: "Analytics", anchor: "#analytics-top", icon: BarChart3Icon },
  { name: "Activity", anchor: "#activity-section", icon: ActivityIcon },
  { name: "Users", anchor: "#users-section", icon: UsersIcon },
];

// Library is now sourced from src/config/library.ts

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole } = useRole();
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const [hoveredChart, setHoveredChart] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    chartLibrary.reduce((acc, cat) => ({ ...acc, [cat.category]: true }), {})
  );

  // Проверяем, находимся ли мы на странице Dashboard
  const isDashboardPage = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isAnalyticsPage = pathname === "/analytics" || pathname.startsWith("/analytics/");

  // Разделяем пункты меню на активные и неактивные
  const activeItem = menuItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const inactiveItems = menuItems.filter((item) => !(pathname === item.href || pathname.startsWith(item.href + '/')));

  const handleScrollToSection = (anchor: string) => {
    if (!isAnalyticsPage) {
      router.push(`/analytics${anchor}`);
      return;
    }
    const id = anchor.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleDemoToggle = () => {
    console.log('[Sidebar] Demo Mode toggle clicked, current:', isDemoMode);
    try {
      toggleDemoMode();
      console.log('[Sidebar] Demo Mode toggled successfully');
    } catch (error) {
      console.error('[Sidebar] Demo Mode toggle error:', error);
    }
  };

  const handleNavigation = (href: string) => {
    console.log('[Sidebar] Navigation clicked:', href);
    try {
      router.push(href);
      console.log('[Sidebar] Router.push called successfully');
    } catch (error) {
      console.error('[Sidebar] Navigation error:', error);
    }
  };

  const handleChartAction = (chartName: string, action: string) => {
    console.log(`[Sidebar] ${action} clicked for ${chartName}`);
    
    switch (action) {
      case 'export':
        // Экспорт конфигурации графика
        const chartData = chartLibrary.flatMap(cat => cat.charts).find(c => c.name === chartName);
        if (chartData) {
          const dataStr = JSON.stringify(chartData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${chartName.replace(/\s+/g, '_').toLowerCase()}_config.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        break;
        
      case 'import':
        // Импорт конфигурации графика
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const imported = JSON.parse(e.target?.result as string);
                console.log(`[Sidebar] Imported config for ${chartName}:`, imported);
              } catch (error) {
                console.error('[Sidebar] Error importing config:', error);
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
        break;
        
      case 'ai-config':
        // AI настройка графика
        console.log(`[Sidebar] Opening AI config for ${chartName}`);
        // Здесь можно открыть модальное окно с AI настройками
        break;
        
      case 'manual-config':
        // Ручная настройка графика
        console.log(`[Sidebar] Opening manual config for ${chartName}`);
        // Здесь можно открыть модальное окно с ручными настройками
        break;
    }
    
    setOpenMenu(null);
  };

  const toggleCategory = (title: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-slate-950 h-screen flex flex-col border-r border-white/10 sticky top-0 z-50`} style={{ transition: 'width 150ms ease-out' }}>
      {/* Logo + Collapse Toggle */}
      <div className={`${collapsed ? 'p-3' : 'p-6'} border-b border-white/10 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <Link href="/home" className="block">
          {collapsed ? (
            <span className="text-lg font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">PA</span>
          ) : (
            <h1 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              PocketAnalyst
            </h1>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Свернуть меню"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center py-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Развернуть меню"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Mode Toggle */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} py-4 border-b border-white/10`}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDemoToggle();
          }}
          className={`w-full inline-flex items-center justify-center gap-2 ${collapsed ? 'px-2' : 'px-4'} py-2 text-xs font-semibold rounded-xl border transition-colors ${
            isDemoMode
              ? "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-lg shadow-amber-500/20"
              : "bg-white/5 text-slate-300 border-white/10 hover:text-white hover:border-white/20"
          }`}
          title={isDemoMode ? "Demo Mode" : "Live Mode"}
        >
          <Beaker className={`w-4 h-4 ${isDemoMode ? "animate-pulse" : ""}`} />
          {!collapsed && (isDemoMode ? "Demo" : "Live")}
        </button>
      </div>

      {/* Navigation - Неактивные пункты */}
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} overflow-y-auto`}>
        <ul className="space-y-1">
          {inactiveItems.map((item) => {
            const Icon = item.icon;
            const isDashboard = item.name === "Dashboard";
            const isAnalytics = item.name === "Analytics";
            return (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNavigation(item.href);
                  }}
                  className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left`}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
                </button>

                {/* Analytics sub-items */}
                {!collapsed && isAnalytics && isAnalyticsPage && (
                  <div className="mt-1 ml-4 pl-4 border-l-2 border-blue-500/30 space-y-0.5">
                    {analyticsSubItems.map((sub) => {
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.name}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleScrollToSection(sub.anchor);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                        >
                          <SubIcon className="w-3.5 h-3.5" />
                          <span>{sub.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                
                {/* Library под Dashboard - видна только когда активен Dashboard и не свёрнут */}
                {!collapsed && isDashboard && isDashboardPage && (
                  <div className="mt-2 ml-4 pl-4 border-l-2 border-blue-500/30">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-400 uppercase">
                      <Library className="w-4 h-4" />
                      <span>Library</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(51, 65, 85, 0.5) transparent' }}>
                      {chartLibrary.map((category) => (
                        <div key={category.category} className="mb-3">
                          <button
                            onClick={() => toggleCategory(category.category)}
                            className="flex items-center justify-between w-full py-2 px-4 text-left text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
                          >
                            <span>{category.category}</span>
                            <span>{expandedCategories[category.category] ? '−' : '+'}</span>
                          </button>
                          {expandedCategories[category.category] && (
                            <div className="mt-1 pl-2">
                              <ul className="space-y-0.5">
                                {category.charts.map((chart) => (
                                  <li key={chart.name} className="relative">
                                    <button
                                      type="button"
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData("application/json", JSON.stringify(chart));
                                        e.dataTransfer.effectAllowed = "copy";
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleNavigation(chart.page);
                                      }}
                                      onMouseEnter={(e) => {
                                        setHoveredChart(chart.name);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setTooltipPosition({ x: rect.right + 8, y: rect.top });
                                      }}
                                      onMouseLeave={() => {
                                        setHoveredChart(null);
                                        setTooltipPosition(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded transition-colors cursor-grab active:cursor-grabbing"
                                    >
                                      {chart.name}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Разделительная линия */}
        {activeItem && (
          <>
            <div className="my-4 border-t border-white/10"></div>

            {/* Активный пункт под линией - тоже кликабельный */}
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNavigation(activeItem.href);
                  }}
                  className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 transition-colors cursor-pointer hover:shadow-blue-500/40 text-left`}
                  title={collapsed ? activeItem.name : undefined}
                >
                  <activeItem.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{activeItem.name}</span>}
                </button>
                
                {/* Analytics sub-items под активным Analytics */}
                {!collapsed && activeItem.name === "Analytics" && isAnalyticsPage && (
                  <div className="mt-1 ml-4 pl-4 border-l-2 border-blue-500/30 space-y-0.5">
                    {analyticsSubItems.map((sub) => {
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.name}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleScrollToSection(sub.anchor);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/5 rounded transition-colors"
                        >
                          <SubIcon className="w-3.5 h-3.5" />
                          <span>{sub.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Library под активным Dashboard */}
                {!collapsed && activeItem.name === "Dashboard" && isDashboardPage && (
                  <div className="mt-2 ml-4 pl-4 border-l-2 border-blue-500/30">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-400 uppercase">
                      <Library className="w-4 h-4" />
                      <span>Library</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(51, 65, 85, 0.5) transparent' }}>
                      {chartLibrary.map((category) => (
                        <div key={category.category} className="mb-3">
                          <button
                            onClick={() => toggleCategory(category.category)}
                            className="flex items-center justify-between w-full py-2 px-4 text-left text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
                          >
                            <span>{category.category}</span>
                            <span>{expandedCategories[category.category] ? '−' : '+'}</span>
                          </button>
                          {expandedCategories[category.category] && (
                            <div className="mt-1 pl-2">
                              <ul className="space-y-0.5">
                                {category.charts.map((chart) => (
                                  <li key={chart.name} className="relative">
                                    <button
                                      type="button"
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData("application/json", JSON.stringify(chart));
                                        e.dataTransfer.effectAllowed = "copy";
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleNavigation(chart.page);
                                      }}
                                      onMouseEnter={(e) => {
                                        setHoveredChart(chart.name);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setTooltipPosition({ x: rect.right + 8, y: rect.top });
                                      }}
                                      onMouseLeave={() => {
                                        setHoveredChart(null);
                                        setTooltipPosition(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded transition-colors cursor-grab active:cursor-grabbing"
                                    >
                                      {chart.name}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            </ul>
          </>
        )}
      </nav>
      
      {/* Глобальный tooltip - отображается поверх всего независимо от Library */}
      {hoveredChart && tooltipPosition && (
        <div 
          className="fixed z-[9999] w-64 px-3 py-2 bg-slate-900/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl text-xs text-slate-300 pointer-events-none"
          style={{ 
            left: `${tooltipPosition.x}px`, 
            top: `${tooltipPosition.y}px` 
          }}
        >
          <div className="font-semibold text-white mb-1">
            {chartLibrary.flatMap(cat => cat.charts).find(c => c.name === hoveredChart)?.name}
          </div>
          <div>
            {chartLibrary.flatMap(cat => cat.charts).find(c => c.name === hoveredChart)?.description}
          </div>
          <div className="mt-1 text-slate-500">
            Page: {chartLibrary.flatMap(cat => cat.charts).find(c => c.name === hoveredChart)?.page}
          </div>
        </div>
      )}
      
      {/* User Section */}
      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-white/10`}>
        <button
          type="button"
          className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-colors group`}
          title={collapsed ? "user 1" : undefined}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg flex-shrink-0">
            U1
          </div>
          {!collapsed && (
            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
              user 1
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
