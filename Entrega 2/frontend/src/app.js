// =========================================================================
// Hoscorp - Portal Web (Nodo 2) - Lógica de Monitoreo e Interoperabilidad
// =========================================================================

// Configuración de endpoints (soporta proxy reverso de Docker o acceso directo)
const API_BASE_URL = window.location.port === '3000' || window.location.pathname.startsWith('/api')
  ? '' // Relativo vía Nginx Reverse Proxy
  : 'http://localhost:5000'; // Acceso directo fallback

const HEALTH_ENDPOINT = `${API_BASE_URL}/health`;
const RECORDS_ENDPOINT = `${API_BASE_URL}/api/records`;
const INFO_ENDPOINT = `${API_BASE_URL}/api/info`;

// Estado local
let isBackendOnline = false;
let heartbeatTimer = null;

// Elementos DOM
const badgeBackend = document.getElementById('badge-backend');
const cardBackend = document.getElementById('card-backend');
const backendHostname = document.getElementById('backend-hostname');
const backendPid = document.getElementById('backend-pid');
const backendLatency = document.getElementById('backend-latency');
const backendUptime = document.getElementById('backend-uptime');
const backendDownAlert = document.getElementById('backend-down-alert');
const recordForm = document.getElementById('record-form');
const recordsList = document.getElementById('records-list');
const recordsCount = document.getElementById('records-count');
const btnRefreshRecords = document.getElementById('btn-refresh-records');
const formFeedback = document.getElementById('form-feedback');

// Formatea segundos a tiempo legible
function formatUptime(seconds) {
  if (isNaN(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return hours > 0 ? `${hours}h ${remMins}m ${secs}s` : `${mins}m ${secs}s`;
}

// 1. Verificación periódica de salud del Nodo 1 (Heartbeat)
async function checkBackendHealth() {
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    // Intentamos contactar al endpoint de health
    const res = await fetch(HEALTH_ENDPOINT, { 
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json();
      setBackendState(true, data, latency);
    } else {
      setBackendState(false);
    }
  } catch (err) {
    setBackendState(false);
  }
}

// 2. Actualizar estado visual del Nodo 1 en la interfaz
function setBackendState(online, data = null, latency = null) {
  const stateChanged = isBackendOnline !== online;
  isBackendOnline = online;

  if (online) {
    badgeBackend.textContent = 'ONLINE';
    badgeBackend.className = 'status-badge status-online';
    cardBackend.classList.add('active');
    backendDownAlert.classList.add('hidden');

    if (data) {
      backendHostname.textContent = data.hostname || 'contenedor-backend';
      backendPid.textContent = data.pid ? `PID ${data.pid}` : '-';
      backendUptime.textContent = formatUptime(data.uptimeSeconds);
    }
    if (latency !== null) {
      backendLatency.textContent = `${latency} ms`;
    }

    // Si recién se recuperó la conexión, recargamos los registros
    if (stateChanged) {
      loadRecords();
    }
  } else {
    badgeBackend.textContent = 'OFFLINE (DETENIDO)';
    badgeBackend.className = 'status-badge status-offline';
    cardBackend.classList.remove('active');
    backendDownAlert.classList.remove('hidden');

    backendHostname.textContent = 'Inaccesible';
    backendPid.textContent = 'Proceso detenido';
    backendLatency.textContent = 'Timeout (infinito)';
    backendUptime.textContent = '0s (Caido)';

    recordsCount.textContent = '[AVISO] Nodo 1 desconectado - Esperando que el backend se inicie...';
  }
}

// 3. Cargar lista de registros médicos desde el Backend
async function loadRecords() {
  if (!isBackendOnline) {
    recordsList.innerHTML = `
      <div class="record-item" style="border-left: 3px solid var(--danger);">
        <p style="color: var(--danger); font-size: 0.85rem;">
          <strong>No es posible recuperar registros:</strong> El Nodo 1 (Backend API) se encuentra detenido.
        </p>
        <p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 0.25rem;">
          Inicie el contenedor con <code>docker compose start backend</code> para restablecer la comunicación entre nodos.
        </p>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(RECORDS_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error al consultar registros');

    const result = await res.json();
    const records = result.data || [];
    renderRecords(records);
  } catch (err) {
    console.error('Error al cargar historias clínicas:', err);
  }
}

// 4. Renderizar registros en el DOM
function renderRecords(records) {
  recordsCount.textContent = `${records.length} registro(s) sincronizados desde Nodo 1`;

  if (records.length === 0) {
    recordsList.innerHTML = `
      <div class="record-item">
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          No hay historias clínicas registradas en el volumen persistente aún. Utilice el formulario superior para crear la primera.
        </p>
      </div>
    `;
    return;
  }

  recordsList.innerHTML = records.map(r => `
    <article class="record-item" id="item-${r.id}">
      <div class="record-item-top">
        <div>
          <span class="record-patient">${escapeHtml(r.paciente)}</span>
          <span class="record-dni">DNI: ${escapeHtml(r.dni || 'N/A')}</span>
        </div>
        <button class="btn-danger-sm" onclick="deleteRecord('${r.id}')" title="Eliminar del volumen del backend">
          Eliminar
        </button>
      </div>

      <div class="record-diag">Diagnóstico: ${escapeHtml(r.diagnostico)}</div>

      <div class="record-meta">
        <span><strong>Centro:</strong> ${escapeHtml(r.centroSalud)}</span>
        <span><strong>Médico:</strong> ${escapeHtml(r.profesional)}</span>
        <span><strong>Fecha:</strong> ${escapeHtml(r.fecha)}</span>
      </div>

      ${r.observaciones ? `<div class="record-obs">${escapeHtml(r.observaciones)}</div>` : ''}
    </article>
  `).join('');
}

// 5. Manejo del formulario de creación de registro
recordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!isBackendOnline) {
    showFeedback('Error: El Nodo 1 está detenido. No se pueden persistir datos.', 'var(--danger)');
    return;
  }

  const payload = {
    paciente: document.getElementById('input-paciente').value,
    dni: document.getElementById('input-dni').value,
    centroSalud: document.getElementById('input-centro').value,
    profesional: document.getElementById('input-profesional').value,
    diagnostico: document.getElementById('input-diagnostico').value,
    observaciones: document.getElementById('input-observaciones').value
  };

  showFeedback('Transmitiendo solicitud REST al Nodo 1...', 'var(--primary)');

  try {
    const res = await fetch(RECORDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al guardar el registro');
    }

    showFeedback('Registro persistido exitosamente en el Nodo 1', 'var(--success)');
    recordForm.reset();
    await loadRecords();

    setTimeout(() => {
      formFeedback.textContent = '';
    }, 4000);
  } catch (err) {
    showFeedback(`Falló la transmisión: ${err.message}`, 'var(--danger)');
  }
});

// 6. Eliminar registro
window.deleteRecord = async function(id) {
  if (!confirm(`¿Deseas eliminar el registro médico ${id}?`)) return;

  try {
    const res = await fetch(`${RECORDS_ENDPOINT}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadRecords();
    } else {
      alert('Error al eliminar registro en el backend.');
    }
  } catch (err) {
    alert('Error de conexión con el Nodo 1.');
  }
};

function showFeedback(text, color) {
  formFeedback.textContent = text;
  formFeedback.style.color = color;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
btnRefreshRecords.addEventListener('click', () => {
  checkBackendHealth();
  loadRecords();
});

// Inicialización
checkBackendHealth().then(() => {
  loadRecords();
});

// Intervalo de Heartbeat continuo cada 3 segundos
heartbeatTimer = setInterval(checkBackendHealth, 3000);
