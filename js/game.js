'use strict'
window.MJ = window.MJ || {}

MJ.RULES = [
  '四人で打つ東風戦です。東場を4局やって終わります。',
  '上がりの基本は、3枚のまとまり4つと、同じ牌2枚です。まとまりは、並び（2萬3萬4萬）か、同じ牌3枚です。',
  '形が揃うだけでは上がれません。役が1つ必要です。タンヤオ、役牌、リーチがよく出ます。',
  '自分の番は山から1枚引き、1枚捨てます。自分で引いて上がるのがツモ、誰かの捨て牌で上がるのがロンです。',
  '赤ドラあり。食いタンあり。裏ドラ、一発、カンドラあり。ロンは頭ハネ。',
  '九種九牌、四風連打、四家立直、四開槓で流れます。東四局の続きは1回まで。点がマイナスになったら終了です。',
  'リーチ後のカン、暗槓への搶槓、包はなし。鳴いたあとの最低は30符です。'
]

function blankPlayer() {
  return {
    concealed: [],
    melds: [],
    river: [],
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    furitenPass: false,
    firstTurn: true
  }
}

function liveEnd(state) {
  return state.wall.length - 14
}

MJ.doraIndicators = function (state) {
  const base = state.wall.length - 14
  const list = []
  for (let i = 0; i < state.doraShown; i++) list.push(state.wall[base + 4 + i * 2])
  return list
}

MJ.uraIndicators = function (state) {
  const base = state.wall.length - 14
  const list = []
  for (let i = 0; i < state.doraShown; i++) list.push(state.wall[base + 5 + i * 2])
  return list
}

MJ.wallLeft = function (state) {
  return Math.max(0, liveEnd(state) - state.cursor)
}

MJ.seatWind = function (state, seat) {
  return 27 + ((seat - state.dealer + 4) % 4)
}

MJ.handClosed = function (player) {
  return player.melds.every(function (meld) { return meld.kind === 'ankan' })
}

MJ.playerName = function (seat) {
  return ['あなた', '下家', '対面', '上家'][seat]
}

MJ.roundLabel = function (state) {
  const names = ['一', '二', '三', '四']
  const kyoku = names[state.kyoku - 1] || String(state.kyoku)
  return '東' + kyoku + '局' + (state.honba ? '  ' + state.honba + '本場' : '')
}

function addLog(state, text) {
  state.log.push(text)
  if (state.log.length > 16) state.log.shift()
}

function windName(type) {
  return ['東', '南', '西', '北'][type - 27]
}

MJ.createMatch = function (options) {
  const opts = options || {}
  const seed = opts.seed || (Date.now() % 1000000)
  const state = {
    seed: seed,
    rng: MJ.mulberry32(seed),
    agents: opts.agents || [false, true, true, true],
    scores: [25000, 25000, 25000, 25000],
    kyoku: 1,
    honba: 0,
    sticks: 0,
    dealer: 0,
    east4Repeats: 0,
    log: [],
    presetWall: opts.wall || null,
    handSteps: 0
  }
  startHand(state)
  return state
}

function startHand(state) {
  const wall = state.presetWall ? state.presetWall : MJ.shuffle(MJ.makeTiles(), state.rng)
  state.presetWall = null
  state.wall = wall
  state.cursor = 0
  state.rinshanTaken = 0
  state.doraShown = 1
  state.kans = [0, 0, 0, 0]
  state.noCalls = true
  state.discardsTotal = 0
  state.riichiCount = 0
  state.openingDiscards = []
  state.pending = null
  state.lock = null
  state.result = null
  state.haitei = false
  state.rinshan = false
  state.declareRiichi = false
  state.chiOptions = []
  state.drawnId = null
  state.animate = 'deal'
  state.handSteps = 0
  state.players = [blankPlayer(), blankPlayer(), blankPlayer(), blankPlayer()]
  for (let lap = 0; lap < 4; lap++) {
    const seat = (state.dealer + lap) % 4
    for (let n = 0; n < 13; n++) state.players[seat].concealed.push(wall[state.cursor++])
  }
  const extra = wall[state.cursor++]
  state.players[state.dealer].concealed.push(extra)
  state.drawnId = extra.id
  state.turn = state.dealer
  state.phase = 'discard'
  addLog(state, MJ.roundLabel(state) + '。' + MJ.playerName(state.dealer) + 'が親（東）です。')
}

