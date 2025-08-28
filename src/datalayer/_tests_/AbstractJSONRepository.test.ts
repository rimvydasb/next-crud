import {Kysely} from 'kysely';
import {
    createTestDb,
    DashboardConfiguration,
    DashboardConfigurationRepository,
    DatabaseSchema
} from "@datalayer/_tests_/testUtils";

describe('AbstractJSONRepository', () => {
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
        const created = await repository.jsonCreate(config)
        expect(created.id).toBeDefined()
        expect(created).toMatchObject({...config, priority: created.id})

        const fetched = await repository.jsonGetById(created.id!)
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
        const created = await repository.jsonCreate(config)
        expect(created).toMatchObject(config)
        expect(created.id).toBeDefined()
        expect(created.id).not.toBe(config.priority)
    })

    test('jsonGetAll returns all rows', async () => {
        const configs: DashboardConfiguration[] = [
            {type: 'DASHBOARD', title: 'One', description: 'd1', panelsIds: [], variables: {}, priority: 0},
            {type: 'DASHBOARD', title: 'Two', description: 'd2', panelsIds: [], variables: {}, priority: 1},
        ]
        for (const c of configs) {
            await repository.jsonCreate(c)
        }
        const list = await repository.jsonGetAll({orderBy: {column: 'id'}})
        expect(list).toHaveLength(2)
        expect(list.map(c => c.title)).toEqual(['One', 'Two'])
    })

    test('jsonGetAllByType returns rows for specified type', async () => {
        await repository.jsonCreate({
            type: 'DASHBOARD',
            title: 'One',
            description: 'd1',
            panelsIds: [],
            variables: {},
        })
        await repository.jsonCreate({
            type: 'DASHBOARD',
            title: 'Two',
            description: 'd2',
            panelsIds: [],
            variables: {},
        })
        const list = await repository.jsonGetAllByType('DASHBOARD', {orderBy: {column: 'id'}})
        expect(list).toHaveLength(2)
    })

    test('jsonGetAllByType throws on unsupported type', async () => {
        await expect(repository.jsonGetAllByType('PANEL')).rejects.toThrow('Unsupported type')
    })

    test('jsonUpdate merges JSON and updates fields', async () => {
        const config: DashboardConfiguration = {
            type: 'DASHBOARD',
            title: 'Main',
            description: 'old',
            panelsIds: [],
            variables: {},
        }
        const created = await repository.jsonCreate(config)
        const updated = await repository.jsonUpdate(created.id!, {
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
            repository.jsonCreate({title: 't', description: 'd', panelsIds: [], variables: {}}),
        ).rejects.toThrow('type must be provided')
    })

    test('throws on unsupported type', async () => {
        // create
        await expect(
            repository.jsonCreate({
                // @ts-expect-error testing runtime check
                type: 'PANEL',
                title: 'x',
                description: 'd',
                panelsIds: [],
                variables: {},
            }),
        ).rejects.toThrow('Unsupported type')

        const created = await repository.jsonCreate({
            type: 'DASHBOARD',
            title: 't',
            description: 'd',
            panelsIds: [],
            variables: {},
        })

        await expect(
            repository.jsonUpdate(created.id!, {type: 'PANEL'} as any),
        ).rejects.toThrow('Unsupported type')
    })

    test('serializes like JSON.stringify (drops undefined) on create', async () => {
        const complex = {
            type: 'DASHBOARD' as const,
            title: 'Complex',
            description: 'with undefineds',
            panelsIds: [1, 2, 3],
            variables: {
                a: 1,
                b: undefined,
                arr: [1, undefined, 3, {x: undefined, y: 2}],
                nested: {keep: true, drop: undefined},
            },
            extra: undefined as unknown,
        }
        const expected = JSON.parse(
            JSON.stringify({
                title: complex.title,
                description: complex.description,
                panelsIds: complex.panelsIds,
                variables: complex.variables,
                // 'extra' should be dropped
            }),
        )

        const created = await repository.jsonCreate(complex as any)
        const fetched = await repository.jsonGetById(created.id!)
        expect(fetched).toBeDefined()
        // Compare only JSON content parts
        expect({
            title: fetched!.title,
            description: fetched!.description,
            panelsIds: fetched!.panelsIds,
            variables: fetched!.variables,
        }).toEqual(expected)
    })

    test('jsonUpdate drops keys set to undefined and handles arrays', async () => {
        const created = await repository.jsonCreate({
            type: 'DASHBOARD',
            title: 'A',
            description: 'B',
            panelsIds: [1, 2],
            variables: {x: 1, y: 2, arr: [1, 2]},
        })

        const updated = await repository.jsonUpdate(created.id!, {
            description: undefined as any, // should drop description
            variables: {x: undefined as any, arr: [undefined as any, 3]}, // drop x, array undefined -> null
        })

        // Expected after JSON.stringify merge behavior
        expect(updated).toBeDefined()
        // Title remains
        expect(updated!.title).toBe('A')
        // description dropped -> absent; since our Content interface requires description, we assert behavior via deep equality on JSON content fields
        const picked = {
            title: updated!.title,
            // description should be missing -> comparing against JSONified expectation
            panelsIds: updated!.panelsIds,
            variables: updated!.variables,
        }
        const expected = JSON.parse(
            JSON.stringify({
                title: 'A',
                panelsIds: [1, 2],
                // variables are replaced (shallow merge), not deep-merged
                variables: {arr: [null, 3]},
            }),
        )
        expect(picked).toEqual(expected)
    })
})
