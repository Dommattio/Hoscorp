const express = require('express');
const cors = require('cors');
const os = require('os');
const crypto = require('crypto');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5001;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-notification-service';
const SERVICE_NAME = 'notification-service';
const INSTANCE_ID = process.env.INSTANCE_ID || 'notification-service-node-01';
const SERVICE_HOST = process.env.SERVICE_HOST || 'localhost';
const SERVICE_REGISTRY_URL = process.env.SERVICE_REGISTRY_URL || 'http://localhost:5002';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const EXCHANGE_NAME = 'hoscorp.events';
const QUEUE_NAME = 'hoscorp.notifications.queue';
const ROUTING_PATTERN = 'clinical.#';
const CONTRACT_VERSION = '1.0.0';

// ====================================================
// MOTOR INTERNO INTERCAMBIABLE (ADAPTER / DTO PATTERN)
// ====================================================
// Permite demostrar que el servicio puede cambiar su estructura y logica interna
// sin romper el contrato publico hacia los demas componentes.
let internalEngineMode = 'v1-memory-ring-buffer'; // o 'v2-structured-compliance-vault'

// Almacenamiento Interno Motor V1 (Arreglo plano)
const internalLogsV1 = [];
// Almacenamiento Interno Motor V2 (Mapa estructurado ISO-27799 con hashes SHA-256)
const internalVaultV2 = new Map();

const MAX_LOGS = 100;

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

// Funcion de almacenamiento interno desacoplada del contrato
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
    actionDescription = `Creacion de nueva historia clinica (ID: ${payload.recordId})`;
    simulatedAction = `[NOTIFICACION DISPARADA] Email de confirmacion enviado al paciente ${payload.paciente}.`;
    isoSeverity = 'NORMAL_CLINICAL_ENTRY';
  } else if (routingKey === 'clinical.record.updated') {
    actionDescription = `Actualizacion exitosa con OCC a version ${payload.newVersion} (ID: ${payload.recordId})`;
    simulatedAction = `[NOTIFICACION DISPARADA] Alerta enviada al portal del paciente y registro en bitacora medica.`;
    isoSeverity = 'AUDIT_MODIFICATION';
  } else if (routingKey === 'clinical.record.conflict') {
    actionDescription = `Conflicto de concurrencia detectado (ID: ${payload.recordId})`;
    simulatedAction = `[ALERTA DE SEGURIDAD] Intento de sobreescritura evitado. Version esperada ${payload.expectedVersion} vs recibida ${payload.receivedVersion}.`;
    isoSeverity = 'CRITICAL_CONCURRENCY_ALERT';
  } else {
    actionDescription = `Evento recibido: ${routingKey}`;
    simulatedAction = `Procesamiento generico en background completado.`;
  }

  // Guardar en Motor V1 (Plano)
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

  // Guardar en Motor V2 (Estructurado con metadatos de compliance e integridad SHA-256)
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

// ADAPTADOR DE CONTRATO EXPLICITO (Garantiza que la salida siempre respete el esquema OpenAPI v1.0.0)
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
    // Adaptador desde el Motor V2 (Vault Estructurado) hacia el DTO de Contrato V1
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

// ====================================================
// AUTO-REGISTRO Y HEARTBEAT EN SERVICE REGISTRY
// ====================================================
async function registerWithServiceDiscovery() {
  const registrationPayload = {
    serviceName: SERVICE_NAME,
    instanceId: INSTANCE_ID,
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

  try {
    const res = await fetch(`${SERVICE_REGISTRY_URL}/api/v1/registry/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationPayload),
      signal: AbortSignal.timeout(3000)
    });

    if (res.ok) {
      registryRegistered = true;
      console.log(`[SERVICE-DISCOVERY] Auto-registrado exitosamente en ${SERVICE_REGISTRY_URL} como "${SERVICE_NAME}" (${INSTANCE_ID}).`);
    } else {
      registryRegistered = false;
      console.warn(`[SERVICE-DISCOVERY] Respuesta no exitosa al registrar: HTTP ${res.status}`);
    }
  } catch (err) {
    registryRegistered = false;
    console.warn(`[SERVICE-DISCOVERY] No se pudo contactar al Service Registry (${err.message}). Se reintentara en el proximo ciclo.`);
  }
}

async function sendDiscoveryHeartbeat() {
  if (!registryRegistered) {
    return registerWithServiceDiscovery();
  }

  try {
    const res = await fetch(`${SERVICE_REGISTRY_URL}/api/v1/registry/heartbeat/${SERVICE_NAME}/${INSTANCE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalEngine: internalEngineMode }),
      signal: AbortSignal.timeout(2500)
    });

    if (res.status === 404) {
      registryRegistered = false;
      await registerWithServiceDiscovery();
    } else if (res.ok) {
      registryRegistered = true;
    }
  } catch (err) {
    registryRegistered = false;
  }
}

