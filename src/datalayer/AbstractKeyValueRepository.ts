import {Insertable, Kysely, sql, Updateable} from "kysely";
import {ColumnType, TimestampDefault} from "./entities";
import {BaseTable} from "./BaseTable";
import {createdAtDefaultSql, fromJsonContent, toJsonContent} from "./utilities";

export interface KeyValueBaseTable {
    key: string;
    value: unknown | null;
    updated_at: TimestampDefault;
}

export interface KeyValueTableConfig<TableName extends string> {
    tableName: TableName;
}

export abstract class AbstractKeyValueRepository<
    DST,
    TableName extends keyof DST & string
> extends BaseTable<DST, TableName> {
    protected constructor(database: Kysely<DST>, config: KeyValueTableConfig<TableName>) {
        super(database, config.tableName);
    }

    protected encodeJson(value: unknown): unknown {
        const json = toJsonContent(value);
        return this.dialect === "sqlite" ? JSON.stringify(json) : json;
    }

    protected encodeJsonOrNull(value: unknown | null | undefined): unknown | null {
        if (value === '' || value == null) return null;
        return this.encodeJson(value);
    }

    protected decodeJson<T>(value: unknown): T | null {
        if (value == null) return null;
        const raw = this.dialect === "sqlite" && typeof value === "string" ? JSON.parse(value) : value;
        return fromJsonContent(raw) as T;
    }

    async ensureSchema(): Promise<void> {
        let builder = this.db.schema
            .createTable(this.tableName)
            .ifNotExists()
            .addColumn("key", "varchar", (col) => col.notNull())
            .addColumn("value", this.sqlApi.toSQLType(ColumnType.JSON) as any)
            .addColumn(
                "updated_at",
                "timestamp",
                (col) => col.notNull().defaultTo(sql.raw(createdAtDefaultSql())),
            );

        builder = this.applyExtraColumns(builder);

        await builder.execute();
        const indexName = `${String(this.tableName)}_key_idx`;

        /*language=TEXT*/
        await sql`CREATE INDEX IF NOT EXISTS ${sql.raw(indexName)} ON ${sql.raw(String(this.tableName))} (key)`.execute(this.db);
    }

    async getAllKeys(): Promise<string[]> {
        const rows = await this.db.selectFrom(this.tableName as string).select(["key"]).execute();
        return (rows as any[]).map((r) => r.key as string);
    }

    async getValue<T = unknown>(key: string): Promise<T | null | undefined> {
        const row = await this.db
            .selectFrom(this.tableName as string)
            .select(["value"])
            .where("key", "=", key)
            .executeTakeFirst();
        if (!row) return undefined;
        return this.decodeJson<T>((row as any).value);
    }

    async setValue(key: string, value: unknown): Promise<void> {
        if (value === undefined) throw new TypeError('Value cannot be undefined');
        const dbJson = this.encodeJsonOrNull(value);

        const res = await (this.db.updateTable(this.tableName as string) as any)
            .set(
                {
                    value: dbJson,
                    /*language=TEXT*/
                    updated_at: sql`CURRENT_TIMESTAMP`,
                } as unknown as Updateable<DST[TableName]>,
            )
            .where("key", "=", key)
            .executeTakeFirst();

        const updated = (res as any)?.numUpdatedRows ?? 0n;
        if (Number(updated) === 0) {
            await (this.db.insertInto(this.tableName as string) as any)
                .values(
                    {
                        key,
                        value: dbJson,
                        /*language=TEXT*/
                        updated_at: sql`CURRENT_TIMESTAMP`,
                    } as unknown as Insertable<DST[TableName]>,
                )
                .execute();
        }
    }

    async exportData(): Promise<Record<string, unknown | null>> {
        const rows = await this.db
            .selectFrom(this.tableName as string)
            .select(["key", "value"])
            .execute();
        const result: Record<string, unknown | null> = {};
        for (const row of rows as any[]) {
            result[row.key] = this.decodeJson((row as any).value);
        }
        return result;
    }

    async importData(obj: Record<string, unknown | null | undefined>): Promise<void> {
        await this.db.transaction().execute(async (trx) => {
            for (const [key, value] of Object.entries(obj)) {
                if (value === undefined) continue;
                const dbJson = this.encodeJsonOrNull(value);

                const res = await (trx.updateTable(this.tableName as string) as any)
                    .set(
                        {
                            value: dbJson,
                            /*language=TEXT*/
                            updated_at: sql`CURRENT_TIMESTAMP`,
                        } as unknown as Updateable<DST[TableName]>,
                    )
                    .where("key", "=", key)
                    .executeTakeFirst();

                const updated = (res as any)?.numUpdatedRows ?? 0n;
                if (Number(updated) === 0) {
                    await (trx.insertInto(this.tableName as string) as any)
                        .values(
                            {
                                key,
                                value: dbJson,
                                /*language=TEXT*/
                                updated_at: sql`CURRENT_TIMESTAMP`,
                            } as unknown as Insertable<DST[TableName]>,
                        )
                        .execute();
                }
            }
        });
    }
}

