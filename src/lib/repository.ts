// Kysely generic repository (Postgres + SQLite)
// - No single-letter identifiers
// - Works with PostgreSQL and SQLite
// - Base columns: id, priority, deleted_at, created_at
// - CRUD, soft delete, hard delete, restore, stable updatePriority (shifts others)
// - ensureSchema() creates table, syncColumns() forward-adds newly declared columns

import {
  Kysely,
  Generated,
  ColumnType,
  Selectable,
  Insertable,
  Updateable,
  sql,
} from 'kysely'

// ----- Dialect tags we support
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
}

// ----- Example table definition
export interface UsersTable extends BaseTable {
  name: string
  surname: string
  telephone_number: string
}

export interface DatabaseSchema {
  users: UsersTable
}

// ----- Column specification understood by the repo
export type ColumnSpec = {
  name: string
  type: string // e.g. 'varchar(255)', 'boolean', 'integer', 'timestamp', 'timestamptz', 'jsonb'
  notNull?: boolean
  defaultSql?: string // raw SQL default, e.g. 'CURRENT_TIMESTAMP' or "'{}'::jsonb"
  unique?: boolean
}

function ensureValidId(id: unknown): asserts id is number {
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid id: must be a finite number > 0')
  }
}

// Map a portable type for created_at
function createdAtDefaultSql(): string {
  // Both Postgres and SQLite understand CURRENT_TIMESTAMP
  return 'CURRENT_TIMESTAMP'
}

