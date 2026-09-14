import { useEffect, useState } from 'react'
import { loadHistory, type HistoryWeek, type HistoryMeal } from '../lib/historyRepository'

const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const moments = ['Midi', 'Soir'] as const
const dishName = (meal: HistoryMeal) => meal.is_leftovers ? '🥡 Restes' : meal.recipe_name
const dateAt = (start: string, offset: number) => {
  const date = new Date(`${start}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}
const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })

function weekPeriod(start: string) {
  const first = dateAt(start, 0)
  const last = dateAt(start, 6)
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear()
  const sameMonth = sameYear && first.getUTCMonth() === last.getUTCMonth()
  return `${formatDate(first, { day: 'numeric', ...(!sameMonth && { month: 'long' }), ...(!sameYear && { year: 'numeric' }) })} → ${formatDate(last, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

export function History({ onBack, onCompose }: { onBack: () => void; onCompose: () => void }) {
  const [weeks, setWeeks] = useState<HistoryWeek[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<HistoryWeek | null>(null)

  useEffect(() => {
    let active = true
    loadHistory().then((data) => {
      if (active) { setWeeks(data); setStatus('ready') }
    }).catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [attempt])

  const back = () => { if (selected) setSelected(null); else onBack() }
  return (
    <main className="home-page journey-page history-page">
      <header className="topbar journey-header">
        <button className="back-button" type="button" onClick={back}><span aria-hidden="true">←</span> Retour</button>
        <span className="brand-mark" aria-hidden="true">✳</span>
        <span className="brand-name">Cassecroute</span>
      </header>
      <section className="journey-step history-step" aria-labelledby="history-title">
        <div className="step-heading">
          <span className="step-count" aria-hidden="true">▦</span>
          <p className="eyebrow">{selected ? 'Une semaine à table' : 'Nos dernières semaines'}</p>
          <h1 id="history-title">{selected ? weekPeriod(selected.week_start) : 'Historique'}</h1>
          <p className="step-intro">{selected ? 'Les plats que nous avions choisis.' : 'Les menus se suivent, les bonnes idées restent.'}</p>
        </div>

        {selected ? (
          <div className="confirmation-days history-detail">
            {days.map((day, dayIndex) => {
              const meals = moments.flatMap((moment) => selected.meals.filter((meal) => meal.day_index === dayIndex && meal.moment === moment))
              if (!meals.length) return null
              return <article className="confirmation-day" key={day}>
                <div className="confirmation-day-heading">
                  <span>{formatDate(dateAt(selected.week_start, dayIndex), { day: '2-digit', month: '2-digit' })}</span>
                  <h2>{day}</h2>
                </div>
                <div className="confirmation-meals">
                  {meals.map((meal) => <div className="confirmation-meal" key={meal.moment}>
                    <span className="history-moment">{meal.moment}</span>
                    <strong>{dishName(meal)}</strong>
                  </div>)}
                </div>
              </article>
            })}
          </div>
        ) : status === 'loading' ? (
          <div className="history-state" role="status">On retrouve nos dernières semaines…</div>
        ) : status === 'error' ? (
          <div className="history-state">
            <p role="alert">Impossible de retrouver les semaines pour le moment.</p>
            <button className="secondary-button" type="button" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1) }}>Réessayer</button>
          </div>
        ) : weeks.length === 0 ? (
          <div className="history-state">
            <h2>Pas encore de semaine sauvegardée.</h2>
            <p>Une première semaine, quelques bons petits plats… et nos souvenirs commencent ici.</p>
            <button className="primary-button" type="button" onClick={onCompose}>Composer une semaine <span aria-hidden="true">↗</span></button>
          </div>
        ) : (
          <div className="history-grid">
            {weeks.map((week) => <button className="history-card" key={week.id} type="button" onClick={() => setSelected(week)}>
              <span className="history-card-top"><span>{week.meals.length} repas à table</span><span aria-hidden="true">↗</span></span>
              <span className="history-period">{weekPeriod(week.week_start)}</span>
              <span className="history-calendar" aria-hidden="true">
                {days.map((day, dayIndex) => <span className="history-calendar-day" key={day}>
                  <span>{day.slice(0, 3)}</span>
                  <strong>{dateAt(week.week_start, dayIndex).getUTCDate()}</strong>
                  <span className="history-dots">{moments.map((moment) => <i key={moment} className={week.meals.some((meal) => meal.day_index === dayIndex && meal.moment === moment) ? 'is-filled' : ''} />)}</span>
                </span>)}
              </span>
              <span className="history-preview">{[...week.meals].sort((a, b) => a.day_index - b.day_index || moments.indexOf(a.moment) - moments.indexOf(b.moment)).slice(0, 3).map((meal) => <span key={`${meal.day_index}-${meal.moment}`}>{dishName(meal)}</span>)}</span>
              <span className="history-open">Revoir cette semaine <span aria-hidden="true">→</span></span>
            </button>)}
          </div>
        )}
        {selected && <div className="confirmation-actions"><button className="secondary-button" type="button" onClick={back}>Retour à l’Historique</button></div>}
      </section>
    </main>
  )
}
