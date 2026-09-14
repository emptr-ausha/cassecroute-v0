import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'

type VercelRequest = IncomingMessage & { body?: unknown }
type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

type MealSnapshot = {
  day_index: number
  moment: 'Midi' | 'Soir'
  recipe_id: string | null
  recipe_name: string
  is_leftovers: boolean
}

// Work from the Paris calendar date, then use UTC solely for date arithmetic.
export const nextWeekStart = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find((value) => value.type === type)!.value)
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7
  date.setUTCDate(date.getUTCDate() + daysUntilMonday)
  return date.toISOString().slice(0, 10)
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

export const validateMeals = (body: unknown): MealSnapshot[] | null => {
  if (!body || typeof body !== 'object' || !('meals' in body)) return null
  const { meals } = body
  if (!Array.isArray(meals) || meals.length < 1 || meals.length > 14) return null

  const slots = new Set<string>()
  const snapshots: MealSnapshot[] = []
  for (const meal of meals) {
    if (!meal || typeof meal !== 'object') return null
    const { day_index, moment, recipe_id, recipe_name, is_leftovers } = meal
    if (!Number.isInteger(day_index) || day_index < 0 || day_index > 6) return null
    if (moment !== 'Midi' && moment !== 'Soir') return null
    if (typeof is_leftovers !== 'boolean') return null
    const slot = `${day_index}-${moment}`
    if (slots.has(slot)) return null
    slots.add(slot)

    if (!is_leftovers && (!isNonEmptyString(recipe_id) || !isNonEmptyString(recipe_name))) return null
    snapshots.push({
      day_index,
      moment,
      recipe_id: is_leftovers ? null : recipe_id,
      recipe_name: is_leftovers ? '🥡 Restes' : recipe_name,
      is_leftovers,
    })
  }
  return snapshots
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const meals = validateMeals(req.body)
  if (!meals) return res.status(400).json({ error: 'Données de semaine invalides' })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server database configuration is incomplete' })
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await supabase.rpc('save_menu_week', {
      p_week_start: nextWeekStart(),
      p_meals: meals,
    })
    if (error || !data) {
      return res.status(500).json({ error: 'La semaine n’a pas pu être sauvegardée' })
    }
    return res.status(200).json({ week: data })
  } catch {
    return res.status(500).json({ error: 'La semaine n’a pas pu être sauvegardée' })
  }
}
