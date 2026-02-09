import { ConnectivityProtocol } from "../lib/db-drivers/types";

export type SSHAuthMethod = "password" | "key" | "agent";

export interface ConnectionFormState {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface SSHTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SSHAuthMethod;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface ProxyConfig {
  enabled: boolean;
  type: "http" | "https" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface SSLConfig {
  enabled: boolean;
  trustStorePath?: string;
  trustStorePassword?: string;
  keyStorePath?: string;
  keyStorePassword?: string;
  validateServerCertificate: boolean;
  clientCertificatePath?: string;
}

export type AdvancedPropertySource = "driver" | "custom";

export interface AdvancedProperty {
  id: string;
  key: string;
  value: string;
  label?: string;
  description?: string;
  type?: "string" | "number" | "boolean" | "enum";
  required?: boolean;
  options?: { value: string; label: string }[];
  validationRegex?: string;
  validationMessage?: string;
  placeholder?: string;
  source: AdvancedPropertySource;
}

export interface AdvancedPropertiesState {
  properties: AdvancedProperty[];
}

export interface ConnectionPayload {
  type: ConnectivityProtocol;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssh: SSHTunnelConfig;
  proxy: ProxyConfig;
  ssl: SSLConfig;
  properties: Record<string, string>;
}

export interface ConnectionPresetInput {
  name: string;
  driverId: string;
  payload: ConnectionPayload;
}

export interface ConnectionPreset extends ConnectionPresetInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
