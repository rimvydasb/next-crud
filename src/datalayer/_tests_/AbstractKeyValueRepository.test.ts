import {Kysely} from 'kysely'
import {createTestDb, DatabaseSchema, SettingsRepository} from '@datalayer/_tests_/testUtils'

describe('AbstractKeyValueRepository', () => {
    let db: Kysely<DatabaseSchema>
    let repo: SettingsRepository

    beforeEach(async () => {
        db = await createTestDb()
        repo = new SettingsRepository(db)
        await repo.ensureSchema()
    })

    afterEach(async () => {
        await db.destroy()
    })

    test('setValue and getValue', async () => {
        await repo.setValue('THEME', 'dark')
        await repo.setValue('COUNT', 5)
        await repo.setValue('CONFIG', {mode: 'light'})
        const deep = {a: {b: {c: {d: [1, {e: 'f'}]}}}}
        await repo.setValue('DEEP', deep)
        expect(await repo.getValue('THEME')).toBe('dark')
        expect(await repo.getValue('COUNT')).toBe(5)
        expect(await repo.getValue('CONFIG')).toEqual({mode: 'light'})
        expect(await repo.getValue('DEEP')).toEqual(deep)
    })

    test('importData updates multiple keys and handles null/undefined', async () => {
        await repo.importData({USER_TOKEN: 'abc', THEME: 'light', COUNT: 1, CONFIG: {a: 1}})
        await repo.importData({USER_TOKEN: null, THEME: undefined, LOCALE: 'en', CONFIG: {a: 2}})
        expect(await repo.getValue('USER_TOKEN')).toBeNull()
        expect(await repo.getValue('THEME')).toBe('light')
        expect(await repo.getValue('COUNT')).toBe(1)
        expect(await repo.getValue('LOCALE')).toBe('en')
        expect(await repo.getValue('CONFIG')).toEqual({a: 2})
        const keys = await repo.getAllKeys()
        expect(new Set(keys)).toEqual(new Set(['USER_TOKEN', 'THEME', 'COUNT', 'LOCALE', 'CONFIG']))
        const all = await repo.exportData()
        expect(all).toEqual({USER_TOKEN: null, THEME: 'light', COUNT: 1, LOCALE: 'en', CONFIG: {a: 2}})
    })

    test('rejects non-serializable value and keeps old data', async () => {
        await repo.setValue('SAFE', 'initial')
        await expect(repo.setValue('SAFE', Buffer.from('abc') as any)).rejects.toThrow(TypeError)
        expect(await repo.getValue('SAFE')).toBe('initial')
    })
})

