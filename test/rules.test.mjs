import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

function loadMJ() {
  const sandbox = { console }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  for (const file of ['tiles.js', 'hand.js']) {
    const code = fs.readFileSync(new URL('../js/' + file, import.meta.url), 'utf8')
    vm.runInContext(code, sandbox, { filename: file })
  }
  return sandbox.MJ
}

const MJ = loadMJ()

function countsFrom(spec) {
  const c = new Array(34).fill(0)
  for (const type of parseTypes(spec)) c[type]++
  return c
}

function parseTypes(spec) {
  const out = []
  let nums = ''
  for (const ch of spec) {
    if ('mpsz'.includes(ch)) {
      for (const n of nums) {
        if (ch === 'z') out.push(26 + Number(n))
        else out.push({ m: 0, p: 9, s: 18 }[ch] + (n === '0' ? 4 : Number(n) - 1))
      }
      nums = ''
    } else nums += ch
  }
  return out
}

function tilesFrom(spec) {
  return parseTypes(spec).map(function (type, i) {
    return { id: i + 1, type: type, red: false }
  })
}

function same(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected)
}

function ctx(extra) {
  return Object.assign({
    winTile: { id: 99, type: 0, red: false },
    tsumo: true,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    rinshan: false,
    haitei: false,
    houtei: false,
    chankan: false,
    tenhou: false,
    chiihou: false,
    seatWind: 28,
    roundWind: 27,
    doraIndicators: [],
    uraIndicators: []
  }, extra)
}

test('dora wraps each suit and the honors', function () {
  assert.equal(MJ.doraFrom(0), 1)
  assert.equal(MJ.doraFrom(8), 0)
  assert.equal(MJ.doraFrom(30), 27)
  assert.equal(MJ.doraFrom(33), 31)
  assert.equal(MJ.tileName(4, true), '赤五萬')
  assert.equal(MJ.tileName(32), '發')
})

test('a finished hand is shanten -1 and a tenpai hand is 0', function () {
  assert.equal(MJ.shanten(countsFrom('123m456m789m123p11s'), 0), -1)
  assert.equal(MJ.shanten(countsFrom('123m456m789m123p1s'), 0), 0)
  assert.equal(MJ.shanten(countsFrom('11223344556677z'), 0), -1)
  assert.equal(MJ.shanten(countsFrom('19m19p19s1234567z1z'), 0), -1)
  assert.equal(MJ.shanten(countsFrom('19m19p19s1234567z'), 0), 0)
  assert.equal(MJ.isAgari(countsFrom('123m456m789m123p11s'), 0), true)
  assert.equal(MJ.isAgari(countsFrom('123m456m789m123p1s2s'), 0), false)
})

test('one open meld changes the shanten target', function () {
  assert.equal(MJ.shanten(countsFrom('123m456m789m11s'), 1), -1)
  assert.equal(MJ.shanten(countsFrom('123m456m789m1s'), 1), 0)
})

test('waits of a ryanmen hand', function () {
  const waits = MJ.waits(tilesFrom('123m456m789m23p77s'), 0)
  same(waits, [9, 12])
})

test('classic scores', function () {
  const pinfu = tilesFrom('234m567m345p234s88p')
  const scored = MJ.scoreWin(pinfu, [], ctx({
    tsumo: true,
    winTile: pinfu.find(function (t) { return t.type === 21 }),
    seatWind: 28,
    roundWind: 27
  }))
  assert.ok(scored.yaku.some(function (y) { return y.id === 'pinfu' }))
  assert.ok(scored.yaku.some(function (y) { return y.id === 'tanyao' }))
  assert.ok(scored.yaku.some(function (y) { return y.id === 'menzen' }))
  assert.equal(scored.han, 3)
  assert.equal(scored.fu, 20)
  const pay = MJ.payments(scored, 1, 0, null, true, 0, 0)
  same(pay, [-1300, 2700, -700, -700])

  const chiitoi = tilesFrom('1133m2255p77s1199p')
  const cscore = MJ.scoreWin(chiitoi, [], ctx({
    tsumo: false,
    winTile: chiitoi[chiitoi.length - 1]
  }))
  assert.equal(cscore.han, 2)
  assert.equal(cscore.fu, 25)
  same(MJ.payments(cscore, 1, 0, 2, false, 0, 0), [0, 1600, -1600, 0])

  const yakuman = tilesFrom('19m19p19s1234567z1z')
  const kscore = MJ.scoreWin(yakuman, [], ctx({
    tsumo: false,
    winTile: { id: 1, type: 27, red: false }
  }))
  assert.equal(kscore.yakuman, 1)
  assert.equal(MJ.payments(kscore, 1, 0, 2, false, 0, 0)[1], 32000)
})

