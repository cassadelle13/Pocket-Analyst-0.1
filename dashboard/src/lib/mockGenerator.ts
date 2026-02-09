/**
 * Mock Data Engine - Generate realistic demo data for all endpoints
 * 
 * Provides high-quality synthetic data for Demo Mode
 */

export interface MockTrendPoint {
  ts: number;
  events: number;
  users: number;
  sessions: number;
  revenue: number;
  conversion: number;
  revenue_forecast?: number;
  users_forecast?: number;
}

export interface MockUserFlow {
  source: string;
  target: string;
  value: number;
}

export interface MockRetentionCohort {
  cohort_date: string;
  cohort_size: number;
  d1: number;
  d3: number;
  d7: number;
  d14: number;
  d30: number;
}

export interface MockAnomaly {
  metric_name: string;
  current_value: number;
  baseline_median: number;
  baseline_stddev: number;
  z_score: number;
  is_anomaly: boolean;
  severity: "critical" | "warning" | "normal";
}

/**
 * Generate analytics trend data with sinusoidal patterns - OPTIMIZED VERSION
 */
export function generateMockTrend(days: number = 14): {
  historical: MockTrendPoint[];
  forecast: MockTrendPoint[];
  meta: { total_points: number; forecast_points: number };
} {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const historical: MockTrendPoint[] = [];
  const forecast: MockTrendPoint[] = [];

  // Generate historical data (limited to 14 days)
  for (let i = days; i >= 0; i--) {
    const ts = now - i * dayMs;
    const dayIndex = days - i;
    
    // Simplified calculations for performance
    const baseRevenue = 50000 + dayIndex * 500;
    const baseUsers = 5000 + dayIndex * 50;
    const weekPhase = (dayIndex / 7) * 2 * Math.PI;
    
    const revenue = baseRevenue + Math.sin(weekPhase) * 10000;
    const users = baseUsers + Math.sin(weekPhase) * 1000;
    const sessions = users * 1.2;
    const events = sessions * 8;
    const conversion = (0.02 + Math.sin(weekPhase) * 0.005) * 100;

    historical.push({
      ts,
      events: Math.round(events),
      users: Math.round(users),
      sessions: Math.round(sessions),
      revenue: Math.round(revenue * 100) / 100,
      conversion: Math.round(conversion * 100) / 100,
    });
  }

  // Generate forecast (3 days ahead for performance)
  for (let i = 1; i <= 3; i++) {
    const ts = now + i * dayMs;
    const dayIndex = days + i;
    
    const baseRevenue = 50000 + dayIndex * 500;
    const baseUsers = 5000 + dayIndex * 50;
    const weekPhase = (dayIndex / 7) * 2 * Math.PI;
    
    const revenue = baseRevenue + Math.sin(weekPhase) * 10000;
    const users = baseUsers + Math.sin(weekPhase) * 1000;

    forecast.push({
      ts,
      events: 0,
      users: 0,
      sessions: 0,
      revenue: 0,
      conversion: 0,
      revenue_forecast: Math.round(revenue * 100) / 100,
      users_forecast: Math.round(users),
    });
  }

  return {
    historical,
    forecast,
    meta: {
      total_points: historical.length,
      forecast_points: forecast.length,
    },
  };
}

/**
 * Generate user flow data (Sankey diagram)
 */
