import {Kysely} from 'kysely'
import {createTestDb, DatabaseSchema, SettingsRepository} from '@datalayer/_tests_/testUtils'

describe('AbstractKeyValueTable', () => {
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
        const val = await repo.getValue('THEME')
        expect(val).toBe('dark')
    })

    test('setObject updates multiple keys and handles null/undefined', async () => {
        await repo.setObject({USER_TOKEN: 'abc', THEME: 'light'})
        await repo.setObject({USER_TOKEN: null, THEME: undefined, LOCALE: 'en'})
        expect(await repo.getValue('USER_TOKEN')).toBeNull()
        expect(await repo.getValue('THEME')).toBe('light')
        expect(await repo.getValue('LOCALE')).toBe('en')
        const all = await repo.getObject()
        expect(all).toEqual({USER_TOKEN: null, THEME: 'light', LOCALE: 'en'})
    })
})

