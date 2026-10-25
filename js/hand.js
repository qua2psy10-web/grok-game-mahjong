'use strict'
window.MJ = window.MJ || {}

function shantenNormal(counts, meldCount) {
  const need = 4 - meldCount
  const base = 8 - 2 * meldCount
  let best = 8
  const c = counts.slice()

  function score(melds, pairFlag, tiles) {
    const slots = need - melds
    const taatsu = slots > 0 ? bestTaatsu(tiles, slots) : 0
    const s = base - 2 * melds - taatsu - (pairFlag ? 1 : 0)
    if (s < best) best = s
  }

  function bestTaatsu(tiles, slots) {
    let local = 0
    function rec(i, left, acc) {
      if (acc > local) local = acc
      if (left === 0 || acc === slots) return
      if (acc + left <= local) return
      while (i < 34 && tiles[i] === 0) i++
      if (i >= 34) return
      rec(i + 1, left, acc)
      if (tiles[i] >= 2 && left > 0) {
        tiles[i] -= 2
        rec(i, left - 1, acc + 1)
        tiles[i] += 2
      }
      if (i < 27 && i % 9 <= 7 && tiles[i + 1] > 0 && left > 0) {
        tiles[i]--
        tiles[i + 1]--
        rec(i, left - 1, acc + 1)
        tiles[i]++
        tiles[i + 1]++
      }
      if (i < 27 && i % 9 <= 6 && tiles[i + 2] > 0 && left > 0) {
        tiles[i]--
        tiles[i + 2]--
        rec(i, left - 1, acc + 1)
        tiles[i]++
        tiles[i + 2]++
      }
    }
    rec(0, slots, 0)
    return local
  }

  function cut(i, melds, pairFlag) {
    while (i < 34 && c[i] === 0) i++
    score(melds, pairFlag, c)
    if (melds === need || i >= 34) return
    if (c[i] >= 3) {
      c[i] -= 3
      cut(i, melds + 1, pairFlag)
      c[i] += 3
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--
      c[i + 1]--
      c[i + 2]--
      cut(i, melds + 1, pairFlag)
      c[i]++
      c[i + 1]++
      c[i + 2]++
    }
    cut(i + 1, melds, pairFlag)
  }

  for (let p = 0; p < 34; p++) {
    if (c[p] >= 2) {
      c[p] -= 2
      cut(0, 0, 1)
      c[p] += 2
    }
  }
  cut(0, 0, 0)
  return best
}

function shantenChiitoi(counts) {
  let pairs = 0
  let kinds = 0
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue
    kinds++
    if (counts[i] >= 2) pairs++
  }
  let s = 6 - pairs
  if (kinds < 7) s += 7 - kinds
  return s
}

function shantenKokushi(counts) {
  let unique = 0
  let pair = 0
  const yao = MJ.YAOCHU
  for (let i = 0; i < yao.length; i++) {
    const n = counts[yao[i]]
    if (n > 0) unique++
    if (n >= 2) pair++
  }
  return 13 - unique - (pair > 0 ? 1 : 0)
}

var shantenCache = new Map()

MJ.shanten = function (counts, meldCount) {
  const melds = meldCount || 0
  let key = String(melds)
  for (let i = 0; i < 34; i++) key += counts[i]
  const cached = shantenCache.get(key)
  if (cached !== undefined) return cached
  const normal = shantenNormal(counts, melds)
  let result = normal
  if (!melds) {
    const chi = shantenChiitoi(counts)
    const koku = shantenKokushi(counts)
    result = normal < chi ? (normal < koku ? normal : koku) : (chi < koku ? chi : koku)
  }
  if (shantenCache.size > 40000) shantenCache.clear()
  shantenCache.set(key, result)
  return result
}

function isChiitoi(counts) {
  let pairs = 0
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue
    if (counts[i] !== 2) return false
    pairs++
  }
  return pairs === 7
}

function isKokushi(counts) {
  let pair = 0
  let sum = 0
  for (let i = 0; i < 34; i++) sum += counts[i]
  if (sum !== 14) return false
  const yao = MJ.YAOCHU
  for (let i = 0; i < yao.length; i++) {
    const n = counts[yao[i]]
    if (n === 0) return false
    if (n > 2) return false
    if (n === 2) pair++
  }
  return pair === 1
}

