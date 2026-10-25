'use strict'
window.MJ = window.MJ || {}

function seatWind(state, seat) {
  return 27 + (seat - state.dealer + 4) % 4
}

function yakuhai(state, seat, type) {
  return type >= 31 || type === seatWind(state, seat) || type === 27
}

function seenCounts(state, seat) {
  const counts = new Array(34).fill(0)
  function add(tile) { counts[tile.type]++ }
  state.players[seat].concealed.forEach(add)
  state.players.forEach(function (player) {
    player.melds.forEach(function (meld) { meld.tiles.forEach(add) })
    player.river.forEach(function (row) { add(row.tile) })
  })
  MJ.doraIndicators(state).forEach(add)
  return counts
}

function shapeAfter(state, seat, tiles, meldCount, allow) {
  const tied = []
  let best = 99
  for (let i = 0; i < tiles.length; i++) {
    if (allow && !allow(tiles[i])) continue
    const rest = []
    for (let k = 0; k < tiles.length; k++) if (k !== i) rest.push(tiles[k])
    const shanten = MJ.shanten(MJ.counts(rest), meldCount)
    if (shanten < best) {
      best = shanten
      tied.length = 0
    }
    if (shanten === best) tied.push({ tile: tiles[i], rest: rest, shanten: shanten })
  }
  if (!tied.length) return null
  let pick = tied[0]
  let bestUke = -1
  const seen = seenCounts(state, seat)
  for (let i = 0; i < tied.length; i++) {
    const option = tied[i]
    const counts = MJ.counts(option.rest)
    let ukeire = 0
    for (let type = 0; type < 34; type++) {
      if (counts[type] >= 4) continue
      const left = 4 - seen[type]
      if (left <= 0) continue
      counts[type]++
      const next = MJ.shanten(counts, meldCount)
      counts[type]--
      if (next < option.shanten) ukeire += left
    }
    const drawnBonus = option.tile.id === state.drawnId && ukeire === bestUke
    if (ukeire > bestUke || bestUke < 0 || drawnBonus) {
      bestUke = ukeire
      pick = option
    }
  }
  pick.ukeire = bestUke
  return pick
}

function removeTypes(tiles, types) {
  const need = types.slice()
  const kept = []
  const got = []
  for (let i = 0; i < tiles.length; i++) {
    const at = need.indexOf(tiles[i].type)
    if (at >= 0) {
      need.splice(at, 1)
      got.push(tiles[i])
    } else kept.push(tiles[i])
  }
  if (need.length) return null
  return kept
}

function safeRank(state, seat, type) {
  let seen = 0
  state.players.forEach(function (player) {
    player.melds.forEach(function (meld) {
      meld.tiles.forEach(function (tile) { if (tile.type === type) seen++ })
    })
    player.river.forEach(function (row) { if (row.tile.type === type) seen++ })
  })
  state.players[seat].concealed.forEach(function (tile) { if (tile.type === type) seen++ })
  MJ.doraIndicators(state).forEach(function (tile) { if (tile.type === type) seen++ })
  if (seen >= 4) return 3
  const riichi = state.players.filter(function (player, index) { return player.riichi && index !== seat })
  if (!riichi.length) return 0
  const safeFrom = riichi.filter(function (player) {
    return player.river.some(function (row) { return row.tile.type === type })
  }).length
  if (safeFrom === riichi.length) return 2
  if (safeFrom > 0) return 1
  return 0
}

