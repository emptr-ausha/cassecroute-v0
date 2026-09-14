import assert from 'node:assert/strict'
import test from 'node:test'
import handler, { nextWeekStart, validateMeals } from '../api/menu-weeks.ts'

const recipe = {
  day_index: 0, moment: 'Midi', recipe_id: 'salade',
  recipe_name: 'Salade composée', is_leftovers: false,
}

test('next Monday uses the Paris date, including Mondays and DST boundaries', () => {
  const cases = [
    ['2026-09-13T21:59:59Z', '2026-09-14'],
    ['2026-09-13T22:00:00Z', '2026-09-21'],
    ['2026-09-14T12:00:00Z', '2026-09-21'],
    ['2026-03-29T00:59:59Z', '2026-03-30'],
    ['2026-03-29T01:00:00Z', '2026-03-30'],
    ['2026-03-29T22:00:00Z', '2026-04-06'],
    ['2026-10-25T00:59:59Z', '2026-10-26'],
    ['2026-10-25T01:00:00Z', '2026-10-26'],
    ['2026-10-25T23:00:00Z', '2026-11-02'],
    ['2026-12-31T23:30:00Z', '2027-01-04'],
  ]
  for (const [instant, expected] of cases) {
    assert.equal(nextWeekStart(new Date(instant)), expected, instant)
  }
})

test('snapshot preserves names, normalizes leftovers and strips unrelated fields', () => {
  assert.deepEqual(validateMeals({ meals: [
    { ...recipe, people: 4, seasons: ['Été'], ingredients: ['tomate'] },
    { day_index: 6, moment: 'Soir', is_leftovers: true, recipe_id: 'old', recipe_name: 'old' },
  ] }), [recipe, {
    day_index: 6, moment: 'Soir', recipe_id: null,
    recipe_name: '🥡 Restes', is_leftovers: true,
  }])
})

test('invalid or duplicate slots cannot replace a saved snapshot', () => {
  for (const body of [
    null, {}, { meals: [] }, { meals: [recipe, recipe] },
    ...[
      { day_index: -1 }, { day_index: 7 }, { day_index: 0.5 },
      { moment: 'Matin' }, { recipe_id: null }, { recipe_name: ' ' },
      { is_leftovers: 'false' },
    ].map((change) => ({ meals: [{ ...recipe, ...change }] })),
  ]) assert.equal(validateMeals(body), null)
})

const response = () => ({
  code: 0, headers: {}, body: undefined,
  setHeader(key, value) { this.headers[key] = value },
  status(code) { this.code = code; return this },
  json(body) { this.body = body },
})

test('route validates requests before accessing Supabase', async () => {
  const res = response()
  await handler({ method: 'GET' }, res)
  assert.equal(res.code, 405)
  assert.equal(res.headers.Allow, 'POST')
  await handler({ method: 'POST', body: { meals: [] } }, res)
  assert.equal(res.code, 400)
})

test('route calls a single transactional RPC with the server date and sanitized meals', async (t) => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey
  })
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(String(url), 'https://example.supabase.co/rest/v1/rpc/save_menu_week')
    assert.deepEqual(JSON.parse(options.body), {
      p_week_start: nextWeekStart(), p_meals: [recipe],
    })
    return new Response(JSON.stringify({ id: 'week-id', week_start: nextWeekStart() }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  })
  const res = response()
  await handler({ method: 'POST', body: { week_start: '2000-01-03', meals: [recipe] } }, res)
  assert.equal(res.code, 200)
  assert.equal(res.body.week.id, 'week-id')
  assert.equal(calls, 1)

  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ message: 'private database details' }), { status: 400 },
  ))
  await handler({ method: 'POST', body: { meals: [recipe] } }, res)
  assert.equal(res.code, 500)
  assert.deepEqual(res.body, { error: 'La semaine n’a pas pu être sauvegardée' })
})
