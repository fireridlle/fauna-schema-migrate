import path from 'path'
import test, { ExecutionContext } from 'ava'
import { fullApply, setupFullTest, destroyFullTest } from '../../../_helpers'
import { getAllCloudResources } from '../../../../src/state/from-cloud'

const testPath = path.relative(process.cwd(), __dirname)

let faunaClient: any = null
test.before(async (t: ExecutionContext) => {
  faunaClient = await setupFullTest(testPath)
})

test('generate create_collection and delete it again in next step', async (t: ExecutionContext) => {
  await fullApply(testPath, ['resources1'])
  let result = await getAllCloudResources(faunaClient)
  t.is(result.Collection.length, 2)
  t.truthy(result.Collection.find((x) => x.name === 'migrations'))
  t.truthy(result.Collection.find((x) => x.name === 'test1'))
  await fullApply(testPath, ['resources2'])
  result = await getAllCloudResources(faunaClient)
  t.is(result.Collection.length, 1)
  t.truthy(result.Collection.find((x) => x.name === 'migrations'))
})

test.after.always(async (t: ExecutionContext) => {
  await destroyFullTest(testPath)
})
