const express = require('express');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5001;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-notification-service';
const SERVICE_NAME = 'notification-service';
const PRIMARY_INSTANCE_ID = process.env.INSTANCE_ID || 'notification-service-primary-01';
const REPLICA_INSTANCE_ID = 'notification-service-replica-02';
const SERVICE_HOST = process.env.SERVICE_HOST || 'localhost';
const SERVICE_REGISTRY_URL = process.env.SERVICE_REGISTRY_URL || 'http://localhost:5002';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const EXCHANGE_NAME = 'hoscorp.events';
const QUEUE_NAME = 'hoscorp.notifications.queue';
const ROUTING_PATTERNS = ['clinical.#', 'security.#', 'reliability.#', 'scalability.#'];
const CONTRACT_VERSION = '1.0.0';

let internalEngineMode = 'v1-memory-ring-buffer';

const internalLogsV1 = [];
const internalVaultV2 = new Map();
const MAX_LOGS = 140;

let mqConnection = null;
let mqChannel = null;
let mqConnected = false;
let mqReconnectTimeout = null;
let totalMessagesReceived = 0;
let registryRegistered = false;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [NODO: ${NODE_NAME}] [ENGINE: ${internalEngineMode}] ${req.method} ${req.url}`);
  next();
});

function storeAuditEventInternally(rawEvent) {
  const id = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const eventId = rawEvent.eventId || 'evt-unknown';
  const routingKey = rawEvent.routingKey || 'clinical.unknown';
  const sourceNode = rawEvent.sourceNode || 'backend-clinical';
  const eventTimestamp = rawEvent.timestamp || new Date().toISOString();
  const consumedAt = new Date().toISOString();
  const payload = rawEvent.payload || {};

  let actionDescription = '';
  let simulatedAction = '';
  let isoSeverity = 'INFO';

  if (routingKey === 'clinical.record.created') {
    actionDescription = `Creacion de historia clinica (ID: ${payload.recordId}) por ${payload.createdBy || 'Profesional'}`;
    simulatedAction = `[NOTIFICACION] Email cifrado enviado al paciente ${payload.paciente} e invalidacion de cache L1.`;
    isoSeverity = 'NORMAL_CLINICAL_ENTRY';
  } else if (routingKey === 'clinical.record.updated') {
    actionDescription = `Actualizacion OCC a version ${payload.newVersion} (ID: ${payload.recordId})`;
    simulatedAction = `[AUDITORIA] Modificacion firmada por ${payload.updatedBy || 'Profesional'} asentada en bitacora.`;
    isoSeverity = 'AUDIT_MODIFICATION';
  } else if (routingKey === 'clinical.record.conflict') {
    actionDescription = `Conflicto de concurrencia OCC detectado (ID: ${payload.recordId})`;
    simulatedAction = `[ALERTA CONCURRENCIA] Intento de sobreescritura prevenido (Version esperada ${payload.expectedVersion} vs recibida ${payload.receivedVersion}).`;
    isoSeverity = 'CRITICAL_CONCURRENCY_ALERT';
  } else if (routingKey === 'security.auth.login') {
    actionDescription = `Inicio de sesion autenticado con JWT: ${payload.username} [Rol: ${payload.role}]`;
    simulatedAction = `[SEGURIDAD] Token JWT HMAC-SHA256 emitido y registrado en auditoria de accesos.`;
    isoSeverity = 'SECURITY_AUTH_SUCCESS';
  } else if (routingKey === 'security.rbac.denied') {
    actionDescription = `Acceso DENEGADO por RBAC (HTTP 403) a usuario "${payload.username}" [Rol: ${payload.role}]`;
    simulatedAction = `[ALERTA DE SEGURIDAD] Intento bloqueado sobre "${payload.attemptedAction}". Se requerian roles: ${(payload.requiredRoles || []).join(', ')}.`;
    isoSeverity = 'CRITICAL_SECURITY_VIOLATION';
  } else if (routingKey === 'reliability.storage.recovered') {
    actionDescription = `Auto-Recuperacion ante Fallo ejecutada exitosamente (${payload.recoveryTimeMs}ms)`;
    simulatedAction = `[CONFIABILIDAD / SELF-HEALING] Almacen primario restaurado desde Replica Espejo verificada con SHA-256 (${payload.recordsRestored} registros, RPO=0).`;
    isoSeverity = 'RELIABILITY_RECOVERY';
  } else if (routingKey === 'scalability.cluster.scaled') {
    actionDescription = `Escalado Horizontal Dinamico ejecutado: ${payload.activeInstancesCount} instancias en pool`;
    simulatedAction = `[ESCALABILIDAD] Balanceador Round-Robin actualizado para distribuir carga entre ${payload.activeInstancesCount} nodos.`;
    isoSeverity = 'SCALABILITY_EVENT';
  } else {
    actionDescription = `Evento distribuido recibido: ${routingKey}`;
    simulatedAction = `Procesado en segundo plano por worker de auditoria.`;
  }

  internalLogsV1.unshift({
    id,
    eventId,
    routingKey,
    sourceNode,
    eventTimestamp,
    consumedAt,
    actionDescription,
    simulatedAction,
    payload
  });
  if (internalLogsV1.length > MAX_LOGS) internalLogsV1.pop();

  const integrityHash = crypto
    .createHash('sha256')
    .update(`${id}:${eventId}:${routingKey}:${JSON.stringify(payload)}`)
    .digest('hex');

  internalVaultV2.set(id, {
    vault_record_uid: id,
    compliance_standard: 'ISO/IEC-27799-Health-Informatics',
    severity_classification: isoSeverity,
    sha256_signature: integrityHash,
    envelope: {
      origin_event_id: eventId,
      amqp_topic: routingKey,
      producer_service: sourceNode,
      emitted_epoch_ms: new Date(eventTimestamp).getTime(),
      ingested_epoch_ms: new Date(consumedAt).getTime()
    },
    audit_narrative: {
      summary_es: actionDescription,
      dispatch_outcome: simulatedAction
    },
    clinical_context_snapshot: payload
  });
}

function getContractCompliantAuditLogs() {
  if (internalEngineMode === 'v1-memory-ring-buffer') {
    return internalLogsV1.map(entry => ({
      id: String(entry.id),
      eventId: String(entry.eventId),
      routingKey: String(entry.routingKey),
      sourceNode: String(entry.sourceNode),
      eventTimestamp: String(entry.eventTimestamp),
      consumedAt: String(entry.consumedAt),
      actionDescription: String(entry.actionDescription),
      simulatedAction: String(entry.simulatedAction),
      payload: entry.payload || {}
    }));
  } else {
    const entries = Array.from(internalVaultV2.values()).reverse();
    return entries.map(vaultItem => ({
      id: String(vaultItem.vault_record_uid),
      eventId: String(vaultItem.envelope.origin_event_id),
      routingKey: String(vaultItem.envelope.amqp_topic),
      sourceNode: String(vaultItem.envelope.producer_service),
      eventTimestamp: new Date(vaultItem.envelope.emitted_epoch_ms).toISOString(),
      consumedAt: new Date(vaultItem.envelope.ingested_epoch_ms).toISOString(),
      actionDescription: String(vaultItem.audit_narrative.summary_es),
      simulatedAction: String(vaultItem.audit_narrative.dispatch_outcome),
      payload: vaultItem.clinical_context_snapshot || {}
    }));
  }
}

async function registerWithServiceDiscovery() {
  const instancesToRegister = [
    { instanceId: PRIMARY_INSTANCE_ID, role: 'PRIMARY' },
    { instanceId: REPLICA_INSTANCE_ID, role: 'REPLICA_STANDBY' }
  ];

  try {
    for (const inst of instancesToRegister) {
      const payload = {
        serviceName: SERVICE_NAME,
        instanceId: inst.instanceId,
        role: inst.role,
        host: SERVICE_HOST,
        port: Number(PORT),
        protocol: 'http',
        contractVersion: CONTRACT_VERSION,
        healthCheckUrl: `http://${SERVICE_HOST}:${PORT}/health`,
        contractUrl: `http://${SERVICE_HOST}:${PORT}/api/v1/contract`,
        internalEngine: internalEngineMode,
        endpoints: {
          validateAudit: '/api/v1/validate-audit',
          auditLogs: '/api/v1/audit-logs',
          contract: '/api/v1/contract'
        },
        ttlSeconds: 18
      };

      const res = await fetch(`${SERVICE_REGISTRY_URL}/api/v1/registry/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) registryRegistered = true;
    }
  } catch (err) {
    registryRegistered = false;
  }
}

async function sendDiscoveryHeartbeat() {
  if (!registryRegistered) {
    return registerWithServiceDiscovery();
  }

  for (const instId of [PRIMARY_INSTANCE_ID, REPLICA_INSTANCE_ID]) {
    try {
      const res = await fetch(`${SERVICE_REGISTRY_URL}/api/v1/registry/heartbeat/${SERVICE_NAME}/${instId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalEngine: internalEngineMode }),
        signal: AbortSignal.timeout(2500)
      });
      if (res.status === 404) {
        registryRegistered = false;
        await registerWithServiceDiscovery();
      }
    } catch (err) {
      registryRegistered = false;
    }
  }
}

