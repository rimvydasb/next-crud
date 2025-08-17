import type {NextApiRequest, NextApiResponse} from 'next'
import {BaseTableDataHandler} from '../lib/restapi/BaseTableDataHandler'
import {UsersRepository} from './UsersRepository'
import {Kysely, SqliteDialect} from "kysely"
import { DatabaseSchema } from "../lib/entities"
import BetterSqlite3 from "better-sqlite3";

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

// Handler implementation for tests
class UsersHandler extends BaseTableDataHandler<'users'> {

    protected getDb(): Promise<Kysely<DatabaseSchema>> {
        const sqlite = new BetterSqlite3(':memory:')
        const db = new Kysely<DatabaseSchema>({dialect: new SqliteDialect({database: sqlite})})
        return Promise.resolve(db)
    }

    protected async getTable(): Promise<UsersRepository> {
        const repo = new UsersRepository(await this.getDb())
        await repo.ensureSchema()
        return repo
    }
}

describe('BaseTableDataHandler REST flow', () => {
    beforeEach(() => {
        // Each test gets a fresh in-memory database
        process.env.DATABASE_URL = 'sqlite://:memory:'
    })

    afterEach(async () => {
    })

    test('create, fetch, update and delete', async () => {
        // ---- Create
        let {req, res} = createMock('POST', {
            name: 'John',
            surname: 'Doe',
            telephone_number: '123',
        })
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        const created = (res as any).data[0]
        expect(created).toMatchObject({name: 'John'})

        const id = created.id

            // ---- Fetch
        ;({req, res} = createMock('GET', undefined, {id: String(id)}))
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        expect((res as any).data[0].id).toBe(id)

        // ---- Update
        ;({req, res} = createMock('PATCH', {id, name: 'Jane'}))
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
        expect((res as any).data[0].name).toBe('Jane')

        // ---- Delete
        ;({req, res} = createMock('DELETE', {id}))
        await new UsersHandler(req, res).handle()
        expect(res.statusCode).toBe(200)
    })
})