MJ.nextHand = function (state) {
  if (state.phase !== 'hand-end') return
  startHand(state)
}

function pullId(player, id) {
  const index = player.concealed.findIndex(function (tile) { return tile.id === id })
  if (index < 0) return null
  return player.concealed.splice(index, 1)[0]
}

function pullTypes(player, types) {
  const need = types.slice()
  const got = []
  const kept = []
  player.concealed.forEach(function (tile) {
    const at = need.indexOf(tile.type)
    if (at >= 0) {
      need.splice(at, 1)
      got.push(tile)
    } else kept.push(tile)
  })
  if (need.length) return null
  player.concealed = kept
  return got
}

MJ.legalDiscardIds = function (state, seat, requireTenpai) {
  const player = state.players[seat]
  const locked = state.lock && state.lock.seat === seat ? state.lock.types : []
  const mustTenpai = requireTenpai || player.riichi
  const ids = []
  for (let i = 0; i < player.concealed.length; i++) {
    const tile = player.concealed[i]
    if (locked.indexOf(tile.type) >= 0) continue
    if (mustTenpai) {
      const rest = []
      for (let k = 0; k < player.concealed.length; k++) if (k !== i) rest.push(player.concealed[k])
      if (MJ.shanten(MJ.counts(rest), player.melds.length) !== 0) continue
    }
    ids.push(tile.id)
  }
  return ids
}

function winContext(state, seat, winTile, tsumo, chankan) {
  const player = state.players[seat]
  return {
    winTile: winTile,
    tsumo: tsumo,
    riichi: player.riichi,
    doubleRiichi: player.doubleRiichi,
    ippatsu: player.ippatsu,
    rinshan: !!state.rinshan && tsumo,
    haitei: !!state.haitei && tsumo,
    houtei: !!state.haitei && !tsumo && !chankan,
    chankan: !!chankan,
    tenhou: tsumo && seat === state.dealer && player.firstTurn && state.discardsTotal === 0,
    chiihou: tsumo && seat !== state.dealer && player.firstTurn && state.noCalls,
    seatWind: MJ.seatWind(state, seat),
    roundWind: 27,
    doraIndicators: MJ.doraIndicators(state),
    uraIndicators: MJ.uraIndicators(state)
  }
}

MJ.canTsumo = function (state, seat) {
  if (state.phase !== 'discard' || state.turn !== seat) return false
  const player = state.players[seat]
  const win = player.concealed.find(function (tile) { return tile.id === state.drawnId }) || player.concealed[player.concealed.length - 1]
  return MJ.scoreWin(player.concealed, player.melds, winContext(state, seat, win, true, false))
}

function waitsNow(state, seat) {
  const player = state.players[seat]
  return MJ.waits(player.concealed, player.melds.length)
}

function isFuriten(state, seat) {
  const player = state.players[seat]
  if (player.furitenPass) return true
  const discarded = {}
  player.river.forEach(function (row) { discarded[row.tile.type] = true })
  return waitsNow(state, seat).some(function (type) { return discarded[type] })
}

function canRon(state, seat, tile, pendingType) {
  if (!state.pending || seat === state.pending.seat) return false
  const player = state.players[seat]
  if (MJ.shanten(MJ.counts(player.concealed), player.melds.length) > 0) return false
  if (isFuriten(state, seat)) return false
  const concealed = player.concealed.concat([tile])
  const scored = MJ.scoreWin(concealed, player.melds, winContext(state, seat, tile, false, pendingType === 'kakan'))
  if (!scored) return false
  if (pendingType === 'ankan') return scored.yaku.some(function (yaku) { return yaku.id === 'kokushi' })
  return true
}

MJ.kanOptions = function (state, seat) {
  const player = state.players[seat]
  if (player.riichi || state.rinshanTaken >= 4 || state.turn !== seat) return []
  if (state.phase !== 'discard' && state.phase !== 'kan') return []
  const counts = MJ.counts(player.concealed)
  const options = []
  for (let type = 0; type < 34; type++) {
    if (counts[type] === 4) options.push({ kind: 'ankan', type: type })
  }
  player.melds.forEach(function (meld) {
    if (meld.kind === 'pon' && counts[meld.called] >= 1) options.push({ kind: 'kakan', type: meld.called })
  })
  return options
}

