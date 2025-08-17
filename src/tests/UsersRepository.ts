import {Kysely} from "kysely";
import {ColumnSpec, ColumnType, DatabaseSchema} from "../lib/entities";
import {AbstractTable} from "../lib/AbstractTable";

export class UsersRepository extends AbstractTable<'users'> {

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