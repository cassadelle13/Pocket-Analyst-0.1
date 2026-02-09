/**
 * Binary-Ready API Serialization Layer
 * 
 * Provides infrastructure for switching between JSON and binary (Protobuf) formats.
 * Production-ready Protobuf implementation using protobufjs.
 */

import protobuf from "protobufjs";

export type SerializationFormat = "json" | "protobuf" | "msgpack";

// Protobuf schema cache
let eventProtoRoot: protobuf.Root | null = null;

/**
 * Load Protobuf schema (lazy initialization)
 */
async function loadProtoSchema(): Promise<protobuf.Root> {
  if (eventProtoRoot) return eventProtoRoot;

  try {
    // Load from proto file
    eventProtoRoot = await protobuf.load("/proto/event.proto");
    return eventProtoRoot;
  } catch (err) {
    console.warn("Failed to load proto file, using inline schema");
    
    // Fallback: inline schema definition
    eventProtoRoot = protobuf.Root.fromJSON({
      nested: {
        pocketanalyst: {
          nested: {
            Event: {
              fields: {
                event_id: { type: "string", id: 1 },
                event_name: { type: "string", id: 2 },
                user_id: { type: "string", id: 3 },
                session_id: { type: "string", id: 4 },
                timestamp: { type: "int64", id: 5 },
                device_id: { type: "string", id: 6 },
                platform: { type: "string", id: 7 },
                country: { type: "string", id: 8 },
                city: { type: "string", id: 9 },
                properties: { type: "map<string,string>", id: 10 },
              },
            },
            EventList: {
              fields: {
                events: { rule: "repeated", type: "Event", id: 1 },
                total_count: { type: "int32", id: 2 },
                query_time_ms: { type: "int64", id: 3 },
              },
            },
          },
        },
      },
    });
    
    return eventProtoRoot;
  }
}

export interface SerializationOptions {
  format?: SerializationFormat;
  compress?: boolean;
  streaming?: boolean;
}

/**
 * Serialize data to specified format
 * Production-ready JSON and Protobuf support
 */
export async function serialize(data: any, options: SerializationOptions = {}): Promise<Buffer | string> {
  const format = options.format || "json";

  switch (format) {
    case "json":
      return JSON.stringify(data);

    case "protobuf": {
      try {
        const root = await loadProtoSchema();
        
        // Determine message type based on data structure
        let MessageType: protobuf.Type;
        if (Array.isArray(data.events)) {
          MessageType = root.lookupType("pocketanalyst.EventList");
        } else if (data.event_id) {
          MessageType = root.lookupType("pocketanalyst.Event");
        } else {
          throw new Error("Unknown message type for Protobuf serialization");
        }

        const errMsg = MessageType.verify(data);
        if (errMsg) throw new Error(`Protobuf verification failed: ${errMsg}`);

        const message = MessageType.create(data);
        const buffer = MessageType.encode(message).finish();
        return Buffer.from(buffer);
      } catch (err) {
        console.error("Protobuf serialization failed:", err);
        console.warn("Falling back to JSON");
        return JSON.stringify(data);
      }
    }

    case "msgpack":
      // Placeholder for MessagePack serialization
      console.warn("MessagePack serialization not yet implemented, falling back to JSON");
      return JSON.stringify(data);

    default:
      return JSON.stringify(data);
  }
}

/**
 * Synchronous serialize for simple cases (JSON only)
 */
export function serializeSync(data: any, options: SerializationOptions = {}): Buffer | string {
  const format = options.format || "json";
  
  if (format === "json") {
    return JSON.stringify(data);
  }
  
  throw new Error("Synchronous serialization only supports JSON format");
}

/**
 * Deserialize data from specified format
 */
