// Objectiu: 23 de Maig de 2027 a les 20:00:00 hora de Madrid (CEST = UTC+2)
// Això equival a les 18:00:00 UTC.
const TARGET_DATE = new Date(Date.UTC(2027, 4, 23, 18, 0, 0));

// Colors oficials dels partits polítics de Sitges per als gràfics
const PARTY_COLORS = {
  'Junts': '#00C3B2',
  'ERC': '#FFB200',
  'PSC': '#E30613',
  'SitgesGI': '#0f85ea',
  'Verds Comuns Sitges': '#10b981',
  'Guanyem': '#a855f7',
  'Vox': '#84cc16',
  'Fets per Sitges': '#ec4899',
  'PP': '#0284c7',
  'Solucions': '#f97316',
  'Aliança Catalana': '#4338ca'
};

// Ordre ideològic/espectre electoral tradicional a Catalunya de l'hemicicle (esquerra a dreta)
const PARTY_ORDER = [
  'Guanyem',
  'Verds Comuns Sitges',
  'ERC',
  'PSC',
  'SitgesGI',
  'Fets per Sitges',
  'Junts',
  'Solucions',
  'PP',
  'Vox',
  'Aliança Catalana'
];

// Funció per generar el nom de fitxer del logotip a partir del nom del partit
function getPartyLogoUrl(partyName) {
  const cleanName = partyName.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // treu accents i diacrítics
    .replace(/\s+/g, '-') // espais a guions
    .replace(/[^a-z0-9-]/g, ''); // elimina caràcters especials
  return `assets/${cleanName}.png`;
}

// Funció per provar diferents extensions si una imatge no es troba (PNG, SVG, JPG, JPEG, WebP)
function handleLogoError(imgElement) {
  const src = imgElement.src;
  
  if (src.endsWith('.png')) {
    imgElement.src = src.substring(0, src.length - 4) + '.svg';
  } else if (src.endsWith('.svg')) {
    imgElement.src = src.substring(0, src.length - 4) + '.jpg';
  } else if (src.endsWith('.jpg')) {
    imgElement.src = src.substring(0, src.length - 4) + '.jpeg';
  } else if (src.endsWith('.jpeg')) {
    imgElement.src = src.substring(0, src.length - 5) + '.webp';
  } else {
    // Si falla tot, ocultem la imatge i mostrem el cercle de color corporatiu
    imgElement.style.display = 'none';
    const fallback = imgElement.nextElementSibling;
    if (fallback) {
      fallback.style.display = 'inline-block';
    }
  }
}

// Base de l'API per a crides externes si s'executa a GitHub Pages
const API_BASE = window.location.hostname.includes('github.io')
  ? 'https://elecions-sitges-2027.onrender.com'
  : '';

// Estat de l'aplicació
let appState = {
  selectedParty: null,
  hasVoted: false,
  votes: [],
  totalVotes: 0,
  composicioActual: [],
  composicioSimulada: [],
  isTestThemeActive: false
};

// Cache d'elements del DOM
const dom = {
  days: document.getElementById('days'),
  hours: document.getElementById('hours'),
  minutes: document.getElementById('minutes'),
  seconds: document.getElementById('seconds'),
  countdownTimer: document.getElementById('countdown-timer'),
  countdownClosedMsg: document.getElementById('countdown-closed-message'),
  partiesContainer: document.getElementById('parties-container'),
  submitVoteBtn: document.getElementById('submit-vote-btn'),
  votingStatusMsg: document.getElementById('voting-status-message'),
  resultsTableBody: document.getElementById('results-table-body'),
  svgActual: document.getElementById('svg-actual'),
  svgSimulated: document.getElementById('svg-simulated'),
  svgActualLarge: document.getElementById('svg-actual-large'),
  svgSimulatedLarge: document.getElementById('svg-simulated-large'),
  tooltip: document.getElementById('tooltip'),
  subtitle: document.getElementById('subtitle')
};

