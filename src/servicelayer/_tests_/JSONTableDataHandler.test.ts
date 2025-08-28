import {Kysely} from 'kysely'
import {createTestDb, DatabaseSchema} from '@datalayer/_tests_/testUtils'
import {JSONTableDataHandler} from '@servicelayer/JSONTableDataHandler'
import {createMock, DashboardConfiguration, DashboardConfigurationRepository} from "@datalayer/_tests_/testUtils";

let db: Kysely<DatabaseSchema>

class DashboardHandler extends JSONTableDataHandler<DatabaseSchema, 'dashboard_configuration', DashboardConfiguration> {
    protected getDb(): Promise<Kysely<DatabaseSchema>> {
        return Promise.resolve(db)
    }

    protected async getTable(): Promise<DashboardConfigurationRepository> {
        const repo = new DashboardConfigurationRepository(await this.getDb())
        await repo.ensureSchema()
        return repo
    }
}

describe('JSONTableDataHandler CRUD flow', () => {
    beforeEach(async () => {
        db = await createTestDb()
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

        const repo = new DashboardConfigurationRepository(db)
        await repo.ensureSchema()
        const inDb = await repo.jsonGetById(created.id!)
        expect(inDb?.title).toBe('Main')
    })

    test('fetches a dashboard configuration', async () => {
        expect.assertions(2)
        const repo = new DashboardConfigurationRepository(db)
        await repo.ensureSchema()
        const created = await repo.jsonCreate({
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
        const repo = new DashboardConfigurationRepository(db)
        await repo.ensureSchema()
        const created = await repo.jsonCreate({
            type: 'DASHBOARD',
            title: 'Old',
            description: 'before',
            panelsIds: [],
            variables: {},
        })

        const {req, res} = createMock('PATCH', {id: created.id, description: 'after'})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const updated = await repo.jsonGetById(created.id!)
        expect(updated?.description).toBe('after')
        expect((res as any).data[0].description).toBe('after')
    })

    test('deletes a dashboard configuration', async () => {
        expect.assertions(3)
        const repo = new DashboardConfigurationRepository(db)
        await repo.ensureSchema()
        const created = await repo.jsonCreate({
            type: 'DASHBOARD',
            title: 'ToDelete',
            description: 'd',
            panelsIds: [],
            variables: {},
        })

        const {req, res} = createMock('DELETE', {id: created.id})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const deleted = await repo.jsonGetById(created.id!)
        expect(deleted).toBeUndefined()
        expect((res as any).data[0].id).toBe(created.id)
    })

    test('lists configurations by type', async () => {
        expect.assertions(2)
        const repo = new DashboardConfigurationRepository(db)
        await repo.ensureSchema()
        await repo.jsonCreate({
            type: 'DASHBOARD',
            title: 'One',
            description: 'd1',
            panelsIds: [],
            variables: {},
        })
        await repo.jsonCreate({
            type: 'DASHBOARD',
            title: 'Two',
            description: 'd2',
            panelsIds: [],
            variables: {},
        })
        const {req, res} = createMock('GET', undefined, {type: 'DASHBOARD'})
        await new DashboardHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        expect((res as any).data).toHaveLength(2)
    })
})

