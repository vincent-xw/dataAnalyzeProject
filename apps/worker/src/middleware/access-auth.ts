import {
  createRemoteJWKSet,
  importJWK,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'
import type { MiddlewareHandler } from 'hono'

import type { Env } from '../index'

export type AuthenticatedUser = { email: string }

type KeyFactory = (issuer: string) => JWTVerifyGetKey

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
const testKeysByJwk = new Map<string, ReturnType<typeof importJWK>>()
const localDevelopmentSessionHeader = 'X-Local-Dev-Session'
const localDevelopmentSessionValue = 'vite-proxy'
const localDevelopmentEmail = 'local-developer@example.test'

let keyFactory: KeyFactory = (issuer) => {
  const cached = jwksByIssuer.get(issuer)
  if (cached) return cached
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  jwksByIssuer.set(issuer, jwks)
  return jwks
}

/** 仅供测试注入本地公钥；仍执行完整签名、issuer、audience 和邮箱校验。 */
export function setAccessKeyFactoryForTest(factory: KeyFactory) {
  keyFactory = factory
}

export function requireAccess(): MiddlewareHandler<Env> {
  return async (context, next) => {
    // 仅由 `pnpm dev:worker` 启动的本地 Worker 接受 Vite 代理标记，生产与测试环境仍必须校验 JWT。
    if (
      context.env.ENVIRONMENT === 'development'
      && context.req.header(localDevelopmentSessionHeader) === localDevelopmentSessionValue
    ) {
      context.set('authenticatedUser', { email: localDevelopmentEmail })
      await next()
      return
    }

    const token = context.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return context.json({ code: 'ACCESS_TOKEN_REQUIRED', message: '需要登录' }, 401)
    }

    const issuer = `https://${context.env.CF_ACCESS_TEAM_DOMAIN}`
    try {
      // E2E 环境仍验证完整 JWT，仅将远程 JWKS 替换为仓库内测试公钥。
      const verificationOptions = { issuer, audience: context.env.CF_ACCESS_AUD }
      let payload
      if (context.env.ENVIRONMENT === 'test') {
        if (!context.env.ACCESS_TEST_PUBLIC_JWK) throw new Error('ACCESS_TEST_PUBLIC_JWK_REQUIRED')
        payload = (await jwtVerify(
          token,
          await getTestVerificationKey(context.env.ACCESS_TEST_PUBLIC_JWK),
          verificationOptions,
        )).payload
      } else {
        payload = (await jwtVerify(token, keyFactory(issuer), verificationOptions)).payload
      }
      if (typeof payload.email !== 'string') {
        return context.json({ code: 'ACCESS_EMAIL_REQUIRED', message: '身份缺少邮箱' }, 401)
      }
      context.set('authenticatedUser', { email: payload.email })
      await next()
    } catch {
      return context.json({ code: 'ACCESS_TOKEN_INVALID', message: '登录凭证无效' }, 401)
    }
  }
}

async function getTestVerificationKey(serializedJwk: string) {
  let key = testKeysByJwk.get(serializedJwk)
  if (!key) {
    key = importJWK(JSON.parse(serializedJwk), 'RS256')
    testKeysByJwk.set(serializedJwk, key)
  }
  return key
}
