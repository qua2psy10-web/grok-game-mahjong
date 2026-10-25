'use strict'

var state = null
var selectedId = null
var rulesOpen = false
var introStep = 0
var introOn = false
var coachOn = true
var timer = 0
var paintedDraw = null
var app = document.getElementById('app')

var INTRO = [
  {
    title: '牌を揃える',
    body: '4人で打つゲームです。ゴールは、3枚のまとまりを4つと、同じ牌2枚を作ること。揃えて、ツモかロンで点をもらいます。まとまりは、同じ種類の並び（2萬・3萬・4萬）か、同じ牌3枚です。'
  },
  {
    title: '自分の番',
    body: '番が来ると、山から1枚もらい、いらない牌を1枚捨てます。牌をクリックして選び、もう一度クリックするか「捨てる」を押します。誰かの捨て牌で上がれるときは「ロン」、自分の番で上がれるときは「ツモで上がる」が出ます。'
  },
  {
    title: '役がないと上がれない',
    body: '形が揃っただけでは点が入りません。役が1つ要ります。2から8だけならタンヤオ。白・發・中が3枚なら役牌。鳴いていない状態でテンパイなら、リーチも役になります。迷ったら、下の案内のとおりに捨てて大丈夫です。'
  }
]

function storageGet(key, fallback) {
  try {
    var value = localStorage.getItem(key)
    return value === null ? fallback : value
  } catch (error) {
    return fallback
  }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value) } catch (error) {}
}

function esc(text) {
  return String(text).replace(/[&<>]/g, function (ch) {
    return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'
  })
}

function windChar(seat) {
  return ['東', '南', '西', '北'][MJ.seatWind(state, seat) - 27]
}

function pinCells(rank) {
  var on = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
    7: [0, 2, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 3, 5, 6, 7, 8],
    9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
  }[rank + 1]
  var html = '<span class="pips">'
  for (var i = 0; i < 9; i++) html += '<i class="' + (on.indexOf(i) >= 0 ? 'on' : 'off') + '"></i>'
  return html + '</span>'
}

function souFace(rank) {
  if (rank === 0) return '<span class="bird"></span>'
  var count = rank + 1
  var html = '<span class="sticks">'
  for (var i = 0; i < count; i++) {
    var marked = (count === 5 && i === 2) || (count !== 5 && count % 2 === 0 && i === count / 2 - 1)
    html += '<i class="' + (marked ? 'mark' : '') + '"></i>'
  }
  return html + '</span>'
}

function face(tile) {
  var type = tile.type
  if (type >= 27) {
    var honor = ['東', '南', '西', '北', '白', '發', '中'][type - 27]
    var tone = type === 33 ? 'ink-red' : type === 32 ? 'hatsu' : type === 31 ? 'haku' : ''
    return '<span class="face honor ' + tone + '"><b>' + honor + '</b></span>'
  }
  var rank = type % 9
  var suit = Math.floor(type / 9)
  if (suit === 0) {
    var red = tile.red || rank === 0 || rank === 8
    return '<span class="face ' + (red ? 'ink-red' : '') + '"><b>' + '一二三四五六七八九'[rank] + '</b><small>萬</small></span>'
  }
  if (suit === 1) {
    if (rank === 0) return '<span class="face"><span class="pip-one"></span></span>'
    return '<span class="face">' + pinCells(rank) + '</span>'
  }
  return '<span class="face">' + souFace(rank) + '</span>'
}

function tileHtml(tile, opts) {
  var o = opts || {}
  var cls = ['tile', MJ.suitOf(tile.type)]
  if (tile.red) cls.push('red')
  if (o.mini) cls.push('mini')
  if (o.across) cls.push('across')
  if (o.up) cls.push('up')
  if (o.hint) cls.push('hint')
  if (o.hot) cls.push('hot')
  if (o.fresh) cls.push('fresh')
  if (o.drawn) cls.push('drawn')
  var label = MJ.tileName(tile.type, tile.red)
  if (o.act) {
    return '<button type="button" class="' + cls.join(' ') + '" data-act="' + o.act + '" data-id="' + tile.id + '" title="' + esc(MJ.tileReading(tile.type, tile.red)) + '" aria-label="' + esc(label) + '">' + face(tile) + '</button>'
  }
  return '<span class="' + cls.join(' ') + '" title="' + esc(label) + '" aria-hidden="true">' + face(tile) + '</span>'
}

