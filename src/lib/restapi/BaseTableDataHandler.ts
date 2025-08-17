import {Insertable, Kysely, Selectable, Updateable} from 'kysely'
import {AbstractTable} from '../AbstractTable'
import {DatabaseSchema} from '../entities'
import {ensureValidId} from '../utilities'
import {BaseHandler, ErrorCode, ResponseError} from './BaseHandler'

/**
 * Generic REST handler that wires HTTP verbs to repository operations
 * implemented by {@link AbstractTable}. Subclasses only need to provide
 * a repository instance via {@link getTable}.
 */
export abstract class BaseTableDataHandler<TableName extends keyof DatabaseSchema> extends BaseHandler<Array<Selectable<DatabaseSchema[TableName]>>> {

    /**
     * Subclasses must return a repository instance for the table they manage.
     * The repository is typically created using the Kysely instance from
     * {@link BaseHandler.db} and should have its schema ensured prior to use.
     */
    protected abstract getTable(): Promise<AbstractTable<TableName>>

    /**
     * Subclasses must return the Kysely instance used for database operations.
     * API user will usually manage db connection lifecycle
     */
    protected abstract getDb(): Promise<Kysely<DatabaseSchema>>

    // ----- GET: fetch list or single row by id
    protected async get(params: Record<string, string>): Promise<void> {
        const table = await this.getTable()

        if (params['id'] !== undefined) {
            const id = Number(params['id'])
            if (!Number.isInteger(id)) {
                throw new ResponseError(ErrorCode.BAD_REQUEST, 'Invalid id')
            }

            const row = await table.getById(id)
            if (row) {
                this.ok(await this.postGet([row]))
            } else {
                this.error(ErrorCode.NOT_FOUND)
            }
            return
        }

        const list = await table.list()
        this.ok(await this.postGet(list))
    }

    // ----- POST: create new row
    protected async post(body: Insertable<DatabaseSchema[TableName]>): Promise<void> {
        const table = await this.getTable()
        const created = await table.create(body)
        await this.postProcess(await this.getDb())
        this.ok([created])
    }

    // ----- PATCH: update existing row or priority
    protected async patch(
        body: Updateable<DatabaseSchema[TableName]> & { id: number }
    ): Promise<void> {
        const table = await this.getTable()
        ensureValidId(body.id)

        let updated
        if (
            typeof (body as any).priority === 'number' &&
            Object.keys(body).length === 2
        ) {
            updated = await table.updatePriority(body.id, (body as any).priority)
        } else {
            const {id, ...rest} = body as any
            updated = await table.update(id, rest)
        }

        if (updated) {
            await this.postProcess(await this.getDb())
            this.ok([updated])
        } else {
            this.error(ErrorCode.NOT_FOUND)
        }
    }

    // ----- DELETE: soft delete
    protected async delete(body: { id: number }): Promise<void> {
        const table = await this.getTable()
        ensureValidId(body.id)

        const deleted = await table.delete(body.id)
        if (deleted) {
            await this.postProcess(await this.getDb())
            this.ok([deleted])
        } else {
            this.error(ErrorCode.NOT_FOUND)
        }
    }

    // ----- Hooks for subclasses -------------------------------------------------

    /**
     * Optional hook executed after mutating operations (POST, PATCH, DELETE).
     * Subclasses can override to perform additional actions such as cache
     * invalidation.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async postProcess(db: Kysely<DatabaseSchema>): Promise<void> {
        // Default: no-op
    }

    /**
     * Optional hook executed before sending GET results to the client. Allows
     * subclasses to transform or filter the result set.
     */
    protected async postGet(
        result: Array<Selectable<DatabaseSchema[TableName]>>
    ): Promise<Array<Selectable<DatabaseSchema[TableName]>>> {
        return result
    }
}

