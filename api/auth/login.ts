import type { IncomingMessage, ServerResponse } from 'node:http'
import { createSessionToken, jsonMethodNotAllowed, setSessionCookie } from '../_auth'

type VercelRequest = IncomingMessage & { body?: unknown }
type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

const getPassword = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('password' in body)) return ''
  const password = body.password
  return typeof password === 'string' ? password : ''
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return jsonMethodNotAllowed(res, ['POST'])

  const configuredPassword = process.env.CASSECROUTE_ADMIN_PASSWORD
  if (!configuredPassword) return res.status(500).json({ error: 'Server authentication is not configured' })

  if (getPassword(req.body) !== configuredPassword) {
    return res.status(401).json({ error: 'Mot de passe incorrect' })
  }

  try {
    setSessionCookie(res, createSessionToken())
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Session configuration is incomplete' })
  }
}
