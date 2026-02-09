import { AdvancedProperty, ConnectionFormState, ProxyConfig, SSLConfig, SSHTunnelConfig } from "../../../types/connection";
import { DbDriverDescriptor } from "../../../lib/db-drivers/types";
import { ShieldCheck } from "lucide-react";

interface ReviewStepProps {
  driver: DbDriverDescriptor;
  basicSettings: ConnectionFormState;
  sshConfig: SSHTunnelConfig;
  proxyConfig: ProxyConfig;
  sslConfig: SSLConfig;
  advancedProperties: AdvancedProperty[];
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</p>
    {children}
  </section>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between text-sm text-slate-300">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-white">{value}</span>
  </div>
);

export function ReviewStep({
  driver,
  basicSettings,
  sshConfig,
  proxyConfig,
  sslConfig,
  advancedProperties,
}: ReviewStepProps) {
  return (
    <div className="space-y-4">
      <Section title="Driver">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg text-white font-semibold">{driver.name}</p>
            <p className="text-sm text-slate-400">{driver.shortDescription}</p>
          </div>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${driver.accentGradient} flex items-center justify-center text-white`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </Section>

      <Section title="Basic">
        <div className="space-y-2">
          <InfoRow label="Host" value={basicSettings.host} />
          <InfoRow label="Port" value={basicSettings.port} />
          <InfoRow label="Database" value={basicSettings.database || "—"} />
          <InfoRow label="User" value={basicSettings.user} />
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="SSH">
          {sshConfig.enabled ? (
            <div className="space-y-2 text-sm text-slate-300">
              <InfoRow label="Host" value={sshConfig.host} />
              <InfoRow label="Port" value={sshConfig.port} />
              <InfoRow label="User" value={sshConfig.username} />
              <InfoRow label="Auth" value={sshConfig.authMethod.toUpperCase()} />
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Disabled</p>
          )}
        </Section>

        <Section title="Proxy">
          {proxyConfig.enabled ? (
            <div className="space-y-2 text-sm text-slate-300">
              <InfoRow label="Type" value={proxyConfig.type.toUpperCase()} />
              <InfoRow label="Host" value={proxyConfig.host} />
              <InfoRow label="Port" value={proxyConfig.port} />
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Disabled</p>
          )}
        </Section>
      </div>

      <Section title="SSL">
        {sslConfig.enabled ? (
          <div className="space-y-2 text-sm text-slate-300">
            <InfoRow label="Validate server" value={sslConfig.validateServerCertificate ? "Yes" : "No"} />
            <InfoRow label="Trust store" value={sslConfig.trustStorePath || "—"} />
            <InfoRow label="Key store" value={sslConfig.keyStorePath || "—"} />
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Disabled</p>
        )}
      </Section>

      <Section title="Advanced">
        {advancedProperties.length === 0 ? (
          <p className="text-slate-500 text-sm">Нет дополнительных свойств</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-300">
            {advancedProperties.map((prop) => (
              <li key={prop.id} className="flex items-center justify-between">
                <span className="text-slate-500">{prop.key}</span>
                <span className="font-mono text-white">{prop.value}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
