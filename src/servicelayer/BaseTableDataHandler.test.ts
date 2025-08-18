import type {NextApiRequest, NextApiResponse} from 'next'
import {Kysely} from "kysely"
import {DatabaseSchema} from "@datalayer/entities"
import {BaseTableDataHandler} from "@servicelayer/BaseTableDataHandler";
import {UsersRepository} from "@datalayer/_tests/UsersRepository";
import {createTestDb} from "../testDb"

// Simple helper to create mock Next.js request/response objects
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

// We'll reuse the same in-memory database instance for each handler call so
// that data persists across multiple requests within a test case.
let db: Kysely<DatabaseSchema>

// Handler implementation for tests
class UsersHandler extends BaseTableDataHandler<DatabaseSchema, 'users'> {

    protected getDb(): Promise<Kysely<DatabaseSchema>> {
        // Return the shared database instance created in the test hooks.
        return Promise.resolve(db)
    }

    protected async getTable(): Promise<UsersRepository> {
        const repo = new UsersRepository(await this.getDb())
        await repo.ensureSchema()
        return repo
    }
}

describe('BaseTableDataHandler REST flow', () => {
    beforeEach(async () => {
        // Each test gets a fresh database instance.
        db = await createTestDb()
    })

    afterEach(async () => {
        // Clean up the database connection after each test run.
        await db.destroy()
    })

    test('creates a user', async () => {
        expect.assertions(3)
        const {req, res} = createMock('POST', {
            name: 'John',
            surname: 'Doe',
            telephone_number: '123',
        })
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const created = (res as any).data[0]
        expect(created).toMatchObject({name: 'John'})

        const repo = new UsersRepository(db)
        await repo.ensureSchema()
        const inDb = await repo.getById(created.id)
        expect(inDb?.name).toBe('John')
    })

    test('fetches a user', async () => {
        expect.assertions(2)
        const repo = new UsersRepository(db)
        await repo.ensureSchema()
        const created = await repo.create({
            name: 'Jane',
            surname: 'Doe',
            telephone_number: '123',
        })

        const {req, res} = createMock('GET', undefined, {id: String(created.id)})
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        expect((res as any).data[0]).toMatchObject({id: created.id, name: 'Jane'})
    })

    test('updates a user', async () => {
        expect.assertions(3)
        const repo = new UsersRepository(db)
        await repo.ensureSchema()
        const created = await repo.create({
            name: 'Jim',
            surname: 'Beam',
            telephone_number: '321',
        })

        const {req, res} = createMock('PATCH', {id: created.id, name: 'Jimmy'})
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const updated = await repo.getById(created.id)
        expect(updated?.name).toBe('Jimmy')
        expect((res as any).data[0].name).toBe('Jimmy')
    })

    test('deletes a user', async () => {
        expect.assertions(3)
        const repo = new UsersRepository(db)
        await repo.ensureSchema()
        const created = await repo.create({
            name: 'Al',
            surname: 'Bundy',
            telephone_number: '555',
        })

        const {req, res} = createMock('DELETE', {id: created.id})
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const deleted = await repo.getById(created.id)
        expect(deleted).toBeUndefined()
        expect((res as any).data[0].id).toBe(created.id)
    })
})

