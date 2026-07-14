import { SignJWT, generateKeyPair } from 'jose'

const issuer = 'https://test.cloudflareaccess.com'
const audience = 'test-access-audience'
const keyPairPromise = generateKeyPair('RS256', { extractable: true })

export async function getTestAccessPublicKey() {
  return (await keyPairPromise).publicKey
}

export async function getTestAccessToken(options?: { audience?: string; email?: string }) {
  const { privateKey } = await keyPairPromise
  return new SignJWT({ email: options?.email ?? 'owner@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(issuer)
    .setAudience(options?.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}
