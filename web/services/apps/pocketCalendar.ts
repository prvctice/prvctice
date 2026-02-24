/**
 * Pocket Calendar -- terminal-aesthetic monthly calendar with event management.
 * Grid-based day picker, event CRUD, persistent storage, keyboard navigation.
 * ES5-compatible JavaScript (runs inside sandboxed iframe).
 */

export const POCKET_CALENDAR_HTML =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .cal-head {
    text-align: center;
    padding: 4px 0;
    font-family: var(--p-font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--p-text-muted);
  }
  .cal-cell {
    text-align: center;
    padding: 5px 2px 3px;
    cursor: pointer;
    border-radius: var(--p-radius-sm);
    font-family: var(--p-font-mono);
    font-size: 12px;
    color: var(--p-text);
    transition: background 0.12s ease;
    position: relative;
    user-select: none;
    -webkit-user-select: none;
  }
  .cal-cell:hover { background: rgba(255,255,255,0.06); }
  .cal-cell.is-today {
    box-shadow: inset 0 0 0 1px var(--p-text-muted);
    color: var(--p-text);
  }
  .cal-cell.is-selected {
    background: var(--p-primary);
    color: var(--p-bg);
  }
  .cal-cell.is-selected:hover { background: var(--p-primary); }
  .cal-cell.is-outside {
    color: var(--p-text-muted);
    opacity: 0.3;
    pointer-events: none;
  }
  .cal-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: var(--p-text-muted);
    margin: 1px auto 0;
  }
  .cal-cell.is-selected .cal-dot { background: var(--p-bg); }
  .cal-wrap {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--p-radius-sm);
    padding: var(--p-2);
  }
  .agenda-card {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--p-radius-sm);
    padding: var(--p-2);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }
  .agenda-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .evt-row {
    display: flex;
    align-items: center;
    padding: 4px 0;
    gap: 6px;
  }
  .evt-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--p-text-muted);
    flex-shrink: 0;
  }
  .evt-name {
    flex: 1;
    font-family: var(--p-font-mono);
    font-size: 11px;
    color: var(--p-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .evt-del {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .evt-row:hover .evt-del { opacity: 1; }
  #addForm input.p-input { height: 28px; padding: 0 8px; font-size: 11px; }
  .today-btn {
    font-size: 9px !important;
    padding: 1px 6px !important;
    letter-spacing: 0.06em;
  }
</style>
</head>
<body class="p-stack pad-2 full gap-1">
  <div id="mainContent" class="p-stack full gap-1">
    <div class="p-terminal-header">
      <span class="p-label-tech">CALENDAR</span>
      <span id="todayLabel" class="p-feed-meta" style="color:var(--p-text-muted)"></span>
    </div>

    <div class="p-stat p-stat-left" style="padding:0">
      <div class="p-stat-value font-mono font-bold" id="heroDay" style="color:var(--p-text);font-size:40px;line-height:1">--</div>
      <div class="p-stat-label p-label-tech" id="heroSub">TODAY</div>
    </div>

    <div class="p-divider" style="margin:0"></div>

    <div class="cal-wrap" style="flex-shrink:0">
      <div class="p-split" style="align-items:center;margin-bottom:var(--p-2)" id="navRow">
        <button class="p-btn p-btn-ghost p-btn-sm" data-action="prev-month">\u2039</button>
        <div style="display:flex;align-items:center;gap:6px">
          <span id="monthLabel" class="text-xs font-mono font-bold" style="letter-spacing:0.06em"></span>
          <button id="todayBtn" class="p-btn p-btn-ghost p-btn-sm today-btn" data-action="go-today" style="display:none">TODAY</button>
        </div>
        <button class="p-btn p-btn-ghost p-btn-sm" data-action="next-month">\u203A</button>
      </div>
      <div id="calGrid" class="cal-grid"></div>
    </div>

    <div class="p-divider" style="margin:0"></div>

    <div class="agenda-card">
      <div class="p-split" style="align-items:center">
        <span id="agendaTitle" class="p-label-tech"></span>
        <button class="p-btn p-btn-ghost p-btn-sm" data-action="toggle-add">+ ADD</button>
      </div>
      <div id="addForm" class="p-row gap-1" style="display:none">
        <input class="p-input flex-1" id="eventInput" placeholder="Event name...">
        <button class="p-btn p-btn-primary p-btn-sm" data-action="save-event">Save</button>
      </div>
      <div class="agenda-scroll" id="agendaList"></div>
    </div>

    <div class="p-split p-feed-meta" style="flex-shrink:0">
      <span class="p-label-tech" style="font-size:10px;opacity:0.7">EVENTS</span>
      <span id="footerStats" class="p-feed-time">0 total</span>
    </div>
  </div>
  <div id="errorState" class="p-center full-height" style="display:none">
    <div class="p-empty"><div class="p-empty-message" id="errorMsg">NO SIGNAL</div></div>
  </div>
</body>
<` +
  `script>prvctice.onReady(function() {
  var now = new Date();
  var todayYear = now.getFullYear();
  var todayMonth = now.getMonth();
  var todayDay = now.getDate();
  var viewYear = todayYear;
  var viewMonth = todayMonth;
  var selectedDay = todayDay;
  var events = {};
  var addingEvent = false;
  var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['SU','MO','TU','WE','TH','FR','SA'];
  var DAY_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  // DOM refs
  var todayLabelEl = document.getElementById('todayLabel');
  var heroDayEl = document.getElementById('heroDay');
  var heroSubEl = document.getElementById('heroSub');
  var monthLabelEl = document.getElementById('monthLabel');
  var todayBtnEl = document.getElementById('todayBtn');
  var calGridEl = document.getElementById('calGrid');
  var agendaTitleEl = document.getElementById('agendaTitle');
  var addFormEl = document.getElementById('addForm');
  var eventInputEl = document.getElementById('eventInput');
  var agendaListEl = document.getElementById('agendaList');
  var footerEl = document.getElementById('footerStats');

  // Set header date
  todayLabelEl.textContent = DAY_NAMES[now.getDay()] + ' ' + MONTHS[todayMonth] + ' ' + todayDay;

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function getTodayKey() { return dateKey(todayYear, todayMonth + 1, todayDay); }
  function getSelectedKey() { return dateKey(viewYear, viewMonth + 1, selectedDay); }
  function isViewingToday() { return viewYear === todayYear && viewMonth === todayMonth; }

  function saveEvents() {
    prvctice.storage.set('pocket_cal_events', events).catch(function() {});
  }
  function loadEvents() {
    prvctice.storage.get('pocket_cal_events').then(function(data) {
      if (data && typeof data === 'object') events = data;
      renderAll();
    }).catch(function() { renderAll(); });
  }

  function countAllEvents() {
    var total = 0;
    var keys = Object.keys(events);
    for (var i = 0; i < keys.length; i++) {
      total += events[keys[i]].length;
    }
    return total;
  }

  function renderAll() {
    renderHero();
    renderCalendar();
    renderAgenda();
    renderFooter();
  }

  function renderHero() {
    var selKey = getSelectedKey();
    var todayKey = getTodayKey();
    var isToday = selKey === todayKey;
    heroDayEl.textContent = pad2(selectedDay);
    var selDate = new Date(viewYear, viewMonth, selectedDay);
    var dayName = DAY_NAMES[selDate.getDay()];
    heroSubEl.textContent = (isToday ? 'TODAY \\u00B7 ' : dayName + ' \\u00B7 ') + MONTHS_FULL[viewMonth].toUpperCase() + ' ' + viewYear;
  }

  function renderCalendar() {
    calGridEl.innerHTML = '';

    // Month label + today button
    monthLabelEl.textContent = MONTHS[viewMonth] + ' ' + viewYear;
    todayBtnEl.style.display = isViewingToday() ? 'none' : '';

    // Day headers
    for (var i = 0; i < 7; i++) {
      var hd = document.createElement('div');
      hd.className = 'cal-head';
      hd.textContent = DAYS[i];
      calGridEl.appendChild(hd);
    }

    var firstDay = new Date(viewYear, viewMonth, 1).getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    var todayKey = getTodayKey();
    var selKey = getSelectedKey();

    // Leading days from previous month
    for (var p = firstDay - 1; p >= 0; p--) {
      var pCell = document.createElement('div');
      pCell.className = 'cal-cell is-outside';
      pCell.textContent = prevMonthDays - p;
      calGridEl.appendChild(pCell);
    }

    // Current month days
    for (var d = 1; d <= daysInMonth; d++) {
      var cell = document.createElement('div');
      cell.className = 'cal-cell';
      var cellKey = dateKey(viewYear, viewMonth + 1, d);
      var isToday = cellKey === todayKey;
      var isSel = cellKey === selKey;
      if (isSel) cell.className += ' is-selected';
      else if (isToday) cell.className += ' is-today';

      var num = document.createElement('span');
      num.textContent = d;
      cell.appendChild(num);

      var hasEvts = events[cellKey] && events[cellKey].length > 0;
      if (hasEvts) {
        var dot = document.createElement('div');
        dot.className = 'cal-dot';
        cell.appendChild(dot);
      }
      cell.setAttribute('data-action', 'select-day');
      cell.setAttribute('data-day', d);
      calGridEl.appendChild(cell);
    }

    // Trailing days to fill last row
    var totalCells = firstDay + daysInMonth;
    var trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var t = 1; t <= trailing; t++) {
      var tCell = document.createElement('div');
      tCell.className = 'cal-cell is-outside';
      tCell.textContent = t;
      calGridEl.appendChild(tCell);
    }

    prvctice.ui.animateEntrance(calGridEl, { stagger: true });
  }

  function renderAgenda() {
    var selKey = getSelectedKey();
    var evts = events[selKey] || [];
    agendaTitleEl.textContent = MONTHS[viewMonth] + ' ' + pad2(selectedDay) + ' \\u00B7 ' + evts.length + (evts.length === 1 ? ' EVENT' : ' EVENTS');
    agendaListEl.innerHTML = '';

    if (evts.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'text-xs text-muted font-mono';
      empty.style.padding = '8px 0';
      empty.textContent = 'No events scheduled';
      agendaListEl.appendChild(empty);
      return;
    }
    for (var i = 0; i < evts.length; i++) {
      (function(idx, name) {
        var row = document.createElement('div');
        row.className = 'evt-row';
        var dot = document.createElement('span');
        dot.className = 'evt-dot';
        var label = document.createElement('span');
        label.className = 'evt-name';
        label.textContent = name;
        var del = document.createElement('button');
        del.className = 'p-btn p-btn-ghost p-btn-sm evt-del';
        del.style.fontSize = '10px';
        del.style.padding = '1px 4px';
        del.style.color = 'var(--p-text-muted)';
        del.textContent = '\\u00D7';
        del.setAttribute('data-action', 'delete-event');
        del.setAttribute('data-idx', idx);
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(del);
        agendaListEl.appendChild(row);
      })(i, evts[i]);
    }
    prvctice.ui.animateEntrance(agendaListEl, { stagger: true });
  }

  function renderFooter() {
    var total = countAllEvents();
    var selEvts = (events[getSelectedKey()] || []).length;
    footerEl.textContent = selEvts + ' TODAY \\u2022 ' + total + ' TOTAL';
  }

  function prevMonth() {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    selectedDay = 1;
    addingEvent = false;
    addFormEl.style.display = 'none';
    renderAll();
  }
  function nextMonth() {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    selectedDay = 1;
    addingEvent = false;
    addFormEl.style.display = 'none';
    renderAll();
  }
  function goToday() {
    viewYear = todayYear;
    viewMonth = todayMonth;
    selectedDay = todayDay;
    addingEvent = false;
    addFormEl.style.display = 'none';
    renderAll();
  }
  function selectDay(day) {
    selectedDay = parseInt(day, 10);
    addingEvent = false;
    addFormEl.style.display = 'none';
    renderAll();
  }
  function toggleAdd() {
    addingEvent = !addingEvent;
    addFormEl.style.display = addingEvent ? '' : 'none';
    if (addingEvent) {
      eventInputEl.value = '';
      eventInputEl.focus();
    }
  }
  function saveEvent() {
    var val = eventInputEl.value.trim();
    if (!val) return;
    var selKey = getSelectedKey();
    if (!events[selKey]) events[selKey] = [];
    events[selKey].push(val);
    saveEvents();
    addingEvent = false;
    addFormEl.style.display = 'none';
    renderAll();
    prvctice.ui.toast({ message: 'Event added', type: 'success', duration: 1500 });
  }
  function deleteEvent(idx) {
    var selKey = getSelectedKey();
    if (!events[selKey]) return;
    events[selKey].splice(idx, 1);
    if (events[selKey].length === 0) delete events[selKey];
    saveEvents();
    renderAll();
  }

  // Delegated click handler
  document.body.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'prev-month') prevMonth();
    else if (action === 'next-month') nextMonth();
    else if (action === 'go-today') goToday();
    else if (action === 'select-day') selectDay(btn.getAttribute('data-day'));
    else if (action === 'toggle-add') toggleAdd();
    else if (action === 'save-event') saveEvent();
    else if (action === 'delete-event') deleteEvent(parseInt(btn.getAttribute('data-idx'), 10));
  });

  // Keyboard: Enter to save, Escape to close form
  document.body.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.activeElement === eventInputEl) {
      saveEvent();
    } else if (e.key === 'Escape' && addingEvent) {
      addingEvent = false;
      addFormEl.style.display = 'none';
    }
  });

  // Init
  loadEvents();

  prvctice.onDispose(function() {
    // cleanup — no intervals to clear, just defensive
  });
});
<` +
  `/script>
</html>`;