function allDecomps(counts, need) {
  const results = []
  const c = counts.slice()
  const melds = []

  function rec(i, pair) {
    while (i < 34 && c[i] === 0) i++
    if (melds.length === need && pair !== null) {
      if (i >= 34) {
        results.push({
          melds: melds.map(function (m) { return { kind: m.kind, type: m.type } }),
          pair: pair
        })
      }
      return
    }
    if (i >= 34 || melds.length > need) return

    let branched = false
    if (pair === null && c[i] >= 2) {
      branched = true
      c[i] -= 2
      rec(i, i)
      c[i] += 2
    }
    if (melds.length < need && c[i] >= 3) {
      branched = true
      c[i] -= 3
      melds.push({ kind: 'kotsu', type: i })
      rec(i, pair)
      melds.pop()
      c[i] += 3
    }
    if (melds.length < need && i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      branched = true
      c[i]--
      c[i + 1]--
      c[i + 2]--
      melds.push({ kind: 'shuntsu', type: i })
      rec(i, pair)
      melds.pop()
      c[i]++
      c[i + 1]++
      c[i + 2]++
    }
    if (!branched) return
  }

  rec(0, null)
  return results
}

MJ.isAgari = function (counts, meldCount) {
  const need = 4 - (meldCount || 0)
  if (!meldCount && (isChiitoi(counts) || isKokushi(counts))) return true
  return allDecomps(counts, need).length > 0
}

MJ.waits = function (concealed, meldCount) {
  const counts = MJ.counts(concealed)
  const found = []
  for (let t = 0; t < 34; t++) {
    if (counts[t] >= 4) continue
    counts[t]++
    if (MJ.isAgari(counts, meldCount)) found.push(t)
    counts[t]--
  }
  return found
}

MJ.chiOptions = function (concealed, calledType) {
  if (calledType >= 27) return []
  const counts = MJ.counts(concealed)
  const rank = calledType % 9
  const base = calledType - rank
  const options = []
  function has(rankOffset, n) {
    const type = base + rankOffset
    return rankOffset >= 0 && rankOffset <= 8 && counts[type] >= n
  }
  function push(low, a, b) {
    if (a === b) {
      if (!has(a, 2)) return
    } else if (!has(a, 1) || !has(b, 1)) return
    options.push({ low: base + low, need: [base + a, base + b], called: calledType })
  }
  if (rank <= 6) push(rank, rank + 1, rank + 2)
  if (rank >= 1 && rank <= 7) push(rank - 1, rank - 1, rank + 1)
  if (rank >= 2) push(rank - 2, rank - 2, rank - 1)
  return options
}

MJ.chiKuikae = function (low, called) {
  const forbidden = [called]
  if (called === low + 2 && low % 9 > 0) forbidden.push(low - 1)
  if (called === low && low % 9 <= 5) forbidden.push(low + 3)
  return forbidden
}

function sequenceWait(low, winType) {
  const pos = winType - low
  const rank = low % 9
  if (pos === 1) return 'kanchan'
  if (pos === 2) return rank === 0 ? 'penchan' : 'ryanmen'
  if (pos === 0) return rank === 6 ? 'penchan' : 'ryanmen'
  return 'other'
}

function isDragon(type) { return type >= 31 }
function isWind(type) { return type >= 27 && type <= 30 }

function pairFu(pair, seatWind, roundWind) {
  let fu = 0
  if (isDragon(pair)) fu += 2
  if (pair === seatWind) fu += 2
  if (pair === roundWind) fu += 2
  return fu
}

function kotsuFu(type, open, kan) {
  const yao = MJ.isYaochu(type)
  if (kan) return open ? (yao ? 16 : 8) : (yao ? 32 : 16)
  return open ? (yao ? 4 : 2) : (yao ? 8 : 4)
}

function everyTile(concealed, melds, fn) {
  for (let i = 0; i < concealed.length; i++) if (!fn(concealed[i].type)) return false
  for (let m = 0; m < melds.length; m++) {
    for (let k = 0; k < melds[m].tiles.length; k++) {
      if (!fn(melds[m].tiles[k].type)) return false
    }
  }
  return true
}

