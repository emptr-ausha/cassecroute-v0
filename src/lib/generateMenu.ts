import type { Recipe } from '../data/recipes'

export type MenuRequest = {
  key: string
  day: string
  dayIndex: number
  moment: 'Midi' | 'Soir'
  people: number
}

export type GeneratedMeal = MenuRequest & {
  recipe: Recipe
}

export type GeneratedMenu = Record<string, GeneratedMeal>

type GenerationContext = {
  requests: MenuRequest[]
  selectedSeasons: string[]
  currentMenu?: GeneratedMenu
  replacingKey?: string
}

const isWeekday = (request: MenuRequest) => request.dayIndex < 5

const isCompatible = (recipe: Recipe, request: MenuRequest) =>
  recipe.moments.includes(request.moment)

export const isSeasonEligible = (recipe: Recipe, selectedSeasons: string[]) =>
  recipe.seasons.includes("Toute l'année") ||
  selectedSeasons.includes("Toute l'année") ||
  recipe.seasons.some((season) => selectedSeasons.includes(season))

const getDinnerNeighborStarches = (
  request: MenuRequest,
  menu: GeneratedMenu,
) => {
  const neighborStarches: string[] = []

  Object.values(menu).forEach((meal) => {
    if (meal.moment !== 'Soir' || !meal.recipe.starch) return

    const dayDistance = Math.abs(meal.dayIndex - request.dayIndex)
    if (dayDistance === 1) neighborStarches.push(meal.recipe.starch)
  })

  return neighborStarches
}

const getPreviousDinner = (request: MenuRequest, menu: GeneratedMenu) =>
  Object.values(menu).find(
    (meal) => meal.moment === 'Soir' && meal.dayIndex === request.dayIndex - 1,
  )

const scoreRecipe = (
  recipe: Recipe,
  request: MenuRequest,
  menu: GeneratedMenu,
) => {
  let score = Math.random()

  if (isWeekday(request)) {
    if (recipe.time === 'Express') score += 4
    if (recipe.time === 'Rapide') score += 3
    if (recipe.time === 'Normal') score -= 1
  } else if (recipe.time === 'Normal') {
    score += 1
  }

  if (request.moment === 'Soir') {
    const previousDinner = getPreviousDinner(request, menu)
    if (previousDinner?.recipe.style === recipe.style && recipe.style === 'Gourmand') {
      score -= 2
    }
  }

  return score
}

const chooseRecipe = (
  request: MenuRequest,
  availableRecipes: Recipe[],
  menu: GeneratedMenu,
  selectedSeasons: string[],
) => {
  const unusedRecipes = availableRecipes.filter(
    (recipe) => !Object.values(menu).some((meal) => meal.recipe.id === recipe.id),
  )
  const compatibleRecipes = unusedRecipes.filter(
    (recipe) => isCompatible(recipe, request) && isSeasonEligible(recipe, selectedSeasons),
  )

  if (compatibleRecipes.length === 0) return undefined

  const neighborStarches =
    request.moment === 'Soir' ? getDinnerNeighborStarches(request, menu) : []
  const withoutRepeatedStarch = compatibleRecipes.filter(
    (recipe) => !recipe.starch || !neighborStarches.includes(recipe.starch),
  )
  const candidates = withoutRepeatedStarch.length > 0 ? withoutRepeatedStarch : compatibleRecipes

  return [...candidates].sort(
    (first, second) => scoreRecipe(second, request, menu) - scoreRecipe(first, request, menu),
  )[0]
}

const buildMenu = (
  requests: MenuRequest[],
  availableRecipes: Recipe[],
  selectedSeasons: string[],
  existingMenu: GeneratedMenu = {},
) => {
  const menu: GeneratedMenu = { ...existingMenu }

  requests
    .filter((request) => !menu[request.key])
    .sort((first, second) => {
      if (first.moment !== second.moment) return first.moment === 'Midi' ? -1 : 1
      return first.dayIndex - second.dayIndex
    })
    .forEach((request) => {
      const recipe = chooseRecipe(request, availableRecipes, menu, selectedSeasons)
      if (recipe) menu[request.key] = { ...request, recipe }
    })

  return menu
}

export const generateMenu = (
  requests: MenuRequest[],
  availableRecipes: Recipe[],
  selectedSeasons: string[],
): GeneratedMenu => buildMenu(requests, availableRecipes, selectedSeasons)

export const replaceMeal = (
  request: MenuRequest,
  currentMenu: GeneratedMenu,
  availableRecipes: Recipe[],
  selectedSeasons: string[],
): GeneratedMenu => {
  const currentRecipeId = currentMenu[request.key]?.recipe.id
  const menuWithoutMeal = { ...currentMenu }
  delete menuWithoutMeal[request.key]

  const otherRecipeIds = new Set(
    Object.values(menuWithoutMeal).map((meal) => meal.recipe.id),
  )
  const compatibleRecipes = availableRecipes.filter(
    (recipe) =>
      recipe.id !== currentRecipeId &&
      !otherRecipeIds.has(recipe.id) &&
      isCompatible(recipe, request) &&
      isSeasonEligible(recipe, selectedSeasons),
  )
  const neighborStarches =
    request.moment === 'Soir' ? getDinnerNeighborStarches(request, menuWithoutMeal) : []
  const alternatives = compatibleRecipes.filter(
    (recipe) => !recipe.starch || !neighborStarches.includes(recipe.starch),
  )
  const candidates = alternatives.length > 0 ? alternatives : compatibleRecipes
  const replacement = [...candidates].sort(
    (first, second) => scoreRecipe(second, request, menuWithoutMeal) - scoreRecipe(first, request, menuWithoutMeal),
  )[0]

  if (!replacement) return currentMenu

  return {
    ...menuWithoutMeal,
    [request.key]: { ...request, recipe: replacement },
  }
}

export const regenerateMenu = ({ requests, selectedSeasons, currentMenu, replacingKey }: GenerationContext, availableRecipes: Recipe[]) => {
  if (!replacingKey || !currentMenu) return generateMenu(requests, availableRecipes, selectedSeasons)

  const request = requests.find((item) => item.key === replacingKey)
  return request ? replaceMeal(request, currentMenu, availableRecipes, selectedSeasons) : currentMenu
}
