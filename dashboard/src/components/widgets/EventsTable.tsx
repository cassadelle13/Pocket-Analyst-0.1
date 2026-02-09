"use client";

import { useMemo, useState, useEffect } from "react";
import { type BaseRecord, useList } from "@refinedev/core";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeaderCell, 
  TableRow,
  Card,
  Title,
  Text,
  Badge,
  Button,
  Flex,
  TextInput,
  Select,
  SelectItem
} from "@tremor/react";
import { Database, Globe, Smartphone, Zap, Search, Filter } from "lucide-react";
import { SimpleExportButton, VirtualizedTable } from "../../components/ui";
import type { EventRow } from "../../types/api";
import { deserialize } from "../../lib/serialization";
import { useDemoMode } from "../../context/DemoContext";
import { generateMockEvents } from "../../lib/mockGenerator";

type Event = EventRow & BaseRecord;

const sourceConfig = {
  web: { icon: Globe, color: "text-blue-400", bg: "bg-blue-400/10" },
  mobile: { icon: Smartphone, color: "text-purple-400", bg: "bg-purple-400/10" },
  desktop: { icon: Database, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  api: { icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10" },
};

interface EventsTableProps {
  title?: string;
}

export function EventsTable({ title = "Live Events" }: EventsTableProps) {
  const { isDemoMode } = useDemoMode();
  const [filters, setFilters] = useState({
    eventName: "",
    userId: "",
    source: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [useProtobuf, setUseProtobuf] = useState(false);
  const [protobufEvents, setProtobufEvents] = useState<Event[]>([]);
  const [protobufLoading, setProtobufLoading] = useState(false);
  const [demoEvents, setDemoEvents] = useState<Event[]>([]);

  // Generate demo events when in Demo Mode
  useEffect(() => {
    if (!isDemoMode) return;

    const mockEvents = generateMockEvents(200);
    setDemoEvents(mockEvents as any);
  }, [isDemoMode]);

  // Fetch with Protobuf when enabled
  useEffect(() => {
    if (!useProtobuf || isDemoMode) return;

    let cancelled = false;
    setProtobufLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "1000",
          exclude_properties: "true",
          ...(filters.eventName && { eventName: filters.eventName }),
          ...(filters.userId && { userId: filters.userId }),
          ...(filters.source && { source: filters.source }),
        });

        const res = await fetch(`/api/rest/events-table?${params.toString()}`, {
          headers: {
            "Accept": "application/x-protobuf",
          },
        });

        if (res.headers.get("content-type")?.includes("protobuf")) {
          // Binary Protobuf response
          const buffer = await res.arrayBuffer();
          const decoded = await deserialize(new Uint8Array(buffer), {
            format: "protobuf",
            messageType: "EventList",
          });

          if (!cancelled && decoded.events) {
            setProtobufEvents(decoded.events.map((e: any, idx: number) => ({
              id: e.event_id || String(idx),
              event_name: e.event_name,
              user_id: e.user_id,
              timestamp: new Date(Number(e.timestamp)).toISOString(),
              properties: JSON.stringify(e.properties || {}),
            })));
          }
        } else {
          // Fallback to JSON
          const json = await res.json();
          if (!cancelled && json.events) {
            setProtobufEvents(json.events);
          }
        }
      } catch (err) {
        console.error("Protobuf fetch failed:", err);
        if (!cancelled) setProtobufEvents([]);
      } finally {
        if (!cancelled) setProtobufLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useProtobuf, filters]);

  const list = useList<Event>({
    resource: "events-table",
    pagination: { mode: "off" },
    filters: [
      ...(filters.eventName ? [{ field: "eventName", operator: "eq" as const, value: filters.eventName }] : []),
      ...(filters.userId ? [{ field: "userId", operator: "eq" as const, value: filters.userId }] : []),
      ...(filters.source ? [{ field: "source", operator: "eq" as const, value: filters.source }] : []),
    ],
    meta: {
      exclude_properties: "true",
    },
    queryOptions: {
      enabled: !useProtobuf && !isDemoMode, // Disable when using Protobuf or Demo Mode
    },
  });

  const allEvents = isDemoMode ? demoEvents : (useProtobuf ? protobufEvents : ((list.data?.data || []) as Event[]));
  const total = allEvents.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isLoading = isDemoMode ? false : (useProtobuf ? protobufLoading : list.isLoading);

  const events = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return allEvents.slice(start, start + pageSize);
  }, [allEvents, currentPage]);

  const getSourceFromProperties = (properties: string): string => {
    try {
      const parsed = JSON.parse(properties);
      return parsed.source || "web";
    } catch {
      return "web";
    }
  };

  const formatProperties = (properties: string): string => {
    if (!properties || properties === "") {
      return "(properties excluded for performance)";
    }
    try {
      const parsed = JSON.parse(properties);
      return Object.entries(parsed)
        .slice(0, 3) // Show only first 3 properties
        .map(([k, v]) => `${k}: ${String(v).substring(0, 20)}`)
        .join(", ");
    } catch {
      return properties.substring(0, 50);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({ eventName: "", userId: "", source: "" });
    setCurrentPage(1);
  };

  const parsedProperties = useMemo(() => {
    if (!selectedEvent) return null;
    try {
      return JSON.parse(selectedEvent.properties);
    } catch {
      return { raw: selectedEvent.properties };
    }
  }, [selectedEvent]);

  return (
    <>
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
      {/* Header */}
      <div className="mb-6">
        <Flex justifyContent="between" alignItems="center">
          <div>
            <Title className="text-white">{title}</Title>
            <Text className="text-slate-400 mt-1">
              Real-time events from ClickHouse • {total.toLocaleString()} total events
              {useProtobuf && <Badge className="ml-2" color="purple">Protobuf Binary</Badge>}
            </Text>
          </div>
          <Flex className="items-center gap-3">
            <Button
              size="xs"
              variant={useProtobuf ? "primary" : "secondary"}
              onClick={() => setUseProtobuf(!useProtobuf)}
              className="text-xs"
            >
              {useProtobuf ? "Using Protobuf" : "Use Protobuf"}
            </Button>
            <SimpleExportButton
              data={{ data: events, filename: `events_${new Date().toISOString().split('T')[0]}` }}
              title="Export Events"
            />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
              <Text className="text-slate-400 text-sm">Live</Text>
            </div>
          </Flex>
        </Flex>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <Flex className="gap-4" alignItems="end">
          <div className="flex-1">
            <Text className="text-slate-400 text-sm mb-2">Event Name</Text>
            <TextInput
              icon={Search}
              placeholder="Filter by event name..."
              value={filters.eventName}
              onChange={(e) => handleFilterChange("eventName", e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Text className="text-slate-400 text-sm mb-2">User ID</Text>
            <TextInput
              icon={Search}
              placeholder="Filter by user ID..."
              value={filters.userId}
              onChange={(e) => handleFilterChange("userId", e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Text className="text-slate-400 text-sm mb-2">Source</Text>
            <Select
              value={filters.source}
              onValueChange={(value) => handleFilterChange("source", value)}
            >
              <SelectItem value="">All Sources</SelectItem>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={clearFilters}
            icon={Filter}
          >
            Clear
          </Button>
        </Flex>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="text-slate-400">Event</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">User</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Source</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Properties</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 text-right">Time</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  Loading events...
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : events.length === 0 ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="text-slate-400">Event</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">User</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Source</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Properties</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 text-right">Time</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No events found
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <VirtualizedTable
            items={events}
            height={520}
            colSpan={5}
            estimateRowHeight={44}
            className="min-w-[900px]"
            renderHeader={
              <TableRow>
                <TableHeaderCell className="text-slate-400">Event</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">User</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Source</TableHeaderCell>
                <TableHeaderCell className="text-slate-400">Properties</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 text-right">Time</TableHeaderCell>
              </TableRow>
            }
            renderRow={(event) => {
              const source = getSourceFromProperties(event.properties);
              const config = sourceConfig[source as keyof typeof sourceConfig] || sourceConfig.web;
              const SourceIcon = config.icon;
              return (
                <TableRow
                  key={event.id}
                  className="hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => setSelectedEvent(event)}
                >
                  <TableCell>
                    <Badge color="blue" size="xs">
                      {event.event_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text className="text-slate-300 font-mono text-sm">{event.user_id}</Text>
                  </TableCell>
                  <TableCell>
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${config.bg}`}>
                      <SourceIcon className={`w-3 h-3 ${config.color}`} />
                      <span className={`text-xs font-medium ${config.color}`}>{source}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Text className="text-slate-400 text-xs font-mono">{formatProperties(event.properties)}</Text>
                  </TableCell>
                  <TableCell className="text-right">
                    <Text className="text-slate-400 text-xs">{formatTimestamp(event.timestamp)}</Text>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <Text className="text-slate-400 text-sm">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, total)} of {total} events
          </Text>
          <Flex className="gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Text className="text-slate-300 px-3 py-1">
              {currentPage} / {totalPages}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </Button>
          </Flex>
        </div>
      )}
      </Card>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <Card className="bg-slate-900 border-slate-800 shadow-xl">
              <div className="p-6">
                <Flex justifyContent="between" alignItems="start">
                  <div>
                    <Title className="text-white">Event Details</Title>
                    <Text className="text-slate-400 mt-1">
                      {selectedEvent.event_name} • {formatTimestamp(selectedEvent.timestamp)}
                    </Text>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedEvent(null)}>
                    Close
                  </Button>
                </Flex>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <Text className="text-slate-400 text-sm">User ID</Text>
                    <Text className="text-slate-200 font-mono mt-1">{selectedEvent.user_id}</Text>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
                    <Text className="text-slate-400 text-sm">Event ID</Text>
                    <Text className="text-slate-200 font-mono mt-1">{selectedEvent.id}</Text>
                  </div>
                </div>

                <div className="mt-4">
                  <Text className="text-slate-400 text-sm mb-2">Properties</Text>
                  <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 overflow-auto max-h-96">
                    <pre className="text-slate-200 text-sm whitespace-pre-wrap">
                      {JSON.stringify(parsedProperties, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <SimpleExportButton
                    data={{ data: [selectedEvent], filename: `event_${selectedEvent.id}` }}
                    title="Export"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
