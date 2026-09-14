import { supabase } from './supabase'
import { previousWeekStart } from './menuDates'

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

// An unavailable history must never prevent generating a menu.
export async function loadPreviousRecipeIds(now = new Date()): Promise<Set<string>> {
  if (!supabase) return new Set()
  try {
    const { data, error } = await supabase
      .from('menu_weeks')
      .select('meals:menu_week_meals(recipe_id, is_leftovers)')
      .eq('week_start', previousWeekStart(now))
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle()
    if (error || !data) return new Set()
    return new Set(data.meals.flatMap((meal) =>
      !meal.is_leftovers && meal.recipe_id !== null ? [meal.recipe_id as string] : []))
  } catch {
    return new Set()
  }
}
