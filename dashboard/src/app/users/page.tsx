"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { RequireRole } from "../../components/auth";
import { 
  Card, 
  Grid, 
  Title, 
  Text,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Button
} from "@tremor/react";
import { UsersIcon, UserPlusIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import { AdvancedFilters } from "../../components/charts";
import { SimpleExportButton, VirtualizedTable } from "../../components/ui";

const UserConstellation = dynamic(() => import("../../components/users/UserConstellation"), { ssr: false });

type GraphData = {
  nodes: Array<{ id: string; name?: string; size: number; category: number; ltv?: number; lastActive?: string }>;
  links: Array<{ source: string; target: string; weight?: number }>;
  categories: Array<{ name: string }>;
};

// Mock data for demonstration
const usersData = [
  {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
    role: "Admin",
    status: "Active",
    lastActive: "2 hours ago",
    sessions: 156,
    revenue: "$2,450"
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane@example.com",
    role: "User",
    status: "Active",
    lastActive: "1 day ago",
    sessions: 89,
    revenue: "$1,230"
  },
  {
    id: 3,
    name: "Bob Johnson",
    email: "bob@example.com",
    role: "User",
    status: "Inactive",
    lastActive: "3 days ago",
    sessions: 45,
    revenue: "$670"
  },
  {
    id: 4,
    name: "Alice Brown",
    email: "alice@example.com",
    role: "Premium",
    status: "Active",
    lastActive: "5 minutes ago",
    sessions: 234,
    revenue: "$4,890"
  },
  {
    id: 5,
    name: "Charlie Wilson",
    email: "charlie@example.com",
    role: "User",
    status: "Active",
    lastActive: "12 hours ago",
    sessions: 67,
    revenue: "$890"
  }
];

const filterOptions = [
  {
    id: "status",
    label: "Status",
    type: "select" as const,
    options: [
      { value: "", label: "All" },
      { value: "Active", label: "Active" },
      { value: "Inactive", label: "Inactive" },
    ],
  },
  {
    id: "role",
    label: "Role",
    type: "select" as const,
    options: [
      { value: "", label: "All" },
      { value: "Admin", label: "Admin" },
      { value: "Premium", label: "Premium" },
      { value: "User", label: "User" },
    ],
  },
  {
    id: "sort",
    label: "Sort",
    type: "select" as const,
    options: [
      { value: "lastActive", label: "Last Active" },
      { value: "sessions_desc", label: "Sessions (desc)" },
      { value: "sessions_asc", label: "Sessions (asc)" },
    ],
  },
];

export default function UsersPage() {
  const [selectedUser, setSelectedUser] = useState<(typeof usersData)[number] | null>(null);
  const [selectedNode, setSelectedNode] = useState<
    | { id: string; name?: string; size: number; category: number; ltv?: number; lastActive?: string }
    | null
  >(null);
  const [activeFilters, setActiveFilters] = useState<any[]>(filterOptions);
  const [search, setSearch] = useState("");

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [highlightIds, setHighlightIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGraphLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/rest/users-graph?limit=650&fill_missing=true", { cache: "no-store" });
        const json = (await res.json()) as { data: GraphData };
        if (!cancelled) setGraph(json.data);
      } catch {
        if (!cancelled) setGraph({ nodes: [], links: [], categories: [] });
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const nodeNeighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const links = graph?.links ?? [];
    for (const l of links) {
      const s = String(l.source);
      const t = String(l.target);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [graph]);

  const selectedNodeStats = useMemo(() => {
    if (!selectedNode || !graph) return null;
    const neighbors = nodeNeighbors.get(selectedNode.id);
    const degree = neighbors ? neighbors.size : 0;
    const catName = graph.categories?.[selectedNode.category]?.name ?? `Cluster ${selectedNode.category + 1}`;
    return { degree, catName };
  }, [selectedNode, graph, nodeNeighbors]);

  const filteredUsers = useMemo(() => {
    const status = activeFilters?.find((f) => f.id === "status")?.value ?? "";
    const role = activeFilters?.find((f) => f.id === "role")?.value ?? "";
    const sort = activeFilters?.find((f) => f.id === "sort")?.value ?? "lastActive";

    let list = usersData;

    if (status) list = list.filter((u) => u.status === status);
    if (role) list = list.filter((u) => u.role === role);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((u) => {
        return (
          u.name.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          u.role.toLowerCase().includes(s) ||
          u.status.toLowerCase().includes(s)
        );
      });
    }

    const sorted = [...list];
    if (sort === "sessions_desc") sorted.sort((a, b) => b.sessions - a.sessions);
    if (sort === "sessions_asc") sorted.sort((a, b) => a.sessions - b.sessions);
    return sorted;
  }, [activeFilters, search]);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10">
          <div className="p-8 space-y-8">
            {/* Page Header */}
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-2xl border border-emerald-400/20">
                  <UsersIcon className="h-8 w-8 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">User Management</h1>
                  <p className="text-slate-300 mt-2">Monitor and manage your user base</p>
                </div>
              </div>
            </div>

            {/* User Stats */}
            <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-6">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-xl border border-emerald-400/20">
                    <UsersIcon className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Total Users</Text>
                    <p className="text-2xl font-bold text-white">12,456</p>
                    <Text className="text-emerald-400 text-sm">+8.2%</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl border border-blue-400/20">
                    <UserPlusIcon className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">New Users</Text>
                    <p className="text-2xl font-bold text-white">+342</p>
                    <Text className="text-blue-400 text-sm">This week</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl border border-purple-400/20">
                    <UserCheckIcon className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Active Users</Text>
                    <p className="text-2xl font-bold text-white">8,234</p>
                    <Text className="text-purple-400 text-sm">66.1%</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/20 rounded-xl border border-amber-400/20">
                    <UserXIcon className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Churned Users</Text>
                    <p className="text-2xl font-bold text-white">89</p>
                    <Text className="text-amber-400 text-sm">-2.1%</Text>
                  </div>
                </div>
              </Card>
            </Grid>

            {/* Filters + Search + Export */}
            <div className="space-y-4">
              <AdvancedFilters
                filters={filterOptions}
                onFiltersChange={setActiveFilters}
              />

              <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 shadow-2xl p-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search users by name, email, role, status..."
                      className="w-full bg-white/10 text-white border border-white/20 rounded-xl px-4 py-2 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <SimpleExportButton
                      data={{ data: filteredUsers, filename: `users_${new Date().toISOString().split("T")[0]}` }}
                      title="Export"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* User Constellation */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <Title className="text-white text-xl">User Constellation</Title>
                  <Text className="text-slate-300 mt-1">Graph view (Canvas). Hover to see connections, click a node for profile.</Text>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-lime-400/15 text-lime-400 border border-lime-400/30 hover:bg-lime-400/20"
                    onClick={() => {
                      const nodes = graph?.nodes ?? [];
                      if (nodes.length === 0) return;
                      const suspects = nodes
                        .filter((n) => (Number(n.ltv ?? 0) >= 1800) || (nodeNeighbors.get(n.id)?.size ?? 0) >= 24)
                        .slice(0, 140)
                        .map((n) => n.id);
                      setHighlightIds(new Set(suspects));
                    }}
                  >
                    Найти аномальные кластеры
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                    onClick={() => setHighlightIds(null)}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <div className="mt-5 rounded-2xl overflow-hidden border border-white/10">
                <UserConstellation
                  data={graph}
                  height={620}
                  highlightNodeIds={highlightIds ?? undefined}
                  onNodeClick={(node) => setSelectedNode(node)}
                />
                {graphLoading && <div className="h-[620px] -mt-[620px] bg-white/5" />}
              </div>
            </Card>

            {/* Users Table */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="mb-6">
                <Title className="text-white text-xl">Recent Users</Title>
                <Text className="text-slate-300 mt-1">Latest user activity and engagement</Text>
              </div>

              <VirtualizedTable
                items={filteredUsers}
                height={520}
                colSpan={6}
                estimateRowHeight={56}
                renderHeader={
                  <TableRow>
                    <TableHeaderCell className="text-slate-300">User</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Role</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Status</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Last Active</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Sessions</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Revenue</TableHeaderCell>
                  </TableRow>
                }
                renderRow={(user) => (
                  <TableRow
                    key={user.id}
                    className="border-white/10 hover:bg-white/5 cursor-pointer"
                    onClick={() => setSelectedUser(user)}
                  >
                    <TableCell>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-slate-400 text-sm">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={user.role === "Admin" ? "red" : user.role === "Premium" ? "purple" : "blue"}
                        className="text-xs"
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge color={user.status === "Active" ? "emerald" : "slate"} className="text-xs">
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{user.lastActive}</TableCell>
                    <TableCell className="text-white">{user.sessions}</TableCell>
                    <TableCell className="text-emerald-400 font-medium">{user.revenue}</TableCell>
                  </TableRow>
                )}
              />
            </Card>
          </div>
        </div>
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Card className="backdrop-blur-xl bg-slate-900/80 rounded-3xl border border-white/20 shadow-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Title className="text-white text-xl">User Details</Title>
                  <Text className="text-slate-300 mt-1">{selectedUser.name} • {selectedUser.email}</Text>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                  onClick={() => setSelectedUser(null)}
                >
                  Close
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Role</Text>
                  <div className="mt-1 text-white font-medium">{selectedUser.role}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Status</Text>
                  <div className="mt-1 text-white font-medium">{selectedUser.status}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Last Active</Text>
                  <div className="mt-1 text-white font-medium">{selectedUser.lastActive}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Sessions</Text>
                  <div className="mt-1 text-white font-medium">{selectedUser.sessions}</div>
                </div>
              </div>

              <div className="mt-4 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm mb-2">Raw</Text>
                <pre className="whitespace-pre-wrap text-slate-200 text-sm">
                  {JSON.stringify(selectedUser, null, 2)}
                </pre>
              </div>
            </Card>
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="fixed inset-0 z-50" onClick={() => setSelectedNode(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="h-full backdrop-blur-xl bg-slate-900/80 rounded-3xl border border-white/20 shadow-2xl p-6 overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Title className="text-white text-xl">User Profile</Title>
                  <Text className="text-slate-300 mt-1">{selectedNode.name ?? selectedNode.id}</Text>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                  onClick={() => setSelectedNode(null)}
                >
                  Close
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3">
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Cluster</Text>
                  <div className="mt-1 text-white font-medium">{selectedNodeStats?.catName ?? "—"}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Connections</Text>
                  <div className="mt-1 text-white font-medium">{selectedNodeStats?.degree ?? 0}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">LTV</Text>
                  <div className="mt-1 text-lime-400 font-semibold">{Number(selectedNode.ltv ?? 0).toLocaleString()}</div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                  <Text className="text-slate-300 text-sm">Last Active</Text>
                  <div className="mt-1 text-white font-medium">
                    {selectedNode.lastActive ? new Date(selectedNode.lastActive).toLocaleString() : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-5 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm mb-2">AI analysis (cluster behavior)</Text>
                <Text className="text-slate-200">
                  This cluster shows unusual behavior patterns. Next step: call AI service to explain why this node is highlighted and what cohort it belongs to.
                </Text>
              </div>
            </Card>
          </div>
        </div>
      )}
    </RequireRole>
  );
}
