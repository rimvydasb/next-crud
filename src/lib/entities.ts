// ----- Dialect tags we support
import {ColumnType, Generated} from "kysely";

export type SupportedDialect = 'postgres' | 'sqlite'
// ----- ColumnType helpers so inserts can omit defaults
export type TimestampDefault = ColumnType<Date, Date | string | undefined, Date | string | undefined>
export type NullableTimestampDefault = ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null | undefined
>
export type PriorityColumn = ColumnType<number, number | undefined, number | undefined>

// ----- Base table contract (no updated_at)
export interface BaseTable {
    id: Generated<number>
    priority: PriorityColumn
    deleted_at: NullableTimestampDefault
    created_at: TimestampDefault
} // ----- Column specification understood by the repo
// ----- Example table definition
export interface UsersTable extends BaseTable {
    name: string
    surname: string
    telephone_number: string
}

export interface DatabaseSchema {
    users: UsersTable
}

export type ColumnSpec = {
    name: string
    type: string // e.g. 'varchar(255)', 'boolean', 'integer', 'timestamp', 'timestamptz', 'jsonb'
    notNull?: boolean
    defaultSql?: string // raw SQL default, e.g. 'CURRENT_TIMESTAMP' or "'{}'::jsonb"
    unique?: boolean
}