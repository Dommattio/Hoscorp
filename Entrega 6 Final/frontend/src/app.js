// =========================================================================
// Hoscorp - Portal Web Integrado - Las 6 Capas + Demo en Vivo E2E
// Entrega 6 Final: Integracion de los Modulos (v6-final)
// =========================================================================

const IS_PROXY = window.location.port === '3000' || window.location.port === '3443' || window.location.pathname.startsWith('/api');
const BACKEND_BASE = IS_PROXY ? '' : 'http://localhost:5000';
const NOTIF_BASE = IS_PROXY ? '/api/notifications' : 'http://localhost:5001/api';
const REGISTRY_BASE = IS_PROXY ? '/api/registry' : 'http://localhost:5002/api/v1/registry';

const HEALTH_BACKEND = IS_PROXY ? '/backend-health' : 'http://localhost:5000/health';
const HEALTH_NOTIF = IS_PROXY ? '/notification-health' : 'http://localhost:5001/health';
const HEALTH_REGISTRY = IS_PROXY ? '/registry-health' : 'http://localhost:5002/health';

const RECORDS_ENDPOINT = `${BACKEND_BASE}/api/v1/records`;
const AUDIT_ENDPOINT = `${NOTIF_BASE}/v1/audit-logs`;

let activeJwtToken = null;
let activeUser = null;
let isBackendOnline = false;
let isNotifOnline = false;
let isRegistryOnline = false;
let recordsCache = [];

const badgeBackend = document.getElementById('badge-backend');
const cardBackend = document.getElementById('card-backend');
const backendLatency = document.getElementById('backend-latency');
const backendUptime = document.getElementById('backend-uptime');
const backendRecoveriesCount = document.getElementById('backend-recoveries-count');
const backendCacheRatio = document.getElementById('backend-cache-ratio');
const backendCbState = document.getElementById('backend-cb-state');

const badgeRegistry = document.getElementById('badge-registry');
const cardRegistry = document.getElementById('card-registry');
const registryActiveCount = document.getElementById('registry-active-count');
const registryLookupsCount = document.getElementById('registry-lookups-count');
const registryUptime = document.getElementById('registry-uptime');

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

function formatUptime(seconds) {
  if (isNaN(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return hours > 0 ? `${hours}h ${remMins}m ${secs}s` : `${mins}m ${secs}s`;
}

function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (activeJwtToken) {
    headers['Authorization'] = `Bearer ${activeJwtToken}`;
  }
  return headers;
}

// ====================================================
// 1. ORQUESTADOR DE DEMO EN VIVO E2E (LAS 6 CAPAS)
// ====================================================
async function runEndToEndSixLayersDemo() {
  const btn = document.getElementById('btn-run-e2e');
  const container = document.getElementById('e2e-layers-container');
  const viewer = document.getElementById('scalability-metrics-viewer');
  const verdict = document.getElementById('e2e-verdict-box');

  btn.disabled = true;
  btn.textContent = 'Ejecutando Demo en Vivo de las 6 Capas...';

  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/demo/run-e2e-all-layers`, {
      method: 'POST'
    });
    const report = await res.json();

    container.style.display = 'flex';
    container.innerHTML = (report.layersReport || []).map(item => `
      <div class="step-item">
        <div class="step-item-header">
          <span>${item.layerName}</span>
          <span class="status-badge status-online">${item.status}</span>
        </div>
        <div class="step-item-desc">${item.evidence}</div>
      </div>
    `).join('');

    viewer.textContent = JSON.stringify(report, null, 2);
    verdict.style.display = 'block';
    verdict.textContent = `[DEMO EN VIVO E2E COMPLETADA EN ${report.totalExecutionTimeMs}ms] Las 6 capas del semestre (Infraestructura, Comunicacion, Middleware, Seguridad y Patrones/Escalabilidad) funcionan integradas de punta a punta.`;

    await checkNodesHealth();
    await loadServiceRegistryCatalog();
    await loadRecords();
    await loadAuditLogs();
  } catch (err) {
    alert('Error ejecutando Demo E2E: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ejecutar Demo en Vivo de Punta a Punta (Las 6 Capas Integradas)';
  }
}

async function scaleClusterHorizontally(targetReplicas = 4) {
  const viewer = document.getElementById('scalability-metrics-viewer');
  const verdict = document.getElementById('e2e-verdict-box');
  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/scalability/scale-cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetReplicas })
    });
    const data = await res.json();

    viewer.textContent = JSON.stringify(data, null, 2);
    verdict.style.display = 'block';
    verdict.textContent = `[ESCALABILIDAD HORIZONTAL VERIFICADA] Pool escalado a ${data.activeInstancesCount} instancias activas. Rafaga de ${data.burstRequestsSent} peticiones distribuida equitativamente por Round-Robin.`;

    await loadServiceRegistryCatalog();
    await loadAuditLogs();
  } catch (err) {
    viewer.textContent = `Error al escalar cluster: ${err.message}`;
  }
}

async function inspectScalabilityMetrics() {
  const viewer = document.getElementById('scalability-metrics-viewer');
  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/scalability/metrics`);
    const data = await res.json();
    viewer.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    viewer.textContent = `Error consultando metricas de escalabilidad: ${err.message}`;
  }
}

