import {Kysely} from 'kysely'
import {AbstractJSONTable} from '../AbstractJSONTable'
import {DatabaseSchema} from '../entities'
import {IJSONContent} from '../IJSONContent'

export interface DashboardConfiguration extends IJSONContent {
  title: string
  description: string
  panelsIds: number[]
  variables: Record<string, unknown>
  type: 'DASHBOARD'
}

export class DashboardConfigurationTable extends AbstractJSONTable<DatabaseSchema, 'dashboard_configuration', DashboardConfiguration> {
  constructor(database: Kysely<DatabaseSchema>) {
    super(database, 'dashboard_configuration', ['DASHBOARD'])
  }
}
