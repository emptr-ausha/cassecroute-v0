import { useEffect, useRef, useState } from 'react'
import { recipes as localRecipes, type Recipe } from './data/recipes'
import {
  generateMenu,
  isSeasonEligible,
  replaceMeal,
  type GeneratedMenu,
  type MenuRequest,
} from './lib/generateMenu'
import { loadRecipes } from './lib/recipeRepository'
import { type RecipeFormValues, type RecipeInsertPayload, toRecipeInsertPayload } from './lib/recipePayload'
import './App.css'

type Screen = 'home' | 'add' | 'people' | 'meals' | 'menu' | 'confirmed'
type MealSlot = 'Midi' | 'Soir'
type SelectedMeals = Record<string, number>
type Leftovers = Record<string, boolean>
type DisplayMeal = (GeneratedMenu[string] | MenuRequest) & { isLeftovers?: boolean }
const emptyRecipeForm: RecipeFormValues = {
  name: '',
  moments: '',
  weekType: '',
  seasons: [],
  time: '',
  type: '',
  starch: '',
  style: '',
  classic: '',
  link: '',
}

const days = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
]

const mealSlots: MealSlot[] = ['Midi', 'Soir']
const seasons = ['Printemps', 'Été', 'Automne', 'Hiver']

const getMealKey = (day: string, slot: MealSlot) => `${day}-${slot}`

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [defaultPeople, setDefaultPeople] = useState(2)
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([])
  const [selectedMeals, setSelectedMeals] = useState<SelectedMeals>({})
  const [generatedMenu, setGeneratedMenu] = useState<GeneratedMenu>({})
  const [availableRecipes, setAvailableRecipes] = useState<Recipe[]>(localRecipes)
  const [leftovers, setLeftovers] = useState<Leftovers>({})
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeForm, setRecipeForm] = useState<RecipeFormValues>(emptyRecipeForm)
  const [hasSubmittedForm, setHasSubmittedForm] = useState(false)
  const [formValidated, setFormValidated] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [isSubmittingRecipe, setIsSubmittingRecipe] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [isSavingWeek, setIsSavingWeek] = useState(false)
  const [saveError, setSaveError] = useState<{ snapshot: string; message: string } | null>(null)
  const savingWeek = useRef(false)

  useEffect(() => {
    let isCurrent = true

    loadRecipes().then((loadedRecipes) => {
      if (isCurrent) setAvailableRecipes(loadedRecipes)
    })

    return () => {
      isCurrent = false
    }
  }, [])

  const getRequests = (): MenuRequest[] =>
    Object.entries(selectedMeals).map(([key, people]) => {
      const [day, moment] = key.split('-') as [string, MealSlot]
      return {
        key,
        day,
        dayIndex: days.indexOf(day),
        moment,
        people,
      }
    })

  const handleGenerate = () => {
    setSavedSnapshot(null)
    setSaveError(null)
    setGeneratedMenu(generateMenu(getRequests(), availableRecipes, selectedSeasons))
    setLeftovers({})
    setScreen('menu')
  }

  const handleChange = (meal: MenuRequest) => {
    setGeneratedMenu((current) => replaceMeal(meal, current, availableRecipes, selectedSeasons))
    setLeftovers((current) => {
      const next = { ...current }
      delete next[meal.key]
      return next
    })
  }

  const handleChooseRecipe = (meal: MenuRequest, recipeId: string) => {
    const recipe = availableRecipes.find((item) => item.id === recipeId)
    if (!recipe) return

    setGeneratedMenu((current) => ({ ...current, [meal.key]: { ...meal, recipe } }))
    setLeftovers((current) => {
      const next = { ...current }
      delete next[meal.key]
      return next
    })
    setPickerKey(null)
    setRecipeSearch('')
  }

  const handleLeftovers = (meal: MenuRequest) => {
    setGeneratedMenu((current) => {
      const next = { ...current }
      delete next[meal.key]
      return next
    })
    setLeftovers((current) => ({ ...current, [meal.key]: true }))
  }

  const handleRestart = () => {
    setSavedSnapshot(null)
    setSaveError(null)
    setScreen('home')
    setDefaultPeople(2)
    setSelectedSeasons([])
    setSelectedMeals({})
    setGeneratedMenu({})
    setLeftovers({})
    setPickerKey(null)
    setRecipeSearch('')
  }

  const displayedMeals: DisplayMeal[] = getRequests()
    .sort((a, b) => a.dayIndex - b.dayIndex || mealSlots.indexOf(a.moment) - mealSlots.indexOf(b.moment))
    .map((request) => leftovers[request.key]
      ? { ...request, isLeftovers: true }
      : generatedMenu[request.key] ?? request)
  const snapshot = displayedMeals.map((meal) => ({
    day_index: meal.dayIndex,
    moment: meal.moment,
    recipe_id: meal.isLeftovers ? null : 'recipe' in meal ? meal.recipe.id : null,
    recipe_name: meal.isLeftovers ? '🥡 Restes' : 'recipe' in meal ? meal.recipe.name : 'Aucune proposition disponible',
    is_leftovers: Boolean(meal.isLeftovers),
  }))
  const snapshotKey = JSON.stringify(snapshot)
  const isWeekSaved = savedSnapshot === snapshotKey
  const canSaveWeek = snapshot.length > 0 && snapshot.every((meal) => meal.is_leftovers || meal.recipe_id)

  const handleSaveWeek = async () => {
    if (savingWeek.current || isWeekSaved || !canSaveWeek) return
    savingWeek.current = true
    setIsSavingWeek(true)
    setSaveError(null)
    try {
      const response = await fetch('/api/menu-weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meals: snapshot }),
      })
      if (!response.ok) throw new Error('Save failed')
      const result = await response.json()
      if (!result.week?.id) throw new Error('Invalid save response')
      setSavedSnapshot(snapshotKey)
    } catch {
      setSaveError({ snapshot: snapshotKey, message: 'La semaine n’a pas pu être sauvegardée. Réessayez.' })
    } finally {
      savingWeek.current = false
      setIsSavingWeek(false)
    }
  }

  const updateRecipeForm = <Key extends keyof RecipeFormValues>(key: Key, value: RecipeFormValues[Key]) => {
    setRecipeForm((current) => ({ ...current, [key]: value }))
    setFormValidated(false)
    setFormMessage('')
    setFormMessage('')
  }

  const toggleFormChoice = (key: 'seasons', value: string) => {
    setRecipeForm((current) => ({
      ...current,
      [key]: current.seasons.includes(value)
        ? current.seasons.filter((season) => season !== value)
        : [...current.seasons, value],
    }))
    setFormValidated(false)
    setFormMessage('')
  }

  const getRecipeFormErrors = (form: RecipeFormValues = recipeForm) => {
    const errors: string[] = []
    if (!form.name.trim()) errors.push('Ajoute le nom du plat.')
    if (!form.moments) errors.push('Choisis au moins un moment.')
    if (!form.weekType) errors.push('Choisis quand le plat peut être cuisiné.')
    if (form.seasons.length === 0) errors.push('Choisis au moins une saison.')
    if (!form.time) errors.push('Choisis un temps de préparation.')
    if (!form.type) errors.push('Choisis un type de plat.')
    if (!form.starch) errors.push('Choisis un féculent principal.')
    if (!form.style) errors.push('Choisis un style.')
    if (!form.classic) errors.push('Indique si le plat est un classique.')
    return errors
  }

  const validateRecipeForm = () => {
    const errors = getRecipeFormErrors()
    setHasSubmittedForm(true)
    setFormValidated(errors.length === 0)
    return errors.length === 0 ? toRecipeInsertPayload(recipeForm) : null
  }

  const visibleFormErrors = hasSubmittedForm ? getRecipeFormErrors() : []

  const postRecipe = async (payload: RecipeInsertPayload) => {
    const response = await fetch('/api/recipes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) throw new Error('La recette n’a pas pu être enregistrée.')
    return true
  }

  const handleAddRecipe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = validateRecipeForm()
    if (!payload) return

    setIsSubmittingRecipe(true)
    setFormMessage('')

    try {
      const saved = await postRecipe(payload)
      if (!saved) return

      const refreshedRecipes = await loadRecipes()
      setAvailableRecipes(refreshedRecipes)
      setFormValidated(true)
      setFormMessage('Plat ajouté. Il est maintenant disponible dans votre bibliothèque.')
      setRecipeForm(emptyRecipeForm)
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'Une erreur est survenue.')
    } finally {
      setIsSubmittingRecipe(false)
    }
  }

  const updateMeal = (day: string, slot: MealSlot) => {
    const key = getMealKey(day, slot)

    setSelectedMeals((current) => {
      if (key in current) {
        const next = { ...current }
        delete next[key]
        return next
      }

      return { ...current, [key]: defaultPeople }
    })
  }

  const toggleSeason = (season: string) => {
    setSelectedSeasons((current) => current.includes(season)
      ? current.filter((item) => item !== season)
      : [...current, season])
  }

  const setShortcut = (shortcut: 'all' | 'evenings' | 'week' | 'clear') => {
    if (shortcut === 'clear') {
      setSelectedMeals({})
      return
    }

    const selected: SelectedMeals = {}
    const daysToSelect = shortcut === 'week' ? days.slice(0, 5) : days
    const slotsToSelect = shortcut === 'evenings' ? ['Soir'] : mealSlots

    daysToSelect.forEach((day) => {
      slotsToSelect.forEach((slot) => {
        selected[getMealKey(day, slot as MealSlot)] = defaultPeople
      })
    })

    setSelectedMeals(selected)
  }

  const updatePeople = (day: string, slot: MealSlot, people: number) => {
    const key = getMealKey(day, slot)
    setSelectedMeals((current) => ({ ...current, [key]: people }))
  }

  if (screen === 'people') {
    return (
      <main className="home-page journey-page">
        <JourneyHeader onBack={() => setScreen('home')} />
        <section className="journey-step people-step season-step" aria-labelledby="season-title">
          <div className="step-heading">
            <span className="step-count">01</span>
            <p className="eyebrow">ON COMMENCE PAR LE DÉBUT</p>
            <h1 id="season-title">On est dans quelle saison ?</h1>
            <p className="step-intro">On adaptera les suggestions à la période de l’année.</p>
          </div>

          <div className="season-grid" role="group" aria-label="Saisons">
            {seasons.map((season) => (
              <button
                className={`people-choice season-choice ${selectedSeasons.includes(season) ? 'is-selected' : ''}`}
                key={season}
                type="button"
                aria-pressed={selectedSeasons.includes(season)}
                onClick={() => toggleSeason(season)}
              >
                <strong>{season}</strong>
              </button>
            ))}
          </div>

          <button
            className={`season-all-choice ${selectedSeasons.includes("Toute l'année") ? 'is-selected' : ''}`}
            type="button"
            aria-pressed={selectedSeasons.includes("Toute l'année")}
            onClick={() => toggleSeason("Toute l'année")}
          >
            Toute l’année <span aria-hidden="true">✦</span>
          </button>

          <div className="journey-actions">
            <button className="primary-button" type="button" disabled={selectedSeasons.length === 0} onClick={() => setScreen('meals')}>
              Continuer <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'add') {
    return (
      <main className="home-page journey-page add-page">
        <JourneyHeader onBack={() => setScreen('home')} />
        <section className="journey-step add-step" aria-labelledby="add-title">
          <div className="step-heading add-heading">
            <span className="step-count">＋</span>
            <p className="eyebrow">Votre bibliothèque, vos idées</p>
            <h1 id="add-title">Ajouter un plat</h1>
            <p className="step-intro">Un plat de plus dans la marmite, ça ne se refuse pas.</p>
          </div>

          <form className="recipe-form" onSubmit={handleAddRecipe} noValidate>
            <FormField label="Nom du plat" required error={visibleFormErrors.includes('Ajoute le nom du plat.')}>
              <input
                className="form-input"
                type="text"
                placeholder="Ex. Lasagnes de mamie"
                value={recipeForm.name}
                onChange={(event) => updateRecipeForm('name', event.target.value)}
                aria-invalid={visibleFormErrors.includes('Ajoute le nom du plat.')}
              />
            </FormField>

            <FormChoiceGroup label="Quand peut-on le manger ?" required error={visibleFormErrors.includes('Choisis au moins un moment.')}>
              <ChoiceButtons values={['Midi', 'Soir', 'Les deux']} selected={recipeForm.moments ? [recipeForm.moments] : []} onToggle={(value) => updateRecipeForm('moments', value as RecipeFormValues['moments'])} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Quand peut-on le cuisiner ?" required error={visibleFormErrors.includes('Choisis quand le plat peut être cuisiné.')}>
              <ChoiceButtons values={['Semaine', 'Week-end', 'Tous les jours']} selected={recipeForm.weekType ? [recipeForm.weekType] : []} onToggle={(value) => updateRecipeForm('weekType', value as RecipeFormValues['weekType'])} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Saison" required error={visibleFormErrors.includes('Choisis au moins une saison.')}>
              <ChoiceButtons values={['Printemps', 'Été', 'Automne', 'Hiver', "Toute l'année"]} selected={recipeForm.seasons} onToggle={(value) => toggleFormChoice('seasons', value)} />
            </FormChoiceGroup>

            <FormChoiceGroup label="Temps" required error={visibleFormErrors.includes('Choisis un temps de préparation.')}>
              <ChoiceButtons values={['Express · 15 min max', 'Rapide · 16 à 30 min', 'Normal · plus de 30 min']} selected={recipeForm.time ? [recipeForm.time === 'Express' ? 'Express · 15 min max' : recipeForm.time === 'Normal' ? 'Normal · plus de 30 min' : 'Rapide · 16 à 30 min'] : []} onToggle={(value) => updateRecipeForm('time', value.split(' · ')[0] as RecipeFormValues['time'])} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Type" required error={visibleFormErrors.includes('Choisis un type de plat.')}>
              <ChoiceButtons values={['Végétarien', 'Viande', 'Poisson']} selected={recipeForm.type ? [recipeForm.type] : []} onToggle={(value) => updateRecipeForm('type', value as RecipeFormValues['type'])} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Féculent principal" required error={visibleFormErrors.includes('Choisis un féculent principal.')}>
              <ChoiceButtons values={['Aucun', 'Pâtes', 'Riz', 'Pommes de terre', 'Semoule', 'Pain', 'Gnocchis', 'Légumineuses', 'Autre']} selected={recipeForm.starch ? [recipeForm.starch] : []} onToggle={(value) => updateRecipeForm('starch', value)} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Style" required error={visibleFormErrors.includes('Choisis un style.')}>
              <ChoiceButtons values={['Healthy', 'Gourmand']} selected={recipeForm.style ? [recipeForm.style] : []} onToggle={(value) => updateRecipeForm('style', value as RecipeFormValues['style'])} single />
            </FormChoiceGroup>

            <FormChoiceGroup label="Est-ce un classique ?" required error={visibleFormErrors.includes('Indique si le plat est un classique.')}>
              <ChoiceButtons values={['Oui', 'Non']} selected={recipeForm.classic ? [recipeForm.classic] : []} onToggle={(value) => updateRecipeForm('classic', value as RecipeFormValues['classic'])} single />
            </FormChoiceGroup>

            <FormField label="Lien vers la recette">
              <input className="form-input" type="url" placeholder="https://... (facultatif)" value={recipeForm.link} onChange={(event) => updateRecipeForm('link', event.target.value)} />
            </FormField>

            {formValidated && !formMessage && (
              <p className="form-feedback form-success" role="status">Le formulaire est valide. L'enregistrement sera disponible bientôt.</p>
            )}
            {formMessage && (
              <p className={`form-feedback ${formValidated ? 'form-success' : 'form-error'}`} role="status">{formMessage}</p>
            )}

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={isSubmittingRecipe}>
                {isSubmittingRecipe ? 'Ajout en cours…' : 'Ajouter le plat'} <span aria-hidden="true">↗</span>
              </button>
              <button className="secondary-button" type="button" onClick={() => setScreen('home')}>Retour</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  if (screen === 'menu') {
    return (
      <main className="home-page journey-page menu-page">
        <JourneyHeader onBack={() => setScreen('meals')} />
        <section className="journey-step menu-step" aria-labelledby="menu-title">
          <div className="step-heading menu-heading">
            <span className="step-count">03</span>
            <p className="eyebrow">Votre semaine prend forme</p>
            <h1 id="menu-title">Voilà ce qu'on pourrait manger.</h1>
            <p className="step-intro">Une première proposition à ajuster selon vos envies.</p>
          </div>

          <div className="generated-days">
            {days.map((day, dayIndex) => {
              const dayMeals = mealSlots
                .map((slot) => {
                  const key = getMealKey(day, slot)
                  if (!(key in selectedMeals)) return undefined

                  const request = {
                    key,
                    day,
                    dayIndex,
                    moment: slot,
                    people: selectedMeals[key],
                  }

                  if (leftovers[key]) return { ...request, isLeftovers: true }
                  return generatedMenu[key] ?? request
                })
                .filter((meal) => meal !== undefined)

              if (dayMeals.length === 0) return null

              return (
                <article className="generated-day-card" key={day}>
                  <div className="generated-day-header">
                    <span>{String(dayIndex + 1).padStart(2, '0')}</span>
                    <h2>{day}</h2>
                  </div>
                  <div className="generated-meals">
                    {dayMeals.map((meal) => (
                      <GeneratedMealCard
                        key={meal.key}
                        meal={meal}
                        onChange={() => handleChange(meal)}
                        onChoose={() => setPickerKey(meal.key)}
                        onLeftovers={() => handleLeftovers(meal)}
                      />
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="journey-actions validation-action">
            <button className="primary-button" type="button" onClick={() => setScreen('confirmed')}>
              Cette semaine me plaît ! <span aria-hidden="true">↗</span>
            </button>
          </div>

          {pickerKey && (
            <RecipePicker
              meal={getRequests().find((request) => request.key === pickerKey)}
              availableRecipes={availableRecipes}
              selectedSeasons={selectedSeasons}
              search={recipeSearch}
              onSearch={setRecipeSearch}
              onChoose={handleChooseRecipe}
              onClose={() => {
                setPickerKey(null)
                setRecipeSearch('')
              }}
            />
          )}
        </section>
      </main>
    )
  }

  if (screen === 'confirmed') {
    return (
      <main className="home-page journey-page confirmation-page">
        <JourneyHeader onBack={() => setScreen('menu')} />
        <section className="journey-step confirmation-step" aria-labelledby="confirmation-title">
          <div className="step-heading confirmation-heading">
            <span className="step-count">✓</span>
            <p className="eyebrow">C'est noté</p>
            <h1 id="confirmation-title">Menu validé 🎉</h1>
            <p className="step-intro">Voici le récapitulatif de votre semaine.</p>
          </div>

          <div className="confirmation-days">
            {days.map((day, dayIndex) => {
              const dayMeals = displayedMeals.filter((meal) => meal.dayIndex === dayIndex)

              if (dayMeals.length === 0) return null

              return (
                <article className="confirmation-day" key={day}>
                  <div className="confirmation-day-heading">
                    <span>{String(dayIndex + 1).padStart(2, '0')}</span>
                    <h2>{day}</h2>
                  </div>
                  <div className="confirmation-meals">
                    {dayMeals.map((meal) => (
                      <ConfirmationMeal key={meal.key} meal={meal} />
                    ))}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="confirmation-actions">
            <button className="primary-button" type="button" onClick={handleSaveWeek}
              disabled={isSavingWeek || isWeekSaved || !canSaveWeek} aria-busy={isSavingWeek}>
              {isSavingWeek ? 'Sauvegarde en cours…' : isWeekSaved ? 'Semaine sauvegardée ✓' : 'Je sauvegarde cette semaine'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setScreen('menu')}>
              Modifier ma semaine <span aria-hidden="true">←</span>
            </button>
            <button className="secondary-button" type="button" onClick={handleRestart}>
              Recommencer
            </button>
          </div>
          <div className="save-week-message" aria-live="polite">
            {isWeekSaved && <p>Semaine sauvegardée ✓</p>}
            {!canSaveWeek && <p>Choisissez une recette ou « Restes » pour chaque repas avant de sauvegarder.</p>}
            {saveError?.snapshot === snapshotKey && <p role="alert">{saveError.message}</p>}
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'meals') {
    return (
      <main className="home-page journey-page">
        <JourneyHeader onBack={() => setScreen('people')} />
        <section className="journey-step meals-step" aria-labelledby="meals-title">
          <div className="step-heading meals-heading">
            <span className="step-count">02</span>
            <p className="eyebrow">À vous de choisir</p>
            <h1 id="meals-title">Quels repas voulez-vous prévoir ?</h1>
            <p className="step-intro">Sélectionnez les moments où vous voulez des idées.</p>
          </div>

          <div className="shortcut-row" aria-label="Raccourcis de sélection">
            <button type="button" onClick={() => setShortcut('all')}>Tout sélectionner</button>
            <button type="button" onClick={() => setShortcut('evenings')}>Tous les soirs</button>
            <button type="button" onClick={() => setShortcut('week')}>Semaine</button>
            <button type="button" onClick={() => setShortcut('clear')}>Effacer</button>
          </div>

          <div className="days-list">
            {days.map((day, dayIndex) => (
              <article className="day-card" key={day}>
                <div className="day-name">
                  <span>{String(dayIndex + 1).padStart(2, '0')}</span>
                  <h2>{day}</h2>
                </div>
                <div className="meal-options">
                  {mealSlots.map((slot) => {
                    const key = getMealKey(day, slot)
                    const isSelected = key in selectedMeals

                    return (
                      <div className={`meal-option ${isSelected ? 'is-selected' : ''}`} key={slot}>
                        <button
                          className="meal-toggle"
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => updateMeal(day, slot)}
                        >
                          <span className="meal-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                          <span>{slot}</span>
                        </button>
                        {isSelected && (
                          <label className="people-per-meal">
                            <span>Pour</span>
                            <select
                              aria-label={`${day} ${slot}, nombre de personnes`}
                              value={selectedMeals[key]}
                              onChange={(event) => updatePeople(day, slot, Number(event.target.value))}
                            >
                              {[1, 2, 3, 4, 5, 6].map((people) => (
                                <option key={people} value={people}>{people}</option>
                              ))}
                            </select>
                            <span>{selectedMeals[key] === 1 ? 'personne' : 'personnes'}</span>
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>

          <div className="journey-actions meals-actions">
            <button className="primary-button" type="button" onClick={handleGenerate}>
              Générer mes menus <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="home-page">
      <header className="topbar">
        <span className="brand-mark" aria-hidden="true">✳</span>
        <span className="brand-name">Cassecroute</span>
        <span className="topbar-note">La semaine, mais en mieux</span>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow">Le menu de la semaine</p>
          <h1 id="welcome-title">
            Qu'est-ce qu'on mange cette semaine{ '\u00a0' }?
          </h1>
          <p className="welcome-text">
            Des idées simples, joyeuses et sans prise de tête pour remplir les
            assiettes.
          </p>
          <div className="sparkle" aria-hidden="true">✦</div>
        </div>

        <div className="choice-grid">
          <button className="choice-card choice-card-add" type="button" onClick={() => { setScreen('add'); setHasSubmittedForm(false); setFormValidated(false) }}>
            <span className="card-icon" aria-hidden="true">＋</span>
            <span className="choice-content">
              <strong>Ajouter un plat</strong>
              <span>Créer une nouvelle idée</span>
            </span>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </button>

          <button className="choice-card choice-card-compose" type="button" onClick={() => setScreen('people')}>
            <span className="card-icon" aria-hidden="true">🍴</span>
            <span className="choice-content">
              <strong>Composer ma semaine</strong>
              <span>On se lance ?</span>
            </span>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      <footer className="home-footer">
        <span>15 plats dans la marmite</span>
        <span aria-hidden="true">•</span>
        <span>Fait pour les semaines bien remplies</span>
      </footer>
    </main>
  )
}

type JourneyHeaderProps = { onBack: () => void }

function JourneyHeader({ onBack }: JourneyHeaderProps) {
  return (
    <header className="topbar journey-header">
      <button className="back-button" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Retour
      </button>
      <span className="brand-mark" aria-hidden="true">✳</span>
      <span className="brand-name">Cassecroute</span>
    </header>
  )
}

type GeneratedMealCardProps = {
  meal: DisplayMeal
  onChange: () => void
  onChoose: () => void
  onLeftovers: () => void
}

function GeneratedMealCard({ meal, onChange, onChoose, onLeftovers }: GeneratedMealCardProps) {
  if (!('recipe' in meal)) {
    return (
      <div className={`generated-meal-card ${meal.isLeftovers ? 'leftovers-meal-card' : 'unavailable-meal-card'}`}>
        <div className="generated-meal-topline">
          <span className="meal-label">{meal.moment}</span>
          <span className="meal-people">Pour {meal.people} {meal.people === 1 ? 'personne' : 'personnes'}</span>
        </div>
        {meal.isLeftovers ? (
          <>
            <h3>🥡 Restes</h3>
            <MealActions onChange={onChange} onChoose={onChoose} onLeftovers={onLeftovers} />
          </>
        ) : (
          <>
            <h3>Aucune proposition disponible</h3>
            <p className="unavailable-meal-text">La base actuelle ne contient pas assez de plats compatibles avec ce créneau.</p>
          </>
        )}
      </div>
    )
  }

  const { recipe } = meal

  return (
    <div className="generated-meal-card">
      <div className="generated-meal-topline">
        <span className="meal-label">{meal.moment}</span>
        <span className="meal-people">Pour {meal.people} {meal.people === 1 ? 'personne' : 'personnes'}</span>
      </div>
      <h3>{recipe.name}</h3>
      <div className="recipe-details">
        <span>{recipe.time}</span>
        <span>{recipe.style}</span>
        <span>{recipe.starch ?? 'Sans féculent'}</span>
      </div>
      <MealActions onChange={onChange} onChoose={onChoose} onLeftovers={onLeftovers} />
    </div>
  )
}

type MealActionsProps = {
  onChange: () => void
  onChoose: () => void
  onLeftovers: () => void
}

function MealActions({ onChange, onChoose, onLeftovers }: MealActionsProps) {
  return (
    <div className="meal-actions">
      <button type="button" onClick={onChange}>
        <span aria-hidden="true">⟳</span> Changer
      </button>
      <button type="button" onClick={onChoose}>
        <span aria-hidden="true">✦</span> Choisir moi-même
      </button>
      <button type="button" onClick={onLeftovers}>
        <span aria-hidden="true">🥡</span> Restes
      </button>
    </div>
  )
}

type ConfirmationMealProps = { meal: DisplayMeal }

function ConfirmationMeal({ meal }: ConfirmationMealProps) {
  return (
    <div className="confirmation-meal">
      <div className="confirmation-meal-label">
        <span>{meal.moment}</span>
        <span>Pour {meal.people} {meal.people === 1 ? 'personne' : 'personnes'}</span>
      </div>
      <strong>{'isLeftovers' in meal && meal.isLeftovers ? '🥡 Restes' : 'recipe' in meal ? meal.recipe.name : 'Aucune proposition disponible'}</strong>
      {'recipe' in meal && (
        <span className="confirmation-meal-details">{meal.recipe.time} · {meal.recipe.style}</span>
      )}
    </div>
  )
}

type RecipePickerProps = {
  meal: MenuRequest | undefined
  availableRecipes: Recipe[]
  selectedSeasons: string[]
  search: string
  onSearch: (value: string) => void
  onChoose: (meal: MenuRequest, recipeId: string) => void
  onClose: () => void
}

function RecipePicker({ meal, availableRecipes, selectedSeasons, search, onSearch, onChoose, onClose }: RecipePickerProps) {
  if (!meal) return null

  const compatibleRecipes = availableRecipes
    .filter((recipe) => recipe.moments.includes(meal.moment))
    .filter((recipe) => isSeasonEligible(recipe, selectedSeasons))
    .filter((recipe) => recipe.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))

  return (
    <div className="picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="recipe-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="picker-header">
          <div>
            <p className="eyebrow">Choisir pour {meal.moment.toLowerCase()}</p>
            <h2 id="picker-title">Une autre idée ?</h2>
          </div>
          <button className="picker-close" type="button" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
        <input
          className="recipe-search"
          type="search"
          placeholder="Rechercher un plat"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          autoFocus
        />
        <div className="recipe-picker-list">
          {compatibleRecipes.length > 0 ? compatibleRecipes.map((recipe) => (
            <button className="recipe-choice" type="button" key={recipe.id} onClick={() => onChoose(meal, recipe.id)}>
              <span className="recipe-choice-name">{recipe.name}</span>
              <span className="recipe-choice-details">
                <span>{recipe.time}</span>
                <span>{recipe.style}</span>
                <span>{recipe.starch ?? 'Sans féculent'}</span>
              </span>
            </button>
          )) : (
            <p className="empty-picker">Aucun plat ne correspond à cette recherche.</p>
          )}
        </div>
      </section>
    </div>
  )
}

type FormFieldProps = {
  label: string
  required?: boolean
  error?: boolean
  children: React.ReactNode
}

function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label className="form-label">
        {label} {required && <span aria-hidden="true">*</span>}
      </label>
      {children}
    </div>
  )
}

type FormChoiceGroupProps = {
  label: string
  required?: boolean
  error?: boolean
  children: React.ReactNode
}

function FormChoiceGroup({ label, required, error, children }: FormChoiceGroupProps) {
  return (
    <fieldset className={`form-field form-choice-group ${error ? 'has-error' : ''}`}>
      <legend className="form-label">{label} {required && <span aria-hidden="true">*</span>}</legend>
      {children}
    </fieldset>
  )
}

type ChoiceButtonsProps = {
  values: string[]
  selected: string[]
  onToggle: (value: string) => void
  single?: boolean
}

function ChoiceButtons({ values, selected, onToggle, single }: ChoiceButtonsProps) {
  return (
    <div className="choice-buttons" role="group">
      {values.map((value) => (
        <button
          className={`choice-pill ${selected.includes(value) ? 'is-selected' : ''}`}
          type="button"
          key={value}
          aria-pressed={selected.includes(value)}
          onClick={() => onToggle(value)}
        >
          {value}
          {single && selected.includes(value) && <span aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  )
}

export default App
