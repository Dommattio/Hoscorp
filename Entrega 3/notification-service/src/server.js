const express = require('express');
const cors = require('cors');
const os = require('os');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5001;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-notification-service';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const EXCHANGE_NAME = 'hoscorp.events';
const QUEUE_NAME = 'hoscorp.notifications.queue';
const ROUTING_PATTERN = 'clinical.#';

// Buffer en memoria de eventos auditados recibidos por cola de mensajes
const auditLogs = [];
const MAX_LOGS = 100;

// Estado de conexion RabbitMQ
let mqConnection = null;
let mqChannel = null;
let mqConnected = false;
let mqReconnectTimeout = null;
let totalMessagesReceived = 0;

// Middleware
app.use(cors());
app.use(express.json());

// Logger de peticiones HTTP
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [NODO: ${NODE_NAME}] [PID: ${process.pid}] ${req.method} ${req.url}`);
  next();
});

// ==========================================
// CANAL ASINCRONO: CONSUMIDOR RABBITMQ
// ==========================================
async function connectAndConsume() {
  if (mqReconnectTimeout) {
    clearTimeout(mqReconnectTimeout);
    mqReconnectTimeout = null;
  }

  try {
    console.log(`[RABBITMQ-CONSUMER] Conectando a broker en ${RABBITMQ_URL}...`);
    mqConnection = await amqp.connect(RABBITMQ_URL);
    mqChannel = await mqConnection.createChannel();

    // Declarar Exchange y Cola durable
    await mqChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    const q = await mqChannel.assertQueue(QUEUE_NAME, { durable: true });
    await mqChannel.bindQueue(q.queue, EXCHANGE_NAME, ROUTING_PATTERN);

    // Limitar prefetch a 10 mensajes concurrentes
    await mqChannel.prefetch(10);

    mqConnected = true;
    console.log(`[RABBITMQ-CONSUMER] Conectado exitosamente.`);
    console.log(`[RABBITMQ-CONSUMER] Escuchando cola "${QUEUE_NAME}" vinculada a exchange "${EXCHANGE_NAME}" con patron "${ROUTING_PATTERN}".`);

    // Iniciar consumo de mensajes
    mqChannel.consume(QUEUE_NAME, (msg) => {
      if (!msg) return;

      try {
        const rawContent = msg.content.toString();
        const eventData = JSON.parse(rawContent);
        totalMessagesReceived++;

        const receivedAt = new Date().toISOString();
        let actionDescription = '';
        let simulatedAction = '';

        if (eventData.routingKey === 'clinical.record.created') {
          actionDescription = `Creacion de nueva historia clinica (ID: ${eventData.payload?.recordId})`;
          simulatedAction = `[NOTIFICACION DISPARADA] Email de bienvenida y confirmacion enviado al paciente ${eventData.payload?.paciente}.`;
        } else if (eventData.routingKey === 'clinical.record.updated') {
          actionDescription = `Actualizacion exitosa con OCC a version ${eventData.payload?.newVersion} (ID: ${eventData.payload?.recordId})`;
          simulatedAction = `[NOTIFICACION DISPARADA] Alerta enviada al portal del paciente y registro en bitacora medica general.`;
        } else if (eventData.routingKey === 'clinical.record.conflict') {
          actionDescription = `Conflicto de concurrencia detectado (ID: ${eventData.payload?.recordId})`;
          simulatedAction = `[ALERTA DE SEGURIDAD] Notificacion enviada a administracion: intento de sobreescritura evitado. Version esperada ${eventData.payload?.expectedVersion} vs recibida ${eventData.payload?.receivedVersion}.`;
        } else {
          actionDescription = `Evento recibido: ${eventData.routingKey}`;
          simulatedAction = `Procesamiento generico en background completado.`;
        }

        const logEntry = {
          id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          eventId: eventData.eventId || 'desconocido',
          routingKey: eventData.routingKey || msg.fields.routingKey,
          sourceNode: eventData.sourceNode || 'backend-clinical',
          eventTimestamp: eventData.timestamp || receivedAt,
          consumedAt: receivedAt,
          actionDescription,
          simulatedAction,
          payload: eventData.payload
        };

        auditLogs.unshift(logEntry);
        if (auditLogs.length > MAX_LOGS) {
          auditLogs.pop();
        }

        console.log(`[RABBITMQ-CONSUMER] [MENSAJE PROCESADO] RoutingKey: ${logEntry.routingKey} | Accion: ${logEntry.actionDescription}`);

        // Confirmacion (ack) del mensaje
        mqChannel.ack(msg);
      } catch (err) {
        console.error('[RABBITMQ-CONSUMER] Error al parsear mensaje:', err.message);
        // Rechazar sin reencolar si el formato es invalido
        mqChannel.nack(msg, false, false);
      }
    });

    mqConnection.on('error', (err) => {
      console.error('[RABBITMQ-CONSUMER] Error en conexion RabbitMQ:', err.message);
      mqConnected = false;
    });

    mqConnection.on('close', () => {
      console.warn('[RABBITMQ-CONSUMER] Conexion con RabbitMQ cerrada. Reintentando en 4s...');
      mqConnected = false;
      mqReconnectTimeout = setTimeout(connectAndConsume, 4000);
    });

  } catch (err) {
    console.error(`[RABBITMQ-CONSUMER] Fallo al conectar con RabbitMQ (${err.message}). Reintentando en 4s...`);
    mqConnected = false;
    mqReconnectTimeout = setTimeout(connectAndConsume, 4000);
  }
}

// ==========================================
// CANAL SINCRONO: ENDPOINTS HTTP REST
// ==========================================

// 1. Healthcheck del servicio de notificaciones
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: 'notification-service',
    role: 'Consumidor Asincrono de Eventos y Notificaciones',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    pid: process.pid,
    rabbitmq: {
      connected: mqConnected,
      queue: QUEUE_NAME,
      exchange: EXCHANGE_NAME,
      routingPattern: ROUTING_PATTERN,
      totalMessagesReceived
    },
    inMemoryAuditLogsCount: auditLogs.length
  });
});

// 2. Consulta de bitácora de eventos recibidos por el canal asíncrono
app.get('/api/audit-logs', (req, res) => {
  res.status(200).json({
    node: NODE_NAME,
    totalCount: auditLogs.length,
    channel: 'Asincrono (RabbitMQ Topic Exchange -> Worker)',
    logs: auditLogs
  });
});

// 3. Endpoint para validación síncrona inter-servicio
app.get('/api/validate-audit', (req, res) => {
  const { recordId } = req.query;
  res.status(200).json({
    status: 'VALIDATED',
    service: NODE_NAME,
    recordId: recordId || 'N/A',
    timestamp: new Date().toISOString(),
    auditReady: true,
    message: 'Canal sincrono inter-servicio validado correctamente: el servicio de auditoria y notificaciones se encuentra operativo.'
  });
});

// 4. Limpiar bitácora (para reiniciar pruebas)
app.delete('/api/audit-logs', (req, res) => {
  auditLogs.length = 0;
  totalMessagesReceived = 0;
  console.log('[NOTIFICACIONES] Bitacora de auditoria reiniciada.');
  res.status(200).json({
    message: 'Bitacora de auditoria reiniciada correctamente.',
    currentCount: 0
  });
});

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO NOTIFICACIONES Y AUDITORIA] Escuchando en puerto ${PORT}`);
  console.log(`[PID: ${process.pid}] [HOST: ${os.hostname()}]`);
  console.log(`=======================================================`);

  // Iniciar conexion como consumidor de RabbitMQ
  connectAndConsume();
});

// Cierre ordenado
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('[NODO NOTIFICACIONES] Senal recibida. Cerrando conexiones...');
  server.close(async () => {
    if (mqChannel) await mqChannel.close().catch(() => {});
    if (mqConnection) await mqConnection.close().catch(() => {});
    console.log('[NODO NOTIFICACIONES] Servidor HTTP y consumidor cerrados.');
    process.exit(0);
  });
}