export function generateMockUserFlows(): {
  nodes: Array<{ id: string; name: string }>;
  links: MockUserFlow[];
} {
  const pages = [
    "Landing Page",
    "Product List",
    "Product Detail",
    "Cart",
    "Checkout",
    "Payment",
    "Confirmation",
    "Exit",
  ];

  const nodes = pages.map((name, idx) => ({ id: String(idx), name }));

  // Define realistic flow patterns
  const flowPatterns = [
    { from: 0, to: 1, base: 10000 },  // Landing -> Product List
    { from: 0, to: 7, base: 3000 },   // Landing -> Exit
    { from: 1, to: 2, base: 6000 },   // Product List -> Product Detail
    { from: 1, to: 7, base: 2000 },   // Product List -> Exit
    { from: 2, to: 3, base: 3000 },   // Product Detail -> Cart
    { from: 2, to: 1, base: 1500 },   // Product Detail -> Product List (back)
    { from: 2, to: 7, base: 1000 },   // Product Detail -> Exit
    { from: 3, to: 4, base: 2000 },   // Cart -> Checkout
    { from: 3, to: 1, base: 500 },    // Cart -> Product List (continue shopping)
    { from: 3, to: 7, base: 400 },    // Cart -> Exit
    { from: 4, to: 5, base: 1500 },   // Checkout -> Payment
    { from: 4, to: 7, base: 300 },    // Checkout -> Exit
    { from: 5, to: 6, base: 1200 },   // Payment -> Confirmation
    { from: 5, to: 7, base: 200 },    // Payment -> Exit
    { from: 6, to: 7, base: 1200 },   // Confirmation -> Exit
  ];

  const links = flowPatterns.map(({ from, to, base }) => ({
    source: pages[from],
    target: pages[to],
    value: base + Math.round(Math.random() * base * 0.2),
  }));

  return { nodes, links };
}

/**
 * Generate retention cohort data with decay pattern - OPTIMIZED VERSION
 */
export function generateMockRetention(cohorts: number = 7): MockRetentionCohort[] {
  const result: MockRetentionCohort[] = [];
  const now = new Date();

  for (let i = 0; i < cohorts; i++) {
    const cohortDate = new Date(now);
    cohortDate.setDate(cohortDate.getDate() - i * 7);
    
    const cohortSize = 1000 + Math.round(Math.random() * 500);
    
    // Simplified decay pattern
    const d1 = Math.round(cohortSize * 0.9);
    const d3 = Math.round(d1 * 0.85);
    const d7 = Math.round(d3 * 0.8);
    const d14 = Math.round(d7 * 0.75);
    const d30 = Math.round(d14 * 0.7);

    result.push({
      cohort_date: cohortDate.toISOString().split('T')[0],
      cohort_size: cohortSize,
      d1,
      d3,
      d7,
      d14,
      d30,
    });
  }

  return result;
}

/**
 * Generate anomaly detection data with critical alerts
 */
