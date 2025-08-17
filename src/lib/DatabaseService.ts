import {Kysely} from 'kysely'
import {DatabaseSchema, SupportedDialect} from './entities'
import {ISQLApi, createInstance} from './sqlapi/ISQLApi'

/**
 * DatabaseService - singleton access to Kysely instance
 */
export class DatabaseService {
    private static instance: Kysely<DatabaseSchema> | null = null

    private static _dialect: SupportedDialect
    private static _sqlApi: ISQLApi | null = null

    /** Return the current SQL dialect. Throws if database not initialized. */
    public static get dialect(): SupportedDialect {
        if (!this.instance) {
            throw new Error('DatabaseService not initialized')
        }
        return this._dialect
    }

    /** Return SQL API instance. Throws if database not initialized. */
    public static get sqlApi(): ISQLApi {
        if (!this.instance || !this._sqlApi) {
            throw new Error('DatabaseService not initialized')
        }
        return this._sqlApi
    }

    /** Get or create the shared Kysely instance. */
    public static async getInstance(): Promise<Kysely<DatabaseSchema>> {
        if (this.instance) return this.instance

        const url = process.env.DATABASE_URL
        if (!url) {
            throw new Error('DATABASE_URL not configured')
        }

        const {db, dialect, api} = await createInstance(url)
        this.instance = db
        this._dialect = dialect
        this._sqlApi = api

        return this.instance
    }

    /** Destroy the shared Kysely instance (useful for tests). */
    public static async destroy(): Promise<void> {
        if (this.instance) {
            await this.instance.destroy()
            this.instance = null
            // dialect and api will be re-initialized on next getInstance call
            this._sqlApi = null
        }
    }
}

