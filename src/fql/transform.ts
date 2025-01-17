import * as fauna from 'faunadb'
import cloneDeep from 'lodash.clonedeep'

import { StatementType, TaggedExpression } from '../types/expressions'
import { ResourceTypes } from '../types/resource-types'

const {
  Update,
  Delete,
  CreateFunction,
  CreateCollection,
  CreateAccessProvider,
  CreateIndex,
  CreateRole,
  Role,
  Function,
  Collection,
  Index,
  AccessProvider,
  Database,
  CreateDatabase,
  Var,
  Query,
  Lambda,
} = fauna.query

export const createStub = (expr: TaggedExpression) => {
  // Just create an empty stub from a create expression.
  if (!expr.type) {
    // could also improve my types instead.
    throw new Error(`Expression type undefined ${expr}`)
  } else {
    const original = expr.fqlExpr.raw['create_' + camelToSnakeCase(expr.type)].raw.object
    const fqlFunction = resourceTypeToFqlCreateFunction(expr)
    const obj = { name: original.name }
    addRequiredProps(expr, obj)
    return toTaggedExpr(expr, fqlFunction(obj), StatementType.Create)
  }
}

export const transformUpdateToCreate = (expr: TaggedExpression) => {
  if (!expr.type) {
    // could also improve my types instead.
    throw new Error(`Expression type undefined ${expr}`)
  } else {
    const obj1 = expr.fqlExpr.raw.params.raw.object
    obj1.name = expr.name
    const fqlFunction = resourceTypeToFqlCreateFunction(expr)
    return toTaggedExpr(expr, fqlFunction(obj1), StatementType.Create)
  }
}

export const explicitelySetAllParameters = (expr: TaggedExpression) => {
  if (expr.statement !== StatementType.Update) {
    throw new Error(`explicitelySetAllParameters is only meant for update expressions, received: ${expr.statement}`)
  }
  // update only updates what is set.
  switch (expr.type) {
    case ResourceTypes.Collection:
      setExplicitUpdateParameters({ data: null, history_days: 30, ttl_days: null, permissions: null }, expr)
      return toTaggedExpr(expr, expr.fqlExpr, StatementType.Update)
    // case ResourceTypes.Index:
    // ignore, indexes are never updated
    case ResourceTypes.Function:
      setExplicitUpdateParameters({ data: null, body: null, role: null }, expr)
      return toTaggedExpr(expr, expr.fqlExpr, StatementType.Update)
    case ResourceTypes.Role:
      setExplicitUpdateParameters({ data: null, privileges: null, membership: null }, expr)
      return toTaggedExpr(expr, expr.fqlExpr, StatementType.Update)
    case ResourceTypes.AccessProvider:
      setExplicitUpdateParameters({ data: null, issuer: null, jwks_uri: null, roles: null }, expr)
      return toTaggedExpr(expr, expr.fqlExpr, StatementType.Update)
    case ResourceTypes.Database:
      setExplicitUpdateParameters({ data: null, priority: null }, expr)
      return toTaggedExpr(expr, expr.fqlExpr, StatementType.Update)
    default:
      throw new Error(`Unknown type ${expr.type}`)
  }
}

const addRequiredProps = (expr: TaggedExpression, obj: any) => {
  switch (expr.type) {
    case ResourceTypes.Function:
      obj.body = Query(Lambda('x', Var('x')))
      break
    case ResourceTypes.AccessProvider:
      // let's take an auth0 issueras dummy
      obj.issuer = 'https://faunadb-auth0.auth0.com/'
      obj.jwks_uri = 'https://faunadb-auth0.auth0.com.well-known/jwks.json'
      break
    case ResourceTypes.Role:
      obj.privileges = []
      break
    default:
    // Some (e.g. collection, role) don't have required props.
    // We don't stub indexes since they can't live without a source.
    // instead indexes are always moved to the end.
  }
}

const setExplicitUpdateParameters = (params: { [str: string]: any }, expr: TaggedExpression) => {
  Object.keys(params).forEach((key) => {
    if (expr.fqlExpr.raw.params.raw.object[key] === undefined) {
      expr.fqlExpr.raw.params.raw.object[key] = params[key]
    }
  })
}

/*
 * Transform from one type to another
 **/

export const transformCreateToUpdate = (expr: TaggedExpression) => {
  if (!expr.type) {
    // could also improve my types instead.
    throw new Error(`Expression type undefined ${expr}`)
  } else {
    return explicitelySetAllParameters(
      toTaggedExpr(
        expr,
        Update(
          getReference(<TaggedExpression>expr, resourceTypeToFqlReferenceFunction(expr)),
          expr.fqlExpr.raw['create_' + camelToSnakeCase(expr.type)].raw.object
        ),
        StatementType.Update
      )
    )
  }
}

