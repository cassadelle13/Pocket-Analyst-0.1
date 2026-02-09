import { SSLConfig } from "../../../types/connection";

interface SSLStepProps {
  value: SSLConfig;
  onChange: (updates: Partial<SSLConfig>) => void;
}

export function SSLStep({ value, onChange }: SSLStepProps) {
  const handleInput = (field: keyof SSLConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ [field]: e.target.value });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">SSL / TLS</p>
          <p className="text-sm text-slate-500">Шифрование трафика и проверка сертификатов</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="accent-emerald-400"
          />
          Enable
        </label>
      </header>

      {value.enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Trust store path</label>
              <input
                value={value.trustStorePath || ""}
                onChange={handleInput("trustStorePath")}
                placeholder="/etc/certs/truststore.jks"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Trust store password</label>
              <input
                type="password"
                value={value.trustStorePassword || ""}
                onChange={handleInput("trustStorePassword")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Key store path</label>
              <input
                value={value.keyStorePath || ""}
                onChange={handleInput("keyStorePath")}
                placeholder="/etc/certs/keystore.p12"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Key store password</label>
              <input
                type="password"
                value={value.keyStorePassword || ""}
                onChange={handleInput("keyStorePassword")}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Client certificate</label>
              <input
                value={value.clientCertificatePath || ""}
                onChange={handleInput("clientCertificatePath")}
                placeholder="/etc/certs/client.pem"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={value.validateServerCertificate}
                onChange={(e) => onChange({ validateServerCertificate: e.target.checked })}
                className="accent-emerald-400"
              />
              <span className="text-sm text-white">Validate server certificate</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
