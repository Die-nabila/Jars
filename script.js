// My Money — all the app logic lives in this one file.
const KEY = 'mymoney.v1';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => ((Math.round(n) || 0)).toLocaleString('en-US') + ' DA';
const ICONS = ['🍔', '🚕', '🎀', '🛍️', '💰', '🏠', '☕', '🎓', '💊', '🎁', '📱', '🐱', '✈️', '🎮', '📚', '🧺'];
const COLORS = ['#f4a261', '#6cc5d9', '#f08fb0', '#b39ddb', '#f2c14e', '#8bc78a', '#ef8a7a', '#7aa7e8'];

// ---------- Data (saved in localStorage) ----------
function defaults() {
  const t = new Date();
  return {
    start: 50000,
    startDate: iso(new Date(t.getFullYear(), t.getMonth(), 1)),
    endDate: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)),
    theme: 'light',
    jars: [ // type: 'spend' or 'reserve'
      { id: 'daily', name: 'Daily', icon: '🍔', alloc: 20000, type: 'spend', color: COLORS[0] },
      { id: 'transport', name: 'Transport', icon: '🚕', alloc: 5000, type: 'spend', color: COLORS[1] },
      { id: 'fun', name: 'Fun', icon: '🎀', alloc: 5000, type: 'spend', color: COLORS[2] },
      { id: 'shopping', name: 'Shopping', icon: '🛍️', alloc: 5000, type: 'spend', color: COLORS[3] },
      { id: 'savings', name: 'Savings', icon: '💰', alloc: 15000, type: 'reserve', color: COLORS[4] }
    ],
    tx: [],    // expenses: {id, ts, jar, amount, note, date}
    moves: []  // transfers: {id, ts, from, to, amount, date}
  };
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.jars) return s; } catch (e) {} return defaults(); }
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const J = id => S.jars.find(j => j.id === id);

// ---------- Money maths ----------
const sum = a => a.reduce((x, y) => x + y, 0);
const spent = j => sum(S.tx.filter(t => t.jar === j.id).map(t => t.amount));
const moved = j => sum(S.moves.map(m => (m.to === j.id ? m.amount : 0) - (m.from === j.id ? m.amount : 0)));
const eff = j => j.alloc + moved(j);   // allocation including money moved in/out
const bal = j => eff(j) - spent(j);    // what is left in the jar
function stats() {
  const sp = S.jars.filter(j => j.type === 'spend'), rs = S.jars.filter(j => j.type === 'reserve');
  const spendable = sum(sp.map(bal)), reserved = sum(rs.map(bal));
  const t = today();
  const spentToday = sum(S.tx.filter(x => x.date === t && J(x.jar)?.type === 'spend').map(x => x.amount));
  const days = Math.max(1, Math.round((Date.parse(S.endDate) - Date.parse(t)) / 864e5) + 1);
  // spentToday is added back so today's allowance stays steady during the day
  return { spendable, reserved, total: spendable + reserved, spentToday, days, allowance: (spendable + spentToday) / days };
}

// ---------- Jar drawing (SVG) ----------
const BODY = 'M38 28H82V36Q100 44 100 62V118Q100 134 84 134H36Q20 134 20 118V62Q20 44 38 36Z';
const COINS = [[30, 6], [52, 3], [74, 7], [92, 4], [40, 20], [64, 17], [84, 22], [28, 34], [54, 31], [78, 38]];
let clipN = 0;
function jarSVG(j) {
  const e = eff(j), p = e > 0 ? Math.max(0, Math.min(1, bal(j) / e)) : 0, y = (1 - p) * 98, id = 'clip' + (clipN++);
  const coins = COINS.map(([x, d]) => `<ellipse cx="${x}" cy="${40 + d}" rx="9" ry="4" fill="#f6c453" stroke="#d99a1e" stroke-width="1.2"/>`).join('');
  return `<svg class="jarsvg" viewBox="0 0 120 142" role="img" aria-label="${esc(j.name)} jar, ${Math.round(p * 100)}% full">
  <defs><clipPath id="${id}"><path d="${BODY}"/></clipPath></defs>
  <ellipse cx="60" cy="138" rx="38" ry="4" fill="#000" opacity=".12"/>
  <path d="${BODY}" fill="#fff" fill-opacity=".4"/>
  <g clip-path="url(#${id})"><g class="fill" style="--y:${y}px"><rect x="0" y="40" width="120" height="100" fill="${j.color}" opacity=".4"/>${coins}</g></g>
  <path d="${BODY}" fill="none" stroke="#9cb8c4" stroke-width="2.5"/>
  <path d="M29 68V108" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".75"/>
  <rect x="33" y="12" width="54" height="17" rx="6" fill="${j.color}" stroke="#00000022" stroke-width="1.5"/>
  <text x="60" y="100" text-anchor="middle" font-size="26">${j.icon}</text></svg>`;
}
const card = j => `<button class="jar" data-act="open" data-id="${j.id}">${jarSVG(j)}<b>${esc(j.name)}</b><span>${fmt(bal(j))}</span>${j.type === 'reserve' ? '<em>reserved</em>' : ''}</button>`;
const grid = () => S.jars.length ? `<div class="grid">${S.jars.map(card).join('')}</div>` : '<p class="muted">No jars yet — create one to get started.</p>';

