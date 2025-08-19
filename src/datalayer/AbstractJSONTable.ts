import {Insertable, Kysely, Selectable, Updateable} from 'kysely'
import {AbstractTable, TableConfig} from './AbstractTable'
import {ColumnSpec, ColumnType} from './entities'
import {IJSONContent} from './IJSONContent'

/**
 * Simple JSON storage table backed by a {@link AbstractTable}. Stores arbitrary
 * JSON in a `content` column while exposing `id`, `type` and `priority` fields
 * directly on the returned objects.
 */
export abstract class AbstractJSONTable<DST, TableName extends keyof DST & string, Content extends IJSONContent> extends AbstractTable<DST, TableName> {
    private readonly supportedTypes: string[]

    constructor(
        database: Kysely<DST>,
        tableNameOrConfig: TableName | TableConfig<TableName>,
        supportedTypes: string[],
    ) {
        super(database, tableNameOrConfig)
        this.supportedTypes = supportedTypes
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'type', type: ColumnType.STRING, notNull: true},
            {name: 'content', type: ColumnType.JSON, notNull: true},
        ]
    }

    protected encodeJson(value: unknown): unknown {
        return this.dialect === 'postgres' ? value : JSON.stringify(value)
    }

    protected decodeJson(value: unknown): Record<string, unknown> {
        if (value == null) return {} as Record<string, unknown>
        if (this.dialect === 'postgres') return value as Record<string, unknown>
        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as Record<string, unknown>
            } catch {
                /* ignore */
            }
        }
        return value as Record<string, unknown>
    }

    private toJsonContent(content: Partial<Content>): Record<string, unknown> {
        const rest = {...(content as any)}
        delete (rest as any).id
        delete (rest as any).priority
        delete (rest as any).type
        return rest
    }

    private fromRow(row: Selectable<DST[TableName]>): Content {
        const json = this.decodeJson((row as any).content)
        return {
            ...json,
            id: (row as any).id,
            priority: (row as any).priority,
            type: (row as any).type,
        } as Content
    }

    async createWithContent(content: Content): Promise<Content> {
        const {type, priority} = content
        if (!type) {
            throw new Error('type must be provided')
        }
        if (this.supportedTypes.length && !this.supportedTypes.includes(type)) {
            throw new Error(`Unsupported type: ${type}`)
        }
        const row = await super.create({
            type,
            priority: priority as any,
            content: this.encodeJson(this.toJsonContent(content)),
        } as Insertable<DST[TableName]>)
        return this.fromRow(row)
    }

    async getByIdWithContent(
        id: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<Content | undefined> {
        const row = await super.getById(id, options)
        return row ? this.fromRow(row) : undefined
    }

    async listWithContent(
        options: {
            includeDeleted?: boolean
            limit?: number
            offset?: number
            orderBy?: { column: keyof DST[TableName]; direction?: 'asc' | 'desc' }
        } = {},
    ): Promise<Content[]> {
        const rows = await super.list(options)
        return rows.map(r => this.fromRow(r))
    }

    async updateWithContent(id: number, patch: Partial<Content>): Promise<Content | undefined> {
        const {type, priority, ...jsonPatch} = patch as any
        const updateData: any = {}
        if (type !== undefined) {
            if (this.supportedTypes.length && !this.supportedTypes.includes(type)) {
                throw new Error(`Unsupported type: ${type}`)
            }
            updateData.type = type
        }
        if (priority !== undefined) updateData.priority = priority
        if (Object.keys(jsonPatch).length) {
            const current = await super.getById(id, {includeDeleted: true})
            const existing = current ? this.decodeJson((current as any).content) : {}
            updateData.content = this.encodeJson({...existing, ...jsonPatch})
        }
        const row = await super.update(id, updateData as Updateable<DST[TableName]>)
        return row ? this.fromRow(row) : undefined
    }
}
