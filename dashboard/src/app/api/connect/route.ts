import { NextRequest, NextResponse } from "next/server";
import { createConnection } from "../../../lib/datatalkMetaDb";
import { determineOptimalSample, generateSampleQuery, generateCountQuery, calculateSampleStats, type TableSchema } from "../../../lib/dataSampling";
import { logAuditEvent, getClientIp, getUserAgent } from "../../../lib/auditLog";
import { ConnectionPayload } from "../../../types/connection";
import { DirectConnectDriver, isDirectConnectDriver, normalizeConnectionPayload } from "../../../lib/connectionPayload";

type DbType = DirectConnectDriver;

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: 'event_name' | 'user_id' | 'properties' | 'timestamp';
  dataType: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mapping: ColumnMapping[];
}

interface ConnectRequest {
  connection: ConnectionPayload;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ipAddress = getClientIp(request.headers);
  const userAgent = getUserAgent(request.headers);
  let connectionId: string | undefined;

  try {
    const body = (await request.json()) as ConnectRequest;
    const { connection: rawConnection } = body;

    if (!rawConnection || !rawConnection.type || !rawConnection.host) {
      await logAuditEvent({
        action: 'database_connect',
        resourceType: 'database',
        resourceId: 'unknown',
        success: false,
        errorMessage: 'Invalid connection configuration',
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: "Invalid connection configuration" },
        { status: 400 }
      );
    }

    const connection = normalizeConnectionPayload(rawConnection);

    if (!isDirectConnectDriver(connection.type)) {
      await logAuditEvent({
        action: 'database_connect',
        resourceType: 'database',
        resourceId: `${connection.type}://${connection.host}:${connection.port}/${connection.database}`,
        success: false,
        errorMessage: `Driver ${connection.type} is not supported for direct connections yet`,
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { error: `Driver ${connection.type} is not supported for direct connections yet` },
        { status: 400 }
      );
    }

    const driverType: DirectConnectDriver = connection.type;

    // Log connection attempt
    await logAuditEvent({
      action: 'database_connect',
      resourceType: 'database',
      resourceId: `${connection.type}://${connection.host}:${connection.port}/${connection.database}`,
      details: {
        type: driverType,
        host: connection.host,
        port: connection.port,
        database: connection.database,
      },
      success: true,
      ipAddress,
      userAgent,
    });

    // Step 1: Call datatalk-agent to discover schema
    const agentUrl = process.env.DATATALK_AGENT_URL || "http://datatalk-agent:9010";
    const agentSecret = process.env.DATATALK_AGENT_SHARED_SECRET;

    const schemaRes = await fetch(`${agentUrl}/schema`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(agentSecret ? { "x-datatalk-agent-secret": agentSecret } : {}),
      },
      body: JSON.stringify({ connection }),
    });

    if (!schemaRes.ok) {
      const errorText = await schemaRes.text();
      throw new Error(`Schema discovery failed: ${errorText}`);
    }

    const schemaData = await schemaRes.json();
    const schema = schemaData.data;

    // Step 2: Find events table (or first table with timestamp-like column)
    const eventsTable = findEventsTable(schema);

    if (!eventsTable) {
      throw new Error("No suitable events table found in database");
    }