// Inicialització
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // Comprovar si ja ha votat localment a LocalStorage
  if (localStorage.getItem('sitges_vot_realitzat') === 'true') {
    appState.hasVoted = true;
  }

  // Escoltador per al botó de votació
  dom.submitVoteBtn.addEventListener('click', submitVote);

  // Escoltadors per a pestanyes de resultats
  initTabs();

  // Mode de prova d'inversió fent doble clic sobre el subtítol
  dom.subtitle.addEventListener('dblclick', toggleTestTheme);

  // Carregar dades del servidor
  await fetchStatus();

  // Iniciar temporitzadors
  setInterval(updateCountdownAndTheme, 1000);
  updateCountdownAndTheme(); // Primera execució
}

// Pestanyes de la secció de gràfics
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.remove('hidden');

      // Redibuixar hemicles per assegurar que l'escala és correcta en pestanyes anteriorment ocultes
      renderAllHemicycles();
    });
  });
}

// Càlcul del compte enrere i inversió automàtica de color per data
function updateCountdownAndTheme() {
  const now = new Date();
  const diff = TARGET_DATE - now;

  // Gestió de la inversió de colors (producció o mode de proves)
  if (diff <= 0 || appState.isTestThemeActive) {
    if (!document.body.classList.contains('inverted')) {
      document.body.classList.add('inverted');
    }
  } else {
    if (document.body.classList.contains('inverted')) {
      document.body.classList.remove('inverted');
    }
  }

  // Actualització dels dígits del compte enrere
  if (diff <= 0) {
    dom.countdownTimer.classList.add('hidden');
    dom.countdownClosedMsg.classList.remove('hidden');
    dom.days.textContent = '00';
    dom.hours.textContent = '00';
    dom.minutes.textContent = '00';
    dom.seconds.textContent = '00';
  } else {
    dom.countdownTimer.classList.remove('hidden');
    dom.countdownClosedMsg.classList.add('hidden');

    const totalSeconds = Math.floor(diff / 1000);
    const secs = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const mins = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hrs = totalHours % 24;
    const daysVal = Math.floor(totalHours / 24);

    dom.days.textContent = String(daysVal).padStart(2, '0');
    dom.hours.textContent = String(hrs).padStart(2, '0');
    dom.minutes.textContent = String(mins).padStart(2, '0');
    dom.seconds.textContent = String(secs).padStart(2, '0');
  }
}

// Mode de proves per a inversió de color
function toggleTestTheme() {
  appState.isTestThemeActive = !appState.isTestThemeActive;
  updateCountdownAndTheme();

  if (appState.isTestThemeActive) {
    dom.subtitle.textContent = "Posant llum a la foscor (Mode proves actiu)";
  } else {
    dom.subtitle.textContent = "Posant llum a la foscor";
  }
}

// Carrega els vots, l'estat i distribucions d'escons des de l'API
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) throw new Error('Error al connectar amb el servidor.');
    
    const data = await res.json();
    
    appState.votes = data.vots;
    appState.totalVotes = data.totalVots;
    appState.composicioActual = data.composicioActual;
    appState.composicioSimulada = data.composicioSimulada;

    // Si el servidor detecta que la IP ja ha votat, actualitzem l'estat
    if (data.jaVotat) {
      appState.hasVoted = true;
    }

    renderPartiesList();
    renderAllHemicycles();
    renderResultsTable();
  } catch (err) {
    console.error(err);
    dom.partiesContainer.innerHTML = `<p class="status-message error">No s'han pogut carregar les dades. Si us plau, torna-ho a provar més tard.</p>`;
  }
}

