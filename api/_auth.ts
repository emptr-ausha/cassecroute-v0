import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const sessionCookieName = 'cassecroute_session'
const sessionDurationSeconds = 60 * 60 * 24 * 7

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const getSecret = () => process.env.CASSECROUTE_SESSION_SECRET

const sign = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url')

export const createSessionToken = () => {
  const secret = getSecret()
  if (!secret) throw new Error('CASSECROUTE_SESSION_SECRET is not configured')

  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + sessionDurationSeconds * 1000,
  })).toString('base64url')

  return `${payload}.${sign(payload, secret)}`
}

export const hasValidSession = (req: IncomingMessage) => {
  const secret = getSecret()
  const cookieHeader = req.headers.cookie
  if (!secret || !cookieHeader) return false

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const [key, ...value] = part.trim().split('=')
      return [key, value.join('=')]
    }),
  )
  const token = cookies[sessionCookieName]
  if (!token) return false

  const [payload, receivedSignature] = token.split('.')
  if (!payload || !receivedSignature) return false

  const expectedSignature = sign(payload, secret)
  const receivedBuffer = Buffer.from(receivedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (receivedBuffer.length !== expectedBuffer.length) return false
  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return false

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { expiresAt?: number }
    return typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()
  } catch {
    return false
  }
}

export const setSessionCookie = (res: VercelResponse, token: string) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${token}; Max-Age=${sessionDurationSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  )
}

export const jsonMethodNotAllowed = (res: VercelResponse, allowed: string[]) => {
  res.setHeader('Allow', allowed.join(', '))
  return res.status(405).json({ error: 'Method not allowed' })
}
