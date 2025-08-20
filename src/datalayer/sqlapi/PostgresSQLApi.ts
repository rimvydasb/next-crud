import {ColumnSpec, ColumnType, SupportedDialect} from "../entities";
import {Kysely, sql} from "kysely";
import {ISQLApi} from "./ISQLApi";

export class PostgresSQLApi implements ISQLApi {
    dialect: SupportedDialect = 'postgres'
    toStringType(type: ColumnType): string {
        switch (type) {
            case ColumnType.STRING:
                return 'varchar(255)'
            case ColumnType.INTEGER:
                return 'integer'
            case ColumnType.BOOLEAN:
                return 'boolean'
            case ColumnType.TIMESTAMP:
                return 'timestamp'
            case ColumnType.JSON:
                return 'jsonb'
            case ColumnType.TEXT:
                return 'text'
            default:
                return 'text'
        }
    }

    async syncColumns(
        db: Kysely<any>,
        tableName: string,
        columns: ColumnSpec[],
        schemaName = 'public'
    ): Promise<boolean> {
        const rows = await sql<{ column_name: string }>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = ${schemaName}
              AND table_name = ${tableName}
        `.execute(db)
        const existing = new Set(rows.rows.map(r => r.column_name))
        const toAdd = columns.filter(c => !existing.has(c.name))
        if (toAdd.length === 0) return false
        for (const column of toAdd) {
            await db.schema
                .alterTable(tableName)
                .addColumn(
                    column.name,
                    this.toStringType(column.type) as any,
                    col => {
                        if (column.notNull && column.defaultSql) col = col.notNull().defaultTo(sql.raw(column.defaultSql))
                        else if (column.notNull) col = col.notNull()
                        if (column.unique) col = col.unique()
                        if (column.defaultSql) col = col.defaultTo(sql.raw(column.defaultSql))
                        return col
                    }
                )
                .execute()
        }
        return true
    }
}