async function connectAndConsume() {
  if (mqReconnectTimeout) {
    clearTimeout(mqReconnectTimeout);
    mqReconnectTimeout = null;
  }

  try {
    mqConnection = await amqp.connect(RABBITMQ_URL);
    mqChannel = await mqConnection.createChannel();

    await mqChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    const q = await mqChannel.assertQueue(QUEUE_NAME, { durable: true });
    for (const pattern of ROUTING_PATTERNS) {
      await mqChannel.bindQueue(q.queue, EXCHANGE_NAME, pattern);
    }
    await mqChannel.prefetch(10);

    mqConnected = true;

    mqChannel.consume(QUEUE_NAME, (msg) => {
      if (!msg) return;
      try {
        const eventData = JSON.parse(msg.content.toString());
        totalMessagesReceived++;
        storeAuditEventInternally(eventData);
        mqChannel.ack(msg);
      } catch (err) {
        mqChannel.nack(msg, false, false);
      }
    });

    mqConnection.on('error', () => { mqConnected = false; });
    mqConnection.on('close', () => {
      mqConnected = false;
      mqReconnectTimeout = setTimeout(connectAndConsume, 4000);
    });
  } catch (err) {
    mqConnected = false;
    mqReconnectTimeout = setTimeout(connectAndConsume, 4000);
  }
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: SERVICE_NAME,
    primaryInstanceId: PRIMARY_INSTANCE_ID,
    replicaInstanceId: REPLICA_INSTANCE_ID,
    role: 'Servicio de Auditoria de Seguridad, Confiabilidad y Escalabilidad',
    contractVersion: CONTRACT_VERSION,
    internalEngine: internalEngineMode,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    pid: process.pid,
    serviceDiscovery: {
      registered: registryRegistered,
      registryUrl: SERVICE_REGISTRY_URL
    },
    rabbitmq: {
      connected: mqConnected,
      queue: QUEUE_NAME,
      exchange: EXCHANGE_NAME,
      totalMessagesReceived
    },
    inMemoryAuditLogsCount: internalLogsV1.length
  });
});

