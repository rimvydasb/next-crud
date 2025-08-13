// -----------------------------------------------------------------------------
// Example repository: Users (define extra columns here only)
// -----------------------------------------------------------------------------
import {Kysely} from "kysely";
import {ColumnSpec, DatabaseSchema, SupportedDialect} from "../lib/entities";
import {AbstractTable} from "../lib/repository";

export class UsersRepository extends AbstractTable<'users'> {
    constructor(database: Kysely<DatabaseSchema>, dialect: SupportedDialect) {
        super(database, 'users', dialect)
    }

    protected extraColumns(): ColumnSpec[] {
        const textType = this.dialect === 'postgres' ? 'varchar(255)' : 'text'
        return [
            {name: 'name', type: textType, notNull: true},
            {name: 'surname', type: textType, notNull: true},
            {name: 'telephone_number', type: textType, notNull: true},
        ]
    }
}