// ---------- Screens ----------
let view = 'home', detail = null;
function render() {
  document.documentElement.dataset.theme = S.theme;
  $('#app').innerHTML = detail ? detailV() : { home: homeV, jars: jarsV, history: historyV, settings: settingsV }[view]();
  $('#nav').innerHTML = [['home', '🏠', 'Home'], ['jars', '🫙', 'Jars'], ['history', '📋', 'History'], ['settings', '⚙️', 'Settings']]
    .map(([k, i, l]) => `<button data-act="nav" data-v="${k}" class="${k === view && !detail ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('');
}
function homeV() {
  const s = stats(), h = new Date().getHours(), rem = s.allowance - s.spentToday;
  const g = h < 12 ? 'Good morning ☀️' : h < 18 ? 'Good afternoon 🌤️' : 'Good evening 🌙';
  return `<header><small>${g}</small><h1>My Money</h1></header>
  <section class="total"><small>TOTAL AVAILABLE</small><div class="big">${fmt(s.total)}</div><small>${fmt(s.spendable)} to spend, ${fmt(s.reserved)} reserved</small></section>
  <section class="card allow"><small>TODAY'S ALLOWANCE</small><div class="big">${fmt(s.allowance)}</div>
  <div class="row"><span>Spent today</span><b>${fmt(s.spentToday)}</b></div>
  <div class="row ${rem < 0 ? 'neg' : ''}"><span>Remaining today</span><b>${fmt(rem)}</b></div>
  <small>${s.days} day${s.days > 1 ? 's' : ''} left, including today${rem < 0 ? '. A bit over today, and that is okay 💛' : ''}</small></section>
  <button class="cta" data-act="addexp">＋ ADD EXPENSE</button><h2>Your jars</h2>${grid()}`;
}
const jarsV = () => `<header><h1>Jars</h1></header>${grid()}<button class="ghost" data-act="newjar">＋ New jar</button>`;
const sortFn = (a, b) => b.date.localeCompare(a.date) || b.ts - a.ts;
function txRow(t) {
  const j = J(t.jar);
  return `<button class="tx" data-act="edit" data-id="${t.id}"><span class="ti">${j.icon}</span><div><b>${esc(t.note || j.name)}</b><small>${esc(j.name)}</small></div><strong>-${fmt(t.amount)}</strong></button>`;
}
function detailV() {
  const j = J(detail);
  if (!j) { detail = null; return homeV(); }
  const list = S.tx.filter(t => t.jar === j.id).sort(sortFn);
  return `<button class="back" data-act="back">‹ Back</button>
  <div class="detail">${jarSVG(j)}<h1>${esc(j.name).toUpperCase()}</h1><div class="big">${fmt(bal(j))}</div><small>remaining</small></div>
  <section class="card"><div class="row"><span>Allocation</span><b>${fmt(eff(j))}</b></div><div class="row"><span>Spent</span><b>${fmt(spent(j))}</b></div></section>
  <div class="btns"><button class="cta" data-act="addexp" data-id="${j.id}">＋ Add expense</button><button class="ghost" data-act="move" data-id="${j.id}" style="border-style:solid">Move money</button></div>
  <h2>Expenses</h2>${list.length ? list.map(txRow).join('') : '<p class="muted">No expenses in this jar yet.</p>'}`;
}
function historyV() {
  const items = [...S.tx.map(t => ({ ...t, k: 'e' })), ...S.moves.map(m => ({ ...m, k: 'm' }))].sort(sortFn);
  if (!items.length) return '<header><h1>History</h1></header><p class="muted">Nothing here yet. Add your first expense from Home.</p>';
  let out = '<header><h1>History</h1></header>', last = '';
  for (const it of items) {
    if (it.date !== last) {
      const [y, m, d] = it.date.split('-');
      out += `<div class="date">${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>`;
      last = it.date;
    }
    if (it.k === 'e') out += txRow(it);
    else { const a = J(it.from), b = J(it.to); out += `<div class="tx"><span class="ti">↔️</span><div><b>${a.icon} ${esc(a.name)} → ${b.icon} ${esc(b.name)}</b><small>Moved money</small></div><strong>${fmt(it.amount)}</strong></div>`; }
  }
  return out;
}
function settingsV() {
  const un = S.start - sum(S.jars.map(j => j.alloc));
  const t = k => `<button data-act="theme" data-t="${k}" class="${S.theme === k ? 'on' : ''}">${k === 'light' ? '☀️ Light' : '🌙 Dark'}</button>`;
  return `<header><h1>Settings</h1></header>
  <section class="card"><h2 style="margin-top:0">Money setup</h2>
  <label>Starting money (DA)<input id="s-start" type="number" inputmode="decimal" value="${S.start}"></label>
  <label>Budget start<input id="s-sd" type="date" value="${S.startDate}"></label>
  <label>Budget end<input id="s-ed" type="date" value="${S.endDate}"></label>
  <p class="muted">Not yet in a jar: ${fmt(un)}${un < 0 ? ' (jars hold more than your starting money)' : ''}</p>
  <button class="cta" data-act="savesetup">Save setup</button></section>
  <section class="card"><h2 style="margin-top:0">Manage jars</h2>
  ${S.jars.map(j => `<button class="tx" data-act="editjar" data-id="${j.id}"><span class="ti">${j.icon}</span><div><b>${esc(j.name)}</b><small>${j.type === 'spend' ? 'Spending' : 'Reserved'}</small></div><strong>${fmt(j.alloc)}</strong></button>`).join('')}
  <button class="ghost" data-act="newjar">＋ New jar</button></section>
  <section class="card"><h2 style="margin-top:0">Appearance</h2><div class="seg">${t('light')}${t('dark')}</div></section>`;
}

// ---------- Pop-ups ----------
const openModal = h => { $('#modal').innerHTML = `<div class="sheet">${h}</div>`; $('#modal').classList.add('open'); };
const closeModal = () => { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; };
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }
const done = m => { save(); closeModal(); render(); toast(m); };
const jarOpts = (sel, extra = {}) => S.jars.map(j => `<option value="${j.id}" ${j.id === sel ? 'selected' : ''}>${j.icon} ${esc(j.name)} (${fmt(bal(j) + (extra[j.id] || 0))})</option>`).join('');

function expenseModal(id, preJar) {
  if (!S.jars.length) return toast('Create a jar first.');
  const t = (id && S.tx.find(x => x.id === id)) || { amount: '', jar: preJar || S.jars[0].id, note: '', date: today() };
  openModal(`<h2 style="margin-top:0">${id ? 'Edit expense' : 'Add expense'}</h2>
  <label>Amount (DA)<input id="f-amt" type="number" inputmode="decimal" min="0" value="${t.amount}"></label>
  <label>Jar<select id="f-jar">${jarOpts(t.jar, id ? { [t.jar]: t.amount } : {})}</select></label>
  <label>Note (optional)<input id="f-note" value="${esc(t.note)}" maxlength="60"></label>
  <label>Date<input id="f-date" type="date" value="${t.date}"></label>
  <button class="cta" data-act="saveexp" data-id="${id || ''}">SAVE EXPENSE</button>
  ${id ? `<button class="danger" data-act="delexp" data-id="${id}">Delete expense</button>` : ''}`);
}
function saveExpense(id) {
  const amount = +$('#f-amt').value, jar = $('#f-jar').value, note = $('#f-note').value.trim(), date = $('#f-date').value || today();
  const old = id && S.tx.find(t => t.id === id);
  if (!(amount > 0)) return toast('Enter an amount above 0.');
  if (amount > bal(J(jar)) + (old && old.jar === jar ? old.amount : 0)) return toast('Not enough money in this jar.');
  if (old) Object.assign(old, { amount, jar, note, date }); else S.tx.push({ id: uid(), ts: Date.now(), amount, jar, note, date });
  done(old ? 'Expense updated ✓' : 'Expense saved ✓');
}
function moveModal(from) {
  if (S.jars.length < 2) return toast('You need at least two jars to move money.');
  from = from || S.jars[0].id;
  const to = (S.jars.find(j => j.id !== from)).id;
  openModal(`<h2 style="margin-top:0">Move money</h2>
  <label>From<select id="m-from">${jarOpts(from)}</select></label>
  <label>To<select id="m-to">${jarOpts(to)}</select></label>
  <label>Amount (DA)<input id="m-amt" type="number" inputmode="decimal" min="0"></label>
  <button class="cta" data-act="savemove">MOVE MONEY</button>`);
}
function saveMove() {
  const from = $('#m-from').value, to = $('#m-to').value, amount = +$('#m-amt').value;
  if (from === to) return toast('Choose two different jars.');
  if (!(amount > 0)) return toast('Enter an amount above 0.');
  if (amount > bal(J(from))) return toast('Not enough money in the source jar.');
  S.moves.push({ id: uid(), ts: Date.now(), from, to, amount, date: today() });
  done('Money moved ✓');
}
function jarModal(id) {
  const j = id ? J(id) : { name: '', icon: '🫙', alloc: 0, type: 'spend', color: COLORS[S.jars.length % COLORS.length] };
  openModal(`<h2 style="margin-top:0">${id ? 'Edit jar' : 'New jar'}</h2>
  <label>Name<input id="j-name" value="${esc(j.name)}" maxlength="20"></label>
  <label>Icon (type any emoji or pick one)<input id="j-icon" value="${j.icon}" maxlength="4"></label>
  <div class="picks">${ICONS.map(i => `<button data-act="pick" data-k="icon" data-v="${i}">${i}</button>`).join('')}</div>
  <label>Colour</label><input id="j-color" type="hidden" value="${j.color}">
  <div class="picks">${COLORS.map(c => `<button data-act="pick" data-k="color" data-v="${c}" class="${c === j.color ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>
  <label>Allocated amount (DA)<input id="j-alloc" type="number" inputmode="decimal" min="0" value="${j.alloc}"></label>
  <label>Type<select id="j-type"><option value="spend" ${j.type === 'spend' ? 'selected' : ''}>Spending jar</option><option value="reserve" ${j.type === 'reserve' ? 'selected' : ''}>Reserved jar (not in daily allowance)</option></select></label>
  <button class="cta" data-act="savejar" data-id="${id || ''}">Save jar</button>
  ${id ? `<button class="danger" data-act="deljar" data-id="${id}">Delete jar</button>` : ''}`);
}
function saveJar(id) {
  const name = $('#j-name').value.trim(), icon = $('#j-icon').value.trim() || '🫙', color = $('#j-color').value, alloc = +$('#j-alloc').value, type = $('#j-type').value;
  if (!name) return toast('Give the jar a name.');
  if (!(alloc >= 0)) return toast('Allocation cannot be negative.');
  if (id) {
    const j = J(id);
    if (alloc + moved(j) < spent(j)) return toast(`This jar already has ${fmt(spent(j))} spent, so it needs more.`);
    Object.assign(j, { name, icon, color, alloc, type });
  } else S.jars.push({ id: uid(), name, icon, color, alloc, type });
  done('Jar saved ✓');
}
function deleteJar(id) {
  if (S.tx.some(t => t.jar === id) || S.moves.some(m => m.from === id || m.to === id))
    return toast('This jar has history, so it cannot be deleted. Set its amount lower instead.');
  if (!confirm('Delete this jar?')) return;
  S.jars = S.jars.filter(j => j.id !== id);
  detail = null; done('Jar deleted');
}

// ---------- Clicks ----------
document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id;
  ({
    nav() { view = b.dataset.v; detail = null; render(); scrollTo(0, 0); },
    open() { detail = id; render(); scrollTo(0, 0); },
    back() { detail = null; render(); },
    addexp() { expenseModal(null, id); },
    edit() { expenseModal(id); },
    saveexp() { saveExpense(id); },
    delexp() { if (confirm('Delete this expense?')) { S.tx = S.tx.filter(t => t.id !== id); done('Expense deleted'); } },
    move() { moveModal(id); },
    savemove() { saveMove(); },
    newjar() { jarModal(); },
    editjar() { jarModal(id); },
    savejar() { saveJar(id); },
    deljar() { deleteJar(id); },
    pick() { $('#j-' + b.dataset.k).value = b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); },
    theme() { S.theme = b.dataset.t; save(); render(); },
    savesetup() {
      const st = +$('#s-start').value, sd = $('#s-sd').value, ed = $('#s-ed').value;
      if (!(st >= 0) || !sd || !ed) return toast('Please fill in every field.');
      if (ed < sd) return toast('The end date must be after the start date.');
      S.start = st; S.startDate = sd; S.endDate = ed; save(); render(); toast('Setup saved ✓');
    }
  })[b.dataset.act]?.();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
