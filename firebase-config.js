import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, set, get, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjkSwbM_9lOuI4LzRAOKLjpwzc9qqAR3Q",
  authDomain: "la-familia-fbf01.firebaseapp.com",
  databaseURL: "https://la-familia-fbf01-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "la-familia-fbf01",
  storageBucket: "la-familia-fbf01.firebasestorage.app",
  messagingSenderId: "821467766471",
  appId: "1:821467766471:web:90045ca0d18058daee28e2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Ranks
const RANKS = [
  { id: 12, label: '12er', name: 'Jefe Supremo' },
  { id: 11, label: '11er', name: 'El Patrón' },
  { id: 10, label: '10er', name: 'El Capo' },
  { id: 9,  label: '9er',  name: 'El Tenjo' },
  { id: 8,  label: '8er',  name: 'El Sicario' },
  { id: 7,  label: '7er',  name: 'El Operador' },
  { id: 6,  label: '6er',  name: 'El Capadore' },
  { id: 5,  label: '5er',  name: 'Luogotenente' },
  { id: 4,  label: '4er',  name: 'Caporegime' },
  { id: 3,  label: '3er',  name: 'Sgarrista' },
  { id: 2,  label: '2er',  name: 'La Sombra' },
  { id: 1,  label: '1er',  name: 'Soldato' }
];

const SUBROLES = [
  { key: 'schuetzenteam', label: 'Schützenteam', hasSubs: true, subs: [
    { key: 'caller', label: 'Caller' },
    { key: 'backstepper', label: 'Backstepper' },
    { key: 'schuetzenteamleitung', label: 'Schützenteamleitung' },
    { key: 'stellvertretendeleitung', label: 'Stellv. Leitung' },
    { key: 'schuetzenteam_ausbilder', label: 'ST Ausbilder' }
  ]},
  { key: 'routenverwaltung', label: 'Routenverwaltung', hasSubs: false, subs: [] },
  { key: 'sanktionsverwaltung', label: 'Sanktionsverwaltung', hasSubs: false, subs: [] },
  { key: 'fraktionsverwaltung', label: 'Fraktionsverwaltung', hasSubs: false, subs: [] }
];

// Session (localStorage = bleibt nach Browser-Neustart)
function getSession() { return JSON.parse(localStorage.getItem('lf_session') || 'null'); }
function setSession(u) { localStorage.setItem('lf_session', JSON.stringify(u)); }
function clearSession() { localStorage.removeItem('lf_session'); }

// Utils
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function parseDMTime(ds, ts) {
  var dp = ds.split('/'); if (dp.length !== 2) return null;
  var day = parseInt(dp[0]), month = parseInt(dp[1]);
  if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;
  var tp = ts.split(':'); if (tp.length !== 2) return null;
  var h = parseInt(tp[0]), min = parseInt(tp[1]);
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  var now = new Date(); var year = now.getFullYear();
  var dt = new Date(year, month - 1, day, h, min);
  if (dt < now) dt.setFullYear(year + 1);
  return dt;
}

function formatDT(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function getSubroleLabels(keys) {
  if (!keys) return [];
  var labels = [];
  keys.forEach(function(k) {
    for (var i = 0; i < SUBROLES.length; i++) {
      if (SUBROLES[i].key === k) { labels.push(SUBROLES[i].label); return; }
      for (var j = 0; j < SUBROLES[i].subs.length; j++) {
        if (SUBROLES[i].subs[j].key === k) { labels.push(SUBROLES[i].subs[j].label); return; }
      }
    }
  });
  return labels;
}

// Seed default data
async function initDB() {
  var snap = await get(ref(db, 'accounts'));
  if (!snap.exists()) {
    await set(ref(db, 'accounts'), {
      acc1: { username: 'admin', password: 'admin123' },
      acc2: { username: 'yuki', password: 'familia2024' }
    });
  }
  var mSnap = await get(ref(db, 'members'));
  if (!mSnap.exists()) {
    await set(ref(db, 'members'), {
      m1: { rank: 12, icName: 'Carlos Mendoza', discord: 'carlos#0001', discordId: '100000000000000001', absence: null, sanctions: null, notes: '', subroles: null, warns: 0 },
      m2: { rank: 11, icName: 'Diego Alvarez', discord: 'diego#0002', discordId: '100000000000000002', absence: null, sanctions: null, notes: '', subroles: null, warns: 0 },
      m3: { rank: 8,  icName: 'Mateo Solis', discord: 'mateo#0003', discordId: '100000000000000003', absence: null, sanctions: null, notes: '', subroles: ['schuetzenteam', 'caller'], warns: 1 },
      m4: { rank: 5,  icName: 'Luis Herrera', discord: 'luis#0004', discordId: '100000000000000004', absence: null, sanctions: { s1: { reason: 'Verwarnungsgespräch', until: '2026-04-01T20:00' } }, notes: 'Muss sich bessern', subroles: ['routenverwaltung'], warns: 2 },
      m5: { rank: 3,  icName: 'Sofia Reyes', discord: 'sofia#0005', discordId: '100000000000000005', absence: null, sanctions: null, notes: '', subroles: null, warns: 0 },
      m6: { rank: 1,  icName: 'Marco Perez', discord: 'marco#0006', discordId: '100000000000000006', absence: null, sanctions: null, notes: '', subroles: null, warns: 0 },
      m7: { rank: 1,  icName: 'Elena Torres', discord: 'elena#0007', discordId: '100000000000000007', absence: { until: '2026-03-15T18:00', reason: 'Urlaub' }, sanctions: null, notes: '', subroles: null, warns: 0 },
      m8: { rank: 2,  icName: 'Javier Cruz', discord: 'javier#0008', discordId: '100000000000000008', absence: null, sanctions: null, notes: '', subroles: ['sanktionsverwaltung'], warns: 3 }
    });
  }
}

export { db, ref, set, get, push, onValue, remove, update, RANKS, SUBROLES, getSession, setSession, clearSession, esc, parseDMTime, formatDT, getSubroleLabels, initDB };
