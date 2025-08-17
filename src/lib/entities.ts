import {ColumnType, Generated} from "kysely";

export type SupportedDialect = 'postgres' | 'sqlite'

export type TimestampDefault = ColumnType<Date, Date | string | undefined, Date | string | undefined>

export type NullableTimestampDefault = ColumnType<
    Date | null,
    Date | string | null | undefined,
    Date | string | null | undefined
>
export type PriorityColumn = ColumnType<number, number | undefined, number | undefined>

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

// @Todo: implement enum ColumnType and use it in ColumnSpec

export type ColumnSpec = {
    name: string
    type: string // e.g. 'varchar(255)', 'boolean', 'integer', 'timestamp', 'timestamptz', 'jsonb'
    notNull?: boolean
    defaultSql?: string // raw SQL default, e.g. 'CURRENT_TIMESTAMP' or "'{}'::jsonb"
    unique?: boolean
}