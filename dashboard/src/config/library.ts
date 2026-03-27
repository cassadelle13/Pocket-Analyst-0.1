import type { VizType } from "@/types/viz";

export type ChartLibraryItem = {
  name: string;
  vizType: VizType;
  page: string;
  description: string;
  status: "available" | "coming_soon";
  defaultQuerySpec?: {
    axis?: string[];
    legend?: string[];
    values?: string[];
    tooltips?: string[];
  };
};

export type ChartLibraryCategory = {
  category: string;
  charts: ChartLibraryItem[];
};

// Centralized Library config for the Dashboard sidebar.
// Edit this file to add/remove categories and charts.
export const chartLibrary: ChartLibraryCategory[] = [
  {
    category: "Bar / Column charts",
    charts: [
      { name: "Clustered column chart", vizType: "bar", page: "/dashboard", description: "Vertical columns for category comparison", status: "available" },
      { name: "Stacked column chart", vizType: "bar", page: "/dashboard", description: "Stacked vertical columns", status: "available" },
      { name: "100% stacked column chart", vizType: "bar", page: "/dashboard", description: "Normalized stacked columns (100%)", status: "available" },
      { name: "Clustered bar chart", vizType: "bar", page: "/dashboard", description: "Horizontal bars for category comparison", status: "available" },
      { name: "Stacked bar chart", vizType: "bar", page: "/dashboard", description: "Stacked horizontal bars", status: "available" },
      { name: "100% stacked bar chart", vizType: "bar", page: "/dashboard", description: "Normalized stacked bars (100%)", status: "available" },
    ],
  },

  {
    category: "Line / Area charts",
    charts: [
      { name: "Line chart", vizType: "line", page: "/dashboard", description: "Time series / continuous axis", status: "available" },
      { name: "Area chart", vizType: "area", page: "/dashboard", description: "Line with fill", status: "available" },
      { name: "Stacked area chart", vizType: "area", page: "/dashboard", description: "Stacked area", status: "available" },
    ],
  },

  {
    category: "Combo charts",
    charts: [
      { name: "Line and clustered column chart", vizType: "line", page: "/dashboard", description: "Combo with dual axis", status: "available" },
      { name: "Line and stacked column chart", vizType: "line", page: "/dashboard", description: "Combo with dual axis (stacked columns)", status: "available" },
    ],
  },

  {
    category: "Part-to-whole",
    charts: [
      { name: "Pie chart", vizType: "pie", page: "/dashboard", description: "One measure with categories as slices", status: "available" },
      { name: "Donut chart", vizType: "donut", page: "/dashboard", description: "Pie with hollow center", status: "available" },
    ],
  },

  {
    category: "Scatter / Distribution",
    charts: [
      { name: "Scatter chart", vizType: "scatter", page: "/dashboard", description: "X/Y measures", status: "available" },
    ],
  },

  {
    category: "Tables",
    charts: [
      { name: "Table", vizType: "table", page: "/dashboard", description: "Flat table", status: "available" },
    ],
  },

  {
    category: "KPI / Cards",
    charts: [
      { name: "Card", vizType: "kpi", page: "/dashboard", description: "Single value", status: "available" },
      { name: "Multi-row card", vizType: "table", page: "/dashboard", description: "Multiple values", status: "available" },
      { name: "KPI", vizType: "kpi", page: "/dashboard", description: "Target + trend", status: "available" },
    ],
  },

  {
    category: "Funnel",
    charts: [
      { name: "Funnel", vizType: "funnel", page: "/dashboard", description: "Stages of a process", status: "available" },
    ],
  },

  {
    category: "Waterfall",
    charts: [
      { name: "Waterfall", vizType: "waterfall", page: "/dashboard", description: "Contribution breakdown", status: "available" },
    ],
  },

  {
    category: "Filters / Slicers",
    charts: [
      { name: "Slicer", vizType: "slicer", page: "/dashboard", description: "Core filtering visual", status: "available" },
    ],
  },

  {
    category: "Advanced analytics",
    charts: [
      {
        name: "Cohort analysis",
        vizType: "cohort",
        page: "/dashboard",
        description: "Cohort matrix over time from semantic query",
        status: "available",
        defaultQuerySpec: {
          axis: ["cohort"],
          legend: ["period"],
          values: ["retention_rate"],
        },
      },
    ],
  },
];
