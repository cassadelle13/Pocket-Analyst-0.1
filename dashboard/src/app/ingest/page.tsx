"use client";

import { useList } from "@refinedev/core";
import { Card, Text, Title, Flex, Badge, Grid, Button } from "@tremor/react";
import { RequireRole } from "../../components/auth";

interface VectorHealth {
  status: string;
  lastProcessed?: string;
  totalProcessed?: number;
  errors?: number;
}

interface MetricsResponse {
  totalUsers: number;
  activeUsers: number;
  eventsToday: number;
  retention: Array<{ day: string; retention: number }>;
}

export default function IngestPage() {
  const vectorList = useList<VectorHealth>({
    resource: "vector-health",
    pagination: { mode: "off" },
  });

  const vectorHealth = vectorList.data?.data?.[0];

  const curlExample = `curl -X POST http://localhost:9009 -H "Content-Type: application/json" -d '{
  "event_name": "page_view",
  "user_id": "user_0001",
  "properties": {
    "url": "/pricing",
    "source": "demo"
  }
}'`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlExample);
  };

  return (
    <RequireRole allow={["data-admin"]} fallbackHref="/dashboard">
      <div className="p-6 min-h-screen space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Ingest</h1>
          <p className="mt-1 text-slate-500">Vector HTTP ingest + current pipeline status.</p>
        </div>

        {/* Pipeline Status */}
        <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
          <Card className="bg-slate-900/40 border border-slate-800">
            <Flex justifyContent="between" alignItems="center">
              <Title className="text-white">Vector</Title>
              <Badge color={vectorHealth?.status === "online" ? "lime" : "red"}>
                {vectorHealth?.status || "…"}
              </Badge>
            </Flex>
            <Text className="mt-2 text-slate-400">HTTP Source</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">{vectorHealth?.totalProcessed?.toLocaleString() || "…"}</Title>
            <Text className="mt-2 text-slate-400">Events Processed</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">{vectorHealth?.errors || "…"}</Title>
            <Text className="mt-2 text-slate-400">Errors</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white text-sm">
              {vectorHealth?.lastProcessed 
                ? new Date(vectorHealth.lastProcessed).toLocaleTimeString()
                : "…"
              }
            </Title>
            <Text className="mt-2 text-slate-400">Last Processed</Text>
          </Card>
        </Grid>

        {/* Test Event */}
        <Card className="bg-slate-900/40 border border-slate-800">
          <Flex justifyContent="between" alignItems="start">
            <div className="flex-1">
              <Title className="text-white">Send a test event</Title>
              <Text className="mt-1 text-slate-400">
                Vector HTTP source listens on port 9009. Events flow: HTTP → Vector → ClickHouse.
              </Text>
            </div>
            <Button size="xs" onClick={copyToClipboard} className="ml-4">
              Copy
            </Button>
          </Flex>
          <pre className="mt-4 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-4 text-xs text-slate-200">
            {curlExample}
          </pre>
        </Card>

        {/* Instructions */}
        <Card className="bg-slate-900/40 border border-slate-800">
          <Title className="text-white">Quick Test</Title>
          <div className="mt-4 space-y-3 text-slate-300">
            <div>
              <Text className="text-slate-400">1. Run the curl command above in your terminal</Text>
            </div>
            <div>
              <Text className="text-slate-400">2. Check the event appears in ClickHouse:</Text>
              <pre className="mt-2 overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-xs text-slate-200">
{`docker compose exec clickhouse clickhouse-client \\
  --query="SELECT event_name, user_id, timestamp FROM analytics.events ORDER BY timestamp DESC LIMIT 5"`}
              </pre>
            </div>
            <div>
              <Text className="text-slate-400">3. View real-time updates in the Dashboard or Metrics tabs</Text>
            </div>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
