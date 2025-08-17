import {ColumnSpec, ColumnType} from "../entities";
import {Kysely, sql} from "kysely";
import {ISQLApi} from "./ISQLApi";

export class SQLiteApi implements ISQLApi {
    toStringType(type: ColumnType): string {
        switch (type) {
            case ColumnType.STRING:
                return 'text'
            case ColumnType.INTEGER:
                return 'integer'
            case ColumnType.BOOLEAN:
                return 'integer'
            case ColumnType.TIMESTAMP:
                return 'timestamp'
            case ColumnType.JSON:
            case ColumnType.TEXT:
                return 'text'
            default:
                return 'text'
        }
    }

    async syncColumns(db: Kysely<any>, tableName: string, columns: ColumnSpec[]): Promise<boolean> {
        const pragma = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(String(tableName))});`.execute(db)
        const existing = new Set(pragma.rows.map(r => r.name))
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