// Renderitza la llista de partits per votar
function renderPartiesList() {
  dom.partiesContainer.innerHTML = '';
  
  // Ordenar partits alfabèticament per a la interfície de votació
  const sortedParties = [...appState.votes].sort((a, b) => a.partit.localeCompare(b.partit));

  sortedParties.forEach(item => {
    const partyName = item.partit;
    const color = PARTY_COLORS[partyName] || '#666';

    const div = document.createElement('div');
    div.className = `party-item ${appState.hasVoted ? 'disabled' : ''}`;
    if (appState.selectedParty === partyName) {
      div.classList.add('selected');
    }

    div.innerHTML = `
      <div class="party-info">
        <img src="${getPartyLogoUrl(partyName)}" class="party-logo" 
          onerror="handleLogoError(this)" 
          alt="${partyName}">
        <span class="party-color-indicator" style="background-color: ${color}; display: none;"></span>
        <span class="party-name">${partyName}</span>
      </div>
      <input type="radio" name="party" class="party-radio" value="${partyName}" 
        ${appState.hasVoted ? 'disabled' : ''} 
        ${appState.selectedParty === partyName ? 'checked' : ''}>
    `;

    // Escoltador per seleccionar partit
    if (!appState.hasVoted) {
      div.addEventListener('click', () => {
        selectParty(partyName);
      });
    }

    dom.partiesContainer.appendChild(div);
  });

  // Gestionar botó d'enviar i missatge
  if (appState.hasVoted) {
    dom.submitVoteBtn.style.display = 'none';
    dom.votingStatusMsg.className = 'status-message success';
    dom.votingStatusMsg.textContent = 'Gràcies per participar. El teu vot ja ha estat comptabilitzat.';
  } else {
    dom.submitVoteBtn.style.display = 'block';
    dom.submitVoteBtn.disabled = !appState.selectedParty;
    dom.votingStatusMsg.textContent = '';
  }
}

function selectParty(partyName) {
  appState.selectedParty = partyName;
  const items = dom.partiesContainer.querySelectorAll('.party-item');
  items.forEach(item => {
    const name = item.querySelector('.party-name').textContent;
    if (name === partyName) {
      item.classList.add('selected');
      item.querySelector('.party-radio').checked = true;
    } else {
      item.classList.remove('selected');
      item.querySelector('.party-radio').checked = false;
    }
  });
  dom.submitVoteBtn.disabled = false;
}