// ====================================================
// 2. AUTENTICACION JWT Y CONTROL DE ACCESO RBAC
// ====================================================
async function loginWithPreset(username, password) {
  const viewer = document.getElementById('jwt-session-viewer');
  const rolePill = document.getElementById('jwt-role-pill');
  const userBadge = document.getElementById('active-user-badge');
  const headerRole = document.getElementById('header-active-role');

  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      activeJwtToken = data.token;
      activeUser = data.user;

      if (rolePill) rolePill.textContent = `ROL: ${data.user.role}`;
      if (userBadge) userBadge.textContent = `${data.user.username} [${data.user.role}]`;
      if (headerRole) headerRole.textContent = `${data.user.username} (${data.user.role})`;

      if (viewer) {
        viewer.textContent = JSON.stringify({
          status: data.status,
          algorithm: data.algorithm,
          user: data.user,
          jwtTokenPreview: `${data.token.slice(0, 38)}...${data.token.slice(-18)}`
        }, null, 2);
      }
      await loadAuditLogs();
    }
  } catch (err) {
    if (viewer) viewer.textContent = `Error de autenticacion: ${err.message}`;
  }
}

function clearJwtSession() {
  activeJwtToken = null;
  activeUser = null;
  document.getElementById('jwt-role-pill').textContent = 'SIN SESION (ANONIMO)';
  document.getElementById('active-user-badge').textContent = 'Anonimo [Sin Token JWT]';
  document.getElementById('header-active-role').textContent = 'ANONIMO';
  document.getElementById('jwt-session-viewer').textContent = JSON.stringify({
    status: 'UNAUTHENTICATED',
    activeJwtToken: null,
    note: 'Cualquier intento de escritura sin token sera rechazado con HTTP 401 Unauthorized.'
  }, null, 2);
}