    // Step 2.5: Validate schema compatibility with ClickHouse
    const validation = validateSchemaCompatibility(eventsTable, schema);
    
    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[Connect API] Schema warnings:', validation.warnings);
    }

    // Step 3: Determine optimal sampling strategy
    const tableSchema: TableSchema = {
      name: eventsTable.name,
      columns: eventsTable.columns.map((col: string) => ({
        name: col,
        type: 'unknown', // Will be determined from schema
      })),
    };

    // Get row count estimate
    const countQuery = generateCountQuery(driverType, eventsTable.name);
    const countResult = await executeAgentQuery(connection, countQuery, agentUrl, agentSecret);
    const estimatedRows = countResult.rows[0]?.[0] || 10000;

    // Determine sampling strategy
    const samplingStrategy = determineOptimalSample(tableSchema, estimatedRows);
    
    console.log('[Connect API] Sampling strategy:', {
      method: samplingStrategy.method,
      sampleSize: samplingStrategy.sampleSize,
      estimatedRows,
    });

    // Log sampling decision
    await logAuditEvent({
      action: 'schema_discover',
      resourceType: 'table',
      resourceId: eventsTable.name,
      details: {
        estimatedRows,
        samplingMethod: samplingStrategy.method,
        sampleSize: samplingStrategy.sampleSize,
      },
      success: true,
      ipAddress,
      userAgent,
    });

    // Step 4: Load SAMPLED data from discovered table into ClickHouse
    const loadResult = await loadDataIntoClickHouse(
      connection, 
      eventsTable, 
      validation.mapping,
      samplingStrategy,
      tableSchema,
      agentUrl, 
      agentSecret
    );
    
    if (!loadResult.success) {
      await logAuditEvent({
        action: 'database_connect',
        resourceType: 'database',
        resourceId: `${connection.type}://${connection.host}/${connection.database}`,
        success: false,
        errorMessage: loadResult.error,
        ipAddress,
        userAgent,
      });
      throw new Error(`Data loading failed: ${loadResult.error}`);
    }

    // Calculate sample statistics
    const sampleStats = calculateSampleStats(
      estimatedRows,
      loadResult.rowsLoaded,
      samplingStrategy.method
    );

    // Step 5: Save connection to metadata DB
    const savedConnection = await createConnection({
      name: `${driverType} - ${connection.database}`,
      type: driverType,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.user,
      password: connection.password,
    });

    connectionId = savedConnection.id;

    // Log successful connection
    await logAuditEvent({
      action: 'database_connect',
      resourceType: 'database',
      resourceId: savedConnection.id,
      details: {
        connectionName: savedConnection.name,
        table: eventsTable.name,
        rowsLoaded: loadResult.rowsLoaded,
        estimatedTotal: estimatedRows,
        samplingMethod: samplingStrategy.method,
        sampleRate: sampleStats.sampleRate,
        accuracy: sampleStats.estimatedAccuracy,
        duration: Date.now() - startTime,
      },
      success: true,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      connectionId: savedConnection.id,
      connectionName: savedConnection.name,
      discoveredTable: eventsTable.name,
      rowsLoaded: loadResult.rowsLoaded,
      estimatedTotal: estimatedRows,
      samplingMethod: samplingStrategy.method,
      sampleStats,
    });
  } catch (error) {
    console.error("[Connect API] Error:", error);
    
    // Log error
    await logAuditEvent({
      action: 'database_connect',
      resourceType: 'database',
      resourceId: connectionId || 'unknown',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Connection failed',
      details: {
        duration: Date.now() - startTime,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 500 }
    );
  }
}

function findEventsTable(schema: any): { name: string; columns: string[] } | null {
  const columns = schema.columns || [];
  
  // Group columns by table
  const tables = new Map<string, string[]>();
  for (const col of columns) {
    const tableName = col.table || col.table_name;
    if (!tableName) continue;
    
    if (!tables.has(tableName)) {
      tables.set(tableName, []);
    }
    tables.get(tableName)!.push(col.name || col.column_name);
  }

  // Look for table with event-like columns
  for (const [tableName, cols] of tables.entries()) {
    const lowerCols = cols.map(c => c.toLowerCase());
    
    // Check if table has timestamp/datetime and event_name or similar
    const hasTimestamp = lowerCols.some(c => 
      c.includes("timestamp") || c.includes("created") || c.includes("date")
    );
    const hasEventName = lowerCols.some(c => 
      c.includes("event") || c.includes("action") || c.includes("type")
    );
    
    if (hasTimestamp && hasEventName) {
      return { name: tableName, columns: cols };
    }
  }

  // Fallback: return first table with timestamp
  for (const [tableName, cols] of tables.entries()) {
    const lowerCols = cols.map(c => c.toLowerCase());
    const hasTimestamp = lowerCols.some(c => 
      c.includes("timestamp") || c.includes("created") || c.includes("date")
    );
    
    if (hasTimestamp) {
      return { name: tableName, columns: cols };
    }
  }

  return null;
}

