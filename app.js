import { db, ref, set, get, push, onValue, remove, update, RANKS, SUBROLES, getSession, setSession, clearSession, esc, parseDMTime, formatDT, getSubroleLabels, initDB } from './firebase-config.js';

var membersData = {};
var chatData = [];
var accountsData = {};
var session = getSession();
var currentDetailKey = null;
var activeFilter = null;

// ==================== LOGIN ====================
window.toggleLogin = function() { document.getElementById('loginPanel').classList.toggle('active'); };
window.doLogin = function() {
  var user = document.getElementById('loginUser').value.trim();
  var pass = document.getElementById('loginPass').value;
  var acc = null;
  var keys = Object.keys(accountsData);
  for (var i = 0; i < keys.length; i++) {
    if (accountsData[keys[i]].username === user && accountsData[keys[i]].password === pass) { acc = accountsData[keys[i]]; break; }
  }
  if (acc) { session = { username: acc.username }; setSession(session); document.getElementById('loginError').style.display = 'none'; updateLoginUI(); window.toggleLogin(); }
  else { document.getElementById('loginError').style.display = 'block'; }
};
window.doLogout = function() { session = null; clearSession(); updateLoginUI(); window.toggleLogin(); };

function updateLoginUI() {
  var li = !!session;
  document.getElementById('loginFormArea').style.display = li ? 'none' : 'block';
  document.getElementById('loggedInArea').style.display = li ? 'block' : 'none';
  document.getElementById('loginBtnText').textContent = li ? session.username : 'Login';
  document.getElementById('addUserBtn').style.display = li ? 'inline-flex' : 'none';
  document.getElementById('chatToggle').style.display = li ? 'inline-flex' : 'none';
  document.getElementById('payoutLink').style.display = li ? 'inline-flex' : 'none';
  if (li) document.getElementById('loggedInName').textContent = session.username;
  if (!li) document.getElementById('chatSidebar').classList.remove('open');
}

// ==================== CHAT ====================
window.toggleChat = function() { document.getElementById('chatSidebar').classList.toggle('open'); };
function renderChat() {
  var s = session; var c = document.getElementById('chatMessages');
  if (!chatData.length) { c.innerHTML = '<div class="empty-state"><p>Noch keine Nachrichten.</p></div>'; return; }
  c.innerHTML = chatData.map(function(m) {
    var cls = s && m.author === s.username ? 'self' : 'other';
    return '<div class="chat-msg ' + cls + '"><div class="msg-author">' + esc(m.author) + '</div><div>' + esc(m.text) + '</div><div class="msg-time">' + esc(m.time) + '</div></div>';
  }).join('');
  c.scrollTop = c.scrollHeight;
}
window.sendChat = async function() {
  if (!session) return;
  var input = document.getElementById('chatInput'); var text = input.value.trim(); if (!text) return;
  await push(ref(db, 'chat'), { author: session.username, text: text, time: new Date().toLocaleString('de-AT'), ts: Date.now() });
  input.value = '';
  var snap = await get(ref(db, 'chat'));
  if (snap.exists()) {
    var all = Object.entries(snap.val()).sort(function(a, b) { return a[1].ts - b[1].ts; });
    if (all.length > 20) {
      var updates = {};
      for (var i = 0; i < all.length - 20; i++) { updates[all[i][0]] = null; }
      await update(ref(db, 'chat'), updates);
    }
  }
};

// ==================== FILTER ====================
window.toggleFilterBar = function() { var b = document.getElementById('filterBar'); b.style.display = b.style.display === 'none' ? 'flex' : 'none'; };
function buildFilterBar() {
  var b = document.getElementById('filterBar');
  b.innerHTML = '<div class="filter-chip ' + (!activeFilter ? 'active' : '') + '" onclick="setFilter(null)">Alle</div>' + RANKS.map(function(r) {
    return '<div class="filter-chip ' + (activeFilter === r.id ? 'active' : '') + '" onclick="setFilter(' + r.id + ')">' + r.label + ' ' + r.name + '</div>';
  }).join('');
}
window.setFilter = function(id) { activeFilter = id; buildFilterBar(); renderMembers(); };