// Map base id column by dialect
function addIdColumn<T extends DatabaseSchema>(
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
async function createUniquePriorityIndex<T extends DatabaseSchema>(
  db: Kysely<T>,
  tableName: keyof T
) {
  const indexName = `${String(tableName)}_priority_key`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS ${sql.raw(indexName)} ON ${sql.raw(
    String(tableName)
  )} (priority)`.execute(db)
}

// -----------------------------------------------------------------------------
// Generic repository
// -----------------------------------------------------------------------------
export abstract class AbstractTable<TableName extends keyof DatabaseSchema> {
  constructor(
    protected readonly database: Kysely<DatabaseSchema>,
    protected readonly tableName: TableName,
    protected readonly dialect: SupportedDialect
  ) {}

  // Access Kysely with relaxed typing for generic operations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get db(): Kysely<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.database as unknown as Kysely<any>
  }

  // Define table-specific extra columns in subclasses, in one place
  protected abstract extraColumns(): ColumnSpec[]

  // Create table if missing: base + extra columns
  async ensureSchema(): Promise<void> {
    let createBuilder = this.db.schema
      .createTable(this.tableName as string)
      .ifNotExists()

    createBuilder = addIdColumn(this.dialect, createBuilder)

    createBuilder = createBuilder
      .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('deleted_at', 'timestamp') // nullable
      .addColumn(
        'created_at',
        this.dialect === 'postgres' ? 'timestamp' : 'timestamp',
        (col) => col.notNull().defaultTo(sql.raw(createdAtDefaultSql()))
      )

    for (const column of this.extraColumns()) {
      createBuilder = createBuilder.addColumn(
        column.name,
        column.type as any,
        (col) => {
          if (column.notNull) col = col.notNull()
          if (column.unique) col = col.unique()
          if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
          return col
        }
      )
    }

    await createBuilder.execute()
    await createUniquePriorityIndex(this.db, this.tableName)
  }

  // Add any newly declared extra columns to an existing table (forward-only)
  async syncColumns(schemaName: string = 'public'): Promise<void> {
    let existingColumnNames: string[]

    if (this.dialect === 'postgres') {
      const rows = await sql<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = ${schemaName}
          AND table_name = ${this.tableName as string}
      `.execute(this.database)
      existingColumnNames = rows.rows.map((r) => r.column_name)
    } else {
      // SQLite
    const pragma = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(
        String(this.tableName)
      )});`.execute(this.db)
      existingColumnNames = pragma.rows.map((r) => r.name)
    }

    const existingColumnsSet = new Set(existingColumnNames)
    const columnsToAdd = this.extraColumns().filter(
      (column) => !existingColumnsSet.has(column.name)
    )

    if (columnsToAdd.length === 0) return

    for (const column of columnsToAdd) {
      await this.db.schema
        .alterTable(this.tableName as string)
        .addColumn(
          column.name,
          column.type as any,
          (col) => {
            // Note: adding NOT NULL to a non-empty table without default will fail
            if (column.notNull && column.defaultSql) col = col.notNull().defaultTo(sql.raw(column.defaultSql))
            else if (column.notNull) col = col.notNull()
            if (column.unique) col = col.unique()
            if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
            return col
          }
        )
        .execute()
    }
  }

  // ---- CRUD
  async create(values: Insertable<DatabaseSchema[TableName]>): Promise<Selectable<DatabaseSchema[TableName]>> {
    // RETURNING is supported by Postgres and SQLite >= 3.35; if your SQLite is older, upgrade.
    return (await this.database
      .insertInto(this.tableName)
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow()) as Selectable<DatabaseSchema[TableName]>
  }

  async getById(
    id: number,
    options: { includeDeleted?: boolean } = {}
  ): Promise<Selectable<DatabaseSchema[TableName]> | undefined> {
    ensureValidId(id)
    let query = this.db.selectFrom(this.tableName as string).selectAll().where('id', '=', id)
    if (!options.includeDeleted) query = query.where('deleted_at', 'is', null)
    return (await query.executeTakeFirst()) as Selectable<DatabaseSchema[TableName]> | undefined
  }

  async list(options: {
    includeDeleted?: boolean
    limit?: number
    offset?: number
    orderBy?: { column: keyof DatabaseSchema[TableName]; direction?: 'asc' | 'desc' }
  } = {}): Promise<Array<Selectable<DatabaseSchema[TableName]>>> {
    const { includeDeleted, limit = 50, offset = 0, orderBy } = options
    let query = this.db.selectFrom(this.tableName as string).selectAll()
    if (!includeDeleted) query = query.where('deleted_at', 'is', null)
    if (orderBy) query = query.orderBy(orderBy.column as string, orderBy.direction ?? 'asc')
    return (await query.limit(limit).offset(offset).execute()) as Array<Selectable<DatabaseSchema[TableName]>>
  }

  async update(
    id: number,
    patch: Updateable<DatabaseSchema[TableName]>
  ): Promise<Selectable<DatabaseSchema[TableName]> | undefined> {
    ensureValidId(id)
    return (await (this.db.updateTable(this.tableName) as any)
      .set(patch as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()) as Selectable<DatabaseSchema[TableName]> | undefined
  }

  // Soft delete
  async delete(id: number): Promise<Selectable<DatabaseSchema[TableName]> | undefined> {
    ensureValidId(id)
    return (await (this.db.updateTable(this.tableName) as any)
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` } as unknown as Updateable<DatabaseSchema[TableName]>)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst()) as Selectable<DatabaseSchema[TableName]> | undefined
  }

  async restore(id: number): Promise<Selectable<DatabaseSchema[TableName]> | undefined> {
    ensureValidId(id)
    return (await (this.db.updateTable(this.tableName) as any)
      .set({ deleted_at: null } as unknown as Updateable<DatabaseSchema[TableName]>)
      .where('id', '=', id)
      .where('deleted_at', 'is not', null)
      .returningAll()
      .executeTakeFirst()) as Selectable<DatabaseSchema[TableName]> | undefined
  }

  // Hard delete
  async permanentDelete(id: number): Promise<number> {
    ensureValidId(id)
      const result = await (this.db.deleteFrom(this.tableName) as any)
        .where('id', '=', id)
        .executeTakeFirst()
      return result?.numDeletedRows ? Number(result.numDeletedRows) : 0
  }

  /**
   * Move a row to the target priority. Keeps priorities unique by shifting others.
   * - If currentPriority < targetPriority: shift (current+1..target) down by 1
   * - If currentPriority > targetPriority: shift (target..current-1) up by 1
   */
  async updatePriority(
    id: number,
    targetPriority: number
  ): Promise<Selectable<DatabaseSchema[TableName]>> {
    ensureValidId(id)

    if (!Number.isInteger(targetPriority) || targetPriority < 0) {
      throw new Error('Invalid target priority: must be an integer >= 0')
    }

    return (await this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom(this.tableName as string)
        .select(['id', 'priority'])
        .where('id', '=', id)
        .executeTakeFirst()

      if (!current) throw new Error(`Row not found for id=${id}`)

      const currentPriority = Number(current.priority)
      if (currentPriority === targetPriority) {
        return (await trx
          .selectFrom(this.tableName as string)
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow()) as Selectable<DatabaseSchema[TableName]>
      }

      if (currentPriority < targetPriority) {
        await (trx.updateTable(this.tableName as string) as any)
          .set({ priority: sql`priority - 1` } as unknown as Updateable<DatabaseSchema[TableName]>)
          .where('priority', '>', currentPriority)
          .where('priority', '<=', targetPriority)
          .execute()
      } else {
        await (trx.updateTable(this.tableName as string) as any)
          .set({ priority: sql`priority + 1` } as unknown as Updateable<DatabaseSchema[TableName]>)
          .where('priority', '>=', targetPriority)
          .where('priority', '<', currentPriority)
          .execute()
      }

      const updated = await (trx.updateTable(this.tableName as string) as any)
        .set({ priority: targetPriority } as unknown as Updateable<DatabaseSchema[TableName]>)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow()

      return updated as Selectable<DatabaseSchema[TableName]>
    })) as Selectable<DatabaseSchema[TableName]>
  }
}

// -----------------------------------------------------------------------------
// Example repository: Users (define extra columns here only)
// -----------------------------------------------------------------------------
export class UsersRepository extends AbstractTable<'users'> {
  constructor(database: Kysely<DatabaseSchema>, dialect: SupportedDialect) {
    super(database, 'users', dialect)
  }

  protected extraColumns(): ColumnSpec[] {
    const textType = this.dialect === 'postgres' ? 'varchar(255)' : 'text'
    return [
      { name: 'name', type: textType, notNull: true },
      { name: 'surname', type: textType, notNull: true },
      { name: 'telephone_number', type: textType, notNull: true },
    ]
  }
}

// -----------------------------------------------------------------------------
// Example of initializing Kysely with either Postgres or SQLite
// -----------------------------------------------------------------------------
// Postgres example:
// import { Pool } from 'pg'
// const postgresDb = new Kysely<DatabaseSchema>({
//   dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
// })
// const usersPg = new UsersRepository(postgresDb, 'postgres')
// await usersPg.ensureSchema()
// SQLite example (better-sqlite3):
// import BetterSqlite3 from 'better-sqlite3'
// const sqliteDb = new Kysely<DatabaseSchema>({
//   dialect: new SqliteDialect({ database: new BetterSqlite3('app.db') }),
// })
// const usersSqlite = new UsersRepository(sqliteDb, 'sqlite')
// await usersSqlite.ensureSchema()