function backs(count) {
  var html = ''
  for (var i = 0; i < count; i++) html += '<span class="tile mini back" aria-hidden="true"></span>'
  return html
}

function riverHtml(player) {
  var html = ''
  for (var i = 0; i < player.river.length; i++) {
    var row = player.river[i]
    var hot = state.pending && state.pending.tile && state.pending.tile.id === row.tile.id
    html += tileHtml(row.tile, { mini: true, across: row.riichi, hot: hot })
  }
  return html
}

function calledIndex(meld) {
  if (meld.kind === 'ankan' || meld.called === undefined || meld.called === null) return -1
  if (meld.kind === 'chi') {
    for (var i = 0; i < meld.tiles.length; i++) if (meld.tiles[i].type === meld.called) return i
    return -1
  }
  var owner = -1
  for (var seat = 0; seat < 4; seat++) {
    if (state.players[seat].melds.indexOf(meld) >= 0) owner = seat
  }
  if (owner < 0 || meld.from === undefined || meld.from === null) return 0
  var rel = (meld.from - owner + 4) % 4
  if (rel === 3) return 0
  if (rel === 2) return Math.min(1, meld.tiles.length - 1)
  return meld.tiles.length - 1
}

function meldHtml(meld, owner) {
  var html = ''
  var spot = calledIndex(meld)
  var hide = meld.kind === 'ankan' && owner !== 0
  for (var i = 0; i < meld.tiles.length; i++) {
    if (hide && (i === 0 || i === meld.tiles.length - 1)) html += '<span class="tile mini back" aria-hidden="true"></span>'
    else html += tileHtml(meld.tiles[i], { mini: true, across: i === spot })
  }
  return html
}

function meldsHtml(seat) {
  var html = ''
  var melds = state.players[seat].melds
  for (var i = 0; i < melds.length; i++) html += '<span class="meld">' + meldHtml(melds[i], seat) + '</span>'
  return html
}

function whoHtml(seat) {
  var acting = state.phase === 'discard' && state.turn === seat
  var dealer = seat === state.dealer
  var riichi = state.players[seat].riichi
  return '<p class="who' + (acting ? ' acting' : '') + '"><span class="wind">' + windChar(seat) + '</span>' +
    '<span class="name">' + esc(MJ.playerName(seat)) + '</span>' +
    (dealer ? '<span class="tag">親</span>' : '') +
    (riichi ? '<span class="tag">リーチ</span>' : '') +
    '<span class="pts">' + state.scores[seat].toLocaleString('ja-JP') + '</span></p>'
}

function adviceKey() {
  var ids = state.players[0].concealed.map(function (tile) { return tile.id }).join('.')
  return state.phase + ':' + state.turn + ':' + state.handSteps + ':' + (state.declareRiichi ? 1 : 0) + ':' + ids
}

function turnAdvice() {
  if (!(state.phase === 'discard' && state.turn === 0)) return null
  if (state._adviceKey !== adviceKey()) {
    state._advice = MJ.chooseTurn(state, 0)
    state._adviceKey = adviceKey()
  }
  return state._advice
}

function coachText() {
  if (state.flash) return state.flash
  if (coachOn && state.phase === 'discard' && state.turn === 0) return turnAdvice().text
  if (state.phase === 'discard' && state.turn === 0) return '牌を選んで、捨ててください。上がれるときは赤いボタンが出ます。'
  return MJ.advice(state)
}

function humanTurn() {
  return state.phase === 'discard' && state.turn === 0 && !state.agents[0]
}