function validateSchemaCompatibility(
  table: { name: string; columns: string[] },
  schema: any
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    mapping: [],
  };

  const columns = schema.columns || [];
  const tableColumns = columns.filter((c: any) => 
    (c.table || c.table_name) === table.name
  );

  // Find required mappings
  let eventNameCol = tableColumns.find((c: any) => {
    const name = (c.name || c.column_name || '').toLowerCase();
    return name.includes('event') || name.includes('action') || name.includes('type');
  });

  let timestampCol = tableColumns.find((c: any) => {
    const name = (c.name || c.column_name || '').toLowerCase();
    return name.includes('timestamp') || name.includes('created') || name.includes('date');
  });

  let userIdCol = tableColumns.find((c: any) => {
    const name = (c.name || c.column_name || '').toLowerCase();
    return name.includes('user') && name.includes('id');
  });

  // Validate required columns
  if (!timestampCol) {
    result.valid = false;
    result.errors.push('No timestamp column found - required for events table');
  } else {
    const tsType = (timestampCol.type || timestampCol.data_type || '').toLowerCase();
    if (!tsType.includes('timestamp') && !tsType.includes('datetime') && !tsType.includes('date')) {
      result.warnings.push(`Timestamp column '${timestampCol.name}' has type '${tsType}' - may need conversion`);
    }
    result.mapping.push({
      sourceColumn: timestampCol.name || timestampCol.column_name,
      targetColumn: 'timestamp',
      dataType: timestampCol.type || timestampCol.data_type,
    });
  }

  if (!eventNameCol) {
    result.warnings.push('No event_name column found - will use default value');
  } else {
    result.mapping.push({
      sourceColumn: eventNameCol.name || eventNameCol.column_name,
      targetColumn: 'event_name',
      dataType: eventNameCol.type || eventNameCol.data_type,
    });
  }

  if (!userIdCol) {
    result.warnings.push('No user_id column found - will use "anonymous"');
  } else {
    result.mapping.push({
      sourceColumn: userIdCol.name || userIdCol.column_name,
      targetColumn: 'user_id',
      dataType: userIdCol.type || userIdCol.data_type,
    });
  }

  // All other columns go to properties
  const mappedCols = new Set(result.mapping.map(m => m.sourceColumn));
  const propertyCols = tableColumns.filter((c: any) => {
    const colName = c.name || c.column_name;
    return !mappedCols.has(colName);
  });

  if (propertyCols.length > 0) {
    result.mapping.push({
      sourceColumn: `${propertyCols.length} columns`,
      targetColumn: 'properties',
      dataType: 'JSON',
    });
  }

  return result;
}

