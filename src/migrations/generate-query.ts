import { CircularMigrationError } from '../errors/CircularMigrationError'
import { findPatterns } from '../fql/json'
import { StatementType, TaggedExpression } from '../types/expressions'
import { PatternAndIndexName } from '../types/patterns'
import { ResourceTypes } from '../types/resource-types'
import { toIndexableName } from '../util/unique-naming'
import { evalFQLCode } from '../fql/eval'
import { createStub, transformCreateToUpdate } from '../fql/transform'
import { emit } from 'commander'

export interface NameToDependencyNames {
  [type: string]: string[]
}

export interface NameToExpressions {
  [type: string]: TaggedExpression
}
export interface NameToBool {
  [type: string]: boolean
}

export interface NameToVar {
  [type: string]: string
}

export interface DependenciesArrayEl {
  indexedName: string
  dependencyIndexNames: string[]
}

export const generateMigrationLetObject = (migrations: TaggedExpression[]) => {
  const indexedMigrations = indexMigrations(migrations)
  const dependencyIndex = findDependencies(migrations)
  // transform index to sorted array, sorted on amount of dependencies.
  // since we can safely start with the ones that don't have dependencies
  const dependenciesArray = indexToDependenciesArray(dependencyIndex)
  // Todo, add names of previous migrations for extra verification
  // to make sure no unexisting resource is deleted/updated.
  let orderedExpressions = orderAccordingToDependencies(dependenciesArray, indexedMigrations)
  orderedExpressions = reOrderDeleted(orderedExpressions)
  // Generate Let with variables.
  // Instead of adding all statements to a Do which will not work in some cases
  // where resources depend on other resources.
  // we will create a Let and replace references to other statements
  // that are created in the statement with their variable.
  const letBindingObject = generateLetBindingObject(orderedExpressions, indexedMigrations, dependencyIndex)
  return letBindingObject
}

const reOrderDeleted = (orderedExpressions: TaggedExpression[]) => {
  // Deleting an index after a colleciton doesn't work.
  // Since deleting the collection also triggers a delete of the index.
  const deleted = orderedExpressions.filter((e) => e.statement === StatementType.Delete)
  const rest = orderedExpressions.filter((e) => e.statement !== StatementType.Delete)
  const deletedIndexes = deleted.filter((e) => e.type === ResourceTypes.Index)
  const deletedRest = deleted.filter((e) => e.type !== ResourceTypes.Index)
  return deletedIndexes.concat(deletedRest).concat(rest)
}

const orderAccordingToDependencies = (
  dependenciesArray: DependenciesArrayEl[],
  indexedMigrations: NameToExpressions
) => {
  const namesPresent: NameToBool = {}
  const orderedExpressions = []
  let popLength = 0

  while (dependenciesArray.length > 0 && popLength < dependenciesArray.length) {
    // if popLength becomes to big we have been around the complete array which means
    // that we are running in circles (there are circular dependencies that can't)
    // be resolved
    const dep = <DependenciesArrayEl>dependenciesArray.shift()
    popLength++
    const allDepsPresent = dep?.dependencyIndexNames.every((el) => {
      return namesPresent[el] || indexedMigrations[el].statement === StatementType.Update
    })
    if (allDepsPresent) {
      namesPresent[dep.indexedName] = true
      orderedExpressions.push(indexedMigrations[dep.indexedName])
      popLength = 0
    }
    // else, push to end, first handle others
    else {
      dependenciesArray.push(dep)
    }
  }
  // If there are still items in the dependency array it means we have circular dependencies.
  replaceWithStubs(dependenciesArray, indexedMigrations, orderedExpressions)
  return orderedExpressions
}

const replaceWithStubs = (
  dependenciesArray: DependenciesArrayEl[],
  indexedMigrations: NameToExpressions,
  orderedExpressions: TaggedExpression[]
) => {
  const stubbed: TaggedExpression[] = []
  const others: TaggedExpression[] = []
  while (dependenciesArray.length > 0) {
    const dep = <DependenciesArrayEl>dependenciesArray.shift()
    const expr = indexedMigrations[dep.indexedName]
    if (expr.statement === StatementType.Create) {
      orderedExpressions.push(createStub(expr))
      stubbed.push(transformCreateToUpdate(expr))
    } else {
      others.push(expr)
    }
  }
  // then handle the others
  others.forEach((expr) => {
    orderedExpressions.push(expr)
  })
  stubbed.forEach((expr) => {
    orderedExpressions.push(expr)
  })
}

