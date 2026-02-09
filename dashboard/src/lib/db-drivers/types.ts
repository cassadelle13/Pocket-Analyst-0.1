export type DbDriverCategory = "sql" | "nosql" | "analytic" | "cloud" | "newsql" | "stream";

export type ConnectivityStatus = "available" | "preview" | "coming_soon";

export type ConnectivityProtocol =
  | "postgres"
  | "mysql"
  | "mssql"
  | "mariadb"
  | "oracle"
  | "snowflake"
  | "bigquery"
  | "databricks"
  | "redshift"
  | "clickhouse"
  | "cassandra"
  | "mongodb"
  | "redis"
  | "cockroach"
  | "yugabytedb"
  | "tidb"
  | "athena"
  | "snowflake"
  | "bigquery"
  | "databricks";

export interface DriverFeatures {
  ssl: boolean;
  ssh: boolean;
  proxy: boolean;
  schemaDiscovery: boolean;
  ingestion: boolean;
}

export interface DriverConnectivity {
  protocol: ConnectivityProtocol;
  status: ConnectivityStatus;
  supportsAgent?: boolean;
  notes?: string;
}

export type DriverPropertyType = "string" | "number" | "boolean" | "enum";

export interface DriverPropertyOption {
  value: string;
  label: string;
}

export interface DriverPropertyDescriptor {
  id: string;
  key: string;
  label: string;
  description?: string;
  type: DriverPropertyType;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  validationRegex?: string;
  validationMessage?: string;
  options?: DriverPropertyOption[];
}

export interface ConnectionTemplate {
  host: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
  options?: Record<string, string>;
}

export interface DbDriverDescriptor {
  id: string;
  name: string;
  vendor: string;
  categories: DbDriverCategory[];
  shortDescription: string;
  accentGradient: string;
  iconGlyph?: string;
  tags: string[];
  defaultTemplate: ConnectionTemplate;
  connectivity: DriverConnectivity;
  features: DriverFeatures;
  popularityRank: number;
  docsUrl?: string;
  website?: string;
  connectionProperties?: DriverPropertyDescriptor[];
}
