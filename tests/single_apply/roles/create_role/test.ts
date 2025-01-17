import path from 'path'
import test, { ExecutionContext } from 'ava'
import { fullApply, setupFullTest, destroyFullTest } from '../../../_helpers'
import { getAllCloudResources } from '../../../../src/state/from-cloud'

const testPath = path.relative(process.cwd(), __dirname)

let faunaClient: any = null
test.before(async (t: ExecutionContext) => {
  faunaClient = await setupFullTest(testPath)
})

test('generate create_role migration', async (t: ExecutionContext) => {
  await fullApply(testPath)
  const result = await getAllCloudResources(faunaClient)
  t.is(result.Role.length, 1)
  t.truthy(result.Role.find((x) => x.name === 'powerless'))
})

test.after.always(async (t: ExecutionContext) => {
  await destroyFullTest(testPath)
})
