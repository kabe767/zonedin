// ── CONSTANTS ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── STATE ──
let today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = formatDate(today);
let viewDate = new Date(today);
let events = JSON.parse(localStorage.getItem('ff_events') || '{}');
let blockerActive = false;
let selectedApps = new Set();
let currentStatus = 'available';
let blockEndTime = null;
let blockCountdown = null;

const statusConfig = {
  available: { label: 'Available', dot: 'available', color: '#7eb893', preview: "Available" },
  focusing:  { label: 'Focusing',  dot: 'focusing',  color: '#e88b5a', preview: "Focusing — DO NOT DISTURB" },
};

// ── UTILITIES ──
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function saveEvents() {
  localStorage.setItem('ff_events', JSON.stringify(events));
}

// ── TOP BAR ──
function updateTopbarDate() {
  const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  document.getElementById('topbar-date').textContent = today.toLocaleDateString('en-CA', opts);
}

// ── CALENDAR ──
function renderCalendar() {
  const mi = viewMonth, yi = viewYear;
  document.getElementById('cal-month-label').textContent = `${MONTHS[mi]} ${yi}`;
  document.getElementById('form-date-label').textContent = formatNiceDate(selectedDate);

  // Render day-of-week headers once
  const dowRow = document.getElementById('cal-dow-row');
  if (!dowRow.children.length) {
    DAYS.forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-dow';
      el.textContent = d;
      dowRow.appendChild(el);
    });
  }

  const grid = document.getElementById('cal-days');
  grid.innerHTML = '';

  const firstDayOfWeek = new Date(yi, mi, 1).getDay();
  const daysInMonth = new Date(yi, mi + 1, 0).getDate();
  const prevMonthDays = new Date(yi, mi, 0).getDate();
  const todayStr = formatDate(today);

  // Previous month overflow cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month empty';
    d.textContent = prevMonthDays - firstDayOfWeek + 1 + i;
    grid.appendChild(d);
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = document.createElement('div');
    const dateStr = `${yi}-${String(mi+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    d.className = 'cal-day';
    if (dateStr === todayStr) d.classList.add('today');
    if (dateStr === selectedDate) d.classList.add('selected');
    if (events[dateStr] && events[dateStr].length) d.classList.add('has-event');
    d.textContent = i;
    d.dataset.date = dateStr;
    d.onclick = () => selectDate(dateStr);
    grid.appendChild(d);
  }
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  renderCalendar();
}

function selectDate(dateStr) {
  selectedDate = dateStr;
  viewDate = parseDate(dateStr);
  renderCalendar();
  renderTodo();
}

// ── TO-DO / SCHEDULE ──
function formatNiceDate(dateStr) {
  const d = parseDate(dateStr);
  const todayStr = formatDate(today);
  if (dateStr === todayStr) return 'Today';
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === formatDate(tomorrow)) return 'Tomorrow';
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === formatDate(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}

function renderTodo() {
  const dateStr = formatDate(viewDate);
  const dayEvents = events[dateStr] || [];
  const nice = formatNiceDate(dateStr);
  const d = parseDate(dateStr);

  document.getElementById('todo-header-title').textContent = nice === 'Today' ? "Today's Schedule" : "Schedule";
  document.getElementById('todo-date-label').textContent = nice;
  document.getElementById('todo-date-sub').textContent = d.toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  // Progress chips
  const done = dayEvents.filter(e => e.done).length;
  const total = dayEvents.length;
  const strip = document.getElementById('progress-strip');

  if (total > 0) {
    strip.innerHTML = `
      <div class="progress-chip">
        <div class="progress-chip-val">${total}</div>
        <div class="progress-chip-label">Total</div>
      </div>
      <div class="progress-chip">
        <div class="progress-chip-val">${done}</div>
        <div class="progress-chip-label">Done</div>
      </div>
      <div class="progress-chip">
        <div class="progress-chip-val">${total - done}</div>
        <div class="progress-chip-label">Remaining</div>
      </div>
    `;
    strip.style.display = 'flex';
  } else {
    strip.style.display = 'none';
  }

  // Event list
  const list = document.getElementById('event-list');

  if (!dayEvents.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
        <p>No events for this day :)<br>Add one using the calendar.</p>
      </div>
    `;
    return;
  }

  const sorted = [...dayEvents].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  list.innerHTML = sorted.map(ev => `
    <div class="event-item type-${ev.type} ${ev.done ? 'done' : ''}" id="ev-${ev.id}">
      <div class="event-check ${ev.done ? 'checked' : ''}" onclick="toggleDone('${dateStr}','${ev.id}')">✓</div>
      <div class="event-content">
        <div class="event-title">${ev.title}</div>
        <div class="event-meta">
         <span class="event-tag tag-${ev.type}">${ev.type}</span>
         <span class="event-tag tag-${ev.block}">${ev.block}</span>
         ${ev.time ? `<span>${ev.time}</span>` : ''}
        </div>
      </div>
      <button class="event-delete" onclick="deleteEvent('${dateStr}','${ev.id}')" title="Delete">✕</button>
    </div>
  `).join('');
}

