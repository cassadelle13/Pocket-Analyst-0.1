import { NextRequest, NextResponse } from "next/server";


const CLICKHOUSE_HOSTS = [
  process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  "http://clickhouse:8123",
  "http://localhost:8123",
];

async function queryClickHouse(query: string): Promise<any[]> {
  for (const host of CLICKHOUSE_HOSTS) {
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query + " FORMAT JSON",
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      return json.data || [];
    } catch {
      continue;
    }
  }
  console.error("ClickHouse unavailable on all hosts");
  return [];
}

interface AnomalyMetric {
  metric_name: string;
  current_value: number;
  baseline_median: number;
  baseline_stddev: number;
  z_score: number;
  is_anomaly: boolean;
  severity: "critical" | "warning" | "normal";
}

interface JunkAlert {
  hour: string;
  total_events: number;
  junk_events: number;
  junk_percentage: number;
  alert_message: string;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const threshold = parseFloat(sp.get("threshold") || "2.0"); // sigma threshold

  // Anomaly detection query: compare last hour vs 7-day baseline
  const query = `
    WITH 
      current_metrics AS (
        SELECT
          'events_per_hour' as metric_name,
          count() as value
        FROM events
        WHERE timestamp >= now() - INTERVAL 1 HOUR
        
        UNION ALL
        
        SELECT
          'unique_users_per_hour' as metric_name,
          uniq(user_id) as value
        FROM events
        WHERE timestamp >= now() - INTERVAL 1 HOUR
        
        UNION ALL
        
        SELECT
          'avg_events_per_user' as metric_name,
          count() / nullIf(uniq(user_id), 0) as value
        FROM events
        WHERE timestamp >= now() - INTERVAL 1 HOUR
      ),
      
      baseline_metrics AS (
        SELECT
          metric_name,
          median(value) as baseline_median,
          stddevPop(value) as baseline_stddev
        FROM (
          SELECT
            'events_per_hour' as metric_name,
            count() as value
          FROM events
          WHERE timestamp >= now() - INTERVAL 7 DAY
            AND timestamp < now() - INTERVAL 1 HOUR
          GROUP BY toStartOfHour(timestamp)
          
          UNION ALL
          
          SELECT
            'unique_users_per_hour' as metric_name,
            uniq(user_id) as value
          FROM events
          WHERE timestamp >= now() - INTERVAL 7 DAY
            AND timestamp < now() - INTERVAL 1 HOUR
          GROUP BY toStartOfHour(timestamp)
          
          UNION ALL
          
          SELECT
            'avg_events_per_user' as metric_name,
            count() / nullIf(uniq(user_id), 0) as value
          FROM events
          WHERE timestamp >= now() - INTERVAL 7 DAY
            AND timestamp < now() - INTERVAL 1 HOUR
          GROUP BY toStartOfHour(timestamp)
        )
        GROUP BY metric_name
      )
    
    SELECT
      c.metric_name,
      c.value as current_value,
      b.baseline_median,
      b.baseline_stddev,
      if(b.baseline_stddev > 0, 
         abs(c.value - b.baseline_median) / b.baseline_stddev, 
         0) as z_score
    FROM current_metrics c
    LEFT JOIN baseline_metrics b ON c.metric_name = b.metric_name
    ORDER BY z_score DESC
  `;

  const rows = await queryClickHouse(query);

  // Data Quality Shield: Check for junk events
  const junkQuery = `
    SELECT
      formatDateTime(hour, '%Y-%m-%d %H:%M:%S') as hour,
      total_events,
      junk_events,
      junk_percentage,
      'Внимание! Обнаружен аномальный поток некорректных данных. Проверьте интеграцию на фронтенде.' as alert_message
    FROM junk_stats
    WHERE junk_percentage > 5
      AND hour >= now() - INTERVAL 1 HOUR
    ORDER BY hour DESC
    LIMIT 1
  `;

  const junkRows = await queryClickHouse(junkQuery);
  const junkAlert: JunkAlert | null = junkRows.length > 0 ? {
    hour: String(junkRows[0].hour),
    total_events: Number(junkRows[0].total_events || 0),
    junk_events: Number(junkRows[0].junk_events || 0),
    junk_percentage: Number(junkRows[0].junk_percentage || 0),
    alert_message: String(junkRows[0].alert_message),
  } : null;