MJ.chooseTurn = function (state, seat) {
  const player = state.players[seat]
  if (MJ.canTsumo(state, seat)) {
    return { type: 'tsumo', text: '形が揃って、役もあります。ツモで上がれます。' }
  }
  if (MJ.canKyuushu(state, seat)) {
    const shanten = MJ.shanten(MJ.counts(player.concealed), player.melds.length)
    if (shanten >= 3) {
      return { type: 'kyuushu', text: '1・9と字牌が9種類以上あります。役が作りにくいので、この局を流せます。' }
    }
  }
  const allowed = {}
  MJ.legalDiscardIds(state, seat, false).forEach(function (id) { allowed[id] = true })
  const current = shapeAfter(state, seat, player.concealed, player.melds.length, function (tile) {
    return allowed[tile.id]
  })
  if (!current) throw new Error('no legal discard')
  if (!player.riichi && current.shanten >= 1) {
    const kans = MJ.kanOptions(state, seat).filter(function (option) { return yakuhai(state, seat, option.type) })
    if (kans.length) {
      return { type: 'kan', kind: kans[0].kind, kanType: kans[0].type, text: '役牌が4枚そろいました。カンして、1枚引き直せます。' }
    }
  }
  if (MJ.canRiichi(state, seat)) {
    const riichiIds = {}
    MJ.legalDiscardIds(state, seat, true).forEach(function (id) { riichiIds[id] = true })
    const chosen = shapeAfter(state, seat, player.concealed, player.melds.length, function (tile) {
      return riichiIds[tile.id]
    })
    if (chosen && chosen.ukeire > 0) {
      return {
        type: 'riichi',
        tileId: chosen.tile.id,
        text: 'テンパイです。' + MJ.tileName(chosen.tile.type, chosen.tile.red) + 'を捨ててリーチすると、それ自体が役になります。宣言のあと、手は変えられません。'
      }
    }
  }
  const threatened = state.players.some(function (other, index) { return other.riichi && index !== seat })
  if (threatened && current.shanten >= 2) {
    let bestSafe = -1
    let tile = null
    player.concealed.forEach(function (item) {
      if (!allowed[item.id]) return
      const rank = safeRank(state, seat, item.type)
      if (rank > bestSafe) {
        bestSafe = rank
        tile = item
      }
    })
    if (tile && bestSafe > 0) {
      return {
        type: 'discard',
        tileId: tile.id,
        text: '誰かがリーチしています。まだテンパイが遠いので、その人がすでに捨てた牌を捨てます。その牌では振り込みません。'
      }
    }
  }
  const pick = current
  const name = MJ.tileName(pick.tile.type, pick.tile.red)
  let text = name + 'を捨てるのがよさそうです。' + MJ.friendlyDistance(pick.shanten)
  if (pick.shanten === 0) {
    const waits = MJ.waits(pick.rest, player.melds.length)
    const names = waits.map(function (type) { return MJ.tileName(type) }).join('、')
    text = name + 'を捨てるとテンパイです。待ちは' + names + '。'
    const dead = furitenWaits(player, waits)
    if (dead) text += 'ただし、待ち牌を自分で捨てているので、ロンはできずツモだけです。'
    else if (!player.riichi && MJ.handClosed(player) && state.scores[seat] >= 1000) text += 'リーチすれば役になります。'
  }
  return { type: 'discard', tileId: pick.tile.id, text: text }
}

function furitenWaits(player, waits) {
  const discarded = {}
  player.river.forEach(function (row) { discarded[row.tile.type] = true })
  return waits.some(function (type) { return discarded[type] })
}

MJ.chooseClaim = function (state, seat, can) {
  if (can.indexOf('ron') >= 0) return { type: 'ron', text: '捨てられた牌で上がれます。ロンです。' }
  const player = state.players[seat]
  const current = MJ.shanten(MJ.counts(player.concealed), player.melds.length)
  if (MJ.handClosed(player) && current <= 1) {
    return { type: 'skip', text: '鳴かずに、このまま自分で揃えた方がリーチしやすくなります。見送りで大丈夫です。' }
  }
  const called = state.pending.tile
  let best = { type: 'skip', shanten: current, text: 'この牌は取らなくて大丈夫です。見送ります。' }
  if (can.indexOf('pon') >= 0 || can.indexOf('kan') >= 0) {
    const kept = removeTypes(player.concealed, [called.type, called.type])
    if (kept) {
      const after = shapeAfter(state, seat, kept, player.melds.length + 1, function (tile) {
        return tile.type !== called.type
      })
      const honor = yakuhai(state, seat, called.type)
      if (after && (after.shanten < current || (honor && after.shanten <= current))) {
        const kan = can.indexOf('kan') >= 0 && honor
        best = {
          type: kan ? 'kan' : 'pon',
          shanten: after.shanten,
          text: (honor ? '役牌なので' : '上がりに近づくので') + (kan ? 'カンできます。' : 'ポンできます。') + '鳴くと、一部の役は使えなくなります。'
        }
      }
    }
  }
  if (can.indexOf('chi') >= 0) {
    const options = MJ.claimChiOptions(state, seat)
    for (let i = 0; i < options.length; i++) {
      const opt = options[i]
      const kept = removeTypes(player.concealed, opt.need)
      if (!kept) continue
      const banned = {}
      MJ.chiKuikae(opt.low, opt.called).forEach(function (type) { banned[type] = true })
      const after = shapeAfter(state, seat, kept, player.melds.length + 1, function (tile) {
        return !banned[tile.type]
      })
      if (after && (after.shanten < best.shanten || (after.shanten < current && best.type === 'skip'))) {
        best = {
          type: 'chi',
          low: opt.low,
          shanten: after.shanten,
          text: '直前の人の捨て牌で、並びの3枚が作れます。チーすると手は開きます。'
        }
      }
    }
  }
  return best
}