function shiftViewDate(delta) {
  viewDate.setDate(viewDate.getDate() + delta);
  selectedDate = formatDate(viewDate);
  if (viewDate.getMonth() !== viewMonth || viewDate.getFullYear() !== viewYear) {
    viewMonth = viewDate.getMonth();
    viewYear = viewDate.getFullYear();
  }
  renderCalendar();
  renderTodo();
}

function goToToday() {
  viewDate = new Date(today);
  selectedDate = formatDate(today);
  viewMonth = today.getMonth();
  viewYear = today.getFullYear();
  renderCalendar();
  renderTodo();
}

function addEvent() {
  const title = document.getElementById('event-title-input').value.trim();
  if (!title) {
    document.getElementById('event-title-input').focus();
    return;
  }

  const type = document.getElementById('event-type-input').value;
  const time = document.getElementById('event-time-input').value;
  const block = document.getElementById('event-block-input').value;
  const dateStr = selectedDate;

  if (!events[dateStr]) events[dateStr] = [];
  events[dateStr].push({ id: Date.now().toString(), title, type, time, block, done: false });

  saveEvents();
  document.getElementById('event-title-input').value = '';
  document.getElementById('event-time-input').value = '';
  document.getElementById('event-block-input').value = '';
  renderCalendar();
  if (formatDate(viewDate) === dateStr) renderTodo();
}

function toggleDone(dateStr, id) {
  const ev = events[dateStr]?.find(e => e.id === id);
  if (ev) {
    ev.done = !ev.done;
    saveEvents();
    renderTodo();
  }
}

function deleteEvent(dateStr, id) {
  if (!events[dateStr]) return;
  events[dateStr] = events[dateStr].filter(e => e.id !== id);
  saveEvents();
  renderCalendar();
  renderTodo();
}

// ── APP BLOCKER ──

let appList = JSON.parse(localStorage.getItem('ff_apps') || 'null') || DEFAULT_APPS;

function saveApps() {
  localStorage.setItem('ff_apps', JSON.stringify(appList));
}

function renderAppList() {
  const container = document.getElementById('app-list-container');
  container.innerHTML = appList.map(app => `
    <div class="app-item ${selectedApps.has(app.id) ? 'selected' : ''}"
         id="appitem-${app.id}"
         onclick="toggleApp('${app.id}')">
      <div class="app-name">${app.name}</div>
      <div class="app-check">✓</div>
      <button class="app-delete" onclick="removeApp(event,'${app.id}')" title="Remove">✕</button>
    </div>
  `).join('');
}

function toggleApp(id) {
  if (selectedApps.has(id)) selectedApps.delete(id);
  else selectedApps.add(id);
  renderAppList();
  updateBlockerSub();
}

function removeApp(event, id) {
  event.stopPropagation(); // don't trigger toggleApp
  appList = appList.filter(a => a.id !== id);
  selectedApps.delete(id);
  saveApps();
  renderAppList();
  updateBlockerSub();
}