  const anomalies: AnomalyMetric[] = rows.map((row) => {
    const zScore = Number(row.z_score || 0);
    const isAnomaly = zScore > threshold;
    
    let severity: "critical" | "warning" | "normal" = "normal";
    if (zScore > 3.0) severity = "critical";
    else if (zScore > threshold) severity = "warning";

    return {
      metric_name: String(row.metric_name),
      current_value: Number(row.current_value || 0),
      baseline_median: Number(row.baseline_median || 0),
      baseline_stddev: Number(row.baseline_stddev || 0),
      z_score: zScore,
      is_anomaly: isAnomaly,
      severity,
    };
  });

  // Filter only anomalies for AI analysis
  const criticalAnomalies = anomalies.filter((a) => a.is_anomaly);

  // Intelligence Upgrade: AI analysis with Confidence Score + Estimated Impact
  let aiInsight = null;
  let confidenceScore = 0;
  let estimatedImpact = { revenue_loss: 0, users_affected: 0, description: "" };

  // Check if we should include junk alert in AI analysis
  const hasJunkAlert = junkAlert !== null;

  if (criticalAnomalies.length > 0 || hasJunkAlert) {
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_API_URL;
      if (aiServiceUrl) {
        const anomalyList = criticalAnomalies.map((a) => 
          `- ${a.metric_name}: текущее значение ${a.current_value.toFixed(2)}, медиана за 7 дней ${a.baseline_median.toFixed(2)}, отклонение ${a.z_score.toFixed(2)}σ (${a.severity})`
        ).join('\n');

        const junkAlertText = hasJunkAlert 
          ? `\n\nDATA QUALITY ALERT:\n- Обнаружен аномальный поток некорректных данных\n- Процент мусорных событий: ${junkAlert!.junk_percentage.toFixed(2)}%\n- Всего событий за час: ${junkAlert!.total_events}\n- Мусорных событий: ${junkAlert!.junk_events}\n- Рекомендация: Проверьте интеграцию на фронтенде`
          : '';

        const prompt = `Проанализируй следующие аномалии в метриках системы и предоставь структурированный ответ:

АНОМАЛИИ:
${anomalyList}${junkAlertText}

ТРЕБУЕМЫЙ ФОРМАТ ОТВЕТА:
1. **Confidence Score** (0-100%): Насколько уверенно ты можешь определить причину аномалии
2. **Estimated Impact**: 
   - Revenue Loss ($/час): Сколько денег мы теряем из-за этой аномалии
   - Users Affected: Сколько пользователей затронуто
   - Description: Краткое описание влияния
3. **Root Cause Hypothesis**: Наиболее вероятная причина
4. **Recommended Actions**: Конкретные шаги для устранения

Ответь в формате JSON:
{
  "confidence_score": <число 0-100>,
  "estimated_impact": {
    "revenue_loss": <число>,
    "users_affected": <число>,
    "description": "<текст>"
  },
  "root_cause": "<текст>",
  "actions": ["<действие 1>", "<действие 2>"]
}`;

        const aiRes = await fetch(`${aiServiceUrl}/api/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: prompt }),
          cache: "no-store",
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawInsight = aiData.insight || aiData.response || "";
          
          // Try to parse structured response
          try {
            const jsonMatch = rawInsight.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              confidenceScore = parsed.confidence_score || 0;
              estimatedImpact = parsed.estimated_impact || estimatedImpact;
              aiInsight = {
                confidence_score: confidenceScore,
                estimated_impact: estimatedImpact,
                root_cause: parsed.root_cause || "",
                actions: parsed.actions || [],
                raw: rawInsight,
              };
            } else {
              // Fallback: use raw text with default scores
              aiInsight = {
                confidence_score: 50,
                estimated_impact: { revenue_loss: 0, users_affected: 0, description: "Unable to estimate" },
                root_cause: rawInsight,
                actions: [],
                raw: rawInsight,
              };
            }
          } catch {
            // Parsing failed, use raw response
            aiInsight = {
              confidence_score: 50,
              estimated_impact: { revenue_loss: 0, users_affected: 0, description: "Unable to estimate" },
              root_cause: rawInsight,
              actions: [],
              raw: rawInsight,
            };
          }
        }
      }
    } catch (err) {
      console.error("AI analysis failed:", err);
    }
  }

  return NextResponse.json({
    anomalies,
    critical_count: criticalAnomalies.length,
    has_critical: criticalAnomalies.some((a) => a.severity === "critical"),
    junk_alert: junkAlert,
    has_junk_alert: hasJunkAlert,
    aiInsight,
    confidence_score: confidenceScore,
    estimated_impact: estimatedImpact,
    timestamp: new Date().toISOString(),
  });
}