// ==================== RENDER MEMBERS ====================
function renderMembers() {
  var search = document.getElementById('searchInput').value.toLowerCase().trim();
  var area = document.getElementById('membersArea');
  var now = new Date();
  var entries = Object.entries(membersData).map(function(e) { var o = e[1]; o.key = e[0]; return o; });
  if (search) entries = entries.filter(function(m) { return (m.icName || '').toLowerCase().indexOf(search) >= 0 || (m.discord || '').toLowerCase().indexOf(search) >= 0 || (m.discordId || '').indexOf(search) >= 0; });
  if (activeFilter !== null) entries = entries.filter(function(m) { return m.rank === activeFilter; });
  var grouped = {};
  entries.forEach(function(m) { if (!grouped[m.rank]) grouped[m.rank] = []; grouped[m.rank].push(m); });
  var sortedRanks = Object.keys(grouped).map(Number).sort(function(a, b) { return b - a; });
  if (!sortedRanks.length) { area.innerHTML = '<div class="empty-state"><p>Keine Mitglieder gefunden.</p></div>'; return; }

  area.innerHTML = sortedRanks.map(function(rid) {
    var rank = RANKS.find(function(r) { return r.id === rid; });
    var rm = grouped[rid];
    var cardsHtml = rm.map(function(m) {
      var initials = (m.icName || '').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
      var isAbsent = m.absence && m.absence.until && new Date(m.absence.until) > now;
      var sArr = m.sanctions ? Object.values(m.sanctions) : [];
      var hasSanction = sArr.some(function(s) { return new Date(s.until) > now; });
      var warns = m.warns || 0;
      var timerHtml = isAbsent ? '<div class="card-absence-timer">⏰ bis ' + formatDT(new Date(m.absence.until)) + '</div>' : '';
      var subHtml = (m.subroles && m.subroles.length) ? getSubroleLabels(m.subroles).map(function(l) { return '<span class="card-tag tag-role">' + esc(l) + '</span>'; }).join('') : '';
      var statusTag = isAbsent ? '<span class="card-tag tag-inactive">Abgemeldet</span>' : '<span class="card-tag tag-active">Aktiv</span>';
      var sanctionTag = hasSanction ? '<span class="card-tag tag-sanktion">Sanktion</span>' : '';
      var warnClass = warns === 0 ? 'warn-0' : warns === 1 ? 'warn-1' : warns === 2 ? 'warn-2' : 'warn-3';
      var warnTag = '<span class="warn-badge ' + warnClass + '">⚠ ' + warns + '/3</span>';
      return '<div class="user-card" onclick="openDetail(\'' + m.key + '\')">' +
        '<div class="card-avatar">' + initials + '</div>' +
        '<div class="card-ic-name">' + esc(m.icName || '') + '</div>' +
        '<div class="card-discord">' + esc(m.discord || '') + '</div>' +
        '<div class="card-tags">' + statusTag + sanctionTag + subHtml + '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;margin-top:4px">' + warnTag + '</div>' +
        timerHtml + '</div>';
    }).join('');
    return '<div class="rank-section"><div class="rank-header"><div class="rank-badge">' + (rank ? rank.label : rid) + '</div><div class="rank-title">' + (rank ? rank.name : 'Rang ' + rid) + '</div><div class="rank-count">' + rm.length + '</div></div><div class="cards-row">' + cardsHtml + '</div></div>';
  }).join('');
}
window.renderMembers = renderMembers;

// ==================== ADD MEMBER ====================
window.openAddModal = function() {
  if (!session) return;
  document.getElementById('addRank').innerHTML = RANKS.map(function(r) { return '<option value="' + r.id + '">' + r.label + ' | ' + r.name + '</option>'; }).join('');
  document.getElementById('addIcName').value = ''; document.getElementById('addDiscord').value = ''; document.getElementById('addDiscordId').value = '';
  openModal('addModal');
};
window.addMember = async function() {
  var rank = parseInt(document.getElementById('addRank').value);
  var icName = document.getElementById('addIcName').value.trim();
  var discord = document.getElementById('addDiscord').value.trim();
  var discordId = document.getElementById('addDiscordId').value.trim();
  if (!icName) { alert('Bitte IC Name eingeben.'); return; }
  await push(ref(db, 'members'), { rank: rank, icName: icName, discord: discord, discordId: discordId, absence: null, sanctions: null, notes: '', subroles: null, warns: 0 });
  closeModal('addModal');
};

