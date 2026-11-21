/** Ver ephemeral-schema.js. */
export declare const STALE_AFTER_MS: number;
export declare function ephemeralSchemaName(prefix: string): string;
export declare function ephemeralSchemaCreatedAt(name: string): number | null;
export declare function sweepStaleEphemeralSchemas(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ nspname: string }> }>;
  },
  now?: number,
): Promise<number>;
