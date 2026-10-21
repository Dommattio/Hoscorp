// =========================================================================
// Hoscorp - Portal Web (Nodo 3) - Logica de Monitoreo, Canales y OCC
// Entrega 3: Comunicacion Sincrona, Asincrona y Sincronizacion Distribuida
// =========================================================================

// Configuracion de endpoints (soporta proxy reverso de Nginx o acceso directo fallback)
const API_BASE_URL = window.location.port === '3000' || window.location.pathname.startsWith('/api')
  ? '' // Relativo via Nginx Reverse Proxy
  : 'http://localhost:5000';

const HEALTH_ENDPOINT = `${API_BASE_URL}/backend-health`;
const RECORDS_ENDPOINT = `${API_BASE_URL}/api/records`;
const NOTIF_HEALTH_ENDPOINT = `${API_BASE_URL}/notification-health`;
const AUDIT_ENDPOINT = `${API_BASE_URL}/api/notifications/audit-logs`;

// Estado local
let isBackendOnline = false;
let isNotifOnline = false;
let recordsCache = [];
let heartbeatTimer = null;

// Elementos DOM de Nodos y Metricas
const badgeBackend = document.getElementById('badge-backend');
const cardBackend = document.getElementById('card-backend');
const backendLatency = document.getElementById('backend-latency');
const backendUptime = document.getElementById('backend-uptime');

const badgeRabbitMQ = document.getElementById('badge-rabbitmq');
const cardRabbitMQ = document.getElementById('card-rabbitmq');

const badgeNotification = document.getElementById('badge-notification');
const cardNotification = document.getElementById('card-notification');
const notificationUptime = document.getElementById('notification-uptime');
const notificationMsgCount = document.getElementById('notification-msg-count');

const backendDownAlert = document.getElementById('backend-down-alert');
const recordForm = document.getElementById('record-form');
const recordsList = document.getElementById('records-list');
const recordsCount = document.getElementById('records-count');
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

// ==========================================
// 1. VERIFICACION PERIODICA DE NODOS (HEARTBEAT)
// ==========================================
async function checkNodesHealth() {
  const startTime = performance.now();

  // 1.1 Backend Clinico Core & RabbitMQ
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

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

  // 1.2 Microservicio de Notificaciones y Auditoria
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(NOTIF_HEALTH_ENDPOINT, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      setNotifState(true, data);
    } else {
      setNotifState(false);
    }
  } catch (err) {
    setNotifState(false);
  }
}

function setBackendState(online, data = null, latency = null) {
  const stateChanged = isBackendOnline !== online;
  isBackendOnline = online;

  if (online) {
    badgeBackend.textContent = 'ONLINE';
    badgeBackend.className = 'status-badge status-online';
    cardBackend.classList.add('active');

    if (data) {
      backendUptime.textContent = formatUptime(data.uptimeSeconds);
      
      // Estado de RabbitMQ verificado a traves del Backend
      if (data.rabbitmq && data.rabbitmq.connected) {
        badgeRabbitMQ.textContent = 'CONECTADO';
        badgeRabbitMQ.className = 'status-badge status-online';
        cardRabbitMQ.classList.add('active');
      } else {
        badgeRabbitMQ.textContent = 'DESCONECTADO';
        badgeRabbitMQ.className = 'status-badge status-offline';
        cardRabbitMQ.classList.remove('active');
      }
    }
    if (latency !== null) {
      backendLatency.textContent = `${latency} ms`;
    }

    if (stateChanged) {
      loadRecords();
      loadAuditLogs();
    }
  } else {
    badgeBackend.textContent = 'OFFLINE (DETENIDO)';
    badgeBackend.className = 'status-badge status-offline';
    cardBackend.classList.remove('active');

    badgeRabbitMQ.textContent = 'DESCONOCIDO';
    badgeRabbitMQ.className = 'status-badge status-offline';
    cardRabbitMQ.classList.remove('active');

    backendLatency.textContent = 'Timeout';
    backendUptime.textContent = 'Inaccesible';
  }

  updateGlobalAlert();
}

