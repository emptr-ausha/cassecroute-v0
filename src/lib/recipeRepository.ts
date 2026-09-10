import type { Recipe } from '../data/recipes'
import { recipes as localRecipes } from '../data/recipes'
import { supabase } from './supabase'

type RemoteRecipe = {
  id: string
  name: string
  moments: Recipe['moments']
  week_type: Recipe['weekType']
  season: string
  time: Recipe['time']
  type: Recipe['type']
  starch: string | null
  classic: boolean
  style: Recipe['style']
}

const toRecipe = (recipe: RemoteRecipe): Recipe => ({
  id: recipe.id,
  name: recipe.name,
  moments: recipe.moments,
  weekType: recipe.week_type,
  season: recipe.season,
  time: recipe.time,
  type: recipe.type,
  starch: recipe.starch ?? undefined,
  classic: recipe.classic,
  style: recipe.style,
})

export const loadRecipes = async (): Promise<Recipe[]> => {
  if (!supabase) return localRecipes

  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, moments, week_type, season, time, type, starch, classic, style')
    .order('name')

  if (error || !data || data.length === 0) return localRecipes

  return (data as RemoteRecipe[]).map(toRecipe)
}