const generateLetBindingObject = (
  orderedExpressions: TaggedExpression[],
  indexedMigrations: NameToExpressions,
  dependencyIndex: NameToDependencyNames
) => {
  const nameToVar: NameToVar = {}
  // obj is the object with variable bindings that will be fet to the Let.
  const obj: any = {}
  orderedExpressions.forEach((e, varIndex) => {
    const indexableName = toIndexableName(e)
    const dependencies = dependencyIndex[indexableName]
    dependencies.forEach((dep: string) => {
      const depExpr = indexedMigrations[dep]
      // If it's a create we need to reference it by the
      // variable since Fauna won't know it yet
      if (depExpr.statement === StatementType.Create) {
        const depIndexableName = toIndexableName(depExpr)
        // replace a refernece to another resource
        // with the variable that was bound to it.
        // Todo, currently done via the string which is probably
        // a silly inefficient way to do it (but easier).
        // Might want to change this and do an expression manipulation
        // instead directly.
        e.fql = replaceAll(<string>e.fql, `${depExpr.type}("${depExpr.name}")`, `Var("${nameToVar[depIndexableName]}")`)
      }
    })

    if (nameToVar[indexableName] && e.statement === StatementType.Update) {
      e.fql = replaceAll(<string>e.fql, `${e.type}("${e.name}")`, `Var("${nameToVar[indexableName]}")`)
    }
    // only the first occurance is a create.
    // due to circular dependency stubbing, there might be
    // both a create and an update.
    if (!nameToVar[indexableName]) {
      nameToVar[indexableName] = `var${varIndex}`
    }
    // Bind the variable to the code.
    obj[`var${varIndex}`] = evalFQLCode(`Select(['ref'], ${e.fql})`)
  })
  return obj
}

const replaceAll = (str: string, old: string, newStr: string) => {
  return str.split(old).join(newStr)
}

const findDependencies = (migrations: TaggedExpression[]) => {
  const jsonPatterns: PatternAndIndexName[] = []
  migrations.forEach((mig) => {
    jsonPatterns.push(toPattern(mig, <ResourceTypes>mig.type))
  })
  const dependencyIndex = indexReferencedDependencies(migrations, jsonPatterns)
  return dependencyIndex
}

const indexMigrations = (flattened: TaggedExpression[]): NameToExpressions => {
  const indexedMigrations: NameToExpressions = {}
  flattened.forEach((expr) => {
    const indexableName = toIndexableName(expr)
    indexedMigrations[indexableName] = expr
  })
  return indexedMigrations
}

const indexReferencedDependencies = (flattened: TaggedExpression[], jsonPatterns: PatternAndIndexName[]) => {
  const index: NameToDependencyNames = {}
  flattened.forEach((expr) => {
    const indexableName = toIndexableName(expr)
    let found = findPatterns(expr.fqlExpr, jsonPatterns)
    // exclude self in case that would happen (although it shouldn't)
    found = found.filter((e) => e !== indexableName)
    index[indexableName] = found
  })
  return index
}

const toPattern = (mig: TaggedExpression, type: ResourceTypes): PatternAndIndexName => {
  // Seems to be always the same. We could simplify the code
  switch (type) {
    case ResourceTypes.Function:
      return { pattern: { raw: { function: mig.name } }, indexName: toIndexableName(mig) }
    case ResourceTypes.Role:
      return { pattern: { raw: { role: mig.name } }, indexName: toIndexableName(mig) }
    case ResourceTypes.Collection:
      return { pattern: { raw: { collection: mig.name } }, indexName: toIndexableName(mig) }
    case ResourceTypes.Index:
      return { pattern: { raw: { index: mig.name } }, indexName: toIndexableName(mig) }
    case ResourceTypes.AccessProvider:
      return { pattern: { raw: { access_provider: mig.name } }, indexName: toIndexableName(mig) }
    case ResourceTypes.Database:
      return { pattern: { raw: { database: mig.name } }, indexName: toIndexableName(mig) }
    default:
      throw new Error(`unknown type in toPattern ${type}`)
  }
}

const indexToDependenciesArray = (dependencyIndex: NameToDependencyNames): DependenciesArrayEl[] => {
  return <DependenciesArrayEl[]>Object.keys(dependencyIndex)
    .map((indexedName) => {
      const dependencIndexNames = dependencyIndex[indexedName]
      return {
        indexedName: indexedName,
        dependencyIndexNames: dependencIndexNames,
      }
    })
    .sort((a, b) => {
      return a.dependencyIndexNames.length - b.dependencyIndexNames.length
    })
}
