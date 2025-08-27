import {Insertable, Kysely, sql, Updateable} from "kysely";
import {ColumnType, TimestampDefault} from "./entities";
import {BaseTable} from "./BaseTable";
import {createdAtDefaultSql} from "./utilities";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return (
        typeof x === "object" &&
        x !== null &&
        !Array.isArray(x) &&
        Object.getPrototypeOf(x) === Object.prototype
    );
}

function isJsonSerializable(x: unknown): x is JsonValue {
    if (x === null || typeof x === "string" || typeof x === "boolean") return true;
    if (typeof x === "number") return Number.isFinite(x);
    if (Array.isArray(x)) return x.every(isJsonSerializable);
    if (isPlainObject(x)) {
        for (const v of Object.values(x)) if (!isJsonSerializable(v)) return false;
        return true;
    }
    return false;
}

function assertJsonSerializable(x: unknown): asserts x is JsonValue {
    if (!isJsonSerializable(x)) {
        throw new TypeError(
            "Value is not JSON-serializable for jsonb. Allowed: null, string, finite number, boolean, arrays, plain objects."
        );
    }
}

export interface KeyValueBaseTable {
    key: string;
    value: JsonValue | null;
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

    private toDbJson(value: JsonValue | null) {
        if (this.dialect === "sqlite") {
            return value === null ? null : JSON.stringify(value);
        }
        /*language=TEXT*/
        return sql`${JSON.stringify(value)}::jsonb`;
    }

    private decode(value: unknown): JsonValue | null {
        if (value == null) return null;
        if (this.dialect === "sqlite" && typeof value === "string") {
            return JSON.parse(value);
        }
        // pg already parses json/jsonb to JS
        return value as JsonValue;
    }

    async ensureSchema(): Promise<void> {
        let builder = this.db.schema.createTable(this.tableName).ifNotExists();
        builder = builder.addColumn("key", "varchar", (col) => col.notNull());
        builder = builder.addColumn("value", this.sqlApi.toSQLType(ColumnType.JSON) as any);
        builder = builder.addColumn(
            "updated_at",
            "timestamp",
            (col) => col.notNull().defaultTo(sql.raw(createdAtDefaultSql()))
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

    async getValue<T extends JsonValue = JsonValue>(
        key: string
    ): Promise<T | null | undefined> {
        const row = await this.db
            .selectFrom(this.tableName as string)
            .select(["value"])
            .where("key", "=", key)
            .executeTakeFirst();
        if (!row) return undefined;
        return this.decode((row as any).value) as T | null;
    }

    async setValue(key: string, value: unknown): Promise<void> {
        assertJsonSerializable(value);
        const dbJson = this.toDbJson(value as JsonValue);

        const res = await (this.db.updateTable(this.tableName as string) as any)
            .set(
                {
                    value: dbJson,
                    /*language=TEXT*/
                    updated_at: sql`CURRENT_TIMESTAMP`,
                } as unknown as Updateable<DST[TableName]>
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
                    } as unknown as Insertable<DST[TableName]>
                )
                .execute();
        }
    }

    async exportData(): Promise<Record<string, JsonValue | null>> {
        const rows = await this.db
            .selectFrom(this.tableName as string)
            .select(["key", "value"])
            .execute();
        const result: Record<string, JsonValue | null> = {};
        for (const row of rows as any[]) {
            result[row.key] = this.decode(row.value);
        }
        return result;
    }

    async importData(obj: Record<string, unknown | null | undefined>): Promise<void> {
        await this.db.transaction().execute(async (trx) => {
            for (const [key, value] of Object.entries(obj)) {
                if (value === undefined) continue;
                assertJsonSerializable(value);
                const dbJson = this.toDbJson(value as JsonValue);

                const res = await (trx.updateTable(this.tableName as string) as any)
                    .set(
                        {
                            value: dbJson,
                            /*language=TEXT*/
                            updated_at: sql`CURRENT_TIMESTAMP`,
                        } as unknown as Updateable<DST[TableName]>
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
                            } as unknown as Insertable<DST[TableName]>
                        )
                        .execute();
                }
            }
        });
    }
}