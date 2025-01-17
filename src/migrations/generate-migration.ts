import * as fauna from 'faunadb'

import { PlannedDiff, PlannedDiffPerResource, StatementType, TaggedExpression } from '../types/expressions'
import { writeNewMigration } from '../util/files'
import { ResourceTypes } from '../types/resource-types'
import { prettyPrintExpr } from '../fql/print'
import { toTaggedExpr, transformCreateToDelete, transformCreateToUpdate } from '../fql/transform'

export const writeMigrations = async (atChildDbPath: string[] = [], migrations: TaggedExpression[], time: string) => {
  writeNewMigration(atChildDbPath, migrations, time)
}

export const generateMigrations = (planned: PlannedDiffPerResource): TaggedExpression[] => {
  const migrExprs: any[] = []

  // First add all the ones we can generate generically.
  migrExprs.push(transformStatements(planned[ResourceTypes.Role]))
  migrExprs.push(transformStatements(planned[ResourceTypes.Function]))
  migrExprs.push(transformStatements(planned[ResourceTypes.Collection]))
  migrExprs.push(transformStatements(planned[ResourceTypes.Index]))
  migrExprs.push(transformStatements(planned[ResourceTypes.AccessProvider]))
  migrExprs.push(transformStatements(planned[ResourceTypes.Database]))

  const migrExprsFlat = [].concat.apply([], migrExprs)
  return migrExprsFlat
}

const transformStatements = (resources: PlannedDiff) => {
  const migrExprs: TaggedExpression[] = []
  resources.added.forEach((res) => {
    migrExprs.push(toTaggedExpr(res.target, res.target?.fqlExpr, StatementType.Create))
  })
  resources.changed.forEach((res) => {
    // indexes can't be updated.
    if (res.target?.type !== ResourceTypes.Index && res.target) {
      migrExprs.push(transformCreateToUpdate(res.target))
    }
  })
  resources.deleted.forEach((res) => {
    if (res.previous) {
      migrExprs.push(transformCreateToDelete(res.previous))
    }
  })
  return migrExprs
}