export function generateMockAnomalies(): {
  anomalies: MockAnomaly[];
  critical_count: number;
  has_critical: boolean;
  junk_alert: null;
  has_junk_alert: false;
  aiInsight: {
    confidence_score: number;
    estimated_impact: {
      revenue_loss: number;
      users_affected: number;
      description: string;
    };
    root_cause: string;
    actions: string[];
  };
  confidence_score: number;
  estimated_impact: any;
  timestamp: string;
} {
  const anomalies: MockAnomaly[] = [
    {
      metric_name: "events_per_hour",
      current_value: 15234,
      baseline_median: 12000,
      baseline_stddev: 800,
      z_score: 4.04,
      is_anomaly: true,
      severity: "critical",
    },
    {
      metric_name: "users_per_hour",
      current_value: 1823,
      baseline_median: 1500,
      baseline_stddev: 120,
      z_score: 2.69,
      is_anomaly: true,
      severity: "warning",
    },
    {
      metric_name: "revenue_per_hour",
      current_value: 8234.56,
      baseline_median: 7800.00,
      baseline_stddev: 450.00,
      z_score: 0.97,
      is_anomaly: false,
      severity: "normal",
    },
    {
      metric_name: "conversion_rate",
      current_value: 0.0187,
      baseline_median: 0.0215,
      baseline_stddev: 0.0015,
      z_score: -1.87,
      is_anomaly: false,
      severity: "normal",
    },
  ];

  const aiInsight = {
    confidence_score: 87,
    estimated_impact: {
      revenue_loss: 1250,
      users_affected: 323,
      description: "Spike in events may indicate bot traffic or viral content",
    },
    root_cause: "Unusual traffic spike detected. Possible causes: (1) Viral social media post driving organic traffic, (2) Marketing campaign launched, (3) Bot activity or scraping",
    actions: [
      "Verify traffic sources in Google Analytics",
      "Check for unusual referrer patterns",
      "Monitor conversion rate - if it drops, likely bot traffic",
      "Review recent marketing campaigns",
      "Enable rate limiting if bot activity confirmed",
    ],
  };

  return {
    anomalies,
    critical_count: anomalies.filter(a => a.severity === "critical").length,
    has_critical: true,
    junk_alert: null,
    has_junk_alert: false,
    aiInsight,
    confidence_score: aiInsight.confidence_score,
    estimated_impact: aiInsight.estimated_impact,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate device breakdown data
 */
export function generateMockDevices(): Array<{ device: string; count: number; percentage: number }> {
  const total = 50000;
  const devices = [
    { device: "Desktop", count: 22000 },
    { device: "Mobile", count: 20000 },
    { device: "Tablet", count: 8000 },
  ];

  return devices.map(d => ({
    ...d,
    percentage: Math.round((d.count / total) * 10000) / 100,
  }));
}

/**
 * Generate traffic sources data
 */
export function generateMockTrafficSources(): Array<{ source: string; count: number; percentage: number }> {
  const total = 50000;
  const sources = [
    { source: "Organic Search", count: 18000 },
    { source: "Direct", count: 12000 },
    { source: "Social Media", count: 10000 },
    { source: "Referral", count: 6000 },
    { source: "Email", count: 4000 },
  ];

  return sources.map(s => ({
    ...s,
    percentage: Math.round((s.count / total) * 10000) / 100,
  }));
}

/**
 * Generate funnel data - OPTIMIZED VERSION
 */
export function generateMockFunnel(): Array<{
  name: string;
  value: number;
  conversionFromPrev: number | null;
}> {
  return [
    {
      name: "Landing",
      value: 10000,
      conversionFromPrev: null,
    },
    {
      name: "Product View",
      value: 6500,
      conversionFromPrev: 65.0,
    },
    {
      name: "Add to Cart",
      value: 3200,
      conversionFromPrev: 49.2,
    },
    {
      name: "Checkout",
      value: 2100,
      conversionFromPrev: 65.6,
    },
    {
      name: "Purchase",
      value: 1500,
      conversionFromPrev: 71.4,
    },
  ];
}

/**
 * Generate Dashboard metrics (enterprise-scale)
 */
export function generateMockMetrics(): {
  totalUsers: number;
  activeUsers: number;
  eventsToday: number;
  totalEvents: number;
  totalRevenue: number;
  avgSessionDuration: number;
  revenue: number;
} {
  return {
    totalUsers: 847234,
    activeUsers: 124567,
    eventsToday: 2847391,
    totalEvents: 15847391,
    totalRevenue: 1247893.45,
    avgSessionDuration: 342,
    revenue: 1247893.45,
  };
}

/**
 * Generate top events data
 */
export function generateMockTopEvents(): Array<{
  id: string;
  name: string;
  value: number;
  event_name: string;
  count: number;
  percentage: number;
}> {
  const events = [
    { event_name: "page_view", count: 1247893 },
    { event_name: "product_click", count: 487234 },
    { event_name: "add_to_cart", count: 234567 },
    { event_name: "checkout_started", count: 156789 },
    { event_name: "purchase_completed", count: 98234 },
    { event_name: "search_performed", count: 87654 },
    { event_name: "video_played", count: 67890 },
    { event_name: "signup_completed", count: 45678 },
    { event_name: "share_clicked", count: 34567 },
    { event_name: "filter_applied", count: 23456 },
  ];

  const total = events.reduce((sum, e) => sum + e.count, 0);
  
  return events.map((e, idx) => ({
    id: `event_${idx}`,
    name: e.event_name,
    value: e.count,
    event_name: e.event_name,
    count: e.count,
    percentage: Math.round((e.count / total) * 10000) / 100,
  }));
}

/**
 * Generate traffic breakdown data
 */
export function generateMockTrafficBreakdown(): Array<{
  id: string;
  name: string;
  value: number;
  source: string;
  count: number;
  percentage: number;
}> {
  const sources = [
    { source: "Organic Search", count: 487234 },
    { source: "Direct", count: 356789 },
    { source: "Social Media", count: 298765 },
    { source: "Paid Ads", count: 234567 },
    { source: "Referral", count: 187654 },
    { source: "Email Campaign", count: 123456 },
    { source: "Mobile App", count: 98765 },
  ];

  const total = sources.reduce((sum, s) => sum + s.count, 0);
  
  return sources.map((s, idx) => ({
    id: `source_${idx}`,
    name: s.source,
    value: s.count,
    source: s.source,
    count: s.count,
    percentage: Math.round((s.count / total) * 10000) / 100,
  }));
}

/**
 * Generate activity timeline data
 */
export function generateMockActivity(): Array<{
  bucket: string;
  events: number;
  users: number;
}> {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const data: Array<{ bucket: string; events: number; users: number }> = [];

  for (let i = 23; i >= 0; i--) {
    const timestamp = new Date(now - i * hourMs);
    const hour = timestamp.getHours();
    
    // Simulate daily pattern: low at night, high during business hours
    const baseEvents = 80000;
    const hourFactor = hour >= 9 && hour <= 17 ? 1.5 : hour >= 6 && hour <= 22 ? 1.0 : 0.4;
    const events = Math.round(baseEvents * hourFactor * (0.9 + Math.random() * 0.2));
    const users = Math.round(events / 23);

    data.push({
      bucket: timestamp.toISOString(),
      events,
      users,
    });
  }

  return data;
}

/**
 * Generate live events table data
 */
export function generateMockEvents(count: number = 100): Array<{
  id: string;
  event_name: string;
  user_id: string;
  session_id: string;
  timestamp: string;
  properties: Record<string, any>;
}> {
  const eventNames = [
    "page_view", "product_click", "add_to_cart", "checkout_started",
    "purchase_completed", "search_performed", "video_played", "signup_completed",
    "filter_applied", "share_clicked", "review_submitted", "wishlist_added"
  ];

  const sources = ["organic", "paid", "social", "direct", "email", "referral"];
  const devices = ["desktop", "mobile", "tablet"];
  const pages = ["/home", "/products", "/cart", "/checkout", "/account", "/search"];

  const events: Array<any> = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - i * 1000 * Math.random() * 300); // Last 5 minutes
    const eventName = eventNames[Math.floor(Math.random() * eventNames.length)];
    
    events.push({
      id: `evt_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
      event_name: eventName,
      user_id: `user_${Math.floor(Math.random() * 100000)}`,
      session_id: `sess_${Math.floor(Math.random() * 50000)}`,
      timestamp: timestamp.toISOString(),
      properties: {
        source: sources[Math.floor(Math.random() * sources.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        page: pages[Math.floor(Math.random() * pages.length)],
        revenue: eventName === "purchase_completed" ? Math.round(Math.random() * 500 * 100) / 100 : undefined,
        product_id: eventName.includes("product") ? `prod_${Math.floor(Math.random() * 1000)}` : undefined,
      },
    });
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Generate insights feed data
 */
export function generateMockInsights(): Array<{
  id: string;
  question: string;
  answer: string;
  confidence: number;
  timestamp: string;
  sparkline: Array<{ ts: number; value: number }>;
}> {
  const insights = [
    {
      question: "What are the top user engagement patterns this week?",
      answer: "Mobile users show 34% higher engagement during evening hours (6-10 PM). Product page dwell time increased by 18% after recent UX updates. Video content drives 2.3× more add-to-cart actions compared to static images.",
      confidence: 0.89,
    },
    {
      question: "Which traffic sources convert best?",
      answer: "Email campaigns lead with 4.2% conversion rate, followed by organic search at 3.1%. Paid social underperforms at 1.8% but shows strong brand awareness metrics. Referral traffic has highest AOV at $187.",
      confidence: 0.92,
    },
    {
      question: "How does user activity vary by time of day?",
      answer: "Peak activity occurs 2-4 PM EST (23% of daily volume). Morning sessions (8-10 AM) have highest conversion rates at 3.8%. Late-night traffic (11 PM-2 AM) shows exploratory behavior with low conversion but high wishlist additions.",
      confidence: 0.85,
    },
    {
      question: "What product categories are trending?",
      answer: "Electronics category surged 45% week-over-week, driven by new smartphone launches. Home & Garden maintains steady growth at 12% MoM. Fashion shows seasonal decline but accessories subcategory up 28%.",
      confidence: 0.91,
    },
    {
      question: "Are there any checkout friction points?",
      answer: "Payment page abandonment at 23% - 15% higher than industry average. Users spending avg 47 seconds on shipping form (optimal: <30s). Guest checkout converts 2.1× better than account creation flow.",
      confidence: 0.87,
    },
  ];

  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  return insights.map((insight, idx) => {
    const sparkline: Array<{ ts: number; value: number }> = [];
    for (let i = 20; i >= 0; i--) {
      sparkline.push({
        ts: now - i * hourMs,
        value: 50 + Math.sin(i / 3) * 20 + Math.random() * 10,
      });
    }

    return {
      id: `insight_${idx}`,
      question: insight.question,
      answer: insight.answer,
      confidence: insight.confidence,
      timestamp: new Date(now - idx * 2 * hourMs).toISOString(),
      sparkline,
    };
  });
}

/**
 * Generate complex user flows (enterprise Sankey) - OPTIMIZED VERSION
 * With strict limits to prevent performance issues
 */
export function generateMockComplexUserFlows(options?: {
  maxNodes?: number;
  maxLinks?: number;
  throttle?: boolean;
}): {
  nodes: Array<{ id: string; name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
  deadEnds: Array<{ node: string; count: number }>;
  aiInsight: string;
  totalFlows: number;
} {
  const { maxNodes = 6, maxLinks = 10, throttle = true } = options || {};
  
  const pages = [
    "Homepage",
    "Search Results", 
    "Product Detail",
    "Add to Cart",
    "Checkout",
    "Payment",
    "Confirmation",
    "Exit",
  ];

  const limitedPages = pages.slice(0, maxNodes);
  const nodes = limitedPages.map((name, idx) => ({ id: String(idx), name }));

  // Simplified flow patterns (limited to 10)
  const flowPatterns = [
    { from: 0, to: 1, base: 48723 },   // Homepage -> Search
    { from: 0, to: 2, base: 35678 },   // Homepage -> Product Detail
    { from: 0, to: 7, base: 12345 },   // Homepage -> Exit
    { from: 1, to: 2, base: 29876 },   // Search -> Product Detail
    { from: 2, to: 3, base: 42356 },   // Product Detail -> Add to Cart
    { from: 3, to: 4, base: 18765 },   // Add to Cart -> Checkout
    { from: 4, to: 5, base: 15678 },   // Checkout -> Payment
    { from: 5, to: 6, base: 13456 },   // Payment -> Confirmation
    { from: 4, to: 7, base: 4321 },    // Checkout -> Exit
    { from: 6, to: 7, base: 13456 },   // Confirmation -> Exit
  ];

  let limitedLinks = flowPatterns
    .slice(0, maxLinks)
    .filter(({ from, to }) => from < limitedPages.length && to < limitedPages.length)
    .map(({ from, to, base }) => ({
      source: limitedPages[from],
      target: limitedPages[to],
      value: throttle ? Math.min(base, 50000) : base,
    }));

  const deadEnds = [
    { node: "Exit", count: 12345 + 4321 + 13456 },
  ];

  const totalFlows = limitedLinks.reduce((sum, link) => sum + link.value, 0);

  return { 
    nodes, 
    links: limitedLinks, 
    deadEnds,
    aiInsight: "Main conversion path: Homepage → Product Detail → Add to Cart → Checkout → Payment. 23% exit rate at checkout.",
    totalFlows
  };
}
