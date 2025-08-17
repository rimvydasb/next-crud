import {Kysely, SqliteDialect} from 'kysely'
import BetterSqlite3 from 'better-sqlite3'
import {DatabaseSchema} from '../entities'
import {DashboardConfigurationTable, DashboardConfiguration} from './DashboardConfigurationTable'

describe('AbstractJSONTable', () => {
  let db: Kysely<DatabaseSchema>
  let table: DashboardConfigurationTable

  beforeEach(async () => {
    const sqlite = new BetterSqlite3(':memory:')
    db = new Kysely<DatabaseSchema>({dialect: new SqliteDialect({database: sqlite})})
    table = new DashboardConfigurationTable(db)
    await table.ensureSchema()
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
    const created = await table.createWithContent(config)
    expect(created.id).toBeDefined()
    expect(created).toMatchObject({...config, priority: 0})

    const fetched = await table.getByIdWithContent(created.id!)
    expect(fetched).toEqual(created)
  })

  test('listWithContent returns all rows', async () => {
    const configs: DashboardConfiguration[] = [
      {type: 'DASHBOARD', title: 'One', description: 'd1', panelsIds: [], variables: {}, priority: 0},
      {type: 'DASHBOARD', title: 'Two', description: 'd2', panelsIds: [], variables: {}, priority: 1},
    ]
    for (const c of configs) {
      await table.createWithContent(c)
    }
    const list = await table.listWithContent({orderBy: {column: 'id'}})
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
    const created = await table.createWithContent(config)
    const updated = await table.updateWithContent(created.id!, {
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
      table.createWithContent({title: 't', description: 'd', panelsIds: [], variables: {}}),
    ).rejects.toThrow('type must be provided')
  })

  test('throws on unsupported type', async () => {
    // create
    await expect(
      table.createWithContent({
        // @ts-expect-error testing runtime check
        type: 'PANEL',
        title: 'x',
        description: 'd',
        panelsIds: [],
        variables: {},
      }),
    ).rejects.toThrow('Unsupported type')

    const created = await table.createWithContent({
      type: 'DASHBOARD',
      title: 't',
      description: 'd',
      panelsIds: [],
      variables: {},
    })

    await expect(
      table.updateWithContent(created.id!, {type: 'PANEL'} as any),
    ).rejects.toThrow('Unsupported type')
  })
})
