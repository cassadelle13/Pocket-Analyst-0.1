import { ConnectionPayload, ProxyConfig, SSLConfig, SSHTunnelConfig } from "../types/connection";

export const DIRECT_CONNECT_DRIVERS = ["postgres", "mysql", "mssql"] as const;
export type DirectConnectDriver = typeof DIRECT_CONNECT_DRIVERS[number];

const DEFAULT_SSH: SSHTunnelConfig = {
  enabled: false,
  host: "",
  port: 22,
  username: "",
  authMethod: "password",
  password: "",
  privateKeyPath: "",
  passphrase: "",
  localPort: 0,
  remoteHost: "",
  remotePort: 0,
};

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  type: "http",
  host: "",
  port: 80,
  username: "",
  password: "",
};

const DEFAULT_SSL: SSLConfig = {
  enabled: false,
  trustStorePath: "",
  trustStorePassword: "",
  keyStorePath: "",
  keyStorePassword: "",
  validateServerCertificate: true,
  clientCertificatePath: "",
};

export function normalizeConnectionPayload(connection: ConnectionPayload): ConnectionPayload {
  const normalizedPort = Number(connection.port) || 0;

  const ssh: SSHTunnelConfig = {
    ...DEFAULT_SSH,
    ...connection.ssh,
  };
  ssh.remoteHost = ssh.remoteHost || connection.host;
  ssh.remotePort = ssh.remotePort || normalizedPort;

  const proxy: ProxyConfig = {
    ...DEFAULT_PROXY,
    ...connection.proxy,
  };

  const ssl: SSLConfig = {
    ...DEFAULT_SSL,
    ...connection.ssl,
  };

  return {
    ...connection,
    port: normalizedPort,
    database: connection.database || "",
    user: connection.user || "",
    password: connection.password || "",
    ssh,
    proxy,
    ssl,
    properties: connection.properties ?? {},
  };
}

export function isDirectConnectDriver(type: ConnectionPayload["type"]): type is DirectConnectDriver {
  return DIRECT_CONNECT_DRIVERS.includes(type as DirectConnectDriver);
}