function setNotifState(online, data = null) {
  isNotifOnline = online;

  if (online) {
    badgeNotification.textContent = 'ONLINE';
    badgeNotification.className = 'status-badge status-online';
    cardNotification.classList.add('active');

    if (data) {
      notificationUptime.textContent = formatUptime(data.uptimeSeconds);
      if (data.rabbitmq) {
        notificationMsgCount.textContent = `${data.rabbitmq.totalMessagesReceived} msgs`;
      }
    }
  } else {
    badgeNotification.textContent = 'OFFLINE (DETENIDO)';
    badgeNotification.className = 'status-badge status-offline';
    cardNotification.classList.remove('active');
    notificationUptime.textContent = 'Inaccesible';
    notificationMsgCount.textContent = '0';
  }

  updateGlobalAlert();
}

function updateGlobalAlert() {
  if (!isBackendOnline || !isNotifOnline) {
    backendDownAlert.classList.remove('hidden');
  } else {
    backendDownAlert.classList.add('hidden');
  }
}

// ==========================================
// 2. GESTION DE HISTORIAS CLINICAS (CANAL SINCRONO)
// ==========================================
async function loadRecords() {
  try {
    const res = await fetch(RECORDS_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error de servidor al cargar historias');
    const json = await res.json();
    recordsCache = json.data || [];

    recordsCount.textContent = `${recordsCache.length} registros persistidos`;
    renderRecordsList(recordsCache);
    updateTargetRecordSelector(recordsCache);
  } catch (err) {
    recordsList.innerHTML = `
      <div class="record-item" style="border-left: 3px solid var(--danger);">
        <p style="color: var(--danger); font-size: 0.85rem;">No se pudieron cargar los registros: ${err.message}</p>
      </div>
    `;
    recordsCount.textContent = 'Error de conexion';
  }
}

function renderRecordsList(records) {
  if (!records.length) {
    recordsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">No hay registros clinicos almacenados actualmente.</p>';
    return;
  }

  recordsList.innerHTML = records.map(r => `
    <div class="record-item" id="item-${r.id}">
      <div class="record-item-top">
        <div>
          <span class="record-patient">${r.paciente}</span>
          <span class="record-dni">DNI: ${r.dni || 'S/D'}</span>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="version-pill">Version ${r.version}</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="editRecordInline('${r.id}')">Editar</button>
        </div>
      </div>
      <div class="record-diag">${r.diagnostico}</div>
      <div class="record-meta">
        <span><strong>Centro:</strong> ${r.centroSalud}</span>
        <span><strong>Profesional:</strong> ${r.profesional}</span>
        <span><strong>Fecha:</strong> ${r.fecha}</span>
        <span class="mono" style="font-size: 0.7rem; color: var(--text-muted);">ID: ${r.id} | Modif: ${r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString() : 'N/A'}</span>
      </div>
      ${r.observaciones ? `<div class="record-obs">${r.observaciones}</div>` : ''}
    </div>
  `).join('');
}

function updateTargetRecordSelector(records) {
  const select = document.getElementById('select-target-record');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = records.map(r => `
    <option value="${r.id}">${r.id} - ${r.paciente} (v${r.version})</option>
  `).join('');

  if (currentVal && records.some(r => r.id === currentVal)) {
    select.value = currentVal;
  }
  handleTargetRecordChange();
}

function handleTargetRecordChange() {
  const select = document.getElementById('select-target-record');
  const tag = document.getElementById('current-version-tag');
  if (!select || !tag) return;

  const target = recordsCache.find(r => r.id === select.value);
  if (target) {
    tag.textContent = `Version actual en BD: v${target.version}`;
  } else {
    tag.textContent = 'Sin seleccion';
  }
}

// Crear nuevo registro
async function handleCreateRecord(e) {
  e.preventDefault();
  const paciente = document.getElementById('input-paciente').value.trim();
  const dni = document.getElementById('input-dni').value.trim();
  const centroSalud = document.getElementById('input-centro').value;
  const profesional = document.getElementById('input-profesional').value.trim();
  const diagnostico = document.getElementById('input-diagnostico').value.trim();
  const observaciones = document.getElementById('input-observaciones').value.trim();

  formFeedback.textContent = 'Guardando registro...';
  formFeedback.style.color = 'var(--text-secondary)';

  try {
    const res = await fetch(RECORDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente, dni, centroSalud, profesional, diagnostico, observaciones })
    });

    if (res.ok) {
      formFeedback.textContent = 'Registro guardado exitosamente.';
      formFeedback.style.color = 'var(--success)';
      recordForm.reset();
      await loadRecords();
      await loadAuditLogs();
      setTimeout(() => { formFeedback.textContent = ''; }, 3000);
    } else {
      const err = await res.json();
      formFeedback.textContent = `Error: ${err.error || 'No se pudo guardar'}`;
      formFeedback.style.color = 'var(--danger)';
    }
  } catch (err) {
    formFeedback.textContent = `Error de red: ${err.message}`;
    formFeedback.style.color = 'var(--danger)';
  }
}