function tileTypes(concealed, melds) {
  const list = []
  for (let i = 0; i < concealed.length; i++) list.push(concealed[i].type)
  for (let m = 0; m < melds.length; m++) {
    for (let k = 0; k < melds[m].tiles.length; k++) list.push(melds[m].tiles[k].type)
  }
  return list
}

function akaCount(concealed, melds) {
  let n = 0
  for (let i = 0; i < concealed.length; i++) if (concealed[i].red) n++
  for (let m = 0; m < melds.length; m++) {
    for (let k = 0; k < melds[m].tiles.length; k++) if (melds[m].tiles[k].red) n++
  }
  return n
}

function handOpen(melds) {
  return melds.some(function (m) { return m.kind !== 'ankan' })
}

MJ.basicPoints = function (han, fu, yakumanCount) {
  if (yakumanCount) return 8000 * yakumanCount
  if (han >= 13) return 8000
  if (han >= 11) return 6000
  if (han >= 8) return 4000
  if (han >= 6) return 3000
  if (han >= 5) return 2000
  const b = fu * (2 ** (han + 2))
  return b >= 2000 ? 2000 : b
}

MJ.limitName = function (han, yakumanCount, basic) {
  if (yakumanCount >= 2) return 'ダブル役満'
  if (yakumanCount === 1) return '役満'
  if (han >= 11) return '三倍満'
  if (han >= 8) return '倍満'
  if (han >= 6) return '跳満'
  if (han >= 5 || basic >= 2000) return '満貫'
  return ''
}

function pushYaku(list, id, name, han, text, yakuman) {
  list.push({ id: id, name: name, han: han, text: text, yakuman: yakuman || 0 })
}

function yakuhaiName(type) {
  return MJ.tileName(type) + 'が3枚以上'
}

