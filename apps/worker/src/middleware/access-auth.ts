import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'
import type { MiddlewareHandler } from 'hono'

import type { Env } from '../index'

export type AuthenticatedUser = { email: string }

type KeyFactory = (issuer: string) => JWTVerifyGetKey

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

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
    const token = context.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return context.json({ code: 'ACCESS_TOKEN_REQUIRED', message: '需要登录' }, 401)
    }

    const issuer = `https://${context.env.CF_ACCESS_TEAM_DOMAIN}`
    try {
      const { payload } = await jwtVerify(token, keyFactory(issuer), {
        issuer,
        audience: context.env.CF_ACCESS_AUD,
      })
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
