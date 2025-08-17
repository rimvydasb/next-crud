import {Kysely, PostgresDialect, SqliteDialect} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import {Pool} from 'pg'
import {DatabaseSchema, SupportedDialect} from './entities'

/**
 * DatabaseService - singleton access to Kysely instance
 */
export class DatabaseService {
    private static instance: Kysely<DatabaseSchema> | null = null

    private static _dialect: SupportedDialect

    /** Return the current SQL dialect. Throws if database not initialized. */
    public static get dialect(): SupportedDialect {
        if (!this.instance) {
            throw new Error('DatabaseService not initialized')
        }
        return this._dialect
    }

    /** Get or create the shared Kysely instance. */
    public static async getInstance(): Promise<Kysely<DatabaseSchema>> {
        if (this.instance) return this.instance

        const url = process.env.DATABASE_URL
        if (!url) {
            throw new Error('DATABASE_URL not configured')
        }

        // @Todo: move it under ISQLApi.ts createInstance method
        if (url.startsWith('sqlite://')) {
            const filename = url.replace('sqlite://', '')
            const sqlite = new BetterSqlite3(filename)
            this.instance = new Kysely<DatabaseSchema>({
                dialect: new SqliteDialect({database: sqlite}),
            })
            this._dialect = 'sqlite'
        } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
            const pool = new Pool({connectionString: url})
            this.instance = new Kysely<DatabaseSchema>({
                dialect: new PostgresDialect({pool}),
            })
            this._dialect = 'postgres'
        } else {
            throw new Error(`Unsupported DATABASE_URL: ${url}`)
        }

        return this.instance
    }

    /** Destroy the shared Kysely instance (useful for tests). */
    public static async destroy(): Promise<void> {
        if (this.instance) {
            await this.instance.destroy()
            this.instance = null
            // dialect will be re-initialized on next getInstance call
        }
    }
}

