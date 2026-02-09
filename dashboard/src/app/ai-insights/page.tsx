"use client";

import { useState, useEffect, useCallback } from "react";
import { RequireRole } from "../../components/auth";
import { InsightFeed } from "../../components/home/InsightFeed";
import { Card, Title, Text } from "@tremor/react";
import { Brain, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";
import { useDemoMode } from "../../context/DemoContext";
import { generateMockAnomalies } from "../../lib/mockGenerator";

interface AnomalyData {
  anomalies: Array<{
    metric_name: string;
    current_value: number;
    baseline_median: number;
    z_score: number;
    severity: "critical" | "warning" | "normal";
  }>;
  has_critical: boolean;
  critical_count: number;
  ai_insight: string | null;
}

export default function AIInsightsPage() {
  const { isDemoMode } = useDemoMode();
  const [anomalyData, setAnomalyData] = useState<AnomalyData | null>(null);
  const [loadingAnomalies, setLoadingAnomalies] = useState(true);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showAccuracyModal, setShowAccuracyModal] = useState(false);

  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const mockData = generateMockAnomalies();
          setAnomalyData({
            anomalies: mockData.anomalies,
            has_critical: mockData.has_critical,
            critical_count: mockData.critical_count,
            ai_insight: mockData.aiInsight ? 
              `${mockData.aiInsight.root_cause}\n\nRecommended Actions:\n${mockData.aiInsight.actions.join('\n')}` 
              : null,
          });
        } else {
          const res = await fetch("/api/rest/anomalies", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            setAnomalyData(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch anomalies:", err);
      } finally {
        setLoadingAnomalies(false);
      }
    };

    fetchAnomalies();
    const interval = setInterval(fetchAnomalies, 60000);
    return () => clearInterval(interval);
  }, [isDemoMode]);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="relative min-h-screen bg-slate-950 overflow-hidden">
        {/* Динамический градиент в стиле нефтяного пятна */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-purple-950 to-slate-900 opacity-60 animate-pulse" style={{ animationDelay: '3s', animationDuration: '12s' }} />
          <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-amber-950/20 to-orange-950/10 rounded-full blur-[150px] opacity-30 animate-blob" />
          <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-rose-950/20 to-pink-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-gradient-to-tr from-violet-950/20 to-purple-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '4s' }} />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-teal-950/15 to-cyan-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '6s' }} />
          <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-gradient-to-tl from-indigo-950/15 to-blue-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '8s' }} />
          <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-emerald-950/10 to-teal-950/5 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '10s' }} />
        </div>
        <div className="relative">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-blue-500/30">
              <Brain className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">AI Insights</h1>
              <p className="text-slate-400 mt-1">Интеллектуальный анализ данных и аномалий в реальном времени</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              onClick={() => setShowInsightsModal(true)}
              className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/30 backdrop-blur-xl rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:from-blue-500/20 hover:to-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-2xl font-bold text-blue-400">24</span>
              </div>
              <Title className="text-white text-lg">Активных инсайтов</Title>
              <Text className="text-slate-400 text-sm mt-1">За последние 7 дней</Text>
            </button>

            <button
              onClick={() => setShowAnomalyModal(true)}
              className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 backdrop-blur-xl rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:from-amber-500/20 hover:to-orange-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-2xl font-bold text-amber-400">
                  {loadingAnomalies ? "..." : anomalyData?.critical_count || 0}
                </span>
              </div>
              <Title className="text-white text-lg">Критических аномалий</Title>
              <Text className="text-slate-400 text-sm mt-1">Требуют внимания</Text>
            </button>

            <button
              onClick={() => setShowAccuracyModal(true)}
              className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/30 backdrop-blur-xl rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:from-emerald-500/20 hover:to-green-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-2xl font-bold text-emerald-400">89%</span>
              </div>
              <Title className="text-white text-lg">Точность прогнозов</Title>
              <Text className="text-slate-400 text-sm mt-1">За последний месяц</Text>
            </button>
          </div>

          {/* Insight Feed */}
          <Card className="bg-transparent border-0 shadow-none p-0">
            <InsightFeed
              days={7}
              onItemClick={(item) => {
                console.log("Insight click", item.id);
              }}
            />
          </Card>
        </div>

        {/* Insights Modal */}
        {showInsightsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/20 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <Title className="text-blue-300">Активные инсайты</Title>
                      <Text className="text-slate-400 text-sm">За последние 7 дней обнаружено 24 инсайта</Text>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowInsightsModal(false)}
                    className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-blue-300 font-medium">📈 Рост пользовательской активности</Text>
                      <Text className="text-xs text-blue-400">2 дня назад</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Обнаружен рост активности на 23% по сравнению с предыдущей неделей. Основной прирост в вечерние часы.</Text>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-blue-300 font-medium">💡 Оптимизация конверсии</Text>
                      <Text className="text-xs text-blue-400">3 дня назад</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Выявлена возможность улучшить конверсию на 15% через оптимизацию формы регистрации.</Text>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-blue-300 font-medium">🎯 Сегментация пользователей</Text>
                      <Text className="text-xs text-blue-400">5 дней назад</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Выделены 3 ключевых сегмента пользователей с разным поведением и предпочтениями.</Text>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-blue-300 font-medium">⚡ Пиковая нагрузка</Text>
                      <Text className="text-xs text-blue-400">6 дней назад</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Определены пиковые часы нагрузки для оптимизации ресурсов сервера.</Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accuracy Modal */}
        {showAccuracyModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/20 rounded-xl">
                      <Lightbulb className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <Title className="text-emerald-300">Точность прогнозов</Title>
                      <Text className="text-slate-400 text-sm">Точность прогнозов за последний месяц: 89%</Text>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAccuracyModal(false)}
                    className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-emerald-300 font-medium">📊 Прогноз пользовательской активности</Text>
                      <Text className="text-xs text-emerald-400">Точность: 92%</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Модель прогнозирования пользовательской активности показывает высокую точность в течение последних 30 дней.</Text>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-emerald-300 font-medium">💰 Прогноз доходов</Text>
                      <Text className="text-xs text-emerald-400">Точность: 87%</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Прогнозирование доходов на основе исторических данных показывает стабильную точность.</Text>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-emerald-300 font-medium">📈 Прогноз трендов</Text>
                      <Text className="text-xs text-emerald-400">Точность: 88%</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Анализ трендов и прогнозирование будущих показателей демонстрирует хорошую точность.</Text>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-emerald-300 font-medium">🎯 Прогноз конверсии</Text>
                      <Text className="text-xs text-emerald-400">Точность: 91%</Text>
                    </div>
                    <Text className="text-slate-300 text-sm">Модель прогнозирования конверсии показывает отличные результаты в тестовом периоде.</Text>
                  </div>

                  <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                    <Text className="text-emerald-400 font-medium mb-2">📈 Улучшение точности</Text>
                    <Text className="text-slate-300 text-sm">За последний месяц точность прогнозов улучшилась на 3% благодаря оптимизации алгоритмов и добавлению новых данных.</Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Anomaly Modal */}
        {showAnomalyModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-500/20 rounded-xl">
                      <AlertTriangle className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <Title className="text-amber-300">Обнаружены аномалии в метриках</Title>
                      <Text className="text-slate-400 text-sm">
                        {loadingAnomalies ? "Загрузка..." : 
                         anomalyData?.has_critical 
                          ? `Обнаружено ${anomalyData.critical_count} аномал${anomalyData.critical_count === 1 ? "ия" : "ий"} в метриках системы`
                          : "Критических аномалий не обнаружено"
                        }
                      </Text>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAnomalyModal(false)}
                    className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {!loadingAnomalies && anomalyData?.has_critical && (
                  <>
                    <div className="space-y-2 mb-4">
                      {anomalyData.anomalies
                        .filter((a) => a.severity === "critical" || a.severity === "warning")
                        .map((a, i) => (
                          <div key={i} className="flex items-center justify-between bg-black/20 rounded-lg px-4 py-2">
                            <span className="text-sm text-slate-200">{a.metric_name}</span>
                            <span className="text-sm font-mono text-amber-400">
                              {a.current_value.toFixed(0)} (медиана: {a.baseline_median.toFixed(0)}, отклонение: {a.z_score.toFixed(1)}σ)
                            </span>
                          </div>
                        ))}
                    </div>
                    {anomalyData.ai_insight && (
                      <div className="bg-black/30 rounded-lg p-4 border border-lime-500/30">
                        <Text className="text-xs text-lime-400 mb-2">AI-анализ:</Text>
                        <Text className="text-sm text-slate-200 whitespace-pre-wrap">{anomalyData.ai_insight}</Text>
                      </div>
                    )}
                  </>
                )}

                {loadingAnomalies && (
                  <div className="text-center py-8">
                    <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <Text className="text-slate-400">Загрузка данных об аномалиях...</Text>
                  </div>
                )}

                {!loadingAnomalies && !anomalyData?.has_critical && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">✅</div>
                    <Text className="text-slate-300">Критических аномалий не обнаружено</Text>
                    <Text className="text-slate-500 text-sm mt-2">Все метрики в норме</Text>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </RequireRole>
  );
}
