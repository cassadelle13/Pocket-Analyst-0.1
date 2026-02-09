import { ConnectionFormState } from "../../../types/connection";

type BasicConnectionErrors = Partial<Record<keyof ConnectionFormState, string>>;

interface BasicConnectionStepProps {
  value: ConnectionFormState;
  onChange: (updates: Partial<ConnectionFormState>) => void;
  errors?: BasicConnectionErrors;
}

export function BasicConnectionStep({ value, onChange, errors }: BasicConnectionStepProps) {
  const handleChange = (field: keyof ConnectionFormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ [field]: field === "port" ? Number(e.target.value) || 0 : e.target.value });
  };

  const inputClass = (field: keyof ConnectionFormState) =>
    `mt-1 w-full rounded-xl border px-4 py-2 text-white focus:outline-none ${
      errors?.[field]
        ? "border-red-400 bg-red-500/10 focus:border-red-300"
        : "border-white/10 bg-black/20 focus:border-emerald-400/60"
    }`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Укажите точные параметры подключения — без host, порта и пользователя нельзя продолжить.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Host</label>
          <input
            value={value.host}
            onChange={handleChange("host")}
            className={inputClass("host")}
            placeholder="localhost"
          />
          {errors?.host && <p className="text-[11px] text-red-300 mt-1">{errors.host}</p>}
        </div>
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Port</label>
          <input
            value={value.port}
            onChange={handleChange("port")}
            className={inputClass("port")}
            placeholder="5432"
          />
          {errors?.port && <p className="text-[11px] text-red-300 mt-1">{errors.port}</p>}
        </div>
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Database</label>
          <input
            value={value.database}
            onChange={handleChange("database")}
            className={inputClass("database")}
            placeholder="analytics"
          />
          {errors?.database && <p className="text-[11px] text-red-300 mt-1">{errors.database}</p>}
        </div>
        <div>
          <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">User</label>
          <input
            value={value.user}
            onChange={handleChange("user")}
            className={inputClass("user")}
            placeholder="postgres"
          />
          {errors?.user && <p className="text-[11px] text-red-300 mt-1">{errors.user}</p>}
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Password</label>
        <input
          type="password"
          value={value.password}
          onChange={handleChange("password")}
          className={inputClass("password")}
          placeholder="••••••"
        />
        {errors?.password && <p className="text-[11px] text-red-300 mt-1">{errors.password}</p>}
      </div>
    </div>
  );
}