function handHtml() {
  var player = state.players[0]
  var advice = null
  if (coachOn && humanTurn()) {
    try { advice = turnAdvice() } catch (error) { advice = null }
  }
  var legal = {}
  if (humanTurn()) {
    MJ.legalDiscardIds(state, 0, state.declareRiichi || state.players[0].riichi).forEach(function (id) { legal[id] = true })
  }
  var drawn = null
  var rest = []
  for (var i = 0; i < player.concealed.length; i++) {
    var tile = player.concealed[i]
    if (tile.id === state.drawnId) drawn = tile
    else rest.push(tile)
  }
  rest = MJ.sortTiles(rest)
  function one(tile, isDrawn) {
    if (!tile) return ''
    var selectable = humanTurn() && legal[tile.id]
    return tileHtml(tile, {
      act: selectable ? 'tile' : '',
      up: selectedId === tile.id,
      hint: advice && advice.tileId === tile.id && selectedId !== tile.id,
      fresh: isDrawn && paintedDraw !== state.drawnId,
      drawn: isDrawn
    })
  }
  var html = ''
  for (var r = 0; r < rest.length; r++) html += one(rest[r], false)
  html += one(drawn, true)
  return html
}

function actionsHtml() {
  if (state.phase === 'hand-end' || state.phase === 'match-end') return ''
  var html = ''
  if (humanTurn()) {
    if (MJ.canTsumo(state, 0)) html += '<button type="button" class="primary" data-act="tsumo">ツモで上がる</button>'
    if (MJ.canKyuushu(state, 0)) html += '<button type="button" class="quiet" data-act="kyuushu">流す</button>'
    if (state.declareRiichi) html += '<button type="button" class="quiet" data-act="cancel-riichi">リーチをやめる</button>'
    else if (MJ.canRiichi(state, 0)) html += '<button type="button" class="quiet" data-act="arm-riichi">リーチ</button>'
    if (MJ.kanOptions(state, 0).length) html += '<button type="button" class="quiet" data-act="kan">カン</button>'
    if (selectedId) html += '<button type="button" class="primary" data-act="drop">' + (state.declareRiichi ? 'リーチして捨てる' : '捨てる') + '</button>'
  }
  var claim = MJ.currentClaim(state)
  if (claim && claim.seat === 0 && state.phase === 'claim') {
    if (claim.can.indexOf('ron') >= 0) html += '<button type="button" class="primary" data-act="ron">ロン</button>'
    if (claim.can.indexOf('pon') >= 0) html += '<button type="button" class="quiet" data-act="pon">ポン</button>'
    if (claim.can.indexOf('chi') >= 0) html += '<button type="button" class="quiet" data-act="open-chi">チー</button>'
    if (claim.can.indexOf('kan') >= 0) html += '<button type="button" class="quiet" data-act="daiminkan">カン</button>'
    html += '<button type="button" class="ghost" data-act="pass">見送り</button>'
  }
  if (state.phase === 'chi') {
    html += '<div class="chi-choices">'
    var options = state.chiOptions || []
    for (var i = 0; i < options.length; i++) {
      var opt = options[i]
      var types = [opt.low, opt.low + 1, opt.low + 2]
      html += '<button type="button" class="choice" data-act="chi" data-low="' + opt.low + '">'
      for (var t = 0; t < types.length; t++) {
        html += tileHtml({ id: 'c' + i + '-' + t, type: types[t], red: false }, { mini: true })
      }
      html += '</button>'
    }
    html += '</div><button type="button" class="ghost" data-act="pass">見送り</button>'
  }
  if (state.phase === 'kan') {
    html += '<div class="kan-choices">'
    var kans = state.kanOptions || []
    for (var k = 0; k < kans.length; k++) {
      html += '<button type="button" class="choice" data-act="pick-kan" data-kind="' + kans[k].kind + '" data-type="' + kans[k].type + '">'
      html += tileHtml({ id: 'k' + k, type: kans[k].type, red: false }, { mini: true })
      html += esc(kans[k].kind === 'ankan' ? '暗カン' : '加カン')
      html += '</button>'
    }
    html += '</div>'
  }
  return html
}