// ====================================================
// CANAL ASINCRONO: CONSUMIDOR RABBITMQ
// ====================================================
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
    await mqChannel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_PATTERN);
    await mqChannel.prefetch(10);

    mqConnected = true;
    console.log(`[RABBITMQ-CONSUMER] Conectado y escuchando cola "${QUEUE_NAME}".`);

    mqChannel.consume(QUEUE_NAME, (msg) => {
      if (!msg) return;
      try {
        const eventData = JSON.parse(msg.content.toString());
        totalMessagesReceived++;
        storeAuditEventInternally(eventData);
        mqChannel.ack(msg);
      } catch (err) {
        console.error('[RABBITMQ-CONSUMER] Error procesando mensaje:', err.message);
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

// ====================================================
// CONTRATO FORMAL OPENAPI 3.0.3 DE NOTIFICACIONES
// ====================================================
const NOTIFICATION_OPENAPI_CONTRACT = {
  openapi: '3.0.3',
  info: {
    title: 'Hoscorp Notification & Clinical Audit Service API',
    version: CONTRACT_VERSION,
    description: 'Contrato explicito de interfaz REST del microservicio de Notificaciones y Auditoria Clinica. Permite validar la disponibilidad de auditoria de manera sincrona y consultar los eventos clinicos procesados asincronamente, garantizando independencia respecto del motor de almacenamiento interno (v1 Ring Buffer vs v2 Compliance Vault).'
  },
  servers: [
    { url: 'http://localhost:5001', description: 'Acceso local directo' },
    { url: 'http://notification-service:5001', description: 'Endpoint descubierto via Service Registry' }
  ],
  paths: {
    '/api/v1/validate-audit': {
      get: {
        summary: 'Validar sincronamente la disponibilidad de auditoria para un registro clinico',
        parameters: [
          {
            name: 'recordId',
            in: 'query',
            required: true,
            schema: { type: 'string', example: 'rec-1001' },
            description: 'Identificador del registro clinico a auditar'
          }
        ],
        responses: {
          '200': {
            description: 'Conformidad del contrato de validacion de auditoria',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditValidationResponseV1' }
              }
            }
          },
          '400': {
            description: 'Violacion de contrato: Parametro recordId ausente o invalido'
          }
        }
      }
    },
    '/api/v1/audit-logs': {
      get: {
        summary: 'Obtener listado de eventos de auditoria bajo esquema de contrato V1',
        responses: {
          '200': {
            description: 'Lista de eventos normalizados al DTO de contrato publico',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditLogListResponseV1' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      AuditValidationResponseV1: {
        type: 'object',
        required: ['contractVersion', 'status', 'service', 'instanceId', 'recordId', 'timestamp', 'auditReady', 'message'],
        properties: {
          contractVersion: { type: 'string', example: '1.0.0' },
          status: { type: 'string', enum: ['VALIDATED'] },
          service: { type: 'string', example: 'hoscorp-notification-service' },
          instanceId: { type: 'string', example: 'notification-service-node-01' },
          recordId: { type: 'string', example: 'rec-1001' },
          timestamp: { type: 'string', format: 'date-time' },
          auditReady: { type: 'boolean', example: true },
          internalEngineActive: { type: 'string' },
          message: { type: 'string' }
        }
      },
      AuditLogEntryV1: {
        type: 'object',
        required: ['id', 'eventId', 'routingKey', 'sourceNode', 'eventTimestamp', 'consumedAt', 'actionDescription', 'simulatedAction', 'payload'],
        properties: {
          id: { type: 'string' },
          eventId: { type: 'string' },
          routingKey: { type: 'string' },
          sourceNode: { type: 'string' },
          eventTimestamp: { type: 'string', format: 'date-time' },
          consumedAt: { type: 'string', format: 'date-time' },
          actionDescription: { type: 'string' },
          simulatedAction: { type: 'string' },
          payload: { type: 'object' }
        }
      },
      AuditLogListResponseV1: {
        type: 'object',
        required: ['contractVersion', 'node', 'totalCount', 'channel', 'logs'],
        properties: {
          contractVersion: { type: 'string', example: '1.0.0' },
          node: { type: 'string' },
          totalCount: { type: 'integer' },
          channel: { type: 'string' },
          logs: {
            type: 'array',
            items: { $ref: '#/components/schemas/AuditLogEntryV1' }
          }
        }
      }
    }
  }
};

// ====================================================
// ENDPOINTS HTTP REST (CONTRATO EXPLICITO V1)
// ====================================================

// 1. Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: SERVICE_NAME,
    instanceId: INSTANCE_ID,
    role: 'Consumidor Asincrono de Eventos y Servicio de Auditoria',
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

// 2. Contrato Formal OpenAPI 3.0
app.get(['/api/v1/contract', '/api/contract', '/api/notifications/contract'], (req, res) => {
  res.status(200).json(NOTIFICATION_OPENAPI_CONTRACT);
});

// 3. Validacion Sincrona Inter-Servicio (Con verificacion estricta de contrato)
app.get(['/api/v1/validate-audit', '/api/validate-audit'], (req, res) => {
  const { recordId } = req.query;

  // Si se solicita validacion estricta y falta recordId, rechazar por violacion de contrato
  if (!recordId || String(recordId).trim() === '') {
    return res.status(400).json({
      status: 'CONTRACT_VIOLATION',
      code: 400,
      contract: 'AuditValidationResponseV1 (OpenAPI 3.0)',
      error: 'Violacion de contrato: El parametro de consulta "recordId" es obligatorio.'
    });
  }

  // Respuesta garantizada por el Adaptador de Contrato V1 independientemente del motor interno
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    status: 'VALIDATED',
    service: NODE_NAME,
    instanceId: INSTANCE_ID,
    recordId: String(recordId),
    timestamp: new Date().toISOString(),
    auditReady: true,
    internalEngineActive: internalEngineMode,
    message: `Contrato AuditValidationResponseV1 verificado exitosamente por instancia ${INSTANCE_ID} (Motor interno: ${internalEngineMode}).`
  });
});

// 4. Consulta de Bitacora de Auditoria (Normalizada al DTO de Contrato V1)
app.get(['/api/v1/audit-logs', '/api/audit-logs'], (req, res) => {
  const logsDTO = getContractCompliantAuditLogs();
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    node: NODE_NAME,
    instanceId: INSTANCE_ID,
    internalEngineActive: internalEngineMode,
    totalCount: logsDTO.length,
    channel: 'Asincrono (RabbitMQ Topic Exchange -> Worker Adapter V1)',
    logs: logsDTO
  });
});