// Helper to execute query via agent
async function executeAgentQuery(
  connection: ConnectionPayload,
  sql: string,
  agentUrl: string,
  agentSecret?: string
): Promise<{ rows: any[][]; columns: string[] }> {
  const queryRes = await fetch(`${agentUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(agentSecret ? { "x-datatalk-agent-secret": agentSecret } : {}),
    },
    body: JSON.stringify({
      connection,
      sql,
      role: "admin",
      maxRows: 100000,
    }),
  });

  if (!queryRes.ok) {
    const errorText = await queryRes.text();
    throw new Error(`Query failed: ${errorText}`);
  }

  const queryData = await queryRes.json();
  return {
    rows: queryData.data?.rows || [],
    columns: queryData.data?.columns || [],
  };
}

async function loadDataIntoClickHouse(
  connection: ConnectionPayload,
  table: { name: string; columns: string[] },
  columnMapping: ColumnMapping[],
  samplingStrategy: any,
  tableSchema: TableSchema,
  agentUrl: string,
  agentSecret?: string
): Promise<{ success: boolean; rowsLoaded: number; error?: string }> {
  // Generate sampling query
  const sql = generateSampleQuery(
    connection.type as DbType,
    table.name,
    samplingStrategy,
    tableSchema
  );
  
  const queryRes = await fetch(`${agentUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(agentSecret ? { "x-datatalk-agent-secret": agentSecret } : {}),
    },
    body: JSON.stringify({
      connection,
      sql,
      role: "admin",
      maxRows: 1000,
    }),
  });

  if (!queryRes.ok) {
    const errorText = await queryRes.text();
    return { success: false, rowsLoaded: 0, error: `Query failed: ${errorText}` };
  }

  const queryData = await queryRes.json();
  const rows = queryData.data?.rows || [];
  const columns = queryData.data?.columns || [];

  if (rows.length === 0) {
    return { success: true, rowsLoaded: 0 };
  }

  // Use validated column mapping
  const eventNameMapping = columnMapping.find(m => m.targetColumn === 'event_name');
  const timestampMapping = columnMapping.find(m => m.targetColumn === 'timestamp');
  const userIdMapping = columnMapping.find(m => m.targetColumn === 'user_id');

  const eventNameCol = eventNameMapping ? columns.indexOf(eventNameMapping.sourceColumn) : -1;
  const timestampCol = timestampMapping ? columns.indexOf(timestampMapping.sourceColumn) : -1;
  const userIdCol = userIdMapping ? columns.indexOf(userIdMapping.sourceColumn) : -1;

  if (timestampCol < 0) {
    return { success: false, rowsLoaded: 0, error: 'Timestamp column not found in query results' };
  }

  // Validate data before insert
  let validRows = 0;
  const insertValues = rows.map((row: any[]) => {
    try {
      const eventName = eventNameCol >= 0 ? String(row[eventNameCol] || "event") : "event";
      const userId = userIdCol >= 0 ? String(row[userIdCol] || "anonymous") : "anonymous";
      const timestamp = timestampCol >= 0 ? row[timestampCol] : new Date().toISOString();
      
      // Validate timestamp format
      const tsDate = new Date(timestamp);
      if (isNaN(tsDate.getTime())) {
        console.warn(`[Connect API] Invalid timestamp: ${timestamp}`);
        return null;
      }
      
      // Collect remaining columns as properties JSON
      const properties: Record<string, any> = {};
      columns.forEach((col: string, idx: number) => {
        if (idx !== eventNameCol && idx !== timestampCol && idx !== userIdCol) {
          properties[col] = row[idx];
        }
      });

      validRows++;
      return `('${escapeSql(eventName)}', '${escapeSql(userId)}', '${escapeSql(JSON.stringify(properties))}', '${escapeSql(String(timestamp))}')`;  
    } catch (err) {
      console.error('[Connect API] Row mapping error:', err);
      return null;
    }
  }).filter((v: string | null): v is string => v !== null).join(",");

  if (!insertValues) {
    return { success: true, rowsLoaded: 0 };
  }

  // Insert into ClickHouse
  const clickhouseHost = process.env.CLICKHOUSE_HOST || "storage";
  const clickhousePort = process.env.CLICKHOUSE_PORT || "8123";
  try {
    const insertSql = `INSERT INTO analytics.events (event_name, user_id, properties, timestamp) VALUES ${insertValues}`;
    
    const insertRes = await fetch(`http://${clickhouseHost}:${clickhousePort}/?database=analytics`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: insertSql,
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      return { success: false, rowsLoaded: 0, error: `ClickHouse insert failed: ${errorText}` };
    }

    // Verify insert success
    const verifyRes = await fetch(`http://${clickhouseHost}:${clickhousePort}/?database=analytics&query=SELECT COUNT(*) as count FROM analytics.events`);
    if (verifyRes.ok) {
      const verifyText = await verifyRes.text();
      console.log(`[Connect API] ClickHouse verification: ${verifyText}`);
    }

    return { success: true, rowsLoaded: validRows };
  } catch (err) {
    return { 
      success: false, 
      rowsLoaded: 0, 
      error: err instanceof Error ? err.message : 'Unknown error during ClickHouse insert' 
    };
  }
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''").replace(/\\/g, "\\\\");
}
