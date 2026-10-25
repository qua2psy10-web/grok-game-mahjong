import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

function loadMJ() {
  const sandbox = { console }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const file of ['tiles.js', 'hand.js', 'ai.js', 'game.js']) {
    const code = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8')
    vm.runInContext(code, sandbox, { filename: file })
  }
  return sandbox.MJ
}

const MJ = loadMJ()

function parseTypes(spec) {
  const out = []
  let nums = ''
  for (const ch of spec) {
    if ('mpsz'.includes(ch)) {
      for (const n of nums) {
        if (ch === 'z') out.push(26 + Number(n))
        else out.push({ m: 0, p: 9, s: 18 }[ch] + Number(n) - 1)
      }
      nums = ''
    } else nums += ch
  }
  return out
}

function arrangeDealer(spec) {
  const wall = MJ.makeTiles()
  const used = new Set()
  const front = []
  for (const type of parseTypes(spec)) {
    const tile = wall.find(function (item) { return item.type === type && !used.has(item.id) })
    if (!tile) throw new Error('missing ' + type)
    used.add(tile.id)
    front.push(tile)
  }
  const rest = wall.filter(function (tile) { return !used.has(tile.id) })
  return front.slice(0, 13).concat(rest.slice(0, 39), [front[13]], rest.slice(39))
}

function playMatch(seed) {
  const state = MJ.createMatch({ seed: seed, agents: [true, true, true, true] })
  let guard = 0
  while (state.phase !== 'match-end' && guard < 30000) {
    if (state.phase === 'hand-end') {
      const broken = MJ.invariant(state)
      if (broken) throw new Error(seed + ' ' + broken)
      MJ.nextHand(state)
      continue
    }
    const stopped = MJ.step(state)
    const broken = MJ.invariant(state)
    if (broken) throw new Error(seed + ' ' + broken + ' phase ' + state.phase)
    if (stopped === 'stop' && state.phase !== 'hand-end' && state.phase !== 'match-end') {
      throw new Error(seed + ' stopped in ' + state.phase)
    }
    guard++
  }
  if (state.phase !== 'match-end') throw new Error(seed + ' did not finish')
  return state
}

test('a dealt winning hand can be tsumoed by the dealer', function () {
  const state = MJ.createMatch({
    wall: arrangeDealer('234m567m345p234s88p'),
    agents: [false, true, true, true]
  })
  assert.equal(MJ.invariant(state), null)
  assert.ok(MJ.canTsumo(state, 0))
  MJ.tsumo(state, 0)
  assert.equal(state.phase, 'hand-end')
  assert.equal(state.result.winner, 0)
  assert.ok(state.result.scored.yakuman >= 1)
  assert.equal(MJ.invariant(state), null)
  assert.ok(state.scores[0] > 25000)
})

test('cpu matches finish with all 100000 points accounted for', function () {
  const started = Date.now()
  let wins = 0
  for (let seed = 1; seed <= 6; seed++) {
    const state = playMatch(seed)
    assert.equal(MJ.invariant(state), null)
    wins += state.log.filter(function (line) { return line.indexOf('上がりました') >= 0 }).length
  }
  assert.ok(wins > 0, 'nobody ever won')
  assert.ok(Date.now() - started < 20000, 'too slow')
})
