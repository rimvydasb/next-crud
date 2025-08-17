import type {NextApiRequest, NextApiResponse} from 'next'
import {Kysely, SqliteDialect} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import {DatabaseSchema} from '@datalayer/entities'
import {JSONTableDataHandler} from '@servicelayer/JSONTableDataHandler'
import {DashboardConfigurationTable, DashboardConfiguration} from '@datalayer/_tests/DashboardConfigurationTable'

// Helper to create mock Next.js request/response objects
function createMock(method: string, body: any = {}, query: any = {}) {
    const req = {method, body, query} as unknown as NextApiRequest
    const res: any = {
        statusCode: 0,
        data: undefined as any,
        status(code: number) {
            this.statusCode = code
            return this
        },
        json(payload: any) {
            this.data = payload
            return this
        },
        end() {
            return this
        },
        setHeader() {
            /* no-op for tests */
        },
        statusMessage: '',
    }
    return {req, res: res as NextApiResponse}
}

let db: Kysely<DatabaseSchema>

class DashboardHandler extends JSONTableDataHandler<'dashboard_configuration', DashboardConfiguration> {
    protected getDb(): Promise<Kysely<DatabaseSchema>> {
        return Promise.resolve(db)
    }

    protected async getTable(): Promise<DashboardConfigurationTable> {
        const repo = new DashboardConfigurationTable(await this.getDb())
        await repo.ensureSchema()
        return repo
    }
}

describe('JSONTableDataHandler CRUD flow', () => {
    beforeEach(() => {
        const sqlite = new BetterSqlite3(':memory:')
        db = new Kysely<DatabaseSchema>({dialect: new SqliteDialect({database: sqlite})})
    })

    afterEach(async () => {
        await db.destroy()
    })

    test('creates a dashboard configuration', async () => {
        expect.assertions(3)
        const {req, res} = createMock('POST', {
            type: 'DASHBOARD',
            title: 'Main',
            description: 'example',
            panelsIds: [],
            variables: {},
        })
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const created = (res as any).data[0] as DashboardConfiguration
        expect(created).toMatchObject({title: 'Main'})

        const repo = new DashboardConfigurationTable(db)
        await repo.ensureSchema()
        const inDb = await repo.getByIdWithContent(created.id!)
        expect(inDb?.title).toBe('Main')
    })

    test('fetches a dashboard configuration', async () => {
        expect.assertions(2)
        const repo = new DashboardConfigurationTable(db)
        await repo.ensureSchema()
        const created = await repo.createWithContent({
            type: 'DASHBOARD',
            title: 'Dash',
            description: 'd',
            panelsIds: [],
            variables: {},
        })

        const {req, res} = createMock('GET', undefined, {id: String(created.id)})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        expect((res as any).data[0]).toMatchObject({id: created.id, title: 'Dash'})
    })

    test('updates a dashboard configuration', async () => {
        expect.assertions(3)
        const repo = new DashboardConfigurationTable(db)
        await repo.ensureSchema()
        const created = await repo.createWithContent({
            type: 'DASHBOARD',
            title: 'Old',
            description: 'before',
            panelsIds: [],
            variables: {},
        })

        const {req, res} = createMock('PATCH', {id: created.id, description: 'after'})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const updated = await repo.getByIdWithContent(created.id!)
        expect(updated?.description).toBe('after')
        expect((res as any).data[0].description).toBe('after')
    })

    test('deletes a dashboard configuration', async () => {
        expect.assertions(3)
        const repo = new DashboardConfigurationTable(db)
        await repo.ensureSchema()
        const created = await repo.createWithContent({
            type: 'DASHBOARD',
            title: 'ToDelete',
            description: 'd',
            panelsIds: [],
            variables: {},
        })

        const {req, res} = createMock('DELETE', {id: created.id})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const deleted = await repo.getByIdWithContent(created.id!)
        expect(deleted).toBeUndefined()
        expect((res as any).data[0].id).toBe(created.id)
    })
})

