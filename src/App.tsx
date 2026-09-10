import { useEffect, useState } from 'react'
import { recipes as localRecipes, type Recipe } from './data/recipes'
import {
  generateMenu,
  replaceMeal,
  type GeneratedMenu,
  type MenuRequest,
} from './lib/generateMenu'
import { loadRecipes } from './lib/recipeRepository'
import './App.css'

type Screen = 'home' | 'people' | 'meals' | 'menu' | 'confirmed'
type MealSlot = 'Midi' | 'Soir'
type SelectedMeals = Record<string, number>
type Leftovers = Record<string, boolean>
type DisplayMeal = (GeneratedMenu[string] | MenuRequest) & { isLeftovers?: boolean }

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

const getMealKey = (day: string, slot: MealSlot) => `${day}-${slot}`

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [defaultPeople, setDefaultPeople] = useState(2)
  const [selectedMeals, setSelectedMeals] = useState<SelectedMeals>({})
  const [generatedMenu, setGeneratedMenu] = useState<GeneratedMenu>({})
  const [availableRecipes, setAvailableRecipes] = useState<Recipe[]>(localRecipes)
  const [leftovers, setLeftovers] = useState<Leftovers>({})
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')

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
    setGeneratedMenu(generateMenu(getRequests(), availableRecipes))
    setLeftovers({})
    setScreen('menu')
  }

  const handleChange = (meal: MenuRequest) => {
    setGeneratedMenu((current) => replaceMeal(meal, current, availableRecipes))
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
    setScreen('home')
    setDefaultPeople(2)
    setSelectedMeals({})
    setGeneratedMenu({})
    setLeftovers({})
    setPickerKey(null)
    setRecipeSearch('')
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
        <section className="journey-step people-step" aria-labelledby="people-title">
          <div className="step-heading">
            <span className="step-count">01</span>
            <p className="eyebrow">On commence par le début</p>
            <h1 id="people-title">Vous serez combien à table ?</h1>
            <p className="step-intro">On adaptera chaque repas à votre tribu.</p>
          </div>

          <div className="people-grid" role="group" aria-label="Nombre de personnes">
            {[1, 2, 3, 4, 5, 6].map((people) => (
              <button
                className={`people-choice ${defaultPeople === people ? 'is-selected' : ''}`}
                key={people}
                type="button"
                aria-pressed={defaultPeople === people}
                onClick={() => setDefaultPeople(people)}
              >
                <strong>{people}</strong>
                <span>{people === 1 ? 'personne' : 'personnes'}</span>
              </button>
            ))}
          </div>

          <div className="journey-actions">
            <button className="primary-button" type="button" onClick={() => setScreen('meals')}>
              Continuer <span aria-hidden="true">↗</span>
            </button>
          </div>
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
            <button className="primary-button" type="button" onClick={() => setScreen('menu')}>
              Modifier ma semaine <span aria-hidden="true">←</span>
            </button>
            <button className="secondary-button" type="button" onClick={handleRestart}>
              Recommencer
            </button>
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
          <button className="choice-card choice-card-add" type="button" disabled>
            <span className="card-icon" aria-hidden="true">＋</span>
            <span className="choice-content">
              <strong>Ajouter un plat</strong>
              <span>Bientôt disponible</span>
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
  search: string
  onSearch: (value: string) => void
  onChoose: (meal: MenuRequest, recipeId: string) => void
  onClose: () => void
}

function RecipePicker({ meal, availableRecipes, search, onSearch, onChoose, onClose }: RecipePickerProps) {
  if (!meal) return null

  const compatibleRecipes = availableRecipes
    .filter((recipe) => recipe.moments.includes(meal.moment))
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

export default App
