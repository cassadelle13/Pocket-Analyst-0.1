import { useMemo, useState } from "react";
import { ArrowLeftRight, Filter, Lock, Search } from "lucide-react";
import { DbDriverCategory, DbDriverDescriptor, ConnectivityProtocol } from "../../../lib/db-drivers/types";

interface DriverSelectionStepProps {
  drivers: DbDriverDescriptor[];
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  supportedProtocols: ConnectivityProtocol[];
  isConnectable: (driver: DbDriverDescriptor) => boolean;
}

const DRIVER_CATEGORIES: { id: "all" | DbDriverCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "sql", label: "SQL" },
  { id: "analytic", label: "Аналитика" },
  { id: "cloud", label: "Облако" },
  { id: "newsql", label: "NewSQL" },
  { id: "nosql", label: "NoSQL" },
];

export function DriverSelectionStep({
  drivers,
  selectedDriverId,
  onSelectDriver,
  supportedProtocols,
  isConnectable,
}: DriverSelectionStepProps) {
  const [activeCategory, setActiveCategory] = useState<(typeof DRIVER_CATEGORIES)[number]["id"]>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDrivers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return drivers.filter((driver) => {
      const matchesCategory =
        activeCategory === "all" ? true : driver.categories.includes(activeCategory);
      const matchesSearch =
        query.length === 0 ||
        driver.name.toLowerCase().includes(query) ||
        driver.tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [drivers, activeCategory, searchQuery]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Drivers</p>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Filter className="w-3 h-3" /> {filteredDrivers.length} options
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DRIVER_CATEGORIES.map((category) => {
            const isActive = activeCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`rounded-full px-3 py-1 text-xs transition-all border ${
                  isActive
                    ? "border-white/70 bg-white/10 text-white"
                    : "border-white/10 text-slate-400 hover:border-white/30"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию или тегам"
            className="w-full rounded-2xl bg-white/5 border border-white/10 py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-2 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
        {filteredDrivers.map((driver) => {
          const isActive = driver.id === selectedDriverId;
          const canConnect = isConnectable(driver);
          return (
            <button
              key={driver.id}
              onClick={() => onSelectDriver(driver.id)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                isActive
                  ? "border-white/60 bg-white/10 shadow-lg shadow-black/40"
                  : "border-white/5 hover:border-white/20"
              } ${!canConnect ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white font-semibold flex items-center gap-2">
                    {driver.name}
                    {driver.connectivity.status !== "available" && (
                      <span className="text-[10px] uppercase tracking-widest text-amber-300">
                        {driver.connectivity.status === "preview" ? "Preview" : "Soon"}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">{driver.shortDescription}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {driver.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase tracking-[0.2em] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${driver.accentGradient} flex items-center justify-center text-white`}
                >
                  {canConnect ? <ArrowLeftRight className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                </div>
              </div>
            </button>
          );
        })}
        {filteredDrivers.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-8">
            Ничего не найдено. Попробуйте изменить фильтры.
          </div>
        )}
      </div>
    </div>
  );
}