// Envia el vot al servidor
async function submitVote() {
  if (!appState.selectedParty || appState.hasVoted) return;

  dom.submitVoteBtn.disabled = true;
  dom.submitVoteBtn.textContent = 'Enviant...';

  try {
    const res = await fetch(`${API_BASE}/api/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ partit: appState.selectedParty })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error en registrar el vot.');
    }

    // Registre correcte
    appState.hasVoted = true;
    localStorage.setItem('sitges_vot_realitzat', 'true');
    
    appState.votes = data.vots;
    appState.totalVotes = data.totalVots;
    appState.composicioActual = data.composicioActual;
    appState.composicioSimulada = data.composicioSimulada;

    renderPartiesList();
    renderAllHemicycles();
    renderResultsTable();

    dom.votingStatusMsg.className = 'status-message success';
    dom.votingStatusMsg.textContent = 'Gràcies per participar. El teu vot ja ha estat comptabilitzat.';
  } catch (err) {
    console.error(err);
    dom.votingStatusMsg.className = 'status-message error';
    dom.votingStatusMsg.textContent = err.message;
    dom.submitVoteBtn.disabled = false;
    dom.submitVoteBtn.textContent = 'Envia el teu vot';
  }
}

// Dibuixa tots els hemicles de l'aplicació
function renderAllHemicycles() {
  // Generem les 21 posicions d'escons
  const seatsGeometry = generateSeatPositions();

  // Dibuixem cadascun dels hemicles exposats
  drawHemicycle(dom.svgActual, seatsGeometry, appState.composicioActual);
  drawHemicycle(dom.svgSimulated, seatsGeometry, appState.composicioSimulada);
  drawHemicycle(dom.svgActualLarge, seatsGeometry, appState.composicioActual);
  drawHemicycle(dom.svgSimulatedLarge, seatsGeometry, appState.composicioSimulada);
}

// Genera la disposició geomètrica semicircular per a 21 regidors
function generateSeatPositions() {
  const seats = [];
  
  // Distribució en 2 files concèntriques per un millor encaix estètic
  // Fila interna: 9 escons
  const r1 = 60;
  const n1 = 9;
  for (let i = 0; i < n1; i++) {
    // Distribució uniforme des d'un angle de 170º a 10º (deixant 10º de marge a cada base)
    const angleRad = Math.PI - (10 * Math.PI / 180) - (i * (160 * Math.PI / 180) / (n1 - 1));
    seats.push({
      x: r1 * Math.cos(angleRad),
      y: -r1 * Math.sin(angleRad),
      angle: angleRad
    });
  }

  // Fila externa: 12 escons
  const r2 = 82;
  const n2 = 12;
  for (let i = 0; i < n2; i++) {
    const angleRad = Math.PI - (10 * Math.PI / 180) - (i * (160 * Math.PI / 180) / (n2 - 1));
    seats.push({
      x: r2 * Math.cos(angleRad),
      y: -r2 * Math.sin(angleRad),
      angle: angleRad
    });
  }

  // Ordenar els escons geomètrics d'esquerra a dreta per assignar els partits de manera contínua
  seats.sort((a, b) => b.angle - a.angle);
  return seats;
}

// Funció principal de dibuix d'hemicle SVG
function drawHemicycle(svgElement, seatsGeometry, distribution) {
  if (!svgElement) return;
  svgElement.innerHTML = '';

  // Assignar a cada escó físic un partit polític
  // Creem una llista ordenada de 21 elements amb els colors de partit assignats.
  const seatAssignments = [];
  
  PARTY_ORDER.forEach(partyName => {
    const distItem = distribution.find(d => d.partit === partyName);
    const escons = distItem ? distItem.escons : 0;
    
    for (let s = 0; s < escons; s++) {
      seatAssignments.push({
        party: partyName,
        color: PARTY_COLORS[partyName] || '#666'
      });
    }
  });

  // Si no s'han omplert els 21 escons (per exemple, si no hi ha vots en el simulat),
  // omplim la resta amb un color de fons neutre que reflecteixi escons buits.
  while (seatAssignments.length < 21) {
    seatAssignments.push({
      party: 'Vacant',
      color: document.body.classList.contains('inverted') ? '#e5e5ea' : '#222225'
    });
  }

  // Dibuixem els cercles dels escons
  seatsGeometry.forEach((seat, idx) => {
    const assignment = seatAssignments[idx];
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', seat.x);
    circle.setAttribute('cy', seat.y);
    circle.setAttribute('r', '6.5');
    circle.setAttribute('fill', assignment.color);
    circle.setAttribute('class', 'seat');
    circle.setAttribute('data-party', assignment.party);
    
    // Esdeveniments hover
    circle.addEventListener('mouseover', (e) => {
      highlightPartySeats(svgElement, assignment.party);
      showTooltip(e, assignment.party, distribution);
    });

    circle.addEventListener('mousemove', (e) => {
      moveTooltip(e);
    });

    circle.addEventListener('mouseout', () => {
      resetPartySeats(svgElement);
      hideTooltip();
    });

    svgElement.appendChild(circle);
  });
}

// Ressalta tots els escons d'un mateix partit a l'hemicle i a la taula
function highlightPartySeats(svgElement, partyName) {
  if (partyName === 'Vacant') return;

  // Dimm tots els altres escons
  const seats = svgElement.querySelectorAll('.seat');
  seats.forEach(seat => {
    if (seat.getAttribute('data-party') !== partyName) {
      seat.classList.add('dimmed');
    }
  });

  // Ressaltar fila corresponent de la taula
  const rows = dom.resultsTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    const rowParty = row.getAttribute('data-party');
    if (rowParty === partyName) {
      row.style.backgroundColor = 'rgba(var(--accent-color-rgb), 0.06)';
    }
  });
}

function resetPartySeats(svgElement) {
  const seats = svgElement.querySelectorAll('.seat');
  seats.forEach(seat => {
    seat.classList.remove('dimmed');
  });

  const rows = dom.resultsTableBody.querySelectorAll('tr');
  rows.forEach(row => {
    row.style.backgroundColor = '';
  });
}

// Tooltips informatius de l'hemicle
function showTooltip(event, partyName, distribution) {
  if (partyName === 'Vacant') return;

  const distItem = distribution.find(d => d.partit === partyName);
  const escons = distItem ? distItem.escons : 0;
  
  const voteItem = appState.votes.find(v => v.partit === partyName);
  const vots = voteItem ? voteItem.vots : 0;
  const pct = appState.totalVotes > 0 ? ((vots / appState.totalVotes) * 100).toFixed(1) : '0.0';

  dom.tooltip.innerHTML = `
    <strong>${partyName}</strong><br>
    Regidors: ${escons}<br>
    ${partyName !== 'Vacant' ? `Vots: ${vots} (${pct}%)` : ''}
  `;
  dom.tooltip.classList.remove('hidden');
  moveTooltip(event);
}

function moveTooltip(event) {
  dom.tooltip.style.left = `${event.pageX + 12}px`;
  dom.tooltip.style.top = `${event.pageY - 24}px`;
}

function hideTooltip() {
  dom.tooltip.classList.add('hidden');
}

// Renderitza la taula detallada de vots i regidors
function renderResultsTable() {
  dom.resultsTableBody.innerHTML = '';

  // Ordenem la llista de partits per escons simulats (descendents), després per vots, i després per nom
  const tableData = PARTY_ORDER.map(partyName => {
    const actual = appState.composicioActual.find(d => d.partit === partyName)?.escons || 0;
    const simulat = appState.composicioSimulada.find(d => d.partit === partyName)?.escons || 0;
    const vots = appState.votes.find(v => v.partit === partyName)?.vots || 0;
    const pct = appState.totalVotes > 0 ? ((vots / appState.totalVotes) * 100).toFixed(1) : '0.0';
    return { partit: partyName, actual, simulat, vots, pct };
  });

  // Ordenar per posar primer els partits amb més representació
  tableData.sort((a, b) => {
    if (b.simulat !== a.simulat) return b.simulat - a.simulat;
    if (b.vots !== a.vots) return b.vots - a.vots;
    return a.partit.localeCompare(b.partit);
  });

  tableData.forEach(item => {
    const color = PARTY_COLORS[item.partit] || '#666';
    const tr = document.createElement('tr');
    tr.setAttribute('data-party', item.partit);

    tr.innerHTML = `
      <td>
        <div class="table-party-cell">
          <img src="${getPartyLogoUrl(item.partit)}" class="party-logo" 
            onerror="handleLogoError(this)" 
            alt="${item.partit}">
          <span class="table-color-dot" style="background-color: ${color}; display: none;"></span>
          <span class="table-party-name">${item.partit}</span>
        </div>
      </td>
      <td class="text-right font-semibold">${item.actual}</td>
      <td class="text-right font-semibold" style="color: ${item.simulat > 0 ? color : 'var(--text-secondary)'}">${item.simulat}</td>
      <td class="text-right">${item.vots}</td>
      <td class="text-right">${item.pct}%</td>
    `;

    // Efectes hover creuats amb l'hemicle
    tr.addEventListener('mouseover', () => {
      // Ressalta l'actual i el simulat alhora si són visibles
      highlightPartySeats(dom.svgActual, item.partit);
      highlightPartySeats(dom.svgSimulated, item.partit);
      highlightPartySeats(dom.svgActualLarge, item.partit);
      highlightPartySeats(dom.svgSimulatedLarge, item.partit);
      tr.style.backgroundColor = 'rgba(var(--accent-color-rgb), 0.06)';
    });

    tr.addEventListener('mouseout', () => {
      resetPartySeats(dom.svgActual);
      resetPartySeats(dom.svgSimulated);
      resetPartySeats(dom.svgActualLarge);
      resetPartySeats(dom.svgSimulatedLarge);
      tr.style.backgroundColor = '';
    });

    dom.resultsTableBody.appendChild(tr);
  });
}
