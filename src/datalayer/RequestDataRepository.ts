import {Kysely} from 'kysely'
import {AbstractCacheTable, TTL, CacheEntry} from '@datalayer/AbstractCacheTable'
import {ColumnSpec, ColumnType, DatabaseSchema} from '@datalayer/entities'

export default class RequestDataRepository extends AbstractCacheTable<DatabaseSchema, 'request_data_cache'> {
    constructor(db: Kysely<DatabaseSchema>) {
        super(db, 'request_data_cache')
    }

    protected extraColumns(): ColumnSpec[] {
        return [
            {name: 'reference', type: ColumnType.STRING},
            {name: 'metadata', type: ColumnType.JSON},
        ]
    }
}

export {TTL, CacheEntry}