MJ.canRiichi = function (state, seat) {
  const player = state.players[seat]
  if (player.riichi || !MJ.handClosed(player) || state.scores[seat] < 1000) return false
  if (state.phase !== 'discard' || state.turn !== seat) return false
  return MJ.legalDiscardIds(state, seat, true).length > 0
}

MJ.canKyuushu = function (state, seat) {
  const player = state.players[seat]
  if (!player.firstTurn || !state.noCalls || state.phase !== 'discard' || state.turn !== seat) return false
  const kinds = {}
  player.concealed.forEach(function (tile) {
    if (MJ.isYaochu(tile.type)) kinds[tile.type] = true
  })
  return Object.keys(kinds).length >= 9
}

function chiLeavesDiscard(concealed, opt) {
  const need = opt.need.slice()
  const banned = {}
  MJ.chiKuikae(opt.low, opt.called).forEach(function (type) { banned[type] = true })
  let ok = false
  concealed.forEach(function (tile) {
    const at = need.indexOf(tile.type)
    if (at >= 0) need.splice(at, 1)
    else if (!banned[tile.type]) ok = true
  })
  return need.length === 0 && ok
}

MJ.claimChiOptions = function (state, seat) {
  if (!state.pending || state.pending.type !== 'discard') return []
  const player = state.players[seat]
  return MJ.chiOptions(player.concealed, state.pending.tile.type).filter(function (opt) {
    return chiLeavesDiscard(player.concealed, opt)
  })
}

function claimRank(can) {
  if (can.indexOf('ron') >= 0) return 3
  if (can.indexOf('pon') >= 0 || can.indexOf('kan') >= 0) return 2
  if (can.indexOf('chi') >= 0) return 1
  return 0
}

function legalClaims(state, seat) {
  const pending = state.pending
  const list = []
  if (canRon(state, seat, pending.tile, pending.type)) list.push('ron')
  if (pending.type !== 'discard') return list
  const player = state.players[seat]
  if (player.riichi) return list
  const counts = MJ.counts(player.concealed)
  const type = pending.tile.type
  if (counts[type] >= 2) list.push('pon')
  if (counts[type] >= 3 && state.rinshanTaken < 4) list.push('kan')
  const next = (pending.seat + 1) % 4
  if (seat === next && MJ.claimChiOptions(state, seat).length) list.push('chi')
  return list
}

function openClaims(state) {
  const queue = []
  for (let dist = 1; dist <= 3; dist++) {
    const seat = (state.pending.seat + dist) % 4
    const can = legalClaims(state, seat)
    if (can.length) queue.push({ seat: seat, dist: dist, can: can })
  }
  queue.sort(function (a, b) {
    return claimRank(b.can) - claimRank(a.can) || a.dist - b.dist
  })
  state.claimQueue = queue
  state.claimPos = 0
  state.chiOptions = []
  if (!queue.length) resolvePass(state)
  else state.phase = 'claim'
}

function clearIppatsu(state) {
  state.players.forEach(function (player) { player.ippatsu = false })
}

function drawLive(state, seat) {
  if (state.cursor >= liveEnd(state)) return false
  const tile = state.wall[state.cursor++]
  state.players[seat].concealed.push(tile)
  state.drawnId = tile.id
  state.rinshan = false
  state.haitei = state.cursor === liveEnd(state)
  state.players[seat].ippatsu = false
  state.players[seat].furitenPass = false
  return true
}

function drawRinshan(state, seat) {
  if (state.rinshanTaken >= 4) return false
  const tile = state.wall[state.wall.length - 14 + state.rinshanTaken]
  state.rinshanTaken++
  state.players[seat].concealed.push(tile)
  state.drawnId = tile.id
  state.rinshan = true
  state.haitei = false
  return true
}

function commitKan(state, seat) {
  state.kans[seat]++
  const total = state.kans[0] + state.kans[1] + state.kans[2] + state.kans[3]
  const alone = state.kans[seat] === 4
  if (total >= 4 && !alone) {
    finishHand(state, { abort: true, reason: '四開槓。カンが4回かかり、流しました。点は動きません。' })
    return false
  }
  if (state.doraShown < 5) state.doraShown++
  state.noCalls = false
  clearIppatsu(state)
  if (!drawRinshan(state, seat)) {
    finishHand(state, { abort: true, reason: 'カンのあと引く牌がありません。流しました。' })
    return false
  }
  state.turn = seat
  state.phase = 'discard'
  state.lock = null
  state.animate = 'call'
  return true
}