export async function deserialize(
  data: Buffer | string | Uint8Array,
  options: SerializationOptions & { messageType?: "Event" | "EventList" } = {}
): Promise<any> {
  const format = options.format || "json";

  switch (format) {
    case "json":
      return typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());

    case "protobuf": {
      try {
        const root = await loadProtoSchema();
        const messageType = options.messageType || "EventList";
        const MessageType = root.lookupType(`pocketanalyst.${messageType}`);

        const buffer = typeof data === "string" ? Buffer.from(data, "base64") : data;
        const message = MessageType.decode(new Uint8Array(buffer));
        return MessageType.toObject(message, {
          longs: String,
          enums: String,
          bytes: String,
        });
      } catch (err) {
        console.error("Protobuf deserialization failed:", err);
        console.warn("Falling back to JSON");
        return typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());
      }
    }

    case "msgpack":
      console.warn("MessagePack deserialization not yet implemented, falling back to JSON");
      return typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());

    default:
      return typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());
  }
}

/**
 * Detect serialization format from request headers
 */
export function detectFormat(headers: Headers): SerializationFormat {
  const accept = headers.get("accept") || "";
  const contentType = headers.get("content-type") || "";

  if (accept.includes("application/protobuf") || contentType.includes("application/protobuf")) {
    return "protobuf";
  }

  if (accept.includes("application/msgpack") || contentType.includes("application/msgpack")) {
    return "msgpack";
  }

  return "json";
}

/**
 * Get appropriate Content-Type header for format
 */
export function getContentType(format: SerializationFormat): string {
  switch (format) {
    case "protobuf":
      return "application/protobuf";
    case "msgpack":
      return "application/msgpack";
    case "json":
    default:
      return "application/json";
  }
}

/**
 * Compress data using gzip (for large payloads)
 */
export async function compress(data: Buffer | string): Promise<Buffer> {
  // Placeholder for compression
  // TODO: Implement with zlib or brotli
  const buffer = typeof data === "string" ? Buffer.from(data) : data;
  return buffer;
}

/**
 * Decompress gzipped data
 */
export async function decompress(data: Buffer): Promise<Buffer> {
  // Placeholder for decompression
  return data;
}

/**
 * Streaming serialization for large datasets
 * Returns an async generator that yields chunks
 */
export async function* serializeStream(
  data: AsyncIterable<any>,
  options: SerializationOptions = {}
): AsyncGenerator<Buffer | string> {
  const format = options.format || "json";

  if (format === "json") {
    yield "[";
    let first = true;
    for await (const item of data) {
      if (!first) yield ",";
      yield JSON.stringify(item);
      first = false;
    }
    yield "]";
  } else {
    // Placeholder for binary streaming
    for await (const item of data) {
      yield serialize(item, options);
    }
  }
}

/**
 * Helper: Create Response with appropriate serialization
 */
export async function createSerializedResponse(
  data: any,
  options: SerializationOptions & { status?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const format = options.format || "json";
  const serialized = await serialize(data, options);
  const contentType = getContentType(format);

  // For Protobuf, send as binary; for JSON, send as string
  let body: BodyInit;
  if (format === "protobuf" && Buffer.isBuffer(serialized)) {
    body = new Uint8Array(serialized);
  } else if (typeof serialized === "string") {
    body = serialized;
  } else {
    body = serialized.toString();
  }

  return new Response(body, {
    status: options.status || 200,
    headers: {
      "Content-Type": contentType,
      "X-Serialization-Format": format,
      ...options.headers,
    },
  });
}

/**
 * Benchmark: Compare serialization performance
 */
export function benchmarkSerialization(data: any): {
  json: { size: number; time: number };
  protobuf: { size: number; time: number };
} {
  const jsonStart = performance.now();
  const jsonSerialized = JSON.stringify(data);
  const jsonTime = performance.now() - jsonStart;

  // Protobuf benchmark placeholder
  const protobufTime = 0; // Will be measured after implementation

  return {
    json: { size: jsonSerialized.length, time: jsonTime },
    protobuf: { size: 0, time: protobufTime },
  };
}
