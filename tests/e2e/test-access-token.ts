import { importPKCS8, SignJWT } from 'jose'

export const TEST_ACCESS_AUDIENCE = 'e2e-access-audience'
export const TEST_ACCESS_DOMAIN = 'e2e.cloudflareaccess.test'
export const TEST_ACCESS_PUBLIC_JWK = {
  kty: 'RSA',
  n: 'q_iF3rVvr7IvBvRI_AJ00M94aDJRYQdQif5PcE3TGQDyogix6p29qW6zbhQawh7QfNk1CTNCh15oSTu3sP3uqtIAzoFZrUSFb0F5HMHJPVQjSAZpmKouTkmxTmJTDTfoM0tFUvLZ1ypWISRUYlZYktyJIhOhmEJb9SCyUtEL0vZ6lxuzou2Ow-LgQqZedCe5qY91RqCLhZ9zPVv2_iWao41gumPPHMypDX9CM2RHRLZGqP24np-FTeGK7AGGW6BFOYA77T5Qooiyyg0j7e0gGm99mj_4Rc_K7Qj1LdKKrgu0rTfuHyBEZkrL4qRPkC0IFEL-QV1TDS_3aPrAUVPl6Q',
  e: 'AQAB',
  alg: 'RS256',
} as const

const privatePkcs8 = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCr+IXetW+vsi8G
9Ej8AnTQz3hoMlFhB1CJ/k9wTdMZAPKiCLHqnb2pbrNuFBrCHtB82TUJM0KHXmhJ
O7ew/e6q0gDOgVmtRIVvQXkcwck9VCNIBmmYqi5OSbFOYlMNN+gzS0VS8tnXKlYh
JFRiVliS3IkiE6GYQlv1ILJS0QvS9nqXG7Oi7Y7D4uBCpl50J7mpj3VGoIuFn3M9
W/b+JZqjjWC6Y88czKkNf0IzZEdEtkao/bien4VN4YrsAYZboEU5gDvtPlCiiLLK
DSPt7SAab32aP/hFz8rtCPUt0oquC7StN+4fIERmSsvipE+QLQgUQv5BXVMNL/do
+sBRU+XpAgMBAAECggEAC2euJirhgzUVoBgRoo/9pA8MYNmscrtH1L0GUvAAXuVE
kikyNnl7Z3oZYYSpESR2xn7nwOpSwFRLJYc1u6HdoxvOFKP4uPBlSo98qyLxeBUl
SVyugmLP8x55STXlZOgnKMa2TGXhe176CxTkGUj5cxT37cgARK8q9tbyKKKnTnhx
HjlmqNhktwCHiDsgtbCTu/+FZRsVQoUZR8SyF67UdVHqxKiDq0TTdsw5uc7NfjPI
CaGfXa8xTptFKvGuYz3c5WVII0x5QJ/lUOeZfxhZ19uHMXI4Vpbrttg/nAgyygYW
SlGnSxKrjbjkxX+vpg0/Xz1Uu1cwMGNEFHn+S2ffEQKBgQDfhWHSWRwN+VSGXXL2
mKossxzW8NMZrgJPFcm2P0N5PPalE8HYg0rmy8FrJhL+ueTSeM7p5HBExI8Rtx8M
6tkfluW98wFmBQ1orBeDnuU7n+teDB6czkEVCcNer6i/I9lgLjHrEwCvkvMEtPGP
x9MlrJzCEVNH+uIs7KfZSt02WQKBgQDE9Y5jtQcApX5oz6ByejkMJQtdx/GpQsDW
vSI4H72zOFheKHISxDWcJDT6WmDwuPq2ssxR8ewbY9IUAR0H0f3kvA9Lpn2k6LPU
TrBuqrtbJEmHo8fyEedK29wq44Ltm4j9YbtIoZ7GawUc3JxSYJGUGTorr4ZfDtTZ
itS3TshaEQKBgQCAoK9Eb0c3u22qzQglZIE5q/FCt9+jfYGSpUUo/YsEr9J3+MCq
qhNmcYbi9EwmDi/h9ueLrYv15u82EJ1rv5InHZ0kDD2XyfyHadE2SzA7ebHmsy7C
qebGBpJJYOjI5gZn1O2hC5RvdS8oXEBOr32Qxp6HB5VXbMbPd3i4EN7wMQKBgHd4
X8OZRkMdH51h+/gUrU/xlIBxTOQXyrM3DG+wyTfSAMA0lmVNwRsSV1RYyB6che+W
axt1vHssxHw/5KUeunwpmrmPpv0F7jbk+F5Yj8cMLtHpBdqPA5ZD4LvfP0bzplfU
FW9MIexHdFV6eBP74bJMzx06ni5A59mBPeBnGF6RAoGAM4MuuSaGvm216usOzix9
wkJN6ubOTf+Q5VqZR/6q1xATjL79xzAp+TPAb+GDrGlCPydOAiyF3Le4vDgjybbI
YELQWoMCmW+kvlqHOYS4Zx8y5GRv8HOjlguuRMeFvCeUiLrMwxYZjmMf0ax9KKBT
OBeD+Opx9POF9DAlzuQAH6Q=
-----END PRIVATE KEY-----`

/** 使用仅存在于 E2E 目录的私钥签发完整 issuer/audience/email JWT。 */
export async function createTestAccessToken(): Promise<string> {
  const key = await importPKCS8(privatePkcs8, 'RS256')
  return new SignJWT({ email: 'owner@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`https://${TEST_ACCESS_DOMAIN}`)
    .setAudience(TEST_ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key)
}