// ==================== DETAIL ====================
window.openDetail = function(key) {
  currentDetailKey = key;
  var m = membersData[key]; if (!m) return;
  var rank = RANKS.find(function(r) { return r.id === m.rank; });
  var initials = (m.icName || '').split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
  var isLoggedIn = !!session;
  var now = new Date();
  var isAbsent = m.absence && m.absence.until && new Date(m.absence.until) > now;
  var allSanctions = m.sanctions ? Object.entries(m.sanctions) : [];
  var sanctions = allSanctions.filter(function(e) { return new Date(e[1].until) > now; });
  var warns = m.warns || 0;
  var warnClass = warns === 0 ? 'warn-0' : warns === 1 ? 'warn-1' : warns === 2 ? 'warn-2' : 'warn-3';

  document.getElementById('detailTitle').textContent = m.icName || '';

  var statusHtml = isAbsent ? '<span style="color:#d45b5b">Abgemeldet bis ' + formatDT(new Date(m.absence.until)) + '</span>' + (m.absence.reason ? ' — ' + esc(m.absence.reason) : '') : '<span style="color:#5bbd6b">Aktiv</span>';
  var sanctionCountHtml = sanctions.length ? '<span style="color:#d4a84b">' + sanctions.length + ' offen</span>' : '<span style="color:#5bbd6b">Keine</span>';

  var html = '<div class="detail-header"><div class="detail-avatar">' + initials + '</div><div class="detail-info"><h2>' + esc(m.icName || '') + '</h2><p>' + (rank ? rank.label + ' | ' + rank.name : 'Rang ' + m.rank) + '</p></div></div>';
  html += '<div class="detail-grid">' +
    '<div class="detail-field"><div class="detail-field-label">Discord</div><div class="detail-field-value">' + esc(m.discord || '—') + '</div></div>' +
    '<div class="detail-field"><div class="detail-field-label">Discord ID</div><div class="detail-field-value" style="font-family:\'JetBrains Mono\',monospace;font-size:.8rem">' + esc(m.discordId || '—') + '</div></div>' +
    '<div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">' + statusHtml + '</div></div>' +
    '<div class="detail-field"><div class="detail-field-label">Sanktionen</div><div class="detail-field-value">' + sanctionCountHtml + '</div></div>' +
    '</div>';

  // Warns display
  html += '<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px"><span class="warn-badge ' + warnClass + '" style="font-size:.85rem;padding:4px 12px">⚠ Verwarnungen: ' + warns + '/3</span>';
  if (isLoggedIn) {
    html += '<button class="btn btn-sm btn-orange" onclick="addWarn()">+ Warn</button>';
    if (warns > 0) html += '<button class="btn btn-sm btn-green" onclick="removeWarn()">- Warn</button>';
  }
  html += '</div>';

  if (m.subroles && m.subroles.length) {
    var subLabelsHtml = getSubroleLabels(m.subroles).map(function(l) { return '<span class="card-tag tag-role" style="font-size:.75rem;padding:3px 10px">' + esc(l) + '</span>'; }).join('');
    html += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">' + subLabelsHtml + '</div>';
  }

  if (isLoggedIn) {
    html += '<div class="section-title">Abmeldung</div>';
    if (isAbsent) {
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span style="font-size:.85rem">⏰ Bis <strong>' + formatDT(new Date(m.absence.until)) + '</strong>' + (m.absence.reason ? ' — ' + esc(m.absence.reason) : '') + '</span><button class="btn btn-sm btn-green" onclick="clearAbsence()">Aktiv setzen</button></div>';
    } else {
      html += '<button class="btn btn-sm btn-blue" onclick="openAbsenceModal()">📅 Abmelden</button>';
    }
    html += '<div class="section-title">Sanktionen</div>';
    if (sanctions.length) {
      html += sanctions.map(function(arr) { var sk = arr[0], s = arr[1]; return '<div class="sanction-item"><div class="s-reason">' + esc(s.reason) + '</div><div class="s-meta">bis ' + formatDT(new Date(s.until)) + '</div><button class="s-remove" onclick="removeSanction(\'' + sk + '\')" title="Entfernen">✕</button></div>'; }).join('');
    } else {
      html += '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:8px">Keine aktiven Sanktionen.</p>';
    }
    html += '<button class="btn btn-sm" style="margin-top:6px;color:#d4a84b;border-color:rgba(180,120,30,.4)" onclick="openSanctionModal()">+ Sanktion hinzufügen</button>';
    html += '<div class="section-title">Subrollen</div><button class="btn btn-sm btn-blue" onclick="openSubroleModal()">Subrollen bearbeiten</button>';
    html += '<div class="section-title">Notizen</div><textarea class="form-textarea" id="detailNotes" placeholder="Notizen...">' + esc(m.notes || '') + '</textarea>';
  } else {
    if (sanctions.length) {
      html += '<div class="section-title">Sanktionen</div>' + sanctions.map(function(arr) { var s = arr[1]; return '<div class="sanction-item"><div class="s-reason">' + esc(s.reason) + '</div><div class="s-meta">bis ' + formatDT(new Date(s.until)) + '</div></div>'; }).join('');
    }
    if (m.notes) html += '<div class="section-title">Notizen</div><div class="detail-field"><div class="detail-field-value">' + esc(m.notes) + '</div></div>';
  }

  document.getElementById('detailBody').innerHTML = html;
  document.getElementById('detailFooter').innerHTML = isLoggedIn ? '<div class="modal-footer-left"><button class="btn btn-blue btn-sm" onclick="openRankModal()">✏️ Rang</button><button class="btn btn-red btn-sm" onclick="deleteMember()">🗑 Löschen</button></div><div class="modal-footer-right"><button class="btn btn-gold" onclick="saveDetail()">Speichern</button></div>' : '';
  document.getElementById('detailFooter').style.display = isLoggedIn ? 'flex' : 'none';
  openModal('detailModal');
};