export const transformCreateToDelete = (expr: TaggedExpression) => {
  return toTaggedExpr(
    expr,
    Delete(getReference(<TaggedExpression>expr, resourceTypeToFqlReferenceFunction(expr))),
    StatementType.Delete
  )
}

export const transformUpdateToUpdate = (expr: TaggedExpression) => {
  return explicitelySetAllParameters(expr)
}

export const transformUpdateToDelete = (expr: TaggedExpression) => {
  return toTaggedExpr(
    expr,
    Delete(getReference(<TaggedExpression>expr, resourceTypeToFqlReferenceFunction(expr))),
    StatementType.Delete
  )
}

export const transformDbPathToCreate = (childDbPath: string[]): TaggedExpression => {
  const name = childDbPath.length > 0 ? childDbPath[childDbPath.length - 1] : ''
  const db = childDbPath.slice(0, -1)
  const createDbFql: any = CreateDatabase({
    name: name,
  })
  return transformDbNameToFqlGeneric(name, db, StatementType.Create, createDbFql)
}

export const transformDbPathToUpdate = (childDbPath: string[]): TaggedExpression => {
  // no support for database metadata atm
  const name = childDbPath.length > 0 ? childDbPath[childDbPath.length - 1] : ''
  const db = childDbPath.slice(1)
  const updateDbFql: any = Update(Database(name), { name: name })
  return transformDbNameToFqlGeneric(name, db, StatementType.Update, updateDbFql)
}

export const transformDbPathToDelete = (childDbPath: string[]): TaggedExpression => {
  // no support for database metadata atm
  const name = childDbPath.length > 0 ? childDbPath[childDbPath.length - 1] : ''
  const db = childDbPath.slice(1)
  const deleteDbFql: any = Delete(Database(name))
  return transformDbNameToFqlGeneric(name, db, StatementType.Delete, deleteDbFql)
}

export const transformDbNameToFqlGeneric = (
  name: string,
  db: string[],
  s: StatementType,
  fqlExpr: any
): TaggedExpression => {
  return {
    fqlExpr: fqlExpr,
    fql: fqlExpr.toFQL(),
    name: name,
    jsonData: {},
    type: ResourceTypes.Database,
    statement: s,
    db: db,
  }
}

export const camelToSnakeCase = (str: string) => {
  let snakeCase = str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  if (snakeCase.charAt(0) === '_') {
    snakeCase = snakeCase.substring(1, snakeCase.length)
  }
  return snakeCase
}

export const toTaggedExpr = (
  taggedExpr: TaggedExpression | undefined,
  fqlExpr: fauna.Expr,
  statement: StatementType
) => {
  if (taggedExpr === undefined) {
    throw new Error('toTaggedExpr: received undefined expr')
  } else {
    const type: any = taggedExpr.type
    const newExpr = {
      name: taggedExpr.name,
      type: type,
      fqlExpr: fqlExpr,
      fql: (<any>fqlExpr).toFQL(),
      statement: statement,
      jsonData: getJsonData(fqlExpr, type, statement),
      db: taggedExpr.db,
    }
    return newExpr
  }
}

const getReference = (taggedExpr: TaggedExpression, fqlFunc: any) => {
  return fqlFunc(taggedExpr.name)
}

const resourceTypeToFqlReferenceFunction = (expr: TaggedExpression) => {
  switch (expr.type) {
    case ResourceTypes.Collection:
      return Collection
    case ResourceTypes.Index:
      return Index
    case ResourceTypes.Function:
      return Function
    case ResourceTypes.Role:
      return Role
    case ResourceTypes.AccessProvider:
      return AccessProvider
    case ResourceTypes.Database:
      return Database
    default:
      throw new Error(`Unknown type ${expr.type}`)
  }
}

const resourceTypeToFqlCreateFunction = (expr: TaggedExpression) => {
  switch (expr.type) {
    case ResourceTypes.Collection:
      return CreateCollection
    case ResourceTypes.Index:
      return CreateIndex
    case ResourceTypes.Function:
      return CreateFunction
    case ResourceTypes.Role:
      return CreateRole
    case ResourceTypes.AccessProvider:
      return CreateAccessProvider
    case ResourceTypes.Database:
      return CreateDatabase
    default:
      throw new Error(`Unknown type ${expr.type}`)
  }
}

export const getJsonData = (fExpr: fauna.Expr, resourceType: ResourceTypes, statement: StatementType) => {
  const expr: any = fExpr
  if (statement === StatementType.Create) {
    const key = 'create_' + camelToSnakeCase(resourceType)
    const jsonData = cloneDeep(expr.raw[key].raw.object)
    delete jsonData.name
    return jsonData
  } else if (statement === StatementType.Update) {
    const jsonData = expr.raw.params.raw.object
    delete jsonData.name
    return jsonData
  } else {
    return {}
  }
}
