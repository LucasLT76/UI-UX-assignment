'use strict';
/* ===== Config (edit these) ===== */
const CONFIG = {
  feedbackUrl: 'https://docs.google.com/forms/d/e/1FAIpQLScqPn1ssvw2XCh1aDFlaCfff-U_u_tvP0PvcVh7dZYjrbSY8w/viewform',
  rate: 0.5,        // demo electricity rate per kWh
  currency: 'RM'
};
const STORE = 'smarthome-demo-v1';
const VIEWS = [
  ['dashboard', 'Home', '⌂'], ['rooms', 'Rooms', '▦'], ['devices', 'Devices', '⏻'],
  ['security', 'Security', '⛨'], ['energy', 'Energy', '⚡']
];
const ROOMS = { living: 'Living Room', bedroom: 'Bedroom', kitchen: 'Kitchen', bathroom: 'Bathroom' };
// type: light | ac | fan | switch. w = typical watts when fully on.
const DEFS = [
  { id: 'lv-light', room: 'living', name: 'Ceiling light', type: 'light', on: true, value: 80, w: 40 },
  { id: 'lv-ac', room: 'living', name: 'Air conditioner', type: 'ac', on: true, value: 24, w: 900 },
  { id: 'lv-fan', room: 'living', name: 'Ceiling fan', type: 'fan', on: false, value: 2, w: 60 },
  { id: 'lv-tv', room: 'living', name: 'Smart TV', type: 'switch', on: false, w: 110 },
  { id: 'bd-light', room: 'bedroom', name: 'Bedside lamp', type: 'light', on: false, value: 50, w: 10 },
  { id: 'bd-ac', room: 'bedroom', name: 'Air conditioner', type: 'ac', on: false, value: 25, w: 800 },
  { id: 'bd-fan', room: 'bedroom', name: 'Standing fan', type: 'fan', on: false, value: 1, w: 50 },
  { id: 'bd-air', room: 'bedroom', name: 'Air purifier', type: 'switch', on: true, w: 35 },
  { id: 'kt-light', room: 'kitchen', name: 'Kitchen light', type: 'light', on: true, value: 100, w: 30 },
  { id: 'kt-hood', room: 'kitchen', name: 'Extractor hood', type: 'fan', on: false, value: 2, w: 120 },
  { id: 'kt-coffee', room: 'kitchen', name: 'Coffee maker', type: 'switch', on: false, w: 900 },
  { id: 'kt-oven', room: 'kitchen', name: 'Smart oven', type: 'switch', on: false, w: 2000, offline: true },
  { id: 'bt-light', room: 'bathroom', name: 'Bathroom light', type: 'light', on: false, value: 70, w: 20 },
  { id: 'bt-heater', room: 'bathroom', name: 'Water heater', type: 'switch', on: false, w: 1500 },
  { id: 'bt-fan', room: 'bathroom', name: 'Exhaust fan', type: 'fan', on: false, value: 1, w: 25 }
];
const WEEK = [11.2, 9.8, 12.4, 10.6, 13.1, 14.7, 9.3]; // kWh, last entry = today
const LAST_WEEK = 79.5;