function addCustomApp() {
  const nameInput = document.getElementById('new-app-name');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const id = 'custom-' + Date.now();

  appList.push({ id, name });
  saveApps();
  renderAppList();

  // Reset form
  nameInput.value = '';
}

function updateBlockerSub() {
  const n = selectedApps.size;
  document.getElementById('blocker-sub-text').textContent =
    n === 0 ? '0 apps selected' : `${n} app${n > 1 ? 's' : ''} selected`;
}

function toggleBlocker() {
  if (!blockerActive) {
    if (selectedApps.size === 0) {
      alert('Select at least one app category to block.');
      return;
    }
    blockerActive = true;
    const mins = parseInt(document.getElementById('block-duration').value) || 60;
    blockEndTime = Date.now() + mins * 60 * 1000;
    startCountdown();
  } else {
    blockerActive = false;
    if (blockCountdown) clearInterval(blockCountdown);
  }
  updateBlockerUI();
}

function startCountdown() {
  if (blockCountdown) clearInterval(blockCountdown);
  blockCountdown = setInterval(() => {
    if (!blockerActive || Date.now() >= blockEndTime) {
      blockerActive = false;
      clearInterval(blockCountdown);
      updateBlockerUI();
      return;
    }
    const rem = Math.max(0, blockEndTime - Date.now());
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    document.getElementById('shield-sub').textContent = `${m}m ${String(s).padStart(2, '0')}s remaining`;
  }, 1000);
}

function updateBlockerUI() {
  const sw     = document.getElementById('blocker-switch');
  const toggle = document.getElementById('blocker-toggle');
  const shield = document.getElementById('shield-display');
  const status = document.getElementById('shield-status');
  const sub    = document.getElementById('shield-sub');
  const label  = document.getElementById('blocker-label');

  if (blockerActive) {
    sw.classList.add('on');
    toggle.classList.add('active');
    shield.classList.add('blocking');
    status.textContent = `Blocking ${selectedApps.size} categor${selectedApps.size > 1 ? 'ies' : 'y'}`;
    label.textContent = 'Blocking Active';
  } else {
    sw.classList.remove('on');
    toggle.classList.remove('active');
    shield.classList.remove('blocking');
    status.textContent = 'Protection off';
    sub.textContent = 'Select apps and enable blocking';
    label.textContent = 'Enable Blocking';
  }
}

// ── STATUS ──
function setStatus(s) {
  currentStatus = s;
  document.querySelectorAll('.status-option').forEach(el => el.classList.remove('active'));
  document.querySelector(`.status-option.${s}`).classList.add('active');
  updateStatusPreview();
  updateTopbarStatus();
}

function updateStatusPreview() {
  const cfg = statusConfig[currentStatus];
  const msg = document.getElementById('status-message').value.trim();
  document.getElementById('mock-dot').style.background = cfg.color;
  document.getElementById('mock-status-text').textContent = msg || cfg.preview;
  document.getElementById('topbar-dot').className = `status-dot ${currentStatus}`;
  document.getElementById('topbar-status-text').textContent = cfg.label;
}

function updateTopbarStatus() {
  const cfg = statusConfig[currentStatus];
  document.getElementById('topbar-dot').className = `status-dot ${currentStatus}`;
  document.getElementById('topbar-status-text').textContent = cfg.label;
}

const statusCycle = ['available', 'focusing', 'dnd', 'away'];
function cycleStatus() {
  const idx = statusCycle.indexOf(currentStatus);
  setStatus(statusCycle[(idx + 1) % statusCycle.length]);
}

// ── SEED SAMPLE DATA ──
function seedSampleData() {
  if (Object.keys(events).length > 0) return;

  const td = formatDate(today);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const tom = formatDate(tomorrow);
  const next2 = new Date(today); next2.setDate(next2.getDate() + 2);
  const n2 = formatDate(next2);

  saveEvents();
}

// ── INIT ──
seedSampleData();
updateTopbarDate();
renderCalendar();
renderTodo();
renderAppList();
updateBlockerUI();
updateStatusPreview();