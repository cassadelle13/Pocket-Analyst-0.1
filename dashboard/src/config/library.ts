export type ChartLibraryItem = {
  name: string;
  page: string;
  description: string;
};

export type ChartLibraryCategory = {
  category: string;
  charts: ChartLibraryItem[];
};

// Centralized Library config for the Dashboard sidebar.
// Edit this file to add/remove categories and charts.
export const chartLibrary: ChartLibraryCategory[] = [
  {
    category: "Graphics, Diagrams, Table",
    charts: [
      { name: "Graphics", page: "/dashboard", description: "Base graphic blocks and visual wrappers" },
      { name: "Diagrams", page: "/dashboard", description: "Generic diagram presets" },
      { name: "Table", page: "/dashboard", description: "Tabular display presets" },
    ],
  },

  {
    category: "Trends & Time (Динамика)",
    charts: [
      { name: "Line (time series)", page: "/dashboard", description: "Single metric over time" },
      { name: "Multi-line (несколько метрик)", page: "/dashboard", description: "Compare multiple metrics over time" },
      { name: "Area (накопление)", page: "/dashboard", description: "Cumulative area over time" },
      { name: "Stacked area", page: "/dashboard", description: "Composition over time with stacked areas" },
      { name: "Rolling average", page: "/dashboard", description: "Smoothed trend with moving average" },
      { name: "Period-over-period comparison", page: "/dashboard", description: "WoW/MoM/YoY overlays" },
      { name: "Cumulative growth", page: "/dashboard", description: "Cumulative sum trajectory" },
    ],
  },

  {
    category: "Comparison (Сравнение)",
    charts: [
      { name: "Bar (categorical)", page: "/dashboard", description: "Compare categories by value" },
      { name: "Grouped bar", page: "/dashboard", description: "Multiple series per category" },
      { name: "Stacked bar", page: "/dashboard", description: "Composition within categories" },
      { name: "Rank / Top-N", page: "/dashboard", description: "Top categories by metric" },
      { name: "Bottom-N", page: "/dashboard", description: "Lowest categories by metric" },
      { name: "Side-by-side comparison", page: "/dashboard", description: "A/B series side-by-side" },
    ],
  },

  {
    category: "Composition (Состав)",
    charts: [
      { name: "Pie", page: "/dashboard", description: "Share of parts of a whole" },
      { name: "Donut", page: "/dashboard", description: "Pie with hollow center" },
      { name: "100% stacked bar", page: "/dashboard", description: "Relative composition (100%)" },
      { name: "Treemap", page: "/dashboard", description: "Nested rectangles by weight" },
      { name: "Hierarchical breakdown", page: "/dashboard", description: "Multi-level composition view" },
    ],
  },

  {
    category: "Distribution (Распределение)",
    charts: [
      { name: "Histogram", page: "/dashboard", description: "Binned value distribution" },
      { name: "Box plot", page: "/dashboard", description: "Quartiles and outliers" },
      { name: "Density plot", page: "/dashboard", description: "Smoothed distribution (KDE)" },
      { name: "Outlier view", page: "/dashboard", description: "Spot anomalies and extremes" },
    ],
  },

  {
    category: "Performance & KPI",
    charts: [
      { name: "KPI card", page: "/dashboard", description: "Single metric highlight" },
      { name: "KPI with delta", page: "/dashboard", description: "Metric with change vs prior" },
      { name: "KPI vs target", page: "/dashboard", description: "Goal attainment indicator" },
      { name: "Bullet chart", page: "/dashboard", description: "Target, range, and actual" },
      { name: "Funnel", page: "/dashboard", description: "Stage conversion pipeline" },
      { name: "Conversion rate", page: "/dashboard", description: "Rate over time or categories" },
    ],
  },

  {
    category: "Exploration & Tables",
    charts: [
      { name: "Table", page: "/dashboard", description: "Sortable, filterable table" },
      { name: "Pivot table", page: "/dashboard", description: "Rows × Columns aggregation" },
      { name: "Drill-down table", page: "/dashboard", description: "Expand into details" },
      { name: "Drill-through view", page: "/dashboard", description: "Open details in new view" },
      { name: "Filter panel", page: "/dashboard", description: "Interactive filter controls" },
    ],
  },

  {
    category: "Advanced Analysis (Отрыв от рынка)",
    charts: [
      { name: "Scatter plot", page: "/dashboard", description: "Relationship between two metrics" },
      { name: "Scatter + regression", page: "/dashboard", description: "Trendline and fit" },
      { name: "Correlation matrix", page: "/dashboard", description: "Pairwise correlations" },
      { name: "Waterfall (contribution)", page: "/dashboard", description: "Stepwise change breakdown" },
      { name: "Decomposition (drivers)", page: "/dashboard", description: "Drivers of change" },
      { name: "Anomaly detection (time-based)", page: "/dashboard", description: "Outlier detection over time" },
      { name: "Cohort analysis", page: "/dashboard", description: "Cohorts over time" },
      { name: "Retention curve", page: "/dashboard", description: "Retention over time" },
    ],
  },

  {
    category: "Dashboard Templates (обязательно как сущность)",
    charts: [
      { name: "Executive overview", page: "/dashboard", description: "C-level KPI snapshot" },
      { name: "Sales performance", page: "/dashboard", description: "Revenue and pipeline" },
      { name: "Product analytics", page: "/dashboard", description: "Usage and engagement" },
      { name: "Marketing funnel", page: "/dashboard", description: "Acquisition to conversion" },
      { name: "Operations monitoring", page: "/dashboard", description: "Ops health dashboard" },
      { name: "Financial overview", page: "/dashboard", description: "P&L and cash metrics" },
    ],
  },

  {
    category: "DataLens Charts",
    charts: [
      { name: "Line", page: "line", description: "Line chart from DataLens" },
      { name: "Bar", page: "bar", description: "Bar chart from DataLens" },
      { name: "Pie", page: "pie", description: "Pie chart from DataLens" },
      { name: "Scatter", page: "scatter", description: "Scatter plot from DataLens" },
      { name: "Bubble", page: "bubble", description: "Bubble chart from DataLens" },
      { name: "Heatmap", page: "heatmap", description: "Heatmap from DataLens" },
      { name: "Treemap", page: "treemap", description: "Treemap from DataLens" },
      { name: "Sankey", page: "sankey", description: "Sankey diagram from DataLens" },
      { name: "Choropleth", page: "choropleth", description: "Choropleth map from DataLens" },
      { name: "Voronoi", page: "voronoi", description: "Voronoi diagram from DataLens" },
    ],
  },
];