/* ===== Helpers ===== */
const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = t => t[0].toUpperCase() + t.slice(1);
const money = n => `${CONFIG.currency} ${n.toFixed(2)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ===== State (no passwords are ever stored) ===== */
function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* ignore */ }
  const S = Object.assign({
    session: null, room: 'living', door: 'locked', alarm: 'disarmed', online: {}, tries: {},
    alerts: [{ id: 1, level: 'info', msg: 'Front door locked', time: 'Earlier' }]
  }, saved);
  S.devices = {};
  DEFS.forEach(d => { S.devices[d.id] = Object.assign({ on: d.on, value: d.value }, (saved.devices || {})[d.id]); });
  if (!ROOMS[S.room]) S.room = 'living';
  return S;
}
const S = load();
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* storage blocked: keep working in memory */ } }

const online = d => !d.offline || S.online[d.id];
const watts = d => {
  const s = S.devices[d.id];
  if (!s.on || !online(d)) return 0;
  return d.type === 'light' ? d.w * s.value / 100 : d.type === 'fan' ? d.w * s.value / 3 : d.w;
};
const roomWatts = r => DEFS.filter(d => d.room === r).reduce((a, d) => a + watts(d), 0);
const totalWatts = () => Object.keys(ROOMS).reduce((a, r) => a + roomWatts(r), 0);
const countOn = list => list.filter(d => S.devices[d.id].on && online(d)).length;

/* ===== Feedback ===== */
const toastQ = []; let toastBusy = false;
function say(msg, type) {
  if (toastQ.length >= 2) toastQ.shift();      // never build up a backlog
  toastQ.push({ msg, type });
  if (!toastBusy) nextToast();
}
function nextToast() {
  const n = toastQ.shift(), box = $('#toasts');
  if (!n) { toastBusy = false; box.replaceChildren(); return; }
  toastBusy = true;
  const t = document.createElement('div');
  t.className = 'toast' + (n.type === 'err' ? ' err' : '');
  t.textContent = n.msg;
  box.replaceChildren(t);
  requestAnimationFrame(() => t.classList.add('in'));
  const ms = toastQ.length ? 1400 : n.type === 'err' ? 3600 : 2200;
  setTimeout(() => { t.classList.remove('in'); setTimeout(nextToast, 250); }, ms);
}
function addAlert(level, msg) {
  if (S.alerts[0] && S.alerts[0].msg === msg) return;   // no duplicate back-to-back alerts
  S.alerts.unshift({ id: Date.now() + Math.random(), level, msg, time: clock() });
  S.alerts = S.alerts.slice(0, 8);
}

/* ===== Views ===== */
const stat = (label, value, tone = '', sub = '') =>
  `<div class="card"><p class="muted">${label}</p><p class="big ${tone}">${value}</p>${sub ? `<p class="muted small">${sub}</p>` : ''}</div>`;
const quick = (act, title, hint) =>
  `<button class="card tile" data-act="${act}" data-key="q-${act}"><h3>${title}</h3><p class="muted">${hint}</p></button>`;

function vDashboard() {
  const off = DEFS.filter(d => d.offline && !S.online[d.id]).length;
  const today = WEEK[6];
  return `
  <p class="muted" style="margin-bottom:16px">Welcome back, ${esc(S.session.name)}. Everything below is simulated.</p>
  <div class="grid">
    ${stat('Devices on', `${countOn(DEFS)} of ${DEFS.length}`)}
    ${stat('Front door', cap(S.door), S.door === 'locked' ? 'ok' : 'warn')}
    ${stat('Alarm', cap(S.alarm), S.alarm === 'disarmed' ? 'warn' : 'ok')}
    ${stat('Offline devices', off, off ? 'bad' : 'ok')}
  </div>
  <h2 class="sec">Quick controls</h2>
  <div class="grid">
    ${quick('lightsoff', 'Turn all lights off', 'Switches off every light in the house')}
    ${quick('lockdoor', 'Lock front door', S.door === 'locked' ? 'Already locked' : 'Lock it now')}
    ${quick('eco', 'Eco cooling', 'Sets any running AC to 25°C')}
  </div>
  <h2 class="sec">Energy overview</h2>
  <div class="grid">
    ${stat('Current load', `${(totalWatts() / 1000).toFixed(2)} kW`, '', 'Power right now')}
    ${stat('Used today', `${today} kWh`, '', 'Energy so far')}
    ${stat('Est. cost today', money(today * CONFIG.rate))}
    <div class="card row"><p class="muted">Full breakdown and weekly trend</p><a class="btn" href="#energy">View energy</a></div>
  </div>`;
}

function vRooms() {
  return `<p class="muted" style="margin-bottom:16px">Choose a room to see and control its devices.</p>
  <div class="grid two">${Object.entries(ROOMS).map(([k, n]) => {
    const l = DEFS.filter(d => d.room === k);
    return `<button class="card tile" data-act="room" data-room="${k}" data-key="room-${k}">
      <h3>${n}</h3><p class="muted">${countOn(l)} of ${l.length} devices on</p>
      <p class="muted small">${Math.round(roomWatts(k))} W now</p></button>`;
  }).join('')}</div>`;
}

function devCard(d) {
  const s = S.devices[d.id], ok = online(d);
  const sw = ok && d.type !== 'fan'
    ? `<button class="sw" role="switch" aria-checked="${s.on}" aria-label="${d.name}" data-act="toggle" data-id="${d.id}" data-key="t-${d.id}"></button>` : '';
  let status = '', body = '';
  if (!ok) {
    status = 'Not responding';
    body = `<p class="muted">Can't reach this device. Check its power and Wi-Fi, then reconnect.</p>
      <button class="btn" data-act="retry" data-id="${d.id}" data-key="r-${d.id}">Reconnect</button>`;
  } else if (d.type === 'light') {
    status = s.on ? `${s.value}% brightness` : '';
    body = `<label class="row" for="b-${d.id}">Brightness <output id="o-${d.id}">${s.value}%</output></label>
      <input id="b-${d.id}" type="range" min="5" max="100" value="${s.value}" data-act="bright" data-id="${d.id}" ${s.on ? '' : 'disabled'}>`;
  } else if (d.type === 'ac') {
    status = s.on ? `Cooling to ${s.value}°C` : '';
    const dis = s.on ? '' : 'disabled';
    body = `<div class="temp">
      <button class="btn round" data-act="temp" data-id="${d.id}" data-d="-1" data-key="td-${d.id}" aria-label="Lower temperature" ${dis}>−</button>
      <output class="big" aria-live="polite">${s.value}°C</output>
      <button class="btn round" data-act="temp" data-id="${d.id}" data-d="1" data-key="tu-${d.id}" aria-label="Raise temperature" ${dis}>+</button></div>`;
  } else if (d.type === 'fan') {
    status = s.on ? `Speed ${s.value}` : '';
    body = `<div class="seg" role="group" aria-label="${d.name} speed">${[0, 1, 2, 3].map(n =>
      `<button data-act="fan" data-id="${d.id}" data-n="${n}" data-key="f-${d.id}-${n}" aria-pressed="${s.on ? s.value === n : n === 0}">${n || 'Off'}</button>`).join('')}</div>`;
  }
  const chip = !ok ? '<span class="badge bad">Offline</span>' : s.on ? '<span class="badge on">On</span>' : '<span class="badge">Off</span>';
  return `<article class="card dev${s.on && ok ? ' on' : ''}"><div class="row"><div><h3>${d.name}</h3>
    <p class="status">${chip} <span class="muted">${status}</span></p></div>${sw}</div>${body}</article>`;
}

function vDevices() {
  return `<div class="tabs" role="group" aria-label="Room">${Object.entries(ROOMS).map(([k, n]) =>
    `<button data-act="tab" data-room="${k}" data-key="tab-${k}" aria-pressed="${S.room === k}">${n}</button>`).join('')}</div>
  <h2 style="margin-bottom:12px">${ROOMS[S.room]}</h2>
  <div class="grid two">${DEFS.filter(d => d.room === S.room).map(devCard).join('')}</div>`;
}

function vSecurity() {
  const cam2 = S.online.cam2, locked = S.door === 'locked';
  const modes = { disarmed: 'Alarm is off. Motion only creates alerts.', home: 'Perimeter watch while you are home.', away: 'Full protection. Motion triggers the alarm.' };
  const tag = { info: 'Info', warn: 'Warning', high: 'Alarm' };
  return `<div class="grid">
    ${stat('Front door', locked ? 'Locked' : 'Unlocked', locked ? 'ok' : 'warn', 'Simulated lock')}
    ${stat('Alarm', cap(S.alarm), S.alarm === 'disarmed' ? 'warn' : 'ok', 'Current mode')}
    ${stat('Cameras online', `${cam2 ? 2 : 1} of 2`, cam2 ? 'ok' : 'warn', cam2 ? 'Both simulated' : 'Garage is offline')}
    ${stat('Alerts', S.alerts.length, S.alerts.some(a => a.level === 'high') ? 'bad' : '', 'Simulated events')}
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card stack"><div class="row"><h2>Front porch camera</h2><span class="badge ok">Online</span></div>
      <div class="cam" role="img" aria-label="Simulated camera preview, no real video"><span class="tl">CAM 1 · SIMULATED</span><span class="br" id="camtime">${new Date().toLocaleTimeString()}</span></div>
      <p class="muted small">Motion zone: clear</p>
      <button class="btn" data-act="motion" data-key="motion">Simulate motion event</button></div>
    <div class="card stack"><div class="row"><h2>Garage camera</h2><span class="badge ${cam2 ? 'ok' : 'bad'}">${cam2 ? 'Online' : 'Offline'}</span></div>
      <div class="cam ${cam2 ? '' : 'off'}" ${cam2 ? 'role="img" aria-label="Simulated camera preview"' : ''}>${cam2 ? '<span class="tl">CAM 2 · SIMULATED</span>' : 'Camera offline'}</div>
      ${cam2 ? '' : '<button class="btn" data-act="retry" data-id="cam2" data-key="r-cam2">Reconnect camera</button>'}</div>
    <div class="card stack"><div class="row"><h2>Front door</h2><span class="badge ${locked ? 'ok' : 'warn'}">${locked ? 'Locked' : 'Unlocked'}</span></div>
      <button class="btn ${locked ? '' : 'primary'}" data-act="door" data-key="door">${locked ? 'Unlock door' : 'Lock door'}</button>
      <p class="muted small">Simulated. Can't be unlocked while the alarm is on Away.</p></div>
    <div class="card stack"><div class="row"><h2>Alarm</h2><span class="badge ${S.alarm === 'disarmed' ? 'warn' : 'ok'}">${cap(S.alarm)}</span></div>
      <div class="seg" role="group" aria-label="Alarm mode">${['disarmed', 'home', 'away'].map(m =>
        `<button data-act="alarm" data-mode="${m}" data-key="a-${m}" aria-pressed="${S.alarm === m}">${cap(m)}</button>`).join('')}</div>
      <p class="muted small">${modes[S.alarm]} Away needs the door locked.</p></div>
  </div>
  <div class="card" style="margin-top:16px"><div class="row"><h2>Alerts (${S.alerts.length}) · simulated</h2>
    <button class="btn ghost" data-act="clear" data-key="clear" ${S.alerts.length ? '' : 'disabled'}>Clear all</button></div>
    ${S.alerts.length ? `<ul class="alerts">${S.alerts.map(a => `<li class="${a.level}"><span><span class="badge ${a.level}">${tag[a.level]}</span> ${esc(a.msg)} <span class="muted small">· ${esc(a.time)}</span></span>
      <button class="btn ghost" data-act="dismiss" data-id="${a.id}" aria-label="Dismiss alert: ${esc(a.msg)}">Dismiss</button></li>`).join('')}</ul>`
      : '<p class="muted" style="margin-top:12px">No alerts. Try simulating a motion event.</p>'}</div>`;
}

function chart() {
  const top = 16, bw = 52, x0 = 64, gap = (600 - 7 * bw) / 6;
  const days = WEEK.map((_, i) => i === 6 ? 'Today' : new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('en', { weekday: 'short' }));
  const label = WEEK.map((v, i) => `${days[i]} ${v} kWh`).join(', ');
  const grid = [0, 5, 10, 15].map(t => { const y = 240 - t / top * 220;
    return `<line x1="${x0 - 8}" x2="672" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/><text x="${x0 - 14}" y="${y + 4}" text-anchor="end">${t}</text>`; }).join('');
  return `<svg viewBox="0 0 700 280" role="img" aria-label="Energy used per day in kWh over 7 days: ${label}"><text x="${x0 - 14}" y="10" text-anchor="end">kWh</text>${grid}${WEEK.map((v, i) => {
    const x = x0 + i * (bw + gap), h = v / top * 220, y = 240 - h;
    return `<rect class="bar${i === 6 ? ' today' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="8"/>
      <text class="val" x="${x + bw / 2}" y="${y - 8}" text-anchor="middle">${v}</text>
      <text x="${x + bw / 2}" y="264" text-anchor="middle">${days[i]}</text>`;
  }).join('')}</svg>`;
}

function vEnergy() {
  const total = WEEK.reduce((a, b) => a + b, 0), diff = (total - LAST_WEEK) / LAST_WEEK * 100;
  const tw = totalWatts(), kw = (tw / 1000).toFixed(2);
  return `<p class="demo-note" style="margin-bottom:16px">Demo data. Not real meter readings.</p>
  <div class="grid">
    ${stat('Used today', `${WEEK[6]} kWh`, '', 'Energy so far today')}
    ${stat('Last 7 days', `${total.toFixed(1)} kWh`, '', 'Energy used')}
    ${stat('Est. cost, 7 days', money(total * CONFIG.rate), '', `${total.toFixed(1)} kWh × ${money(CONFIG.rate)}`)}
    ${stat('Vs previous 7 days', `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}%`, diff > 0 ? 'warn' : 'ok', `Previous: ${LAST_WEEK} kWh`)}
  </div>
  <div class="card" style="margin-top:16px"><h2>Energy used per day (kWh)</h2>${chart()}
    <p class="muted small">The highlighted bar is today and is still counting.</p></div>
  <div class="card" style="margin-top:16px"><div class="row"><h2>Power draw by room, right now</h2><span class="muted">Total ${kw} kW (${Math.round(tw)} W)</span></div>
    <ul class="bars">${Object.entries(ROOMS).map(([k, n]) => {
      const w = roomWatts(k), pct = tw ? Math.round(w / tw * 100) : 0;
      return `<li><div class="row"><span>${n}</span><span class="muted">${Math.round(w)} W · ${pct}%</span></div>
        <div class="bar-track" role="progressbar" aria-label="${n} share of current load" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="bar-fill" style="width:${pct}%"></div></div></li>`;
    }).join('')}</ul></div>
  <div class="card" style="margin-top:16px"><h2>How to read this page</h2>
    <p class="muted small" style="margin-top:8px"><strong>W and kW</strong> are power: what is being drawn right now. <strong>kWh</strong> is energy: power over time, which is what you are billed for.</p>
    <p class="muted small" style="margin-top:6px">Estimated cost = kWh used × ${money(CONFIG.rate)} per kWh (a demo rate, not a real tariff).</p></div>`;
}

const VIEW_FN = { dashboard: vDashboard, rooms: vRooms, devices: vDevices, security: vSecurity, energy: vEnergy };
const TITLES = { dashboard: 'Home', rooms: 'Rooms', devices: 'Device control', security: 'Security', energy: 'Energy usage' };

/* ===== Rendering & routing ===== */
const currentView = () => { const v = location.hash.slice(1); return VIEW_FN[v] ? v : 'dashboard'; };

function render() {
  const v = currentView(), el = $(`[data-view="${v}"]`);
  const key = document.activeElement && document.activeElement.dataset.key;
  el.innerHTML = VIEW_FN[v]();
  if (key) { const n = $(`[data-key="${key}"]`, el); if (n) n.focus(); }
}

let shown = null;
function show() {
  const loggedIn = !!S.session;
  $('#login').hidden = loggedIn;
  $('#app').hidden = !loggedIn;
  if (!loggedIn) { document.title = 'Haven – Sign in (Demo)'; shown = null; return; }
  const v = currentView();
  document.querySelectorAll('[data-view]').forEach(s => { s.hidden = s.dataset.view !== v; });
  $('#nav').innerHTML = VIEWS.map(([id, name, icon]) =>
    `<a href="#${id}" ${id === v ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${name}</a>`).join('');
  $('#viewTitle').textContent = TITLES[v];
  document.title = `${TITLES[v]} – Haven (Demo)`;
  render();
  if (shown !== v) { $('#viewTitle').focus(); window.scrollTo(0, 0); }
  shown = v;
}
function go(v) { if (location.hash === '#' + v) show(); else location.hash = v; }

/* ===== Actions ===== */
function retry(id, name) {
  S.tries[id] = (S.tries[id] || 0) + 1;
  if (S.tries[id] >= 2) { S.online[id] = true; say(`${name} is back online (simulated).`); }
  else say(`Couldn't reach ${name}. Check power and Wi-Fi, then try again.`, 'err');
}

