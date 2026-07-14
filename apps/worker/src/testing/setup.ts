import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll } from 'vitest'

import { setAccessKeyFactoryForTest } from '../middleware/access-auth'
import { getTestAccessPublicKey } from './access'

beforeAll(async () => {
  const publicKey = await getTestAccessPublicKey()
  setAccessKeyFactoryForTest(() => async () => publicKey)
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