function evaluateStandard(decomp, concealed, melds, ctx) {
  const open = handOpen(melds)
  const win = ctx.winTile.type
  const groups = []
  if (decomp.pair === win) groups.push({ kind: 'pair' })
  decomp.melds.forEach(function (m, index) {
    if (m.kind === 'kotsu' && m.type === win) groups.push({ kind: 'kotsu', index: index })
    if (m.kind === 'shuntsu' && win >= m.type && win <= m.type + 2) groups.push({ kind: 'shuntsu', index: index })
  })
  if (groups.length === 0) groups.push({ kind: 'none' })

  let best = null
  for (let g = 0; g < groups.length; g++) {
    const assign = groups[g]
    const yaku = []
    let yakumanCount = 0

    const allMelds = decomp.melds.map(function (m) {
      return { kind: m.kind, type: m.type, open: false, kan: false }
    })
    melds.forEach(function (m) {
      const kan = m.kind === 'ankan' || m.kind === 'daiminkan' || m.kind === 'kakan'
      const kotsu = m.kind !== 'chi'
      allMelds.push({
        kind: kotsu ? 'kotsu' : 'shuntsu',
        type: m.kind === 'chi' ? m.tiles.slice().sort(function (a, b) { return a.type - b.type })[0].type : m.tiles[0].type,
        open: m.kind !== 'ankan',
        kan: kan,
        ankan: m.kind === 'ankan'
      })
    })

    const seqs = allMelds.filter(function (m) { return m.kind === 'shuntsu' })
    const kotsu = allMelds.filter(function (m) { return m.kind === 'kotsu' })
    const closedSeqs = decomp.melds.filter(function (m) { return m.kind === 'shuntsu' })

    if (ctx.tenhou) {
      pushYaku(yaku, 'tenhou', '天和', 13, '親の配られた牌のまま上がった', 1)
      yakumanCount += 1
    }
    if (ctx.chiihou) {
      pushYaku(yaku, 'chiihou', '地和', 13, '子の最初のツモで上がった', 1)
      yakumanCount += 1
    }

    const types = tileTypes(concealed, melds)
    const allHonors = types.every(function (t) { return t >= 27 })
    const allTerminals = types.every(function (t) { return t < 27 && (t % 9 === 0 || t % 9 === 8) })
    const allGreen = types.every(function (t) { return MJ.GREEN.has(t) })
    const dragons = [31, 32, 33]
    const dragonKotsu = dragons.filter(function (d) { return kotsu.some(function (m) { return m.type === d }) })
    const dragonPair = dragons.indexOf(decomp.pair) !== -1
    const windKotsu = [27, 28, 29, 30].filter(function (d) { return kotsu.some(function (m) { return m.type === d }) })
    const windPair = decomp.pair >= 27 && decomp.pair <= 30
    const kans = melds.filter(function (m) { return m.kind === 'ankan' || m.kind === 'daiminkan' || m.kind === 'kakan' }).length
    const ankou = decomp.melds.filter(function (m) { return m.kind === 'kotsu' }).length + melds.filter(function (m) { return m.kind === 'ankan' }).length

    if (allHonors) { pushYaku(yaku, 'tsuuiisou', '字一色', 13, '字牌だけ', 1); yakumanCount++ }
    if (allTerminals) { pushYaku(yaku, 'chinroutou', '清老頭', 13, '1と9だけ', 1); yakumanCount++ }
    if (allGreen && types.length) { pushYaku(yaku, 'ryuuiisou', '緑一色', 13, '緑の牌だけ', 1); yakumanCount++ }
    if (dragonKotsu.length === 3) { pushYaku(yaku, 'daisangen', '大三元', 13, '白・發・中がすべて3枚以上', 1); yakumanCount++ }
    if (windKotsu.length === 4) { pushYaku(yaku, 'daisuushi', '大四喜', 26, '東南西北がすべて3枚以上', 2); yakumanCount += 2 }
    else if (windKotsu.length === 3 && windPair) { pushYaku(yaku, 'shousuushi', '小四喜', 13, '風が3つ揃い、頭が残りの風', 1); yakumanCount++ }
    if (kans === 4) { pushYaku(yaku, 'suukantsu', '四槓子', 13, 'カンが4つ', 1); yakumanCount++ }
    if (ankou === 4 && kotsu.length === 4) { pushYaku(yaku, 'suuankou', '四暗刻', 13, '隠した刻子が4つ', 1); yakumanCount++ }

    if (yakumanCount === 0) {
      if (ctx.riichi && ctx.doubleRiichi) pushYaku(yaku, 'daburu', 'ダブル立直', 2, '最初の自分の番でリーチした')
      else if (ctx.riichi) pushYaku(yaku, 'riichi', '立直', 1, '門前のまま、テンパイを宣言した')
      if (ctx.riichi && ctx.ippatsu) pushYaku(yaku, 'ippatsu', '一発', 1, 'リーチの直後、誰も鳴く前に上がった')
      if (!open && ctx.tsumo) pushYaku(yaku, 'menzen', '門前清自摸和', 1, '鳴かずに、自分で引いて上がった')

      const tanyao = everyTile(concealed, melds, MJ.isSimple)
      if (tanyao) pushYaku(yaku, 'tanyao', '断幺九', 1, '2から8までの数牌だけ')

      let wait = 'other'
      if (assign.kind === 'pair') wait = 'tanki'
      else if (assign.kind === 'kotsu') wait = 'shanpon'
      else if (assign.kind === 'shuntsu') wait = sequenceWait(decomp.melds[assign.index].type, win)

      const pinfu = !open && seqs.length === 4 && pairFu(decomp.pair, ctx.seatWind, ctx.roundWind) === 0 && wait === 'ryanmen'
      if (pinfu) pushYaku(yaku, 'pinfu', '平和', 1, '順子ばかりで、両側から待っていた')

      const seqKey = {}
      closedSeqs.forEach(function (m) { seqKey[m.type] = (seqKey[m.type] || 0) + 1 })
      let iipei = 0
      Object.keys(seqKey).forEach(function (k) { iipei += Math.floor(seqKey[k] / 2) })
      if (!open && iipei >= 2) pushYaku(yaku, 'ryanpeikou', '二盃口', 3, '同じ順子の対が2組ある')
      else if (!open && iipei === 1) pushYaku(yaku, 'iipeikou', '一盃口', 1, '同じ順子が2つある')

      kotsu.forEach(function (m) {
        let han = 0
        if (isDragon(m.type)) han += 1
        if (m.type === ctx.seatWind) han += 1
        if (m.type === ctx.roundWind) han += 1
        if (han) pushYaku(yaku, 'yakuhai-' + m.type, '役牌', han, yakuhaiName(m.type))
      })

      if (kotsu.length === 4) pushYaku(yaku, 'toitoi', '対々和', 2, '同じ牌3枚のまとまりばかり')
      if (ankou === 3) pushYaku(yaku, 'sanankou', '三暗刻', 2, '隠した刻子が3つ')

      for (let rank = 0; rank <= 6; rank++) {
        const mans = seqs.some(function (m) { return m.type === rank })
        const pins = seqs.some(function (m) { return m.type === 9 + rank })
        const sous = seqs.some(function (m) { return m.type === 18 + rank })
        if (mans && pins && sous) {
          pushYaku(yaku, 'sanshoku', '三色同順', open ? 1 : 2, '萬子・筒子・索子で同じ並び')
          break
        }
      }
      for (let rank = 0; rank <= 8; rank++) {
        if ([rank, 9 + rank, 18 + rank].every(function (t) { return kotsu.some(function (m) { return m.type === t }) })) {
          pushYaku(yaku, 'sandoukou', '三色同刻', 2, '萬子・筒子・索子で同じ数字が3枚')
          break
        }
      }
      for (let suit = 0; suit < 3; suit++) {
        const b = suit * 9
        if ([0, 3, 6].every(function (r) { return seqs.some(function (m) { return m.type === b + r }) })) {
          pushYaku(yaku, 'ittsu', '一気通貫', open ? 1 : 2, '同じ種類で123・456・789')
          break
        }
      }

      const hasHonor = types.some(function (t) { return t >= 27 })
      const chantaOk = allMelds.every(function (m) {
        if (m.kind === 'kotsu') return MJ.isYaochu(m.type)
        const r = m.type % 9
        return r === 0 || r === 6
      }) && MJ.isYaochu(decomp.pair)
      if (chantaOk && hasHonor && !allHonors) pushYaku(yaku, 'chanta', '混全帯幺九', open ? 1 : 2, 'どのまとまりにも1・9か字牌がある')
      if (chantaOk && !hasHonor) pushYaku(yaku, 'junchan', '純全帯幺九', open ? 2 : 3, 'どのまとまりにも1か9がある')

      const honroutou = types.every(MJ.isYaochu) && hasHonor && !allHonors && !allTerminals
      if (honroutou && kotsu.length === 4) pushYaku(yaku, 'honroutou', '混老頭', 2, '1・9と字牌だけ')

      if (dragonKotsu.length === 2 && dragonPair) pushYaku(yaku, 'shousangen', '小三元', 2, '三元牌のうち2つが3枚、1つが頭')

      const suits = { man: false, pin: false, sou: false }
      types.forEach(function (t) {
        if (t < 9) suits.man = true
        else if (t < 18) suits.pin = true
        else if (t < 27) suits.sou = true
      })
      const suitCount = (suits.man ? 1 : 0) + (suits.pin ? 1 : 0) + (suits.sou ? 1 : 0)
      if (suitCount === 1 && hasHonor) pushYaku(yaku, 'honitsu', '混一色', open ? 2 : 3, '1種類の数牌と、字牌')
      if (suitCount === 1 && !hasHonor) pushYaku(yaku, 'chinitsu', '清一色', open ? 5 : 6, '1種類の数牌だけ')

      if (ctx.rinshan) pushYaku(yaku, 'rinshan', '嶺上開花', 1, 'カンのあとに引いた牌で上がった')
      if (ctx.haitei && ctx.tsumo) pushYaku(yaku, 'haitei', '海底摸月', 1, '山の最後の牌で上がった')
      if (ctx.houtei && !ctx.tsumo) pushYaku(yaku, 'houtei', '河底撈魚', 1, '山の最後に捨てられた牌で上がった')
      if (ctx.chankan) pushYaku(yaku, 'chankan', '搶槓', 1, '相手がカンに加えた牌で上がった')

      if (yaku.length === 0) continue

      let fu = 20
      if (!open && !ctx.tsumo) fu += 10
      if (ctx.tsumo && !pinfu) fu += 2
      if (!pinfu) fu += pairFu(decomp.pair, ctx.seatWind, ctx.roundWind)
      allMelds.forEach(function (m) {
        if (m.kind === 'kotsu') fu += kotsuFu(m.type, m.open, m.kan)
      })
      if (!pinfu && (wait === 'tanki' || wait === 'kanchan' || wait === 'penchan')) fu += 2
      fu = Math.ceil(fu / 10) * 10
      if (open && fu < 30) fu = 30

      const hanBase = yaku.reduce(function (s, y) { return s + y.han }, 0)
      const scored = finishDora(yaku, hanBase, 0, fu, concealed, melds, ctx)
      if (!best || scored.points > best.points || (scored.points === best.points && scored.han > best.han)) best = scored
    } else {
      const scored = finishDora(yaku, 13 * yakumanCount, yakumanCount, 0, concealed, melds, ctx)
      if (!best || scored.points > best.points) best = scored
    }
  }
  return best
}