function act(a, el) {
  const d = DEFS.find(x => x.id === el.dataset.id), s = d && S.devices[d.id];
  switch (a) {
    case 'toggle': s.on = !s.on; say(`${d.name} turned ${s.on ? 'on' : 'off'}.`); break;
    case 'temp': s.value = Math.min(30, Math.max(16, s.value + Number(el.dataset.d))); break;
    case 'fan': { const n = Number(el.dataset.n); s.on = n > 0; if (n) s.value = n; say(`${d.name} ${n ? 'set to speed ' + n : 'turned off'}.`); break; }
    case 'retry': retry(el.dataset.id, d ? d.name : 'Garage camera'); break;
    case 'room': S.room = el.dataset.room; save(); go('devices'); return;
    case 'tab': S.room = el.dataset.room; break;
    case 'lightsoff': DEFS.filter(x => x.type === 'light').forEach(x => { S.devices[x.id].on = false; }); say('All lights turned off.'); break;
    case 'lockdoor':
      if (S.door === 'locked') say('Front door is already locked.');
      else { S.door = 'locked'; addAlert('info', 'Front door locked'); say('Front door locked (simulated).'); } break;
    case 'eco': {
      const acs = DEFS.filter(x => x.type === 'ac' && S.devices[x.id].on);
      acs.forEach(x => { S.devices[x.id].value = 25; });
      acs.length ? say('Running AC set to 25°C.') : say('No air conditioner is on.', 'err'); break;
    }
    case 'door':
      if (S.door === 'locked') {
        if (S.alarm === 'away') { say('Disarm the alarm before unlocking the door.', 'err'); break; }
        S.door = 'unlocked'; addAlert('warn', 'Front door unlocked'); say('Front door unlocked (simulated).');
      } else { S.door = 'locked'; addAlert('info', 'Front door locked'); say('Front door locked (simulated).'); }
      break;
    case 'alarm': {
      const m = el.dataset.mode;
      if (m === 'away' && S.door !== 'locked') { say('Lock the front door before arming Away mode.', 'err'); break; }
      if (m === S.alarm) { say(`Alarm is already ${m}.`); break; }
      S.alarm = m; addAlert('info', `Alarm set to ${m}`); say(`Alarm set to ${m} (simulated).`); break;
    }
    case 'motion':
      if (S.alarm === 'away') { addAlert('high', 'Motion detected while armed: alarm triggered (simulated)'); say('Alarm triggered (simulated).', 'err'); }
      else { addAlert('info', 'Motion detected at the front porch (simulated)'); say('Motion event added to alerts.'); }
      break;
    case 'dismiss': S.alerts = S.alerts.filter(x => String(x.id) !== el.dataset.id); break;
    case 'clear': S.alerts = []; say('Alerts cleared.'); break;
  }
  save(); render();
}

