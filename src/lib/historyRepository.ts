import { supabase } from './supabase'

export type HistoryMeal = {
  day_index: number
  moment: 'Midi' | 'Soir'
  recipe_id: string | null
  recipe_name: string
  is_leftovers: boolean
}

export type HistoryWeek = {
  id: string
  week_start: string
  meals: HistoryMeal[]
}

export async function loadHistory(): Promise<HistoryWeek[]> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await supabase
    .from('menu_weeks')
    .select('id, week_start, meals:menu_week_meals(day_index, moment, recipe_id, recipe_name, is_leftovers)')
    .order('week_start', { ascending: false })
    .limit(4)
  if (error) throw error
  return (data ?? []) as HistoryWeek[]
}