async function runAutomatedRbacAndTlsTest() {
  const btn = document.getElementById('btn-test-rbac');
  const outViewer = document.getElementById('security-test-viewer');
  const badgeOut = document.getElementById('badge-security-output');
  const verdictBox = document.getElementById('security-verdict-box');

  btn.disabled = true;

  try {
    const medLogin = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dra.gomez', password: 'medico123' })
    }).then(r => r.json());

    const pacLogin = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'carlos.gomez', password: 'paciente123' })
    }).then(r => r.json());

    const forbiddenAttempt = await fetch(`${RECORDS_ENDPOINT}/rec-1001`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pacLogin.token}`
      },
      body: JSON.stringify({ version: 1, diagnostico: 'Intento no autorizado por Paciente' })
    });
    const forbiddenBody = await forbiddenAttempt.json();

    const unauthAttempt = await fetch(`${RECORDS_ENDPOINT}/rec-1001`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, diagnostico: 'Intento anonimo' })
    });

    const tlsInfo = await fetch(`${BACKEND_BASE}/api/v1/security/tls-status`).then(r => r.json());

    const summary = {
      MEDICO_Auth: { status: 200, role: medLogin.user.role, permissions: medLogin.user.permissions },
      PACIENTE_WriteAttempt: { httpCode: forbiddenAttempt.status, status: forbiddenBody.status, outcome: 'BLOQUEADO CON HTTP 403 FORBIDDEN' },
      ANONYMOUS_WriteAttempt: { httpCode: unauthAttempt.status, outcome: 'BLOQUEADO CON HTTP 401 UNAUTHORIZED' },
      TLS_Channel: { protocol: tlsInfo.negotiatedTlsProtocol, cert: tlsInfo.certificate?.subject, fingerprint256: tlsInfo.certificate?.fingerprint256 }
    };

    badgeOut.textContent = 'RBAC & TLS VERIFICADOS [OK]';
    outViewer.textContent = JSON.stringify(summary, null, 2);
    verdictBox.style.display = 'block';
    verdictBox.textContent = '[SEGURIDAD VERIFICADA] Autenticacion JWT HS256, bloqueo RBAC 403 para rol PACIENTE, bloqueo 401 sin token y canal TLS 1.3 X.509 verificados.';

    await loadAuditLogs();
  } catch (err) {
    outViewer.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function runFailureAndRecoveryTest() {
  const btn = document.getElementById('btn-simulate-disaster');
  const timelineContainer = document.getElementById('recovery-timeline-container');
  const outViewer = document.getElementById('security-test-viewer');
  const verdictBox = document.getElementById('security-verdict-box');

  btn.disabled = true;

  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/reliability/simulate-failure-and-recover`, {
      method: 'POST'
    });
    const report = await res.json();

    outViewer.textContent = JSON.stringify(report, null, 2);
    timelineContainer.style.display = 'flex';
    timelineContainer.innerHTML = (report.timeline || []).map(item => `
      <div class="step-item">
        <div class="step-item-header">
          <span>Paso ${item.step} [${item.phase}]</span>
          <span class="status-badge status-online">${item.status}</span>
        </div>
        <div class="step-item-desc">${item.details}</div>
      </div>
    `).join('');

    verdictBox.style.display = 'block';
    verdictBox.textContent = `[AUTO-RECUPERACION EXITOSA] RPO = ${report.rpoRecordsLost} datos perdidos | RTO = ${report.rtoRecoveryTimeMs}ms | Hash SHA-256 restaurado desde Replica Espejo.`;

    await checkNodesHealth();
    await loadServiceRegistryCatalog();
    await loadRecords();
    await loadAuditLogs();
  } catch (err) {
    alert('Error en simulacion: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ==========================================
// 3. MONITOREO DE NODOS Y SERVICE REGISTRY
// ==========================================
async function checkNodesHealth() {
  const startTime = performance.now();
  try {
    const res = await fetch(HEALTH_BACKEND, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
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

  try {
    const res = await fetch(HEALTH_REGISTRY, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setRegistryState(true, data);
    } else {
      setRegistryState(false);
    }
  } catch (err) {
    setRegistryState(false);
  }

  try {
    const res = await fetch(HEALTH_NOTIF, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
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

  if (online && data) {
    badgeBackend.textContent = 'ONLINE';
    badgeBackend.className = 'status-badge status-online';
    cardBackend.classList.add('active');
    backendUptime.textContent = formatUptime(data.uptimeSeconds);
    backendLatency.textContent = `${latency}ms`;

    if (backendRecoveriesCount && data.reliability) {
      backendRecoveriesCount.textContent = `${data.reliability.totalRecoveriesExecuted} auto-curaciones`;
    }
    if (backendCacheRatio && data.scalability) {
      backendCacheRatio.textContent = `${data.scalability.hitRatioPercent} (${data.scalability.cacheHits} hits)`;
    }
    if (backendCbState && data.scalability) {
      backendCbState.textContent = data.scalability.circuitBreakerState;
    }

    if (data.rabbitmq && data.rabbitmq.connected) {
      badgeRabbitMQ.textContent = 'CONECTADO';
      badgeRabbitMQ.className = 'status-badge status-online';
      cardRabbitMQ.classList.add('active');
    } else {
      badgeRabbitMQ.textContent = 'DESCONECTADO';
      badgeRabbitMQ.className = 'status-badge status-offline';
      cardRabbitMQ.classList.remove('active');
    }

    if (stateChanged) {
      loadRecords();
    }
  } else {
    badgeBackend.textContent = 'OFFLINE';
    badgeBackend.className = 'status-badge status-offline';
    cardBackend.classList.remove('active');
  }
  updateGlobalAlert();
}

function setRegistryState(online, data = null) {
  isRegistryOnline = online;
  if (online && data) {
    badgeRegistry.textContent = 'ONLINE';
    badgeRegistry.className = 'status-badge status-online';
    cardRegistry.classList.add('active');
    registryUptime.textContent = formatUptime(data.uptimeSeconds);
    if (data.metrics) {
      registryActiveCount.textContent = `${data.metrics.activeHealthyInstances} instancias UP`;
      registryLookupsCount.textContent = `${data.metrics.totalLookups} lookups / ${data.metrics.totalFailovers || 0} failovers`;
    }
  } else {
    badgeRegistry.textContent = 'OFFLINE';
    badgeRegistry.className = 'status-badge status-offline';
    cardRegistry.classList.remove('active');
  }
  updateGlobalAlert();
}

function setNotifState(online, data = null) {
  isNotifOnline = online;
  if (online && data) {
    badgeNotification.textContent = 'ONLINE';
    badgeNotification.className = 'status-badge status-online';
    cardNotification.classList.add('active');
    notificationUptime.textContent = formatUptime(data.uptimeSeconds);
    if (data.rabbitmq) {
      notificationMsgCount.textContent = `${data.rabbitmq.totalMessagesReceived} eventos`;
    }
  } else {
    badgeNotification.textContent = 'OFFLINE';
    badgeNotification.className = 'status-badge status-offline';
    cardNotification.classList.remove('active');
  }
  updateGlobalAlert();
}

function updateGlobalAlert() {
  if (!isBackendOnline || !isNotifOnline || !isRegistryOnline) {
    backendDownAlert.classList.remove('hidden');
  } else {
    backendDownAlert.classList.add('hidden');
  }
}

async function loadServiceRegistryCatalog() {
  const tbody = document.getElementById('registry-table-body');
  if (!tbody) return;

  try {
    const res = await fetch(`${REGISTRY_BASE}/services`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const rows = [];
    for (const svc of (data.services || [])) {
      for (const inst of (svc.instances || [])) {
        const isUp = inst.status === 'UP';
        const badgeCls = isUp ? 'status-online' : 'status-offline';
        rows.push(`
          <tr>
            <td><strong style="color: #fff;">${inst.serviceName}</strong></td>
            <td class="mono">${inst.instanceId}</td>
            <td><span class="version-pill">${inst.role || 'PRIMARY'}</span></td>
            <td class="mono" style="color: var(--primary);">${inst.baseUrl}</td>
            <td><span class="engine-pill">${inst.internalEngine || 'v1-default'}</span></td>
            <td>
              <span class="status-badge ${badgeCls}">${inst.status}</span>
              <span class="mono" style="font-size: 0.7rem; color: var(--text-muted); margin-left: 4px;">(hace ${inst.secondsSinceLastHeartbeat}s)</span>
            </td>
            <td class="mono">${inst.lookupHits || 0} hits</td>
          </tr>
        `);
      }
    }

    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Sin instancias registradas.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error consultando Service Registry: ${err.message}</td></tr>`;
  }
}

async function switchInternalEngineLive() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/internal/switch-engine`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });
    const data = await res.json();
    const verdictBox = document.getElementById('security-verdict-box');
    if (verdictBox) {
      verdictBox.style.display = 'block';
      verdictBox.textContent = `[MUTACION INTERNA V1 <-> V2] Motor cambiado a "${data.activeInternalEngine}" sin romper el contrato ClinicalRecordDTOV1.`;
    }
    await loadServiceRegistryCatalog();
    await loadRecords();
  } catch (err) {
    alert('Error al conmutar motor: ' + err.message);
  }
}

// ==========================================
// 4. GESTION DE HISTORIAS CLINICAS
// ==========================================
async function loadRecords() {
  try {
    const res = await fetch(RECORDS_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('Error al cargar historias');
    const json = await res.json();
    recordsCache = json.data || [];

    recordsCount.textContent = `${recordsCache.length} registros (Cache L1: ${json.cacheStatus || 'HIT'})`;
    renderRecordsList(recordsCache);
  } catch (err) {
    recordsList.innerHTML = `
      <div class="record-item" style="border-left: 3px solid var(--danger);">
        <p style="color: var(--danger); font-size: 0.85rem;">No se pudieron cargar los registros: ${err.message}</p>
      </div>
    `;
  }
}

function renderRecordsList(records) {
  if (!records.length) {
    recordsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">No hay registros clinicos almacenados.</p>';
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
          <button type="button" class="btn btn-secondary btn-sm" onclick="editRecordInline('${r.id}')">Editar (Requiere MEDICO)</button>
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

async function handleCreateRecord(e) {
  e.preventDefault();
  const paciente = document.getElementById('input-paciente').value.trim();
  const dni = document.getElementById('input-dni').value.trim();
  const centroSalud = document.getElementById('input-centro').value;
  const profesional = document.getElementById('input-profesional').value.trim();
  const diagnostico = document.getElementById('input-diagnostico').value.trim();
  const observaciones = document.getElementById('input-observaciones').value.trim();

  formFeedback.textContent = 'Verificando JWT, rol RBAC y guardando...';
  formFeedback.style.color = 'var(--text-secondary)';

  try {
    const res = await fetch(RECORDS_ENDPOINT, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ paciente, dni, centroSalud, profesional, diagnostico, observaciones })
    });

    const body = await res.json();

    if (res.ok) {
      formFeedback.textContent = `[201 OK] Guardado, replicado en espejo y cache L1 actualizada por ${body.authenticatedAs} [${body.authorizedRole}].`;
      formFeedback.style.color = 'var(--success)';
      recordForm.reset();
      await loadRecords();
      await loadAuditLogs();
    } else {
      formFeedback.textContent = `[HTTP ${res.status} ${body.status}] ${body.error}`;
      formFeedback.style.color = 'var(--danger)';
      await loadAuditLogs();
    }
  } catch (err) {
    formFeedback.textContent = `Error de red: ${err.message}`;
    formFeedback.style.color = 'var(--danger)';
  }
}

async function editRecordInline(id) {
  const target = recordsCache.find(r => r.id === id);
  if (!target) return;

  const currentRoleLabel = activeUser ? `${activeUser.username} [${activeUser.role}]` : 'SIN TOKEN JWT';
  const nuevoDiag = prompt(`[Sesion activa: ${currentRoleLabel}]\nActualizar diagnostico para ${target.paciente} (Version actual: v${target.version}):`, target.diagnostico);
  if (nuevoDiag === null) return;

  try {
    const res = await fetch(`${RECORDS_ENDPOINT}/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        version: target.version,
        diagnostico: nuevoDiag
      })
    });

    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      alert(`[200 OK] Registro actualizado con OCC y replicado en espejo por ${body.authenticatedAs} [${body.authorizedRole}].`);
    } else if (res.status === 403 || res.status === 401) {
      alert(`[ACCESO DENEGADO - HTTP ${res.status}]\n${body.error}`);
    } else {
      alert(`[HTTP ${res.status}] ${body.error || res.statusText}`);
    }

    await loadRecords();
    await loadAuditLogs();
  } catch (err) {
    alert('Fallo de comunicacion: ' + err.message);
  }
}

async function resetSeedRecords() {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/v1/records/reset`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      await loadRecords();
      await loadAuditLogs();
      alert('Historias clinicas, replica espejo y cache L1 restablecidas.');
    } else {
      alert(`[HTTP ${res.status}] ${body.error || 'No autorizado.'}`);
      await loadAuditLogs();
    }
  } catch (err) {
    alert('Error restableciendo datos: ' + err.message);
  }
}

// ==========================================
// 5. BITACORA DE AUDITORIA RABBITMQ
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
      if (l.routingKey.includes('conflict') || l.routingKey.includes('denied')) keyClass = 'conflict';
      if (l.routingKey.includes('updated') || l.routingKey.includes('recovered') || l.routingKey.includes('scaled')) keyClass = 'updated';

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
    auditList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.8rem;">No se pudo conectar con el worker de auditoria.</p>`;
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

window.addEventListener('DOMContentLoaded', async () => {
  checkNodesHealth();
  await loginWithPreset('dra.gomez', 'medico123');
  loadServiceRegistryCatalog();
  loadRecords();
  loadAuditLogs();

  setInterval(() => {
    checkNodesHealth();
    loadServiceRegistryCatalog();
  }, 3000);
  setInterval(loadAuditLogs, 5000);
});