function completeKakan(state) {
  const pending = state.pending
  const player = state.players[pending.seat]
  const meld = player.melds.find(function (item) { return item.kind === 'pon' && item.called === pending.tile.type })
  meld.tiles.push(pending.tile)
  meld.kind = 'kakan'
  state.pending = null
  addLog(state, MJ.playerName(pending.seat) + 'がカンしました。')
  commitKan(state, pending.seat)
}

function resolvePass(state) {
  const pending = state.pending
  if (pending && pending.type === 'kakan') {
    completeKakan(state)
    return
  }
  if (pending && pending.riichi) state.riichiCount++
  if (state.riichiCount >= 4) {
    state.pending = null
    finishHand(state, { abort: true, reason: '四家立直。4人ともリーチしたので流しました。リーチ棒は場に残ります。' })
    return
  }
  if (state.noCalls && state.openingDiscards.length === 4) {
    const first = state.openingDiscards[0]
    const sameWind = first >= 27 && first <= 30 && state.openingDiscards.every(function (type) { return type === first })
    if (sameWind) {
      state.pending = null
      finishHand(state, { abort: true, reason: '四風連打。最初の4人が同じ風を捨てたので流しました。' })
      return
    }
  }
  const next = (pending.seat + 1) % 4
  state.pending = null
  state.lock = null
  if (!drawLive(state, next)) {
    ryukyoku(state)
    return
  }
  state.turn = next
  state.phase = 'discard'
  state.animate = 'draw'
}

function takeRiver(state, seat, tile) {
  const river = state.players[seat].river
  const index = river.findIndex(function (row) { return row.tile.id === tile.id })
  if (index >= 0) river.splice(index, 1)
}

function applyDiscard(state, seat, tileId, asRiichi) {
  const player = state.players[seat]
  const legal = MJ.legalDiscardIds(state, seat, asRiichi || player.riichi)
  if (legal.indexOf(tileId) < 0) throw new Error('illegal discard ' + tileId)
  const tile = pullId(player, tileId)
  const double = asRiichi && player.firstTurn && state.noCalls
  if (asRiichi) {
    player.riichi = true
    player.doubleRiichi = double
    player.ippatsu = true
    state.scores[seat] -= 1000
    state.sticks++
    addLog(state, MJ.playerName(seat) + 'が' + (double ? 'ダブルリーチ' : 'リーチ') + '。1000点を場に置きました。')
  }
  player.river.push({ tile: tile, riichi: !!asRiichi })
  player.firstTurn = false
  state.discardsTotal++
  if (state.noCalls && state.openingDiscards.length < 4) state.openingDiscards.push(tile.type)
  state.drawnId = null
  state.declareRiichi = false
  state.rinshan = false
  state.lock = null
  state.pending = { type: 'discard', seat: seat, tile: tile, riichi: !!asRiichi }
  state.animate = 'discard'
  if (!asRiichi) addLog(state, MJ.playerName(seat) + 'が' + MJ.tileName(tile.type, tile.red) + 'を捨てました。')
  openClaims(state)
}

MJ.discard = function (state, seat, tileId) {
  if (state.phase !== 'discard' || state.turn !== seat) return
  applyDiscard(state, seat, tileId, !!state.declareRiichi)
}

MJ.declareDiscard = function (state, seat, tileId) {
  if (!MJ.canRiichi(state, seat)) return
  state.declareRiichi = true
  applyDiscard(state, seat, tileId, true)
}

function pointSentence(deltas, tsumo, winner, loser) {
  if (tsumo) {
    const parts = []
    for (let seat = 0; seat < 4; seat++) {
      if (deltas[seat] < 0) parts.push(MJ.playerName(seat) + 'が' + (-deltas[seat]) + '点')
    }
    return parts.join('、') + 'を払いました。'
  }
  return MJ.playerName(loser) + 'が' + deltas[winner] + '点を払いました。'
}