// 5. Limpiar bitacora
app.delete(['/api/v1/audit-logs', '/api/audit-logs'], (req, res) => {
  internalLogsV1.length = 0;
  internalVaultV2.clear();
  totalMessagesReceived = 0;
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    message: 'Bitacora de auditoria reiniciada correctamente en ambos motores internos.',
    currentCount: 0
  });
});

// 6. Conmutar motor interno (Demostracion de cambio interno sin romper contrato externo)
app.post(['/api/v1/internal/switch-engine', '/api/internal/switch-engine'], (req, res) => {
  const previousEngine = internalEngineMode;
  if (req.body && req.body.targetEngine) {
    internalEngineMode = req.body.targetEngine;
  } else {
    internalEngineMode = internalEngineMode === 'v1-memory-ring-buffer'
      ? 'v2-structured-compliance-vault'
      : 'v1-memory-ring-buffer';
  }

  sendDiscoveryHeartbeat();

  const sampleInternalRaw = internalEngineMode === 'v1-memory-ring-buffer'
    ? (internalLogsV1[0] || { info: 'Sin eventos aun en buffer plano v1' })
    : (Array.from(internalVaultV2.values()).pop() || { info: 'Sin eventos aun en vault ISO-27799 v2' });

  const samplePublicContractDTO = getContractCompliantAuditLogs()[0] || null;

  res.status(200).json({
    status: 'INTERNAL_ENGINE_SWITCHED',
    service: SERVICE_NAME,
    previousEngine,
    activeInternalEngine: internalEngineMode,
    contractBroken: false,
    publicContractVersion: CONTRACT_VERSION,
    sampleInternalRepresentation: sampleInternalRaw,
    samplePublicContractDTO
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO NOTIFICACIONES Y AUDITORIA] Escuchando en puerto ${PORT}`);
  console.log(`[PID: ${process.pid}] [HOST: ${os.hostname()}]`);
  console.log(`=======================================================`);

  connectAndConsume();
  setTimeout(registerWithServiceDiscovery, 1500);
  setInterval(sendDiscoveryHeartbeat, 5000);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
