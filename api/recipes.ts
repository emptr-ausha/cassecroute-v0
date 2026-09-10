import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hasValidSession, jsonMethodNotAllowed } from './_auth'

type VercelRequest = IncomingMessage & { body?: unknown }
type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

type RecipePayload = {
  name: unknown
  moments: unknown
  week_type: unknown
  seasons: unknown
  time: unknown
  type: unknown
  starch: unknown
  classic: unknown
  style: unknown
  recipe_url: unknown
}

const allowedMoments = new Set(['Midi', 'Soir'])
const allowedWeekTypes = new Set(['Semaine', 'Week-end', 'Tous les jours'])
const allowedTimes = new Set(['Express', 'Rapide', 'Normal'])
const allowedTypes = new Set(['Végétarien', 'Viande', 'Poisson'])
const allowedStyles = new Set(['Healthy', 'Gourmand'])

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const validatePayload = (body: unknown): RecipePayload | null => {
  if (!body || typeof body !== 'object') return null
  const payload = body as RecipePayload

  if (!isNonEmptyString(payload.name)) return null
  if (!Array.isArray(payload.moments) || payload.moments.length < 1 || payload.moments.some((moment) => !allowedMoments.has(String(moment)))) return null
  if (!allowedWeekTypes.has(String(payload.week_type))) return null
  if (!Array.isArray(payload.seasons) || payload.seasons.length < 1 || payload.seasons.some((season) => !isNonEmptyString(season))) return null
  if (!allowedTimes.has(String(payload.time))) return null
  if (!allowedTypes.has(String(payload.type))) return null
  if (!(payload.starch === null || isNonEmptyString(payload.starch))) return null
  if (typeof payload.classic !== 'boolean') return null
  if (!allowedStyles.has(String(payload.style))) return null
  if (!(payload.recipe_url === null || isNonEmptyString(payload.recipe_url))) return null

  return payload
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return jsonMethodNotAllowed(res, ['POST'])
  if (!hasValidSession(req)) return res.status(401).json({ error: 'Authentication required' })

  const payload = validatePayload(req.body)
  if (!payload) return res.status(400).json({ error: 'Données de recette invalides' })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server database configuration is incomplete' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const id = `${payload.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...payload, id })
    .select('id, name, moments, week_type, seasons, time, type, starch, classic, style, recipe_url')
    .single()

  if (error) return res.status(500).json({ error: 'La recette n’a pas pu être enregistrée' })
  return res.status(201).json({ recipe: data })
}
