import {ColumnType as KyselyColumnType, Generated} from "kysely";

export type SupportedDialect = 'postgres' | 'sqlite'

export type TimestampDefault = KyselyColumnType<Date, Date | string | undefined, Date | string | undefined>

export type NullableTimestampDefault = KyselyColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null | undefined
>
export type PriorityColumn = KyselyColumnType<number, number | undefined, number | undefined>

export interface BaseTable {
    id: Generated<number>
    priority: PriorityColumn
    deleted_at: NullableTimestampDefault
    created_at: TimestampDefault
}

// @Todo: UsersTable is just for testing, refactor it
export interface UsersTable extends BaseTable {
    name: string
    surname: string
    telephone_number: string
}

export interface DatabaseSchema {
    users: UsersTable
}

export enum ColumnType {
    // Maps to varchar(255) in Postgres and TEXT in SQLite
    STRING = 'string',
    INTEGER = 'integer',
    BOOLEAN = 'boolean',
    TIMESTAMP = 'timestamp',
    // Maps to jsonb in Postgres and TEXT in SQLite
    JSON = 'json',
    // Maps to text in both Postgres and SQLite
    TEXT = 'text',
}

export type ColumnSpec = {
    name: string
    type: ColumnType
    notNull?: boolean
    defaultSql?: string // raw SQL default, e.g. 'CURRENT_TIMESTAMP' or "'{}'::jsonb"
    unique?: boolean
}