function winHand(state, winner, loser, tsumo, scored, winTile, sticksBefore) {
  const deltas = MJ.payments(scored, winner, state.dealer, loser, tsumo, state.honba, sticksBefore)
  for (let seat = 0; seat < 4; seat++) state.scores[seat] += deltas[seat]
  state.sticks = 0
  const names = scored.yaku.map(function (yaku) { return yaku.name + (yaku.han ? yaku.han + '翻' : '') }).join('、')
  const how = tsumo ? 'ツモ' : 'ロン'
  finishHand(state, {
    winner: winner,
    loser: loser,
    tsumo: tsumo,
    scored: scored,
    winTile: winTile,
    deltas: deltas,
    headline: MJ.playerName(winner) + 'が' + how + 'で上がりました。',
    detail: (scored.yakuman ? scored.limit : (scored.han + '翻' + (scored.fu ? scored.fu + '符' : ''))) + (scored.limit && !scored.yakuman ? '  ' + scored.limit : ''),
    yaku: scored.yaku,
    points: pointSentence(deltas, tsumo, winner, loser) + (sticksBefore ? ' 場のリーチ棒も受け取ります。' : ''),
    names: names
  })
}

function applyRon(state, seat) {
  const pending = state.pending
  const tile = pending.tile
  const player = state.players[seat]
  const concealed = player.concealed.concat([tile])
  const scored = MJ.scoreWin(concealed, player.melds, winContext(state, seat, tile, false, pending.type === 'kakan'))
  if (!scored) throw new Error('ron without yaku')
  if (pending.type === 'discard') takeRiver(state, pending.seat, tile)
  player.concealed.push(tile)
  const sticks = state.sticks
  state.pending = null
  winHand(state, seat, pending.seat, false, scored, tile, sticks)
}

function applyTsumo(state, seat) {
  const player = state.players[seat]
  const tile = player.concealed.find(function (item) { return item.id === state.drawnId }) || player.concealed[player.concealed.length - 1]
  const scored = MJ.scoreWin(player.concealed, player.melds, winContext(state, seat, tile, true, false))
  if (!scored) throw new Error('tsumo without yaku')
  const sticks = state.sticks
  winHand(state, seat, null, true, scored, tile, sticks)
}

MJ.tsumo = function (state, seat) {
  if (!MJ.canTsumo(state, seat)) return
  applyTsumo(state, seat)
}

MJ.kyuushu = function (state, seat) {
  if (!MJ.canKyuushu(state, seat)) return
  finishHand(state, { abort: true, reason: MJ.playerName(seat) + 'が九種九牌で流しました。1・9と字牌が9種類以上あり、点は動きません。' })
}

function afterCall(state, seat, lockTypes) {
  state.noCalls = false
  clearIppatsu(state)
  state.players[seat].firstTurn = false
  state.lock = { seat: seat, types: lockTypes || [] }
  state.turn = seat
  state.phase = 'discard'
  state.pending = null
  state.drawnId = null
  state.rinshan = false
  state.haitei = false
  state.declareRiichi = false
  state.chiOptions = []
  state.animate = 'call'
}

MJ.pon = function (state, seat) {
  const claim = currentClaim(state)
  if (!claim || claim.seat !== seat || claim.can.indexOf('pon') < 0) return
  const tile = state.pending.tile
  const got = pullTypes(state.players[seat], [tile.type, tile.type])
  state.players[seat].melds.push({
    kind: 'pon',
    tiles: [got[0], got[1], tile],
    from: state.pending.seat,
    called: tile.type
  })
  takeRiver(state, state.pending.seat, tile)
  addLog(state, MJ.playerName(seat) + 'が' + MJ.tileName(tile.type, tile.red) + 'をポンしました。')
  afterCall(state, seat, [tile.type])
}

MJ.chi = function (state, seat, low) {
  if (state.phase !== 'claim' && state.phase !== 'chi') return
  const claim = currentClaim(state) || (state.claimQueue && state.claimQueue[state.claimPos])
  if (!claim || claim.seat !== seat || claim.can.indexOf('chi') < 0) return
  if (state.phase === 'claim') {
    const options = MJ.claimChiOptions(state, seat)
    if (options.length === 1) low = options[0].low
    else if (low === undefined) {
      state.chiOptions = options
      state.phase = 'chi'
      return
    }
  }
  if (state.phase !== 'claim' && state.phase !== 'chi') return
  const options = MJ.claimChiOptions(state, seat)
  const opt = options.find(function (item) { return item.low === low })
  if (!opt) return
  const got = pullTypes(state.players[seat], opt.need)
  const tiles = MJ.sortTiles(got.concat([state.pending.tile]))
  state.players[seat].melds.push({
    kind: 'chi',
    tiles: tiles,
    from: state.pending.seat,
    called: opt.called,
    low: opt.low
  })
  takeRiver(state, state.pending.seat, state.pending.tile)
  addLog(state, MJ.playerName(seat) + 'がチーしました。')
  afterCall(state, seat, MJ.chiKuikae(opt.low, opt.called))
}