function finishDora(yaku, han, yakumanCount, fu, concealed, melds, ctx) {
  const list = yaku.slice()
  if (!yakumanCount) {
    const indicators = ctx.doraIndicators || []
    const doras = indicators.map(function (t) { return MJ.doraFrom(t.type) })
    const uras = ctx.riichi ? (ctx.uraIndicators || []).map(function (t) { return MJ.doraFrom(t.type) }) : []
    let dora = 0
    let ura = 0
    let aka = 0
    const all = concealed.concat()
    melds.forEach(function (m) { m.tiles.forEach(function (t) { all.push(t) }) })
    all.forEach(function (tile) {
      doras.forEach(function (d) { if (tile.type === d) dora++ })
      uras.forEach(function (d) { if (tile.type === d) ura++ })
      if (tile.red) aka++
    })
    if (dora) pushYaku(list, 'dora', 'ドラ', dora, 'めくられた牌の次の牌が' + dora + '枚')
    if (ura) pushYaku(list, 'ura', '裏ドラ', ura, 'リーチしたので裏のめくりが' + ura + '枚')
    if (aka) pushYaku(list, 'aka', '赤ドラ', aka, '赤い5が' + aka + '枚')
    han += dora + ura + aka
  }
  const basic = MJ.basicPoints(han, fu, yakumanCount)
  const points = basic * 4
  return {
    han: han,
    fu: fu,
    yakuman: yakumanCount,
    yaku: list,
    basic: basic,
    points: points,
    limit: MJ.limitName(han, yakumanCount, basic)
  }
}

