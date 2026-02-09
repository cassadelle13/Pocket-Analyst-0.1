import { AdvancedProperty } from "../../../types/connection";
import { Plus, Trash2 } from "lucide-react";

interface AdvancedPropertiesStepProps {
  properties: AdvancedProperty[];
  onAddProperty: () => void;
  onUpdateProperty: (id: string, updates: Partial<AdvancedProperty>) => void;
  onRemoveProperty: (id: string) => void;
}

export function AdvancedPropertiesStep({
  properties,
  onAddProperty,
  onUpdateProperty,
  onRemoveProperty,
}: AdvancedPropertiesStepProps) {
  const handleKeyChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateProperty(id, { key: e.target.value });
  };

  const handleValueChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateProperty(id, { value: e.target.value });
  };

  const handleSelectChange = (id: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateProperty(id, { value: e.target.value });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Advanced properties</p>
          <p className="text-sm text-slate-500">Передайте дополнительные JDBC/driver параметры</p>
        </div>
        <button
          onClick={onAddProperty}
          className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm text-white hover:border-emerald-400/70"
        >
          <Plus className="w-4 h-4" />
          Add property
        </button>
      </div>

      {properties.length === 0 && (
        <p className="text-sm text-slate-500">Пока не добавлено ни одного свойства.</p>
      )}

      <div className="space-y-3">
        {properties.map((property) => {
          const showSelect = property.options && property.options.length > 0;
          const isBoolean = property.type === "boolean" && !showSelect;
          return (
            <div
              key={property.id}
              className="grid grid-cols-1 md:grid-cols-10 gap-3 items-center rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="md:col-span-4">
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Key</label>
                <input
                  value={property.key}
                  onChange={handleKeyChange(property.id)}
                  placeholder="connectTimeout"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  disabled={property.source === "driver"}
                />
                {property.label && (
                  <p className="text-[11px] text-slate-500 mt-1">{property.label}</p>
                )}
              </div>
              <div className="md:col-span-5 space-y-1">
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Value</label>
                {showSelect ? (
                  <select
                    value={property.value}
                    onChange={handleSelectChange(property.id)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  >
                    {property.options?.map((option) => (
                      <option key={option.value} value={option.value} className="text-black">
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : isBoolean ? (
                  <div className="flex gap-3">
                    {([
                      { value: "true", label: "True" },
                      { value: "false", label: "False" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onUpdateProperty(property.id, { value: option.value })}
                        className={`rounded-full px-4 py-1 text-xs border transition ${
                          property.value === option.value
                            ? "border-emerald-400/80 bg-emerald-500/20 text-white"
                            : "border-white/10 text-slate-400 hover:border-white/30"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={property.value}
                    onChange={handleValueChange(property.id)}
                    placeholder={property.placeholder || "30"}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  />
                )}
                {property.description && (
                  <p className="text-[11px] text-slate-500 mt-1">{property.description}</p>
                )}
                {property.validationMessage && property.validationRegex && property.value && !new RegExp(property.validationRegex).test(property.value) && (
                  <p className="text-[11px] text-red-400 mt-1">{property.validationMessage}</p>
                )}
              </div>
              <div className="md:col-span-1 flex justify-end">
                {property.source === "custom" ? (
                  <button
                    onClick={() => onRemoveProperty(property.id)}
                    className="p-2 rounded-xl border border-red-500/30 text-red-200 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-300 uppercase tracking-[0.3em]">Driver</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
