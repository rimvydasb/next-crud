import {Kysely} from "kysely";
import {ColumnSpec, ColumnType, DatabaseSchema, SupportedDialect} from "../lib/entities";
import {AbstractTable} from "../lib/AbstractTable";
import {ISQLApi} from "../lib/sqlapi/ISQLApi";

export class UsersRepository extends AbstractTable<'users'> {

    // @Todo, no reason to pass dialect, it is acquired from sqlApi
    constructor(database: Kysely<DatabaseSchema>, dialect: SupportedDialect, sqlApi: ISQLApi) {
        super(database, 'users', dialect, sqlApi)
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'name', type: ColumnType.STRING, notNull: true},
            {name: 'surname', type: ColumnType.STRING, notNull: true},
            {name: 'telephone_number', type: ColumnType.STRING, notNull: true},
        ]
    }
}