function evaluateChiitoi(concealed, ctx) {
  const yaku = []
  let yakumanCount = 0
  if (ctx.tenhou) { pushYaku(yaku, 'tenhou', '天和', 13, '親の配られた牌のまま上がった', 1); yakumanCount++ }
  if (ctx.chiihou) { pushYaku(yaku, 'chiihou', '地和', 13, '子の最初のツモで上がった', 1); yakumanCount++ }
  const types = concealed.map(function (t) { return t.type })
  const allHonors = types.every(function (t) { return t >= 27 })
  const allTerminals = types.every(function (t) { return MJ.isTerminal(t) })
  const allGreen = types.every(function (t) { return MJ.GREEN.has(t) })
  if (allHonors) { pushYaku(yaku, 'tsuuiisou', '字一色', 13, '字牌だけ', 1); yakumanCount++ }
  if (allTerminals) { pushYaku(yaku, 'chinroutou', '清老頭', 13, '1と9だけ', 1); yakumanCount++ }
  if (allGreen) { pushYaku(yaku, 'ryuuiisou', '緑一色', 13, '緑の牌だけ', 1); yakumanCount++ }
  if (yakumanCount) return finishDora(yaku, 13 * yakumanCount, yakumanCount, 0, concealed, [], ctx)

  pushYaku(yaku, 'chiitoi', '七対子', 2, '同じ牌2枚が7組')
  if (ctx.riichi && ctx.doubleRiichi) pushYaku(yaku, 'daburu', 'ダブル立直', 2, '最初の自分の番でリーチした')
  else if (ctx.riichi) pushYaku(yaku, 'riichi', '立直', 1, '門前のまま、テンパイを宣言した')
  if (ctx.riichi && ctx.ippatsu) pushYaku(yaku, 'ippatsu', '一発', 1, 'リーチの直後、誰も鳴く前に上がった')
  if (ctx.tsumo) pushYaku(yaku, 'menzen', '門前清自摸和', 1, '鳴かずに、自分で引いて上がった')
  if (types.every(MJ.isSimple)) pushYaku(yaku, 'tanyao', '断幺九', 1, '2から8までの数牌だけ')
  const hasHonor = types.some(function (t) { return t >= 27 })
  if (types.every(MJ.isYaochu) && hasHonor) pushYaku(yaku, 'honroutou', '混老頭', 2, '1・9と字牌だけ')
  const suits = { man: false, pin: false, sou: false }
  types.forEach(function (t) {
    if (t < 9) suits.man = true
    else if (t < 18) suits.pin = true
    else if (t < 27) suits.sou = true
  })
  const suitCount = (suits.man ? 1 : 0) + (suits.pin ? 1 : 0) + (suits.sou ? 1 : 0)
  if (suitCount === 1 && hasHonor) pushYaku(yaku, 'honitsu', '混一色', 3, '1種類の数牌と、字牌')
  if (suitCount === 1 && !hasHonor) pushYaku(yaku, 'chinitsu', '清一色', 6, '1種類の数牌だけ')
  if (ctx.rinshan) pushYaku(yaku, 'rinshan', '嶺上開花', 1, 'カンのあとに引いた牌で上がった')
  if (ctx.haitei && ctx.tsumo) pushYaku(yaku, 'haitei', '海底摸月', 1, '山の最後の牌で上がった')
  if (ctx.houtei && !ctx.tsumo) pushYaku(yaku, 'houtei', '河底撈魚', 1, '山の最後に捨てられた牌で上がった')
  return finishDora(yaku, yaku.reduce(function (s, y) { return s + y.han }, 0), 0, 25, concealed, [], ctx)
}