window.saveDetail = async function() {
  if (!currentDetailKey || !session) return;
  var el = document.getElementById('detailNotes');
  await update(ref(db, 'members/' + currentDetailKey), { notes: el ? el.value : '' });
  closeModal('detailModal');
};
window.deleteMember = async function() {
  if (!currentDetailKey || !session) return;
  if (!confirm('Mitglied wirklich löschen?')) return;
  await remove(ref(db, 'members/' + currentDetailKey));
  closeModal('detailModal');
};

// ==================== WARNS ====================
window.addWarn = async function() {
  if (!currentDetailKey) return;
  var m = membersData[currentDetailKey]; var w = (m.warns || 0) + 1; if (w > 3) w = 3;
  await update(ref(db, 'members/' + currentDetailKey), { warns: w });
  window.openDetail(currentDetailKey);
};
window.removeWarn = async function() {
  if (!currentDetailKey) return;
  var m = membersData[currentDetailKey]; var w = (m.warns || 0) - 1; if (w < 0) w = 0;
  await update(ref(db, 'members/' + currentDetailKey), { warns: w });
  window.openDetail(currentDetailKey);
};

// ==================== RANK ====================
window.openRankModal = function() {
  if (!currentDetailKey) return;
  var m = membersData[currentDetailKey]; if (!m) return;
  document.getElementById('rankSelect').innerHTML = RANKS.map(function(r) { return '<option value="' + r.id + '" ' + (r.id === m.rank ? 'selected' : '') + '>' + r.label + ' | ' + r.name + '</option>'; }).join('');
  openModal('rankModal');
};
window.saveRankChange = async function() {
  if (!currentDetailKey) return;
  await update(ref(db, 'members/' + currentDetailKey), { rank: parseInt(document.getElementById('rankSelect').value) });
  closeModal('rankModal'); window.openDetail(currentDetailKey);
};

// ==================== ABSENCE ====================
window.openAbsenceModal = function() { openModal('absenceModal'); document.getElementById('absenceDate').value = ''; document.getElementById('absenceTime').value = ''; document.getElementById('absenceReason').value = ''; };
window.saveAbsence = async function() {
  if (!currentDetailKey) return;
  var dt = parseDMTime(document.getElementById('absenceDate').value.trim(), document.getElementById('absenceTime').value.trim());
  if (!dt) { alert('Bitte gültiges Datum (T/M) und Uhrzeit (HH:MM).'); return; }
  await update(ref(db, 'members/' + currentDetailKey), { absence: { until: dt.toISOString(), reason: document.getElementById('absenceReason').value.trim() } });
  closeModal('absenceModal'); window.openDetail(currentDetailKey);
};
window.clearAbsence = async function() {
  if (!currentDetailKey) return;
  await update(ref(db, 'members/' + currentDetailKey), { absence: null });
  window.openDetail(currentDetailKey);
};

// ==================== SANCTIONS ====================
window.openSanctionModal = function() { openModal('sanctionModal'); document.getElementById('sanctionReason').value = ''; document.getElementById('sanctionDate').value = ''; document.getElementById('sanctionTime').value = ''; };
window.saveSanction = async function() {
  if (!currentDetailKey) return;
  var reason = document.getElementById('sanctionReason').value.trim();
  if (!reason) { alert('Bitte Grund eingeben.'); return; }
  var dt = parseDMTime(document.getElementById('sanctionDate').value.trim(), document.getElementById('sanctionTime').value.trim());
  if (!dt) { alert('Bitte gültiges Datum (T/M) und Uhrzeit (HH:MM).'); return; }
  await push(ref(db, 'members/' + currentDetailKey + '/sanctions'), { reason: reason, until: dt.toISOString() });
  closeModal('sanctionModal'); window.openDetail(currentDetailKey);
};
window.removeSanction = async function(sk) {
  if (!currentDetailKey) return;
  await remove(ref(db, 'members/' + currentDetailKey + '/sanctions/' + sk));
  window.openDetail(currentDetailKey);
};

