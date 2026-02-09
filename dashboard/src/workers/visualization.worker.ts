// Visualization Worker: heavy data processing & offscreen rendering
// Keeps main thread responsive for UI interactions

import type { VisualizationTask, VisualizationResult } from "../types/visualization";

// Performance-optimized data aggregation
function aggregateActivityData(rawData: any[], bucketSize: number = 1000) {
  const buckets = new Map<string, { events: number; users: Set<string> }>();
  
  for (const row of rawData) {
    const bucket = Math.floor(Date.parse(row.timestamp) / bucketSize) * bucketSize;
    const key = new Date(bucket).toISOString();
    
    if (!buckets.has(key)) {
      buckets.set(key, { events: 0, users: new Set() });
    }
    
    const bucketData = buckets.get(key)!;
    bucketData.events += Number(row.events || 1);
    if (row.user_id) bucketData.users.add(row.user_id);
  }
  
  return Array.from(buckets.entries()).map(([bucket, data]) => ({
    bucket,
    events: data.events,
    users: data.users.size,
  }));
}

// Incremental data sampling for large datasets
function sampleData(data: any[], maxPoints: number = 1000) {
  if (data.length <= maxPoints) return data;
  
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}

// Heatmap data preparation for Deck.gl
function prepareHeatmapData(events: any[]) {
  return events.map(event => ({
    coordinates: [event.lng || 0, event.lat || 0],
    weight: event.value || 1,
    timestamp: Date.parse(event.timestamp),
  }));
}

// Arc layer data for user flows
function prepareArcData(flows: any[]) {
  return flows.map(flow => ({
    source: [flow.from_lng, flow.from_lat],
    target: [flow.to_lng, flow.to_lat],
    value: flow.count || 1,
  }));
}

// Main worker message handler
self.onmessage = async (event: MessageEvent<VisualizationTask>) => {
  const { type, payload, taskId } = event.data;
  
  try {
    let result: VisualizationResult;
    
    switch (type) {
      case 'AGGREGATE_ACTIVITY':
        result = {
          type: 'AGGREGATED_ACTIVITY',
          data: aggregateActivityData(payload.data, payload.bucketSize),
          taskId,
        };
        break;
        
      case 'SAMPLE_DATA':
        result = {
          type: 'SAMPLED_DATA',
          data: sampleData(payload.data, payload.maxPoints),
          taskId,
        };
        break;
        
      case 'PREPARE_HEATMAP':
        result = {
          type: 'HEATMAP_DATA',
          data: prepareHeatmapData(payload.events),
          taskId,
        };
        break;
        
      case 'PREPARE_ARCS':
        result = {
          type: 'ARC_DATA',
          data: prepareArcData(payload.flows),
          taskId,
        };
        break;
        
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
    
    self.postMessage(result);
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
      taskId,
    });
  }
};

// Export for TypeScript
export {};
