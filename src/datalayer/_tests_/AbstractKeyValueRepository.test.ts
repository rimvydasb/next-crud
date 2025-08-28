import {Kysely} from 'kysely'
import {createTestDb, DatabaseSchema, SettingsRepository} from '@datalayer/_tests_/testUtils'

describe('AbstractKeyValueRepository', () => {
    let db: Kysely<DatabaseSchema>
    let repo: SettingsRepository
    let dialect: string

    beforeEach(async () => {
        db = await createTestDb()
        repo = new SettingsRepository(db)
        await repo.ensureSchema()
        dialect = (repo as any).dialect
    })

    afterEach(async () => {
        await db.destroy()
    })

    test('setValue handles primitives, arrays, and objects', async () => {
        const cases: any[] = [42, 'dark', true, [1, 2], [], {a: 1}, {}]
        for (const value of cases) {
            await repo.setValue('ANY', value)
            expect(await repo.getValue('ANY')).toEqual(value)
        }
    })

    test('importData updates multiple keys and handles null/undefined/empty string', async () => {
        await repo.importData({USER_TOKEN: 'abc', THEME: 'light', COUNT: 1, CONFIG: {a: 1}, LOCALE: 'en'})
        await repo.importData({USER_TOKEN: null, THEME: undefined, LOCALE: '', CONFIG: {a: 2}})
        expect(await repo.getValue('USER_TOKEN')).toBeNull()
        expect(await repo.getValue('THEME')).toBe('light')
        expect(await repo.getValue('COUNT')).toBe(1)
        expect(await repo.getValue('LOCALE')).toBeNull()
        expect(await repo.getValue('CONFIG')).toEqual({a: 2})
        const keys = await repo.getAllKeys()
        expect(new Set(keys)).toEqual(new Set(['USER_TOKEN', 'THEME', 'COUNT', 'LOCALE', 'CONFIG']))
        const all = await repo.exportData()
        expect(all).toEqual({USER_TOKEN: null, THEME: 'light', COUNT: 1, LOCALE: null, CONFIG: {a: 2}})
    })

    test('null and empty string remove stored value', async () => {
        await repo.setValue('A', 'x')
        await repo.setValue('A', null)
        expect(await repo.getValue('A')).toBeNull()
        await repo.setValue('A', 'y')
        await repo.setValue('A', '')
        expect(await repo.getValue('A')).toBeNull()
    })

    test('rejects undefined and keeps old data', async () => {
        await repo.setValue('SAFE', 'initial')
        await expect(repo.setValue('SAFE', undefined as any)).rejects.toThrow(TypeError)
        expect(await repo.getValue('SAFE')).toBe('initial')
    })

    test('rejects circular structures and keeps old data', async () => {
        if (dialect === 'postgres') return
        const circular: any = {a: 1}
        circular.self = circular
        await repo.setValue('CIRC', {a: 1})
        await expect(repo.setValue('CIRC', circular)).rejects.toThrow('Converting circular structure to JSON')
        expect(await repo.getValue('CIRC')).toEqual({a: 1})
    })

    test('stores Buffer values via JSON conversion', async () => {
        const buf = Buffer.from('abc')
        await repo.setValue('SAFE', buf as any)
        expect(await repo.getValue('SAFE')).toEqual({type: 'Buffer', data: [97, 98, 99]})
    })
})