test('open yakuhai ron is 1000, and a shapeless open hand cannot win', function () {
  const concealed = tilesFrom('234m567m234p55s')
  const win = concealed.find(function (t) { return t.type === 22 })
  const melds = [{
    kind: 'pon',
    tiles: [
      { id: 50, type: 33, red: false },
      { id: 51, type: 33, red: false },
      { id: 52, type: 33, red: false }
    ]
  }]
  const scored = MJ.scoreWin(concealed, melds, ctx({ tsumo: false, winTile: win, seatWind: 28, roundWind: 27 }))
  assert.equal(scored.han, 1)
  assert.equal(scored.fu, 30)
  same(MJ.payments(scored, 1, 0, 2, false, 0, 0), [0, 1000, -1000, 0])

  const nothing = tilesFrom('456p789p123s99s')
  const open = [{
    kind: 'chi',
    tiles: [
      { id: 70, type: 0, red: false },
      { id: 71, type: 1, red: false },
      { id: 72, type: 2, red: false }
    ]
  }]
  const noYaku = MJ.scoreWin(nothing, open, ctx({
    tsumo: false,
    winTile: nothing.find(function (t) { return t.type === 26 })
  }))
  assert.equal(noYaku, null)
})

test('sanankou tanyao tsumo is a mangan', function () {
  const hand = tilesFrom('222333444m567p88p')
  const scored = MJ.scoreWin(hand, [], ctx({
    tsumo: true,
    winTile: hand.find(function (t) { return t.type === 16 })
  }))
  assert.ok(scored.yaku.some(function (y) { return y.id === 'sanankou' }))
  assert.equal(scored.limit, '満貫')
  const pay = MJ.payments(scored, 1, 0, null, true, 0, 0)
  assert.equal(pay[0], -4000)
  assert.equal(pay[2], -2000)
  assert.equal(pay[1], 8000)
})

test('dora and aka add han only when a yaku exists', function () {
  const hand = tilesFrom('123m456m789m234p77s')
  hand[0].red = false
  const five = { id: 40, type: 4, red: true }
  const scored = MJ.scoreWin(hand, [], ctx({
    tsumo: false,
    winTile: hand.find(function (t) { return t.type === 12 }),
    doraIndicators: [{ id: 7, type: 3, red: false }]
  }))
  assert.ok(scored.yaku.some(function (y) { return y.id === 'dora' }))
  const withAka = hand.map(function (t) { return t.type === 4 ? five : t })
  const aka = MJ.scoreWin(withAka, [], ctx({
    tsumo: false,
    winTile: withAka.find(function (t) { return t.type === 12 })
  }))
  assert.ok(aka.yaku.some(function (y) { return y.id === 'aka' }))
})

test('chi swap-back tiles are forbidden', function () {
  same(MJ.chiKuikae(2, 4).sort(function (a, b) { return a - b }), [1, 4])
  same(MJ.chiKuikae(2, 2).sort(function (a, b) { return a - b }), [2, 5])
  same(MJ.chiOptions(tilesFrom('3456m'), 3).map(function (o) { return o.low }).sort(function (a, b) { return a - b }), [2, 3])
})

test('dealer ron and honba and riichi sticks', function () {
  const scored = { basic: 240, han: 1, fu: 30, yakuman: 0 }
  same(MJ.payments(scored, 0, 0, 2, false, 1, 2), [3800, 0, -1800, 0])
})

test('winning on the edge of 123 is not pinfu', function () {
  const hand = tilesFrom('234m567m345p123s88p')
  const scored = MJ.scoreWin(hand, [], ctx({
    tsumo: true,
    winTile: hand.find(function (t) { return t.type === 20 })
  }))
  assert.equal(scored.yaku.some(function (y) { return y.id === 'pinfu' }), false)
  assert.equal(scored.fu, 30)
  assert.equal(scored.han, 1)
})

test('random hands agree on agari and shanten, and shanten stays fast', function () {
  const rng = MJ.mulberry32(7)
  const start = Date.now()
  let checks = 0
  for (let n = 0; n < 80; n++) {
    const bag = MJ.makeTiles()
    MJ.shuffle(bag, rng)
    const fourteen = bag.slice(0, 14)
    const counts = MJ.counts(fourteen)
    const agari = MJ.isAgari(counts, 0)
    const sh = MJ.shanten(counts.slice(), 0)
    if (agari) assert.equal(sh, -1)
    if (sh === -1) assert.equal(agari, true)
    const thirteen = fourteen.slice(0, 13)
    const c13 = MJ.counts(thirteen)
    const before = MJ.shanten(c13.slice(), 0)
    let completed = false
    for (let t = 0; t < 34; t++) {
      if (c13[t] >= 4) continue
      c13[t]++
      if (MJ.isAgari(c13, 0)) completed = true
      c13[t]--
      if (completed) break
    }
    if (completed) assert.equal(before, 0)
    if (before === 0) {
      let found = false
      for (let t = 0; t < 34; t++) {
        if (c13[t] >= 4) continue
        c13[t]++
        if (MJ.isAgari(c13, 0)) found = true
        c13[t]--
      }
      assert.equal(found, true)
    }
    checks++
  }
  const elapsed = Date.now() - start
  assert.equal(checks, 80)
  assert.ok(elapsed < 8000, 'shanten too slow: ' + elapsed + 'ms')
})
