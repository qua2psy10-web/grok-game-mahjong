'use strict'
window.MJ = window.MJ || {}

MJ.YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]
MJ.GREEN = new Set([19, 20, 21, 23, 25, 32])

MJ.suitOf = function (type) {
  if (type < 9) return 'man'
  if (type < 18) return 'pin'
  if (type < 27) return 'sou'
  return 'honor'
}

MJ.isHonor = function (type) {
  return type >= 27
}

MJ.isTerminal = function (type) {
  return type < 27 && type % 9 === 0 || type < 27 && type % 9 === 8
}

MJ.isYaochu = function (type) {
  return type >= 27 || type % 9 === 0 || type % 9 === 8
}

MJ.isSimple = function (type) {
  return type < 27 && type % 9 > 0 && type % 9 < 8
}

MJ.doraFrom = function (indicator) {
  if (indicator < 27) {
    const suit = Math.floor(indicator / 9) * 9
    const rank = indicator % 9
    return suit + (rank + 1) % 9
  }
  if (indicator < 31) return 27 + (indicator - 27 + 1) % 4
  return 31 + (indicator - 31 + 1) % 3
}

MJ.tileName = function (type, red) {
  if (type >= 27) return ['東', '南', '西', '北', '白', '發', '中'][type - 27]
  const num = '一二三四五六七八九'[type % 9]
  const suit = ['萬', '筒', '索'][Math.floor(type / 9)]
  return (red ? '赤' : '') + num + suit
}

MJ.tileReading = function (type, red) {
  const name = MJ.tileName(type, red)
  if (type >= 27) {
    const hint = ['東（場の風や自分の風になる）', '南', '西', '北', '白（役牌）', '發（役牌）', '中（役牌）'][type - 27]
    return name + '。' + hint
  }
  const suit = ['萬子（マンズ）。数字の牌', '筒子（ピンズ）。丸の牌', '索子（ソーズ）。棒の牌'][Math.floor(type / 9)]
  const n = (type % 9) + 1
  return name + '。' + suit + 'の' + n
}

MJ.counts = function (tiles) {
  const c = new Array(34).fill(0)
  for (let i = 0; i < tiles.length; i++) c[tiles[i].type]++
  return c
}

MJ.makeTiles = function () {
  const tiles = []
  let id = 1
  for (let type = 0; type < 34; type++) {
    const five = type < 27 && type % 9 === 4
    for (let n = 0; n < 4; n++) {
      tiles.push({ id: id++, type: type, red: five && n === 0 })
    }
  }
  return tiles
}

MJ.shuffle = function (list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list
}

MJ.mulberry32 = function (seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

MJ.sortTiles = function (tiles) {
  return tiles.slice().sort(function (a, b) {
    if (a.type !== b.type) return a.type - b.type
    return (b.red ? 1 : 0) - (a.red ? 1 : 0)
  })
}

MJ.cloneTiles = function (tiles) {
  return tiles.map(function (t) { return { id: t.id, type: t.type, red: !!t.red } })
}