function moonHtml() {
  var sticks = ''
  for (var i = 0; i < state.sticks; i++) sticks += '<i class="stick"></i>'
  var dora = ''
  var indicators = MJ.doraIndicators(state)
  for (var d = 0; d < indicators.length; d++) dora += tileHtml(indicators[d], { mini: true })
  var kyoku = ['一', '二', '三', '四'][state.kyoku - 1] || state.kyoku
  return '<div class="moon"><div class="ring"><strong>東</strong><span>' + kyoku + '局' + (state.honba ? ' ' + state.honba + '本場' : '') + '</span></div>' +
    '<div class="dora-row">ドラ ' + dora + '</div>' +
    '<div class="stick-row">' + (sticks || '') + '</div>' +
    '<p class="remain">山の残り ' + MJ.wallLeft(state) + '</p></div>'
}

function seatHtml(seat, cls) {
  var player = state.players[seat]
  return '<section class="' + cls + '">' + whoHtml(seat) +
    '<div class="backs">' + backs(player.concealed.length) + '</div>' +
    '<div class="melds">' + meldsHtml(seat) + '</div>' +
    '<div class="river">' + riverHtml(player) + '</div></section>'
}

function sheetHtml() {
  if (introOn) {
    var page = INTRO[introStep]
    return '<div class="veil"><div class="sheet" role="dialog" aria-labelledby="intro-title"><h2 id="intro-title">' + esc(page.title) + '</h2><p>' + esc(page.body) + '</p>' +
      '<button type="button" class="primary" data-act="intro-next">' + (introStep < INTRO.length - 1 ? '次へ' : '対局を始める') + '</button></div></div>'
  }
  if (rulesOpen) {
    var examples = '<div class="examples"><div class="example">並び' +
      tileHtml({ id: 'e1', type: 1, red: false }, { mini: true }) +
      tileHtml({ id: 'e2', type: 2, red: false }, { mini: true }) +
      tileHtml({ id: 'e3', type: 3, red: false }, { mini: true }) +
      '</div><div class="example">同じ牌3枚' +
      tileHtml({ id: 'e4', type: 33, red: false }, { mini: true }) +
      tileHtml({ id: 'e5', type: 33, red: false }, { mini: true }) +
      tileHtml({ id: 'e6', type: 33, red: false }, { mini: true }) +
      '</div></div>'
    var rules = MJ.RULES.map(function (line) { return '<li>' + esc(line) + '</li>' }).join('')
    return '<div class="veil"><div class="sheet" role="dialog" aria-labelledby="rules-title"><h2 id="rules-title">ルール</h2>' +
      examples +
      '<ul>' + rules + '</ul>' +
      '<p>数字の字が萬、丸が筒、棒が索です。1索だけは鳥の絵です。牌に触れると読みが出ます。</p>' +
      '<p>左右の矢印で自分の牌を選び、Enterで捨てます。Escは見送りです。</p>' +
      '<button type="button" class="primary" data-act="close-rules">閉じる</button></div></div>'
  }
  if (state.phase === 'hand-end' || state.phase === 'match-end') return resultHtml()
  return ''
}

function resultHtml() {
  var result = state.result || {}
  var yaku = ''
  if (result.yaku) {
    yaku = '<ul class="yaku-list">' + result.yaku.map(function (item) {
      return '<li><strong>' + esc(item.name) + '</strong> ' + esc(item.text) + '</li>'
    }).join('') + '</ul>'
  }
  var ranking = ''
  if (state.phase === 'match-end') {
    ranking = '<h2>東場が終わりました</h2><ol class="rank">'
    var order = state.ranking || [0, 1, 2, 3]
    for (var i = 0; i < order.length; i++) {
      ranking += '<li>' + esc(MJ.playerName(order[i])) + ' ' + state.scores[order[i]].toLocaleString('ja-JP') + '点</li>'
    }
    ranking += '</ol>'
  }
  var button = state.phase === 'match-end'
    ? '<button type="button" class="primary" data-act="rematch">もう一度</button>'
    : '<button type="button" class="primary" data-act="next">次の局へ</button>'
  return '<div class="veil"><div class="sheet" role="dialog"><h2>' + esc(result.headline || '局が終わりました') + '</h2>' +
    (result.detail ? '<p>' + esc(result.detail) + '</p>' : '') +
    (result.points ? '<p>' + esc(result.points) + '</p>' : '') +
    (result.reason ? '<p>' + esc(result.reason) + '</p>' : '') +
    yaku + ranking + button + '</div></div>'
}

