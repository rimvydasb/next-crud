import {DatabaseSchema, SupportedDialect} from "./entities";
import {Kysely, sql} from "kysely";

export function ensureValidId(id: unknown): asserts id is number {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
        throw new Error('Invalid id: must be a finite number > 0')
    }
}

// Map a portable type for created_at
export function createdAtDefaultSql(): string {
    // Both Postgres and SQLite understand CURRENT_TIMESTAMP
    return 'CURRENT_TIMESTAMP'
}

// Map base id column by dialect
export function addIdColumn<T extends DatabaseSchema>(
    dialect: SupportedDialect,
    builder: ReturnType<Kysely<T>['schema']['createTable']>
) {
    if (dialect === 'postgres') {
        return builder.addColumn('id', 'bigserial', (col) => col.primaryKey())
    }
    // SQLite
    return builder.addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
}

// Create a unique index on priority in a portable way
export async function createUniquePriorityIndex<T extends DatabaseSchema>(
    db: Kysely<T>,
    tableName: keyof T
) {
    const indexName = `${String(tableName)}_priority_key`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS ${sql.raw(indexName)} ON ${sql.raw(
            String(tableName)
    )} (priority)`.execute(db)
}