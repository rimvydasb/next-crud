import {Kysely} from 'kysely'
import {BaseHandler, ErrorCode, ResponseError} from './BaseHandler'
import {AbstractJSONRepository} from '@datalayer/AbstractJSONRepository'
import {IJSONContent} from '@datalayer/IJSONContent'
import {ensureValidId} from '@datalayer/utilities'

/**
 * REST handler for tables based on {@link AbstractJSONRepository}. Works similarly
 * to {@link BaseTableDataHandler} but operates on JSON content objects.
 */
export abstract class JSONTableDataHandler<
    DST,
    TableName extends keyof DST & string,
    Content extends IJSONContent,
> extends BaseHandler<Content[]> {
    /**
     * Subclasses must return a repository instance for the table they manage.
     */
    protected abstract getTable(): Promise<AbstractJSONRepository<DST, TableName, Content>>

    /**
     * Subclasses must return the Kysely instance used for database operations.
     */
    protected abstract getDb(): Promise<Kysely<DST>>

    // ----- GET: fetch list or single row by id
    protected async get(params: Record<string, string>): Promise<void> {
        const table = await this.getTable()

        if (params['id'] !== undefined) {
            const id = Number(params['id'])
            if (!Number.isInteger(id)) {
                throw new ResponseError(ErrorCode.BAD_REQUEST, 'Invalid id')
            }

            const row = await table.getByIdWithContent(id)
            if (row) {
                this.ok(await this.postGet([row]))
            } else {
                this.error(ErrorCode.NOT_FOUND)
            }
            return
        }

        const list = await table.listWithContent()
        this.ok(await this.postGet(list))
    }

    // ----- POST: create new content row
    protected async post(body: Content): Promise<void> {
        const table = await this.getTable()
        const created = await table.createWithContent(body)
        await this.postProcess(await this.getDb())
        this.ok([created])
    }

    // ----- PATCH: update existing content or priority
    protected async patch(body: Partial<Content> & {id: number}): Promise<void> {
        const table = await this.getTable()
        ensureValidId(body.id)

        let updated: Content | undefined
        if (
            typeof (body as any).priority === 'number' &&
            Object.keys(body).length === 2
        ) {
            await table.updatePriority(body.id, (body as any).priority)
            updated = await table.getByIdWithContent(body.id)
        } else {
            const {id, ...rest} = body as any
            updated = await table.updateWithContent(id, rest)
        }

        if (updated) {
            await this.postProcess(await this.getDb())
            this.ok([updated])
        } else {
            this.error(ErrorCode.NOT_FOUND)
        }
    }

    // ----- DELETE: soft delete
    protected async delete(body: {id: number}): Promise<void> {
        const table = await this.getTable()
        ensureValidId(body.id)

        const deleted = await table.delete(body.id)
        if (deleted) {
            await this.postProcess(await this.getDb())
            const content = await table.getByIdWithContent(body.id, {includeDeleted: true})
            if (content) {
                this.ok([content])
            } else {
                this.ok([])
            }
        } else {
            this.error(ErrorCode.NOT_FOUND)
        }
    }

    // ----- Hooks for subclasses -------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async postProcess(db: Kysely<DST>): Promise<void> {
        // Default: no-op
    }

    protected async postGet(result: Content[]): Promise<Content[]> {
        return result
    }
}