function render() {
  var choice = null
  try { choice = humanTurn() && coachOn ? turnAdvice() : null } catch (error) { state.flash = error.message }
  var coach = ''
  try { coach = coachText() } catch (error) { coach = error.message }
  app.innerHTML =
    '<div class="room"><div class="felt">' +
    '<header class="topbar"><div class="brand"><h1>麻雀</h1><p>数字の字が萬、丸が筒、棒が索</p></div>' +
    '<div class="top-actions"><label class="coach-toggle"><input type="checkbox" data-act="coach"' + (coachOn ? ' checked' : '') + '>次の一手を教える</label>' +
    '<button type="button" class="ghost" data-act="rules">ルール</button></div></header>' +
    '<div class="table">' +
    seatHtml(2, 'seat-top') +
    seatHtml(3, 'seat-left') +
    '<div class="moon-wrap">' + moonHtml() + '</div>' +
    seatHtml(1, 'seat-right') +
    '<section class="self">' + whoHtml(0) +
    '<div class="river">' + riverHtml(state.players[0]) + '</div>' +
    '<div class="hand-row"><div class="melds">' + meldsHtml(0) + '</div><div class="hand">' + handHtml() + '</div></div>' +
    '<div class="actions">' + actionsHtml() + '</div>' +
    '<p class="coach" aria-live="polite">' + esc(coach) + '</p>' +
    '</section></div></div></div>' + sheetHtml()
  paintedDraw = state.drawnId
  if (choice && choice.type === 'tsumo') {
    var tsumo = app.querySelector('[data-act="tsumo"]')
    if (tsumo) tsumo.focus()
  }
}

function humanMustAct() {
  if (!state || state.agents[0]) return false
  if (state.phase === 'discard' && state.turn === 0) return true
  if (state.phase === 'chi' || state.phase === 'kan') return true
  var claim = MJ.currentClaim(state)
  return state.phase === 'claim' && claim && claim.seat === 0
}

function afterAction() {
  selectedId = null
  state.flash = ''
  pump()
}

function dropSelected() {
  if (!selectedId) return
  var id = selectedId
  selectedId = null
  if (state.declareRiichi) MJ.declareDiscard(state, 0, id)
  else MJ.discard(state, 0, id)
  afterAction()
}