$('#main').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && b.dataset.act !== 'bright') act(b.dataset.act, b);
});
$('#main').addEventListener('input', e => {
  if (e.target.dataset.act !== 'bright') return; // slider updates live without re-render so focus is kept
  const id = e.target.dataset.id, v = Number(e.target.value);
  S.devices[id].value = v;
  $('#o-' + id).textContent = v + '%';
  save();
});

/* ===== Login (front-end demo only) ===== */
function setErr(input, msg) {
  $('#' + input.id + 'Err').textContent = msg;
  input.setAttribute('aria-invalid', String(!!msg));
  return !msg;
}
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const em = $('#email'), pw = $('#password');
  const okE = setErr(em, !em.value.trim() ? 'Enter your email address.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim()) ? '' : 'Enter a valid email, like you@example.com.');
  const okP = setErr(pw, !pw.value ? 'Enter your password.' : pw.value.length < 6 ? 'Password must be at least 6 characters.' : '');
  if (!okE || !okP) { say('Fix the highlighted fields to continue.', 'err'); (okE ? pw : em).focus(); return; }
  S.session = { name: em.value.trim().split('@')[0] };
  pw.value = '';
  save(); go('dashboard'); say('Signed in (demo).');
});
$('#demoLogin').addEventListener('click', () => {
  S.session = { name: 'Demo user' }; save(); go('dashboard'); say('Signed in with demo account.');
});
$('#logoutBtn').addEventListener('click', () => {
  S.session = null; save(); history.replaceState(null, '', location.pathname); show(); $('#email').focus();
});
$('#feedbackBtn').addEventListener('click', () => {
  if (CONFIG.feedbackUrl.includes('YOUR_FORM_ID')) say('Feedback form not set yet. Add your Google Form link to CONFIG.feedbackUrl in script.js.', 'err');
  else window.open(CONFIG.feedbackUrl, '_blank', 'noopener');
});

/* ===== Boot ===== */
window.addEventListener('hashchange', show);
window.addEventListener('offline', () => say('You are offline. The demo keeps working without internet.', 'err'));
window.addEventListener('online', () => say('Back online.'));
setInterval(() => { const t = $('#camtime'); if (t) t.textContent = new Date().toLocaleTimeString(); }, 1000);
show();