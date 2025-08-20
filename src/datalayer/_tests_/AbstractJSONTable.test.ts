import {Kysely} from 'kysely';
import {
    createTestDb,
    DashboardConfiguration,
    DashboardConfigurationRepository,
    DatabaseSchema
} from "@datalayer/_tests_/testUtils";

describe('AbstractJSONTable', () => {
    let db: Kysely<DatabaseSchema>
    let repository: DashboardConfigurationRepository

    beforeEach(async () => {
        db = await createTestDb()
        repository = new DashboardConfigurationRepository(db)
        await repository.ensureSchema()
    })

    afterEach(async () => {
        await db.destroy()
    })

    test('create and read JSON content', async () => {
        const config: DashboardConfiguration = {
            type: 'DASHBOARD',
            title: 'Main dashboard',
            description: 'example',
            panelsIds: [1, 2],
            variables: {foo: 'bar'},
        }
        const created = await repository.createWithContent(config)
        expect(created.id).toBeDefined()
        expect(created).toMatchObject({...config, priority: created.id})

        const fetched = await repository.getByIdWithContent(created.id!)
        expect(fetched).toEqual(created)
    })

    test('create with explicit priority', async () => {
        const config: DashboardConfiguration = {
            type: 'DASHBOARD',
            title: 'With priority',
            description: 'example',
            panelsIds: [],
            variables: {},
            priority: 5,
        }
        const created = await repository.createWithContent(config)
        expect(created).toMatchObject(config)
        expect(created.id).toBeDefined()
        expect(created.id).not.toBe(config.priority)
    })

    test('listWithContent returns all rows', async () => {
        const configs: DashboardConfiguration[] = [
            {type: 'DASHBOARD', title: 'One', description: 'd1', panelsIds: [], variables: {}, priority: 0},
            {type: 'DASHBOARD', title: 'Two', description: 'd2', panelsIds: [], variables: {}, priority: 1},
        ]
        for (const c of configs) {
            await repository.createWithContent(c)
        }
        const list = await repository.listWithContent({orderBy: {column: 'id'}})
        expect(list).toHaveLength(2)
        expect(list.map(c => c.title)).toEqual(['One', 'Two'])
    })

    test('updateWithContent merges JSON and updates fields', async () => {
        const config: DashboardConfiguration = {
            type: 'DASHBOARD',
            title: 'Main',
            description: 'old',
            panelsIds: [],
            variables: {},
        }
        const created = await repository.createWithContent(config)
        const updated = await repository.updateWithContent(created.id!, {
            description: 'new',
            priority: 5,
        })
        expect(updated).toMatchObject({
            ...config,
            description: 'new',
            priority: 5,
        })
    })

    test('throws on missing type', async () => {
        await expect(
            // @ts-expect-error intentionally missing type
            repository.createWithContent({title: 't', description: 'd', panelsIds: [], variables: {}}),
        ).rejects.toThrow('type must be provided')
    })

    test('throws on unsupported type', async () => {
        // create
        await expect(
            repository.createWithContent({
                // @ts-expect-error testing runtime check
                type: 'PANEL',
                title: 'x',
                description: 'd',
                panelsIds: [],
                variables: {},
            }),
        ).rejects.toThrow('Unsupported type')

        const created = await repository.createWithContent({
            type: 'DASHBOARD',
            title: 't',
            description: 'd',
            panelsIds: [],
            variables: {},
        })

        await expect(
            repository.updateWithContent(created.id!, {type: 'PANEL'} as any),
        ).rejects.toThrow('Unsupported type')
    })
})
