import {SupportedDialect} from "./entities";
import {Kysely, PostgresAdapter, sql, SqliteAdapter} from "kysely";

export function detectDialect(db: Kysely<any>): SupportedDialect {
    const adapter = (db as any).getExecutor().adapter;
    if (adapter instanceof PostgresAdapter || adapter.constructor.name === 'PostgresAdapter' || adapter.dialect?.adapterName === 'postgres') return 'postgres';
    if (adapter instanceof SqliteAdapter || adapter.constructor.name === 'SqliteAdapter' || adapter.dialect?.adapterName === 'sqlite') return 'sqlite';
    throw new Error('Unsupported dialect for adapter: ' + adapter?.constructor?.name);
}

export function ensureValidId(id: unknown): asserts id is number {
    if (typeof id !== 'number' || !Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
        throw new Error('Invalid id: must be a finite integer > 0')
    }
}

// Map a portable type for created_at
export function createdAtDefaultSql(): string {
    // Both Postgres and SQLite understand CURRENT_TIMESTAMP
    return 'CURRENT_TIMESTAMP'
}

// Map base id column by dialect
export function addIdColumn(dialect: SupportedDialect, builder: ReturnType<Kysely<any>['schema']['createTable']>) {
    if (dialect === 'postgres') {
        // Use 'serial' for Postgres to ensure the id is mapped as a JavaScript number (32-bit integer).
        return builder.addColumn('id', 'serial', (col) => col.primaryKey())
    }
    // SQLite
    return builder.addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
}

// Create a non-unique index on priority in a portable way
export async function createPriorityIndex(db: Kysely<any>, tableName: string) {
    const indexName = `${String(tableName)}_priority_idx`
    await sql`CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} ON ${sql.raw(
            String(tableName)
    )} (priority)`.execute(db)
}