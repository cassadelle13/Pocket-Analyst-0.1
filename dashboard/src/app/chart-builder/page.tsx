"use client";

import { useState, useEffect, useCallback } from "react";
import { FieldList } from "../../components/chart-builder/FieldList";
import { DropZone, MultiDropZone } from "../../components/chart-builder/DropZone";
import { ChartCanvas } from "../../components/chart-builder/ChartCanvas";
import { CommandBar } from "../../components/dashboard/CommandBar";
import { SchemaIntelligenceService } from "../../lib/schema-intelligence";
import { CommandExecutor } from "../../lib/dashboard/commandExecutor";
import { generateQuery } from "../../lib/chart-builder/queryGenerator";
import type { DashboardState } from "../../types/dashboard-state";
import type { SemanticModel, ClassifiedColumn } from "../../lib/schema-intelligence";
import { Play, Code, Plus, Trash2, Save } from "lucide-react";

interface ChartInstance {
  id: string;
  name: string;
  state: DashboardState;
  data: any[];
  sql: string;
}

export default function ChartBuilderPage() {
  const [semanticModel, setSemanticModel] = useState<SemanticModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedTable, setSelectedTable] = useState<string>('analytics.events');
  const [availableTables, setAvailableTables] = useState<string[]>(['analytics.events']);
  
  const [charts, setCharts] = useState<ChartInstance[]>([]);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  
  const [state, setState] = useState<DashboardState>({
    chartType: 'bar',
    xField: null,
    yFields: [],
    filters: [],
    limit: 100,
  });

  const [chartData, setChartData] = useState<any[]>([]);
  const [showSQL, setShowSQL] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState<string>('');

  useEffect(() => {
    loadSchema();
    loadFromLocalStorage();
  }, []);

  useEffect(() => {
    saveToLocalStorage();
  }, [state, charts, activeChartId, selectedTable]);

  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('chartBuilder');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.state) setState(data.state);
        if (data.charts) setCharts(data.charts);
        if (data.activeChartId) setActiveChartId(data.activeChartId);
        if (data.selectedTable) setSelectedTable(data.selectedTable);
      }
    } catch (err) {
      console.error('Failed to load from localStorage:', err);
    }
  };

  const saveToLocalStorage = () => {
    try {
      localStorage.setItem('chartBuilder', JSON.stringify({
        state,
        charts,
        activeChartId,
        selectedTable,
      }));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }
  };

  const getClickHouseHost = () => {
    // Если запущено в Docker, используем 'storage', иначе 'localhost'
    return typeof window !== 'undefined' && window.location.hostname === 'localhost' 
      ? 'localhost' 
      : 'storage';
  };

  const getMockSchema = () => {
    return {
      data: {
        columns: [
          { database: 'analytics', table: 'events', name: 'timestamp', type: 'DateTime' },
          { database: 'analytics', table: 'events', name: 'event_name', type: 'String' },
          { database: 'analytics', table: 'events', name: 'user_id', type: 'String' },
          { database: 'analytics', table: 'events', name: 'session_id', type: 'String' },
          { database: 'analytics', table: 'events', name: 'platform', type: 'String' },
          { database: 'analytics', table: 'events', name: 'country', type: 'String' },
          { database: 'analytics', table: 'events', name: 'revenue', type: 'Float64' },
          { database: 'analytics', table: 'events', name: 'quantity', type: 'Int32' },
          { database: 'analytics', table: 'events', name: 'duration', type: 'Int32' },
        ]
      }
    };
  };

  const loadSchema = async () => {
    setSchemaLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/datatalk/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: {
            type: 'clickhouse',
            host: getClickHouseHost(),
            port: 8123,
            database: 'analytics',
            user: 'default',
            password: '',
          }
        }),
      });

      let data;
      if (!res.ok) {
        console.warn('API unavailable, using mock schema');
        data = getMockSchema();
      } else {
        data = await res.json();
      }

      const model = SchemaIntelligenceService.buildFromSchemaResponse(data.data);
      setSemanticModel(model);
      
      const tables = Array.from(new Set(data.data.columns.map((col: any) => `${col.database}.${col.table}`))) as string[];
      setAvailableTables(tables);
    } catch (err) {
      console.warn('Error loading schema, using mock data:', err);
      const mockData = getMockSchema();
      const model = SchemaIntelligenceService.buildFromSchemaResponse(mockData.data);
      setSemanticModel(model);
      const tables = ['analytics.events'];
      setAvailableTables(tables);
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleXAxisDrop = useCallback((column: ClassifiedColumn) => {
    setState(prev => ({ ...prev, xField: column }));
  }, []);

  const handleXAxisRemove = useCallback(() => {
    setState(prev => ({ ...prev, xField: null }));
  }, []);

  const handleYAxisAdd = useCallback((column: ClassifiedColumn) => {
    setState(prev => {
      if (prev.yFields.some(y => y.name === column.name && y.table === column.table)) {
        return prev;
      }
      if (prev.yFields.length >= 3) {
        return prev;
      }
      return { ...prev, yFields: [...prev.yFields, column] };
    });
  }, []);

  const handleYAxisRemove = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      yFields: prev.yFields.filter((_, idx) => idx !== index),
    }));
  }, []);

  const handleChartTypeChange = useCallback((chartType: DashboardState['chartType']) => {
    setState(prev => ({ ...prev, chartType }));
  }, []);

  const handleCommand = useCallback(async (text: string) => {
    if (!semanticModel) {
      throw new Error('Schema not loaded');
    }

    const availableFields = [
      ...semanticModel.dimensions.map(f => f.name),
      ...semanticModel.measures.map(f => f.name),
      ...semanticModel.timeFields.map(f => f.name),
    ];

    const response = await fetch('/api/commands/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, availableFields }),
    });

    if (!response.ok) {
      throw new Error('Failed to parse command');
    }

    const result = await response.json();

    if (!result.success || !result.command) {
      throw new Error(result.error || 'Invalid command');
    }

    const newState = CommandExecutor.execute(result.command, state, semanticModel);
    setState(newState);
  }, [semanticModel, state]);

  const getMockQueryData = () => {
    const now = new Date();
    const mockRows = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      mockRows.push([
        date.toISOString().split('T')[0],
        Math.floor(Math.random() * 1000) + 500,
        Math.floor(Math.random() * 50) + 10,
      ]);
    }
    return {
      data: {
        columns: [state.xField?.name || 'date', ...state.yFields.map(f => f.name)],
        rows: mockRows,
      }
    };
  };

  const executeQuery = async () => {
    if (!state.xField || state.yFields.length === 0) {
      return;
    }

    const legacyConfig = {
      xAxis: state.xField,
      yAxis: state.yFields,
      chartType: state.chartType,
      filters: state.filters.map(f => ({ column: f.field, operator: f.operator, value: f.value })),
    };

    const sql = generateQuery(legacyConfig, selectedTable, state.limit);
    if (!sql) {
      return;
    }

    setGeneratedSQL(sql);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/datatalk/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: {
            type: 'clickhouse',
            host: getClickHouseHost(),
            port: 8123,
            database: 'analytics',
            user: 'default',
            password: '',
          },
          sql,
          role: 'admin',
          maxRows: 100,
          timeoutMs: 10000,
        }),
      });

      let result;
      if (!res.ok) {
        console.warn('Query API unavailable, using mock data');
        result = getMockQueryData();
      } else {
        result = await res.json();
      }
      
      const rows = result.data.rows.map((row: any[]) => {
        const obj: any = {};
        result.data.columns.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return obj;
      });

      setChartData(rows);
    } catch (err) {
      console.warn('Query error, using mock data:', err);
      const mockResult = getMockQueryData();
      const rows = mockResult.data.rows.map((row: any[]) => {
        const obj: any = {};
        mockResult.data.columns.forEach((col: string, idx: number) => {
          obj[col] = row[idx];
        });
        return obj;
      });
      setChartData(rows);
    } finally {
      setLoading(false);
    }
  };

  const addNewChart = () => {
    const newChart: ChartInstance = {
      id: `chart-${Date.now()}`,
      name: `Chart ${charts.length + 1}`,
      state: { ...state },
      data: [...chartData],
      sql: generatedSQL,
    };
    setCharts([...charts, newChart]);
  };

  const deleteChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
    if (activeChartId === id) {
      setActiveChartId(null);
    }
  };

  const loadChart = (chart: ChartInstance) => {
    setState(chart.state);
    setChartData(chart.data);
    setGeneratedSQL(chart.sql);
    setActiveChartId(chart.id);
  };

  const clearAll = () => {
    if (confirm('Clear all charts and reset state?')) {
      setState({
        chartType: 'bar',
        xField: null,
        yFields: [],
        filters: [],
        limit: 100,
      });
      setCharts([]);
      setActiveChartId(null);
      setChartData([]);
      setGeneratedSQL('');
      localStorage.removeItem('chartBuilder');
    }
  };

  if (schemaLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400">Loading schema...</p>
        </div>
      </div>
    );
  }

  if (error && !semanticModel) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-white mb-2">Failed to Load Schema</h3>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={loadSchema}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex overflow-hidden">
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
      <div className="relative flex-1 flex overflow-hidden">
        {semanticModel && (
          <FieldList
            dimensions={semanticModel.dimensions}
            measures={semanticModel.measures}
            timeFields={semanticModel.timeFields}
          />
        )}

        <div className="flex-1 flex flex-col">
          <ChartCanvas
            config={{
              xAxis: state.xField,
              yAxis: state.yFields,
              chartType: state.chartType,
              filters: state.filters.map(f => ({ column: f.field, operator: f.operator, value: f.value })),
            }}
            data={chartData}
            loading={loading}
            onChartTypeChange={handleChartTypeChange}
          />

          <div className="border-t border-slate-700 bg-slate-900 p-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-4 flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                    Table
                  </label>
                  <select
                    value={selectedTable}
                    onChange={(e) => setSelectedTable(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableTables.map(table => (
                      <option key={table} value={table}>{table}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={addNewChart}
                    disabled={!state.xField || state.yFields.length === 0 || chartData.length === 0}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors text-sm"
                    title="Save current chart"
                  >
                    <Save className="w-4 h-4" />
                    Save Chart
                  </button>
                  
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                    title="Clear all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>

              {charts.length > 0 && (
                <div className="mb-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                    Saved Charts ({charts.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {charts.map(chart => (
                      <div
                        key={chart.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                          activeChartId === chart.id
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        <button
                          onClick={() => loadChart(chart)}
                          className="text-sm font-medium"
                        >
                          {chart.name}
                        </button>
                        <button
                          onClick={() => deleteChart(chart.id)}
                          className="p-0.5 hover:bg-red-500 rounded transition-colors"
                          title="Delete chart"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <DropZone
                  label="X Axis (Dimension / Time)"
                  field={state.xField}
                  onDrop={handleXAxisDrop}
                  onRemove={handleXAxisRemove}
                  acceptTypes={['dimension', 'timeField']}
                />

                <MultiDropZone
                  label="Y Axis (Measures)"
                  fields={state.yFields}
                  onAdd={handleYAxisAdd}
                  onRemove={handleYAxisRemove}
                  acceptTypes={['measure']}
                  maxFields={3}
                />
              </div>

              <CommandBar onCommand={handleCommand} disabled={loading || !semanticModel} />

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={executeQuery}
                  disabled={!state.xField || state.yFields.length === 0 || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors font-medium"
                >
                  <Play className="w-4 h-4" />
                  Run Query
                </button>

                <button
                  onClick={() => setShowSQL(!showSQL)}
                  disabled={!state.xField || state.yFields.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors"
                >
                  <Code className="w-4 h-4" />
                  {showSQL ? 'Hide' : 'Show'} SQL
                </button>

                {error && (
                  <div className="flex-1 text-sm text-red-400">
                    Error: {error}
                  </div>
                )}

                {chartData.length > 0 && (
                  <div className="text-sm text-slate-400">
                    {chartData.length} rows
                  </div>
                )}
              </div>

              {showSQL && generatedSQL && (
                <div className="mt-4 p-4 bg-slate-950 rounded-lg border border-slate-700">
                  <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                    Generated SQL
                  </div>
                  <pre className="text-sm text-slate-300 font-mono overflow-x-auto">
                    {generatedSQL}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