function applyDaiminkan(state, seat) {
  const tile = state.pending.tile
  const got = pullTypes(state.players[seat], [tile.type, tile.type, tile.type])
  state.players[seat].melds.push({
    kind: 'daiminkan',
    tiles: got.concat([tile]),
    from: state.pending.seat,
    called: tile.type
  })
  takeRiver(state, state.pending.seat, tile)
  state.pending = null
  addLog(state, MJ.playerName(seat) + 'がカンしました。')
  state.players[seat].firstTurn = false
  commitKan(state, seat)
}

MJ.kan = function (state, seat, kind, type) {
  if (kind === 'daiminkan') {
    const claim = currentClaim(state)
    if (!claim || claim.seat !== seat || claim.can.indexOf('kan') < 0) return
    applyDaiminkan(state, seat)
    return
  }
  if ((state.phase !== 'discard' && state.phase !== 'kan') || state.turn !== seat) return
  const options = MJ.kanOptions(state, seat)
  if (!kind) {
    if (!options.length) return
    if (options.length === 1) {
      kind = options[0].kind
      type = options[0].type
    } else {
      state.kanOptions = options
      state.phase = 'kan'
      return
    }
  }
  const option = options.find(function (item) { return item.kind === kind && item.type === type })
  if (!option) return
  if (kind === 'ankan') {
    const got = pullTypes(state.players[seat], [type, type, type, type])
    if (!got) return
    state.players[seat].melds.push({ kind: 'ankan', tiles: got, from: null, called: type })
    addLog(state, MJ.playerName(seat) + 'が暗カンしました。')
    commitKan(state, seat)
    return
  }
  if (kind === 'kakan') {
    const got = pullTypes(state.players[seat], [type])
    if (!got) return
    state.pending = { type: 'kakan', seat: seat, tile: got[0] }
    state.animate = 'call'
    openClaims(state)
  }
}

function currentClaim(state) {
  if (state.phase !== 'claim' || !state.claimQueue) return null
  return state.claimQueue[state.claimPos] || null
}

MJ.currentClaim = currentClaim

MJ.ron = function (state, seat) {
  const claim = currentClaim(state)
  if (!claim || claim.seat !== seat || claim.can.indexOf('ron') < 0) return
  applyRon(state, seat)
}

MJ.pass = function (state, seat) {
  if (state.phase === 'chi') state.phase = 'claim'
  const claim = currentClaim(state)
  if (!claim || claim.seat !== seat) return
  if (claim.can.indexOf('ron') >= 0) state.players[seat].furitenPass = true
  state.claimPos++
  state.chiOptions = []
  if (state.claimPos >= state.claimQueue.length) resolvePass(state)
}

function ryukyoku(state) {
  const tenpai = []
  state.players.forEach(function (player, seat) {
    const shanten = MJ.shanten(MJ.counts(player.concealed), player.melds.length)
    if (shanten === 0) tenpai.push(seat)
  })
  const deltas = [0, 0, 0, 0]
  if (tenpai.length > 0 && tenpai.length < 4) {
    const pay = 3000 / (4 - tenpai.length)
    const gain = 3000 / tenpai.length
    for (let seat = 0; seat < 4; seat++) {
      if (tenpai.indexOf(seat) >= 0) deltas[seat] += gain
      else deltas[seat] -= pay
    }
    deltas.forEach(function (delta, seat) { state.scores[seat] += delta })
  }
  const who = tenpai.length ? tenpai.map(MJ.playerName).join('と') : '誰も'
  finishHand(state, {
    ryukyoku: true,
    tenpai: tenpai,
    deltas: deltas,
    headline: '流局です。山がなくなりました。',
    detail: who + (tenpai.length ? 'がテンパイ。' : 'テンパイしていません。'),
    points: tenpai.length === 0 || tenpai.length === 4 ? '点は動きません。' : 'テンパイしていない人が、テンパイした人に合計3000点を払います。',
    reason: null
  })
}

