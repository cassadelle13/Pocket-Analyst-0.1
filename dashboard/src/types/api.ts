// Shared API types used across frontend and backend routes

export interface TrafficSlice {
  id: string;
  name: string;
  value: number;
}

export interface EventRow {
  id: string;
  event_name: string;
  user_id: string;
  timestamp: string;
  properties: string; // JSON string
  source?: string;
  page_url?: string;
  page_path?: string;
  session_id?: string;
}

export interface ActivityData {
  bucket: string;
  events: number;
  users: number;
}

export interface TopEventRow {
  id: string;
  name: string;
  value: number;
}

export interface MetricsResponse {
  totalEvents: number;
  totalUsers: number;
  totalRevenue: number;
  avgSessionDuration: number;
  activeUsers?: number;
  eventsToday?: number;
  bounceRate?: number;
  conversionRate?: number;
  retention?: Array<{ day: string; retention: number }>;
}

export interface FunnelRow {
  id: string;
  signup: number;
  upgrade_click: number;
  purchase: number;
  purchase_per_signup: number | null;
  purchase_per_upgrade_click: number | null;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    name: string;
    category?: string;
    value?: number;
    x?: number;
    y?: number;
    ltv?: number;
    lastActive?: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    value?: number;
  }>;
}

export interface InsightHistoryItem {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: 'insight' | 'analysis' | 'recommendation';
  status: 'new' | 'read' | 'archived';
  trend?: number;
  aiNote?: string;
}

export interface InsightApiResponse {
  question: string;
  metric: string;
  sql: string;
  insight?: string;
  error?: string;
}

export interface HealthInfo {
  version: string;
  uptime: number;
  tables: number;
  latestEvent?: string;
}

export interface TableInfo {
  name: string;
  rows: number;
  size: string;
}

export interface VectorHealth {
  status: 'ok' | 'error';
  lastSync?: string;
  error?: string;
}

export interface RetentionCell {
  cohort: string;
  day: number;
  retentionRate: number;
  users: number;
}

export interface FunnelResponse {
  steps: Array<{
    key?: "view" | "cart" | "checkout" | "pay" | string;
    name: string;
    value: number;
    conversionFromPrev: number;
    aiNote?: string;
  }>;
  period: string;
}