app.get(['/api/v1/contract', '/api/contract', '/api/notifications/contract'], (req, res) => {
  res.status(200).json({
    openapi: '3.0.3',
    info: {
      title: 'Hoscorp Notification & Security Audit Service API (Entrega 6 Final)',
      version: CONTRACT_VERSION
    }
  });
});

app.get(['/api/v1/validate-audit', '/api/validate-audit'], (req, res) => {
  const { recordId, targetInstance } = req.query;

  if (!recordId || String(recordId).trim() === '') {
    return res.status(400).json({
      status: 'CONTRACT_VIOLATION',
      code: 400,
      error: 'Violacion de contrato: El parametro "recordId" es obligatorio.'
    });
  }

  const servedBy = targetInstance || PRIMARY_INSTANCE_ID;

  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    status: 'VALIDATED',
    service: NODE_NAME,
    instanceId: servedBy,
    recordId: String(recordId),
    timestamp: new Date().toISOString(),
    auditReady: true,
    internalEngineActive: internalEngineMode,
    message: `Auditoria validada bajo contrato V1 por instancia ${servedBy} (Motor: ${internalEngineMode}).`
  });
});

app.get(['/api/v1/audit-logs', '/api/audit-logs'], (req, res) => {
  const logsDTO = getContractCompliantAuditLogs();
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    node: NODE_NAME,
    instanceId: PRIMARY_INSTANCE_ID,
    internalEngineActive: internalEngineMode,
    totalCount: logsDTO.length,
    channel: 'Asincrono (RabbitMQ Topic Exchange -> Audit Worker)',
    logs: logsDTO
  });
});

app.delete(['/api/v1/audit-logs', '/api/audit-logs'], (req, res) => {
  internalLogsV1.length = 0;
  internalVaultV2.clear();
  totalMessagesReceived = 0;
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    message: 'Bitacora de auditoria reiniciada correctamente.',
    currentCount: 0
  });
});

app.post(['/api/v1/internal/switch-engine', '/api/internal/switch-engine'], (req, res) => {
  const previousEngine = internalEngineMode;
  internalEngineMode = internalEngineMode === 'v1-memory-ring-buffer'
    ? 'v2-structured-compliance-vault'
    : 'v1-memory-ring-buffer';

  sendDiscoveryHeartbeat();

  res.status(200).json({
    status: 'INTERNAL_ENGINE_SWITCHED',
    service: SERVICE_NAME,
    previousEngine,
    activeInternalEngine: internalEngineMode,
    contractBroken: false
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO NOTIFICACIONES Y AUDITORIA] Escuchando en puerto ${PORT}`);
  console.log(`=======================================================`);

  connectAndConsume();
  setTimeout(registerWithServiceDiscovery, 1500);
  setInterval(sendDiscoveryHeartbeat, 5000);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
