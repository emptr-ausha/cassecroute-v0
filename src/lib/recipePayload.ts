export type RecipeFormValues = {
  name: string
  moments: '' | 'Midi' | 'Soir' | 'Les deux'
  weekType: '' | 'Semaine' | 'Week-end' | 'Tous les jours'
  seasons: string[]
  time: '' | 'Express' | 'Rapide' | 'Normal'
  type: '' | 'Végétarien' | 'Viande' | 'Poisson'
  starch: string
  style: '' | 'Healthy' | 'Gourmand'
  classic: '' | 'Oui' | 'Non'
  link: string
}

export type RecipeInsertPayload = {
  name: string
  moments: ('Midi' | 'Soir')[]
  week_type: RecipeFormValues['weekType']
  seasons: string[]
  time: RecipeFormValues['time']
  type: RecipeFormValues['type']
  starch: string | null
  classic: boolean
  style: RecipeFormValues['style']
  recipe_url: string | null
}

export const toRecipeInsertPayload = (form: RecipeFormValues): RecipeInsertPayload => ({
  name: form.name.trim(),
  moments: form.moments === 'Les deux'
    ? ['Midi', 'Soir']
    : form.moments
      ? [form.moments]
      : [],
  week_type: form.weekType as RecipeInsertPayload['week_type'],
  seasons: form.seasons,
  time: form.time as RecipeInsertPayload['time'],
  type: form.type as RecipeInsertPayload['type'],
  starch: form.starch === 'Aucun' ? null : form.starch,
  classic: form.classic === 'Oui',
  style: form.style as RecipeInsertPayload['style'],
  recipe_url: form.link.trim() || null,
})
