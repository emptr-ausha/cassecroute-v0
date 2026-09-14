import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { generateMenu, replaceMeal } from '../src/lib/generateMenu.ts'
import { nextWeekStart, previousWeekStart } from '../src/lib/menuDates.ts'

const request = {key:'Lundi-Soir',day:'Lundi',dayIndex:0,moment:'Soir',people:2}
const recipe = (id, changes={}) => ({id,name:id,moments:['Midi','Soir'],seasons:["Toute l'année"],time:'Rapide',style:'Healthy',type:'Végétarien',weekType:'Tous les jours',classic:false,...changes})
const old = recipe('previous')
const fresh = recipe('fresh')
const current = {[request.key]:{...request,recipe:recipe('current')}}
const selectBoth = (recipes, ids) => [
  generateMenu([request],recipes,['Été'],ids)[request.key]?.recipe.id,
  replaceMeal(request,current,recipes,['Été'],ids)[request.key]?.recipe.id,
]

test('1: initial generation and Changer avoid last week at equal existing priority', t => {
  t.mock.method(Math,'random',()=>0.5)
  assert.deepEqual(selectBoth([old,fresh],new Set(['previous'])),['fresh','fresh'])
})
test('2: previous recipe remains available when it is the only compatible option', t => {
  t.mock.method(Math,'random',()=>0.5)
  assert.deepEqual(selectBoth([old,recipe('wrong-moment',{moments:['Midi']}),recipe('wrong-season',{seasons:['Hiver']})],new Set(['previous'])),['previous','previous'])
})
test('existing time and starch preferences remain ahead of history; starch fallback remains soft', t => {
  t.mock.method(Math,'random',()=>0.5)
  assert.deepEqual(selectBoth([recipe('previous',{time:'Express'}),fresh],new Set(['previous'])),['previous','previous'])
  const lunch={...request,key:'Lundi-Midi',moment:'Midi',recipe:recipe('lunch',{starch:'Riz'})}
  const recipes=[recipe('previous',{starch:'Pâtes'}),recipe('fresh',{starch:'Riz'})]
  assert.equal(replaceMeal(request,{...current,[lunch.key]:lunch},recipes,['Été'],new Set(['previous']))[request.key].recipe.id,'previous')
  assert.equal(replaceMeal(request,{...current,[lunch.key]:lunch},[recipes[1]],['Été'],new Set(['fresh']))[request.key].recipe.id,'fresh')
})
test('dates use Paris, with next Monday always in the future', () => {
  for(const [instant,next,previous] of [
    ['2026-09-13T21:59:59Z','2026-09-14','2026-09-07'],
    ['2026-09-13T22:00:00Z','2026-09-21','2026-09-14'],
    ['2026-09-14T12:00:00Z','2026-09-21','2026-09-14'],
    ['2026-03-29T22:00:00Z','2026-04-06','2026-03-30'],
    ['2026-10-25T23:00:00Z','2026-11-02','2026-10-26'],
  ]) {
    assert.equal(nextWeekStart(new Date(instant)),next)
    assert.equal(previousWeekStart(new Date(instant)),previous)
  }
})
test('3/4: exact previous week only; older weeks, leftovers, null IDs and read failures ignored', async t => {
  // Vite supplies import.meta.env; all database reads below are replaced locally.
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',define:{
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-public-key'),
  }})
  try {
    const {loadPreviousRecipeIds}=await server.ssrLoadModule('/src/lib/historyRepository.ts')
    const {supabase}=await server.ssrLoadModule('/src/lib/supabase.ts')
    const now=new Date('2026-09-14T12:00:00Z')
    let rows=[], fail=false, selectedDate
    t.mock.method(Math,'random',()=>0.5)
    t.mock.method(supabase,'from',table=>{
      assert.equal(table,'menu_weeks')
      const query={
        select(){return query},
        eq(column,value){assert.equal(column,'week_start');selectedDate=value;return query},
        abortSignal(){return query},
        async maybeSingle(){return {data:rows.find(row=>row.week_start===selectedDate)??null,error:fail?Error('offline'):null}},
      }
      return query
    })
    rows=[{week_start:'2026-09-07',meals:[{recipe_id:'previous',is_leftovers:false}]}]
    let ids=await loadPreviousRecipeIds(now)
    assert.equal(selectedDate,'2026-09-14')
    assert.equal(ids.size,0)
    assert.deepEqual(selectBoth([old,fresh],ids),['previous','previous'])
    rows=[]
    ids=await loadPreviousRecipeIds(now)
    assert.deepEqual(selectBoth([old,fresh],ids),selectBoth([old,fresh],undefined))
    rows=[{week_start:'2026-09-14',meals:[{recipe_id:'previous',is_leftovers:false},{recipe_id:'leftover',is_leftovers:true},{recipe_id:null,is_leftovers:false}]}]
    ids=await loadPreviousRecipeIds(now)
    assert.deepEqual([...ids],['previous'])
    assert.deepEqual(selectBoth([old,fresh],ids),['fresh','fresh'])
    fail=true
    assert.equal((await loadPreviousRecipeIds(now)).size,0)
  }finally{await server.close()}
})