function evaluateKokushi(ctx) {
  const yaku = []
  let count = 0
  if (ctx.tenhou) { pushYaku(yaku, 'tenhou', '天和', 13, '親の配られた牌のまま上がった', 1); count++ }
  if (ctx.chiihou) { pushYaku(yaku, 'chiihou', '地和', 13, '子の最初のツモで上がった', 1); count++ }
  pushYaku(yaku, 'kokushi', '国士無双', 13, '1・9と字牌を、すべて揃えた', 1)
  count++
  return finishDora(yaku, 13 * count, count, 0, [], [], ctx)
}

MJ.scoreWin = function (concealed, melds, ctx) {
  const counts = MJ.counts(concealed)
  const need = 4 - melds.length
  if (melds.length === 0 && isKokushi(counts)) return evaluateKokushi(ctx)
  if (melds.length === 0 && isChiitoi(counts)) return evaluateChiitoi(concealed, ctx)
  const decomps = allDecomps(counts, need)
  let best = null
  for (let i = 0; i < decomps.length; i++) {
    const scored = evaluateStandard(decomps[i], concealed, melds, ctx)
    if (scored && (!best || scored.points > best.points || (scored.points === best.points && scored.han > best.han))) best = scored
  }
  return best
}

MJ.payments = function (scored, winner, dealer, loser, tsumo, honba, sticks) {
  const basic = scored.basic
  const deltas = [0, 0, 0, 0]
  function pay(mult) {
    return Math.ceil((basic * mult) / 100) * 100
  }
  if (tsumo) {
    for (let s = 0; s < 4; s++) {
      if (s === winner) continue
      const mult = winner === dealer || s === dealer ? 2 : 1
      const amount = pay(mult) + 100 * honba
      deltas[s] -= amount
      deltas[winner] += amount
    }
  } else {
    const mult = winner === dealer ? 6 : 4
    const amount = pay(mult) + 300 * honba
    deltas[loser] -= amount
    deltas[winner] += amount
  }
  deltas[winner] += sticks * 1000
  return deltas
}

MJ.friendlyDistance = function (shanten) {
  if (shanten < 0) return '上がれます'
  if (shanten === 0) return 'テンパイ。欲しい牌が来れば上がれます'
  if (shanten === 1) return 'あと少し。まとまりがあと一つ足りません'
  if (shanten === 2) return '形は半分ほどできています'
  return 'まだ牌を集めています'
}
