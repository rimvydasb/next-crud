import {Kysely} from "kysely";
import {AbstractTable} from "../AbstractTable";
import {ColumnSpec, ColumnType, DatabaseSchema} from "../entities";

export class UsersRepository extends AbstractTable<DatabaseSchema, 'users'> {

    constructor(database: Kysely<DatabaseSchema>) {
        super(database, 'users')
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'name', type: ColumnType.STRING, notNull: true},
            {name: 'surname', type: ColumnType.STRING, notNull: true},
            {name: 'telephone_number', type: ColumnType.STRING, notNull: true},
        ]
    }
}