// ==================== SUBROLES ====================
window.openSubroleModal = function() {
  if (!currentDetailKey) return;
  var m = membersData[currentDetailKey]; if (!m) return;
  var cur = m.subroles || [];
  var html = '';
  SUBROLES.forEach(function(sr) {
    var checked = cur.indexOf(sr.key) >= 0;
    html += '<div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.9rem;color:var(--text-primary)"><input type="checkbox" class="subrole-main" data-key="' + sr.key + '" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-gold)" onchange="toggleSubMain(this,\'' + sr.key + '\')">' + sr.label + '</label>';
    if (sr.hasSubs) {
      html += '<div class="sub-subs" id="subs_' + sr.key + '" style="margin-left:28px;margin-top:6px;' + (checked ? '' : 'display:none') + '">';
      sr.subs.forEach(function(sub) {
        html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.82rem;color:var(--text-secondary);margin-bottom:4px"><input type="checkbox" class="subrole-sub" data-key="' + sub.key + '" ' + (cur.indexOf(sub.key) >= 0 ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--accent-gold)">' + sub.label + '</label>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  document.getElementById('subroleBody').innerHTML = html;
  openModal('subroleModal');
};
window.toggleSubMain = function(el, key) { var d = document.getElementById('subs_' + key); if (d) d.style.display = el.checked ? 'block' : 'none'; };
window.saveSubroles = async function() {
  if (!currentDetailKey) return;
  var roles = [];
  document.querySelectorAll('.subrole-main:checked').forEach(function(el) { roles.push(el.dataset.key); });
  document.querySelectorAll('.subrole-sub:checked').forEach(function(el) {
    var parent = SUBROLES.find(function(sr) { return sr.subs.some(function(s) { return s.key === el.dataset.key; }); });
    if (parent && roles.indexOf(parent.key) >= 0) roles.push(el.dataset.key);
  });
  await update(ref(db, 'members/' + currentDetailKey), { subroles: roles.length ? roles : null });
  closeModal('subroleModal'); window.openDetail(currentDetailKey);
};

// ==================== MODALS ====================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); if (id === 'detailModal') currentDetailKey = null; }
window.openModal = openModal;
window.closeModal = closeModal;

document.querySelectorAll('.modal-overlay').forEach(function(o) {
  o.addEventListener('click', function(e) { if (e.target === o) { o.classList.remove('active'); if (o.id === 'detailModal') currentDetailKey = null; } });
});
document.addEventListener('click', function(e) {
  var lp = document.getElementById('loginPanel'), lb = document.getElementById('loginBtn');
  if (lp.classList.contains('active') && !lp.contains(e.target) && !lb.contains(e.target)) lp.classList.remove('active');
});

// ==================== AUTO-EXPIRE ====================
async function checkExpiry() {
  var now = new Date(); var updates = {}; var changed = false;
  Object.entries(membersData).forEach(function(e) {
    var key = e[0], m = e[1];
    if (m.absence && m.absence.until && new Date(m.absence.until) <= now) { updates['members/' + key + '/absence'] = null; changed = true; }
    if (m.sanctions) {
      Object.entries(m.sanctions).forEach(function(se) {
        if (new Date(se[1].until) <= now) { updates['members/' + key + '/sanctions/' + se[0]] = null; changed = true; }
      });
    }
  });
  if (changed) await update(ref(db), updates);
}

// ==================== BOOT ====================
async function boot() {
  try {
    await initDB();
    // Listeners
    onValue(ref(db, 'members'), function(snap) { membersData = snap.val() || {}; renderMembers(); });
    onValue(ref(db, 'chat'), function(snap) {
      var raw = snap.val() || {};
      chatData = Object.entries(raw).map(function(e) { var o = e[1]; o.key = e[0]; return o; }).sort(function(a, b) { return a.ts - b.ts; });
      renderChat();
    });
    onValue(ref(db, 'accounts'), function(snap) { accountsData = snap.val() || {}; });
    updateLoginUI();
    buildFilterBar();
    setInterval(checkExpiry, 30000);
    setTimeout(function() { checkExpiry(); }, 2000);
    setTimeout(function() { document.getElementById('loadingScreen').classList.add('hide'); }, 800);
  } catch (err) {
    console.error('Firebase error:', err);
    document.getElementById('loadingScreen').innerHTML = '<p style="color:#d45b5b">Verbindungsfehler. Bitte Seite neu laden.</p>';
  }
}

boot();
