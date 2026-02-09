"use client";

import { useList } from "@refinedev/core";
import { Card, Text, Title, Flex, Badge, Grid, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@tremor/react";
import { RequireRole } from "../../components/auth";

interface TableInfo {
  name: string;
  rows: number;
  size: string;
  engine: string;
}

interface HealthInfo {
  status: string;
  uptime: string;
  version: string;
  tables: number;
  lastEvent?: string;
}

export default function StoragePage() {
  const tablesList = useList<TableInfo>({
    resource: "tables",
    pagination: { mode: "off" },
  });

  const healthList = useList<HealthInfo>({
    resource: "health",
    pagination: { mode: "off" },
  });

  const tables = tablesList.data?.data ?? [];
  const health = healthList.data?.data?.[0];

  return (
    <RequireRole allow={["data-admin"]} fallbackHref="/dashboard">
      <div className="p-6 min-h-screen space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Storage</h1>
          <p className="mt-1 text-slate-500">ClickHouse status and table-level health.</p>
        </div>

        {/* Health Status Cards */}
        <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
          <Card className="bg-slate-900/40 border border-slate-800">
            <Flex justifyContent="between" alignItems="center">
              <Title className="text-white">Status</Title>
              <Badge color={health?.status === "online" ? "lime" : "red"}>
                {health?.status || "…"}
              </Badge>
            </Flex>
            <Text className="mt-2 text-slate-400">ClickHouse Server</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">{health?.tables || "…"}</Title>
            <Text className="mt-2 text-slate-400">Tables</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white text-sm">{health?.version || "…"}</Title>
            <Text className="mt-2 text-slate-400">Version</Text>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white text-sm">{health?.uptime || "…"}</Title>
            <Text className="mt-2 text-slate-400">Uptime</Text>
          </Card>
        </Grid>

        {/* Tables Table */}
        <Card className="bg-slate-900/40 border border-slate-800">
          <Title className="text-white">Tables</Title>
          <Text className="mt-1 text-slate-400">Row counts and storage usage.</Text>
          <div className="mt-6">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="text-slate-400">Table</TableHeaderCell>
                  <TableHeaderCell className="text-slate-400">Rows</TableHeaderCell>
                  <TableHeaderCell className="text-slate-400">Size</TableHeaderCell>
                  <TableHeaderCell className="text-slate-400">Engine</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.name}>
                    <TableCell className="text-white">{table.name}</TableCell>
                    <TableCell className="text-white">
                      {table.rows.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-white">{table.size}</TableCell>
                    <TableCell>
                      <Badge color="slate">{table.engine}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tables.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No tables found
              </div>
            )}
          </div>
        </Card>

        {/* Last Event Info */}
        {health?.lastEvent && (
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Latest Event</Title>
            <Text className="mt-2 text-slate-300">
              {new Date(health.lastEvent).toLocaleString()}
            </Text>
          </Card>
        )}
      </div>
    </RequireRole>
  );
}