function finishHand(state, info) {
  const winner = info.winner
  const renchan = info.abort || winner === state.dealer || (info.ryukyoku && info.tenpai && info.tenpai.indexOf(state.dealer) >= 0)
  if (info.abort || info.ryukyoku || winner === state.dealer) state.honba++
  else state.honba = 0
  if (renchan) {
    if (state.kyoku === 4) state.east4Repeats++
  } else {
    state.dealer = (state.dealer + 1) % 4
    state.kyoku++
    state.east4Repeats = 0
  }
  state.result = info
  state.pending = null
  const broke = state.scores.some(function (score) { return score < 0 })
  const done = broke || state.kyoku > 4 || (state.kyoku === 4 && state.east4Repeats > 1)
  state.phase = done ? 'match-end' : 'hand-end'
  state.animate = 'end'
  if (info.headline) addLog(state, info.headline)
  if (done && state.phase === 'match-end') {
    const ranking = [0, 1, 2, 3].sort(function (a, b) { return state.scores[b] - state.scores[a] })
    state.ranking = ranking
  }
}

MJ.invariant = function (state) {
  const ids = []
  state.players.forEach(function (player) {
    player.concealed.forEach(function (tile) { ids.push(tile.id) })
    player.melds.forEach(function (meld) { meld.tiles.forEach(function (tile) { ids.push(tile.id) }) })
    player.river.forEach(function (row) { ids.push(row.tile.id) })
  })
  if (state.pending && state.pending.type === 'kakan') ids.push(state.pending.tile.id)
  const expect = state.cursor + state.rinshanTaken
  if (ids.length !== expect) return 'tiles ' + ids.length + ' != ' + expect
  const unique = new Set(ids)
  if (unique.size !== ids.length) return 'duplicate tile'
  const sum = state.scores.reduce(function (total, score) { return total + score }, 0) + state.sticks * 1000
  if (sum !== 100000) return 'points ' + sum
  return null
}

function actAi(state, seat, decision) {
  if (decision.type === 'tsumo') applyTsumo(state, seat)
  else if (decision.type === 'kyuushu') MJ.kyuushu(state, seat)
  else if (decision.type === 'kan') MJ.kan(state, seat, decision.kind, decision.kanType)
  else if (decision.type === 'riichi') MJ.declareDiscard(state, seat, decision.tileId)
  else MJ.discard(state, seat, decision.tileId)
}

MJ.step = function (state) {
  if (state.phase === 'hand-end' || state.phase === 'match-end') return 'stop'
  state.handSteps++
  if (state.handSteps > 800) throw new Error('hand did not end')
  if (state.phase === 'discard') {
    if (!state.agents[state.turn]) return 'stop'
    actAi(state, state.turn, MJ.chooseTurn(state, state.turn))
    return 'go'
  }
  if (state.phase === 'claim') {
    const claim = currentClaim(state)
    if (!claim) {
      resolvePass(state)
      return 'go'
    }
    if (!state.agents[claim.seat]) return 'stop'
    const choice = MJ.chooseClaim(state, claim.seat, claim.can)
    if (choice.type === 'ron') applyRon(state, claim.seat)
    else if (choice.type === 'pon') MJ.pon(state, claim.seat)
    else if (choice.type === 'kan') applyDaiminkan(state, claim.seat)
    else if (choice.type === 'chi') MJ.chi(state, claim.seat, choice.low)
    else MJ.pass(state, claim.seat)
    return 'go'
  }
  if (state.phase === 'chi' || state.phase === 'kan') {
    if (!state.agents[state.turn] && !(state.phase === 'chi' && state.agents[currentClaim(state) ? currentClaim(state).seat : 0])) return 'stop'
  }
  return 'stop'
}

MJ.advice = function (state) {
  if (state.phase === 'discard' && state.turn === 0 && !state.agents[0]) {
    if (state.declareRiichi) return 'リーチする牌を選んでください。テンパイが続く牌だけ選べます。'
    return MJ.chooseTurn(state, 0).text
  }
  if (state.phase === 'claim') {
    const claim = currentClaim(state)
    if (claim && claim.seat === 0) return MJ.chooseClaim(state, 0, claim.can).text
  }
  if (state.phase === 'chi') return 'どの3枚にするか選んでください。'
  if (state.phase === 'kan') return 'どの牌をカンするか選んでください。'
  if (state.phase === 'hand-end' || state.phase === 'match-end') return ''
  const wind = windName(MJ.seatWind(state, state.turn))
  return MJ.playerName(state.turn) + '（' + wind + '）の番です。'
}
