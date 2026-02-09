import { SSHTunnelConfig, ProxyConfig } from "../../../types/connection";

interface NetworkStepProps {
  sshConfig: SSHTunnelConfig;
  proxyConfig: ProxyConfig;
  onSSHChange: (updates: Partial<SSHTunnelConfig>) => void;
  onProxyChange: (updates: Partial<ProxyConfig>) => void;
}

const authMethods: SSHTunnelConfig["authMethod"][] = ["password", "key", "agent"];

export function NetworkStep({ sshConfig, proxyConfig, onSSHChange, onProxyChange }: NetworkStepProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">SSH Tunnel</p>
            <p className="text-sm text-slate-500">Подключение через bastion или jump host</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={sshConfig.enabled}
              onChange={(e) => onSSHChange({ enabled: e.target.checked })}
              className="accent-emerald-400"
            />
            Enable
          </label>
        </header>

        {sshConfig.enabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Host</label>
                <input
                  value={sshConfig.host}
                  onChange={(e) => onSSHChange({ host: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  placeholder="bastion.company.com"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Port</label>
                <input
                  value={sshConfig.port}
                  onChange={(e) => onSSHChange({ port: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  placeholder="22"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Username</label>
                <input
                  value={sshConfig.username}
                  onChange={(e) => onSSHChange({ username: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  placeholder="deploy"
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Auth method</p>
              <div className="flex flex-wrap gap-2">
                {authMethods.map((method) => (
                  <button
                    key={method}
                    onClick={() => onSSHChange({ authMethod: method })}
                    className={`rounded-full px-4 py-1 text-xs border transition ${
                      sshConfig.authMethod === method
                        ? "border-emerald-400/80 bg-emerald-500/20 text-white"
                        : "border-white/10 text-slate-400 hover:border-white/30"
                    }`}
                  >
                    {method.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {sshConfig.authMethod === "password" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Password</label>
                  <input
                    type="password"
                    value={sshConfig.password || ""}
                    onChange={(e) => onSSHChange({ password: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {sshConfig.authMethod === "key" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Private key path</label>
                  <input
                    value={sshConfig.privateKeyPath || ""}
                    onChange={(e) => onSSHChange({ privateKeyPath: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                    placeholder="~/.ssh/id_rsa"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Passphrase</label>
                  <input
                    type="password"
                    value={sshConfig.passphrase || ""}
                    onChange={(e) => onSSHChange({ passphrase: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Local port</label>
                <input
                  value={sshConfig.localPort}
                  onChange={(e) => onSSHChange({ localPort: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Remote host</label>
                  <input
                    value={sshConfig.remoteHost}
                    onChange={(e) => onSSHChange({ remoteHost: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Remote port</label>
                  <input
                    value={sshConfig.remotePort}
                    onChange={(e) => onSSHChange({ remotePort: Number(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Proxy</p>
            <p className="text-sm text-slate-500">HTTP/HTTPS/SOCKS маршрутизация</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={proxyConfig.enabled}
              onChange={(e) => onProxyChange({ enabled: e.target.checked })}
              className="accent-emerald-400"
            />
            Enable
          </label>
        </header>

        {proxyConfig.enabled && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["http", "https", "socks5"].map((type) => (
                <button
                  key={type}
                  onClick={() => onProxyChange({ type: type as ProxyConfig["type"] })}
                  className={`rounded-full px-4 py-1 text-xs border transition ${
                    proxyConfig.type === type
                      ? "border-emerald-400/80 bg-emerald-500/20 text-white"
                      : "border-white/10 text-slate-400 hover:border-white/30"
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Host</label>
                <input
                  value={proxyConfig.host}
                  onChange={(e) => onProxyChange({ host: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  placeholder="proxy.company.com"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Port</label>
                <input
                  value={proxyConfig.port}
                  onChange={(e) => onProxyChange({ port: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                  placeholder="8080"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Username</label>
                <input
                  value={proxyConfig.username || ""}
                  onChange={(e) => onProxyChange({ username: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-[0.2em]">Password</label>
                <input
                  type="password"
                  value={proxyConfig.password || ""}
                  onChange={(e) => onProxyChange({ password: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