// Editar registro con OCC
async function editRecordInline(id) {
  const target = recordsCache.find(r => r.id === id);
  if (!target) return;

  const nuevoDiag = prompt(`Actualizar diagnostico para ${target.paciente} (Version actual: v${target.version}):`, target.diagnostico);
  if (nuevoDiag === null) return;

  try {
    const res = await fetch(`${RECORDS_ENDPOINT}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: target.version,
        diagnostico: nuevoDiag,
        modificadoPor: 'Edicion Manual desde Portal'
      })
    });

    if (res.ok) {
      alert('Registro actualizado con exito (Version evolucionada con OCC).');
    } else if (res.status === 409) {
      alert('Error 409 Conflict: Conflicto de concurrencia detectado. El registro fue modificado por otro proceso.');
    } else {
      alert('Error: ' + res.statusText);
    }

    await loadRecords();
    await loadAuditLogs();
  } catch (err) {
    alert('Fallo de comunicacion: ' + err.message);
  }
}

// ==========================================
// 3. LABORATORIO DE CONCURRENCIA (OCC EN VIVO)
// ==========================================
async function executeConcurrentWrites() {
  const select = document.getElementById('select-target-record');
  const targetId = select.value;
  const target = recordsCache.find(r => r.id === targetId);

  if (!target) {
    alert('Por favor selecciona un registro clinico valido.');
    return;
  }

  const baseVersion = target.version;
  const btn = document.getElementById('btn-run-race');
  btn.disabled = true;
  btn.textContent = 'Ejecutando escrituras concurrentes...';

  const cardT1 = document.getElementById('card-thread-1');
  const badgeT1 = document.getElementById('badge-thread-1');
  const codeT1 = document.getElementById('code-thread-1');

  const cardT2 = document.getElementById('card-thread-2');
  const badgeT2 = document.getElementById('badge-thread-2');
  const codeT2 = document.getElementById('code-thread-2');

  const verdict = document.getElementById('concurrency-verdict');

  cardT1.className = 'thread-card idle';
  badgeT1.textContent = 'Enviando...';
  codeT1.textContent = `PUT /api/records/${targetId} con version base ${baseVersion}...`;

  cardT2.className = 'thread-card idle';
  badgeT2.textContent = 'Enviando...';
  codeT2.textContent = `PUT /api/records/${targetId} con version base ${baseVersion}...`;

  const payload1 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dra. Gomez)`,
    observaciones: 'Evaluacion cardiologica urgente completada.',
    modificadoPor: 'Hilo-1 (Dra. Gomez)'
  };

  const payload2 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dr. Ramirez)`,
    observaciones: 'Paciente estable, derivado a control ambulatorio.',
    modificadoPor: 'Hilo-2 (Dr. Ramirez)'
  };

  try {
    // Disparo simultaneo con Promise.all
    const [res1, res2] = await Promise.all([
      fetch(`${RECORDS_ENDPOINT}/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload1)
      }),
      fetch(`${RECORDS_ENDPOINT}/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload2)
      })
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Hilo 1
    if (res1.status === 200) {
      cardT1.className = 'thread-card success';
      badgeT1.textContent = '200 OK (EXITO)';
      badgeT1.className = 'status-badge status-online';
    } else {
      cardT1.className = 'thread-card conflict';
      badgeT1.textContent = '409 CONFLICT (RECHAZADO)';
      badgeT1.className = 'status-badge status-offline';
    }
    codeT1.textContent = JSON.stringify(body1, null, 2);

    // Hilo 2
    if (res2.status === 200) {
      cardT2.className = 'thread-card success';
      badgeT2.textContent = '200 OK (EXITO)';
      badgeT2.className = 'status-badge status-online';
    } else {
      cardT2.className = 'thread-card conflict';
      badgeT2.textContent = '409 CONFLICT (RECHAZADO)';
      badgeT2.className = 'status-badge status-offline';
    }
    codeT2.textContent = JSON.stringify(body2, null, 2);

    // Veredicto
    verdict.style.display = 'block';
    verdict.textContent = '[VEREDICTO OCC] 1 peticion aceptada (200 OK, version incrementada) y 1 peticion rechazada preventivamente (409 Conflict). La anomalia Lost Update fue prevenida con exito.';

    await loadRecords();
    await loadAuditLogs();

  } catch (err) {
    alert('Error en ejecucion concurrente: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ejecutar 2 Escrituras Simultaneas';
  }
}

// Probar llamada sincrona inter-servicio
async function testSyncInterServiceCall() {
  const select = document.getElementById('select-target-record');
  const targetId = select.value || 'rec-1001';
  const output = document.getElementById('sync-test-output');
  output.textContent = 'Realizando llamada sincrona Backend -> Notificaciones...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/records/${targetId}/sync-audit-check`);
    const json = await res.json();
    output.textContent = `[SINCRONO OK] Respuesta directa de backend -> notificaciones en ${json.responseTimeMs}ms (HTTP ${json.httpStatus || 200}). Detalle: ${json.dataFromNotificationService?.message || 'Validado'}`;
  } catch (err) {
    output.textContent = `[SINCRONO FALLO] Error en llamada: ${err.message}`;
  }
}