function onClick(event) {
  var target = event.target.closest('[data-act]')
  if (!target) return
  var act = target.getAttribute('data-act')
  if (act === 'tile') {
    var id = Number(target.getAttribute('data-id'))
    var legal = MJ.legalDiscardIds(state, 0, state.declareRiichi || state.players[0].riichi)
    if (legal.indexOf(id) < 0) {
      state.flash = 'その牌は今捨てられません。'
      render()
      return
    }
    state.flash = ''
    if (selectedId === id) dropSelected()
    else {
      selectedId = id
      render()
    }
    return
  }
  if (act === 'drop') return dropSelected()
  if (act === 'tsumo') { MJ.tsumo(state, 0); return afterAction() }
  if (act === 'kyuushu') { MJ.kyuushu(state, 0); return afterAction() }
  if (act === 'arm-riichi') {
    state.declareRiichi = true
    selectedId = null
    state.flash = ''
    render()
    return
  }
  if (act === 'cancel-riichi') {
    state.declareRiichi = false
    selectedId = null
    render()
    return
  }
  if (act === 'kan') { MJ.kan(state, 0); return afterAction() }
  if (act === 'pick-kan') {
    MJ.kan(state, 0, target.getAttribute('data-kind'), Number(target.getAttribute('data-type')))
    return afterAction()
  }
  if (act === 'ron') { MJ.ron(state, 0); return afterAction() }
  if (act === 'pon') { MJ.pon(state, 0); return afterAction() }
  if (act === 'daiminkan') { MJ.kan(state, 0, 'daiminkan'); return afterAction() }
  if (act === 'open-chi') { MJ.chi(state, 0); return afterAction() }
  if (act === 'chi') { MJ.chi(state, 0, Number(target.getAttribute('data-low'))); return afterAction() }
  if (act === 'pass') { MJ.pass(state, 0); return afterAction() }
  if (act === 'next') { MJ.nextHand(state); return afterAction() }
  if (act === 'rematch') {
    state = MJ.createMatch({ agents: [false, true, true, true] })
    selectedId = null
    return afterAction()
  }
  if (act === 'rules') {
    rulesOpen = true
    window.clearTimeout(timer)
    render()
    return
  }
  if (act === 'close-rules') { rulesOpen = false; pump(); return }
  if (act === 'intro-next') {
    if (introStep < INTRO.length - 1) introStep++
    else {
      introOn = false
      storageSet('mahjong-intro', '1')
    }
    render()
    return
  }
  if (act === 'coach') {
    coachOn = target.checked
    storageSet('mahjong-coach', coachOn ? '1' : '0')
    render()
  }
}

function moveSelection(dir) {
  if (!humanTurn()) return
  var ids = MJ.legalDiscardIds(state, 0, state.declareRiichi || state.players[0].riichi)
  if (!ids.length) return
  var index = ids.indexOf(selectedId)
  if (index < 0) index = dir > 0 ? -1 : 0
  selectedId = ids[(index + dir + ids.length) % ids.length]
  state.flash = ''
  render()
}

function pump() {
  window.clearTimeout(timer)
  render()
  if (introOn || rulesOpen) return
  if (state.phase === 'hand-end' || state.phase === 'match-end') return
  if (humanMustAct()) return
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var wait = reduce ? 0 : (state.animate === 'draw' ? 40 : 260)
  timer = window.setTimeout(function () {
    try { MJ.step(state) } catch (error) {
      state.flash = '手が止まりました。' + error.message
      render()
      return
    }
    pump()
  }, wait)
}

app.addEventListener('click', onClick)
app.addEventListener('change', onClick)
document.addEventListener('keydown', function (event) {
  if (introOn || rulesOpen) return
  if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(1) }
  if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(-1) }
  if (event.key === 'Enter' && humanTurn() && selectedId) { event.preventDefault(); dropSelected() }
  if (event.key === 'Escape' && (state.phase === 'claim' || state.phase === 'chi')) {
    event.preventDefault()
    MJ.pass(state, 0)
    afterAction()
  }
  if (event.key === 'Escape' && state.declareRiichi) {
    state.declareRiichi = false
    render()
  }
})

function boot() {
  if (location.search.indexOf('selftest') >= 0) {
    try {
      var trial = MJ.createMatch({ seed: 3, agents: [true, true, true, true] })
      var guard = 0
      while (trial.phase !== 'match-end' && guard < 30000) {
        if (trial.phase === 'hand-end') MJ.nextHand(trial)
        else MJ.step(trial)
        guard++
      }
      var broken = MJ.invariant(trial)
      app.innerHTML = '<p id="selftest">' + esc(broken || (trial.phase === 'match-end' ? 'SELFTEST OK' : 'NOT FINISHED')) + '</p>'
    } catch (error) {
      app.innerHTML = '<p id="selftest">FAIL ' + esc(error.message) + '</p>'
    }
    return
  }
  coachOn = storageGet('mahjong-coach', '1') !== '0'
  introOn = storageGet('mahjong-intro', '') !== '1' && location.search.indexOf('play=1') < 0
  state = MJ.createMatch({ agents: [false, true, true, true] })
  pump()
}

boot()