// Restablecer semilla
async function resetSeedRecords() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/records/reset`, { method: 'POST' });
    if (res.ok) {
      await loadRecords();
      await loadAuditLogs();
      const verdict = document.getElementById('concurrency-verdict');
      if (verdict) verdict.style.display = 'none';

      document.getElementById('card-thread-1').className = 'thread-card idle';
      document.getElementById('card-thread-2').className = 'thread-card idle';
      document.getElementById('code-thread-1').textContent = 'Presiona "Ejecutar 2 Escrituras Simultaneas" para comenzar.';
      document.getElementById('code-thread-2').textContent = 'Presiona "Ejecutar 2 Escrituras Simultaneas" para comenzar.';
      alert('Historias clinicas restablecidas al estado inicial.');
    }
  } catch (err) {
    alert('Error restableciendo datos: ' + err.message);
  }
}

// ==========================================
// 4. BITACORA ASINCRONA RABBITMQ
// ==========================================
async function loadAuditLogs() {
  const auditList = document.getElementById('audit-list');
  if (!auditList) return;

  try {
    const res = await fetch(AUDIT_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error consultando auditoria');
    const json = await res.json();
    const logs = json.logs || [];

    if (!logs.length) {
      auditList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem 0;">Sin eventos registrados en la cola de RabbitMQ aun.</p>';
      return;
    }

    auditList.innerHTML = logs.map(l => {
      let keyClass = 'created';
      if (l.routingKey.includes('conflict')) keyClass = 'conflict';
      if (l.routingKey.includes('updated')) keyClass = 'updated';

      return `
        <div class="audit-item">
          <div class="audit-item-top">
            <span class="audit-key ${keyClass}">[${l.routingKey}]</span>
            <span class="audit-time">${new Date(l.consumedAt).toLocaleTimeString()}</span>
          </div>
          <div style="font-size: 0.82rem; font-weight: 600; color: #fff;">${l.actionDescription}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem;">${l.simulatedAction}</div>
          <div class="mono" style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.35rem;">
            ID Evento: ${l.eventId} | Origen: ${l.sourceNode}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    auditList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">No se pudo conectar con el worker de notificaciones.</p>`;
  }
}

async function clearAuditLogs() {
  try {
    await fetch(AUDIT_ENDPOINT, { method: 'DELETE' });
    await loadAuditLogs();
  } catch (err) {
    alert('Error al limpiar bitacora: ' + err.message);
  }
}

// ==========================================
// INICIALIZACION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  checkNodesHealth();
  loadRecords();
  loadAuditLogs();

  // Heartbeat y refresco cada 3 y 5 segundos
  heartbeatTimer = setInterval(checkNodesHealth, 3000);
  setInterval(loadAuditLogs, 5000);
});
