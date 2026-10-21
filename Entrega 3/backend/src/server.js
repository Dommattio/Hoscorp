const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-backend-clinical';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';

const EXCHANGE_NAME = 'hoscorp.events';

// Estado de conexión RabbitMQ
let mqConnection = null;
let mqChannel = null;
let mqConnected = false;
let mqReconnectTimeout = null;

// Middleware
app.use(cors());
app.use(express.json());

// Logger de peticiones HTTP
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [NODO: ${NODE_NAME}] [PID: ${process.pid}] ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// ==========================================
// CANAL ASINCRONO: CONEXION CON RABBITMQ
// ==========================================
async function connectRabbitMQ() {
  if (mqReconnectTimeout) {
    clearTimeout(mqReconnectTimeout);
    mqReconnectTimeout = null;
  }

  try {
    console.log(`[RABBITMQ-ASYNC] Conectando a broker en ${RABBITMQ_URL}...`);
    mqConnection = await amqp.connect(RABBITMQ_URL);
    mqChannel = await mqConnection.createChannel();

    // Declarar Exchange de tipo Topic
    await mqChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    mqConnected = true;
    console.log(`[RABBITMQ-ASYNC] Conexion exitosa. Exchange configurado: "${EXCHANGE_NAME}" (tipo topic).`);

    mqConnection.on('error', (err) => {
      console.error('[RABBITMQ-ASYNC] Error en conexion RabbitMQ:', err.message);
      mqConnected = false;
    });

    mqConnection.on('close', () => {
      console.warn('[RABBITMQ-ASYNC] Conexion con RabbitMQ cerrada. Reintentando en 4 segundos...');
      mqConnected = false;
      mqReconnectTimeout = setTimeout(connectRabbitMQ, 4000);
    });

  } catch (err) {
    console.error(`[RABBITMQ-ASYNC] No se pudo conectar a RabbitMQ (${err.message}). Reintentando en 4s...`);
    mqConnected = false;
    mqReconnectTimeout = setTimeout(connectRabbitMQ, 4000);
  }
}

// Publicador asincrono de eventos
async function publishAsyncEvent(routingKey, payload) {
  const eventMessage = {
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    routingKey,
    timestamp: new Date().toISOString(),
    sourceNode: NODE_NAME,
    payload
  };

  if (!mqConnected || !mqChannel) {
    console.warn(`[RABBITMQ-ASYNC] Mensaje no publicado (broker no conectado aun): ${routingKey}`);
    return false;
  }

  try {
    const buffer = Buffer.from(JSON.stringify(eventMessage));
    mqChannel.publish(EXCHANGE_NAME, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json'
    });
    console.log(`[RABBITMQ-ASYNC] [EVENTO PUBLICADO] RoutingKey: "${routingKey}" | ID: ${eventMessage.eventId}`);
    return true;
  } catch (err) {
    console.error(`[RABBITMQ-ASYNC] Error publicando evento:`, err.message);
    return false;
  }
}

// ==========================================
// PERSISTENCIA DE DATOS CLINICOS
// ==========================================
const SEED_DATA = [
  {
    id: 'rec-1001',
    version: 1,
    paciente: 'Carlos Gomez',
    dni: '32.456.789',
    fecha: '2026-10-10',
    centroSalud: 'Hospital Central de Cordoba',
    profesional: 'Dra. Sofia Albarracin (Mat. 44521)',
    diagnostico: 'Hipertension arterial estadio 1',
    observaciones: 'Control trimestral de presion. Se indica dieta hiposodica y enalapril 10mg.',
    updatedAt: '2026-10-10T14:30:00.000Z'
  },
  {
    id: 'rec-1002',
    version: 1,
    paciente: 'Maria Elena Walsh',
    dni: '28.112.334',
    fecha: '2026-10-12',
    centroSalud: 'Clinica Privada San Lucas',
    profesional: 'Dr. Fernando Morales (Mat. 39820)',
    diagnostico: 'Traumatismo leve de muneca izquierda',
    observaciones: 'Radiografia sin signos de fractura osea. Ferula inmovilizadora por 7 dias.',
    updatedAt: '2026-10-12T09:15:00.000Z'
  },
  {
    id: 'rec-1003',
    version: 1,
    paciente: 'Juan Perez',
    dni: '35.889.012',
    fecha: '2026-10-15',
    centroSalud: 'Centro Medico San Martin',
    profesional: 'Dr. Martin Palermo (Mat. 51203)',
    diagnostico: 'Chequeo clinico preventivo',
    observaciones: 'Valores de laboratorio dentro de rangos normales. Proximo control anual.',
    updatedAt: '2026-10-15T11:00:00.000Z'
  }
];

function loadRecords() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
    saveRecords(SEED_DATA);
    return SEED_DATA;
  } catch (err) {
    console.error('[DATOS] Error leyendo archivo de historias clinicas:', err.message);
    return SEED_DATA;
  }
}

function saveRecords(records) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DATOS] Error guardando archivo de historias clinicas:', err.message);
  }
}

// Inicializar datos si no existen
if (!fs.existsSync(DATA_FILE)) {
  saveRecords(SEED_DATA);
}

// ==========================================
// CANAL SINCRONO: ENDPOINTS HTTP REST
// ==========================================

// 1. Healthcheck del nodo backend
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: 'clinical-records-service',
    role: 'Backend API Clinico Core',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    pid: process.pid,
    rabbitmq: {
      connected: mqConnected,
      url: RABBITMQ_URL.replace(/:\/\/.*@/, '://***:***@'),
      exchange: EXCHANGE_NAME
    },
    notificationServiceUrl: NOTIFICATION_SERVICE_URL
  });
});

// 2. Metadatos de arquitectura, comunicacion y concurrencia
app.get('/api/info', (req, res) => {
  res.status(200).json({
    project: 'Hoscorp - Gestion Unificada de Historias Clinicas',
    course: 'Programacion Distribuida y Componentes',
    group: 'Grupo 2',
    authors: ['Donato Mattio', 'Cristian Carilavi'],
    delivery: 'Entrega 3 - Comunicacion sincrona y asincrona + Resolucion de Concurrencia',
    tag: 'v1-comunicacion',
    communicationChannels: {
      synchronous: {
        type: 'HTTP / REST Directo',
        description: 'Peticiones inmediatas cliente-servidor e inter-servicio bloqueantes hasta recibir respuesta.',
        endpoints: [
          'GET /api/records',
          'GET /api/records/:id',
          'POST /api/records',
          'PUT /api/records/:id (con OCC)',
          'GET /api/records/:id/sync-audit-check (Sincrono inter-servicio)'
        ],
        justification: 'Se utiliza para consultas de lectura en tiempo real y transacciones clinicas donde el usuario o consumidor necesita confirmacion inmediata de consistencia.'
      },
      asynchronous: {
        type: 'RabbitMQ (Message Broker / AMQP)',
        exchange: EXCHANGE_NAME,
        exchangeType: 'topic',
        queues: ['hoscorp.notifications.queue'],
        events: ['clinical.record.created', 'clinical.record.updated', 'clinical.record.conflict'],
        justification: 'Se utiliza para notificaciones a pacientes, bitacora de auditoria y desacoplamiento temporal, evitando bloquear al profesional o al hilo principal durante operaciones lentas o secundarias.'
      }
    },
    concurrencyResolution: {
      mechanism: 'Optimistic Concurrency Control (OCC) con versionado',
      description: 'Deteccion y prevencion de la anomalia Lost Update (actualizacion perdida) cuando dos escrituras ocurren simultaneamente sobre el mismo registro.',
      resolutionStrategy: 'Se compara la version recibida contra la version actual del registro. Si coinciden, se aplica el cambio y se incrementa la version (+1). Si difieren, se rechaza la peticion con HTTP 409 Conflict y se emite un evento asincrono de conflicto.',
      conflictStatusCode: 409
    }
  });
});

// 3. Listar todas las historias clinicas (Canal Sincrono)
app.get('/api/records', (req, res) => {
  const records = loadRecords();
  res.status(200).json({
    node: NODE_NAME,
    count: records.length,
    data: records
  });
});

// 4. Obtener una historia clinica especifica por ID (Canal Sincrono)
app.get('/api/records/:id', (req, res) => {
  const records = loadRecords();
  const record = records.find(r => r.id === req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Registro clinico no encontrado', id: req.params.id });
  }
  res.status(200).json({ node: NODE_NAME, data: record });
});

// 5. Crear nueva historia clinica (Canal Sincrono + Disparo Asincrono)
app.post('/api/records', async (req, res) => {
  const { paciente, dni, centroSalud, profesional, diagnostico, observaciones } = req.body;

  if (!paciente || !diagnostico || !centroSalud) {
    return res.status(400).json({
      error: 'Campos requeridos faltantes: paciente, diagnostico y centroSalud son obligatorios.'
    });
  }

  const records = loadRecords();
  const newRecord = {
    id: `rec-${Date.now().toString().slice(-4)}`,
    version: 1,
    paciente,
    dni: dni || 'No especificado',
    fecha: new Date().toISOString().split('T')[0],
    centroSalud,
    profesional: profesional || 'No especificado',
    diagnostico,
    observaciones: observaciones || 'Sin observaciones registradas.',
    updatedAt: new Date().toISOString()
  };

  records.unshift(newRecord);
  saveRecords(records);

  // Disparo asincrono via RabbitMQ (no bloquea la respuesta al cliente)
  publishAsyncEvent('clinical.record.created', {
    recordId: newRecord.id,
    paciente: newRecord.paciente,
    diagnostico: newRecord.diagnostico,
    centroSalud: newRecord.centroSalud,
    version: newRecord.version
  });

  res.status(201).json({
    message: 'Historia clinica creada exitosamente.',
    data: newRecord
  });
});

// 6. Actualizar historia clinica con Control de Concurrencia Optimista (OCC)
// Resuelve el caso de dos escrituras simultaneas sobre el mismo recurso
app.put('/api/records/:id', async (req, res) => {
  const { id } = req.params;
  const { version, paciente, diagnostico, observaciones, centroSalud, profesional, modificadoPor } = req.body;

  if (version === undefined || version === null) {
    return res.status(400).json({
      error: 'OCC Requerido: El parametro "version" es obligatorio para garantizar control de concurrencia optimista.'
    });
  }

  const records = loadRecords();
  const index = records.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Registro clinico no encontrado.', id });
  }

  const currentRecord = records[index];
  const requestedVersion = parseInt(version, 10);

  console.log(`[OCC-CHECK] Registro: ${id} | Version actual en BD: ${currentRecord.version} | Version recibida: ${requestedVersion} | Solicitado por: ${modificadoPor || 'Cliente'}`);

  // DETECCION DE COLISION CONCURRENTE (LOST UPDATE ANOMALY)
  if (currentRecord.version !== requestedVersion) {
    console.warn(`[OCC-CONFLICT] Conflicto de concurrencia detectado en ${id}. Version actual: ${currentRecord.version}, version provista: ${requestedVersion}. Peticion RECHAZADA con HTTP 409 Conflict.`);

    // Publicar evento asincrono de conflicto para auditoria y alertas
    publishAsyncEvent('clinical.record.conflict', {
      recordId: id,
      expectedVersion: currentRecord.version,
      receivedVersion: requestedVersion,
      attemptedBy: modificadoPor || 'Cliente concurrente',
      timestamp: new Date().toISOString(),
      reason: 'Version obsoleta detectada. Posible colision de escrituras concurrentes.'
    });

    return res.status(409).json({
      status: 'CONFLICT',
      code: 409,
      error: 'Conflicto de concurrencia detectado (Lost Update evitado).',
      details: {
        recordId: id,
        currentVersionInDatabase: currentRecord.version,
        versionSentByClient: requestedVersion,
        message: 'El registro clinico fue modificado por otra transaccion concurrentemente. Su version esta obsoleta.',
        recommendedAction: 'Obtenga la version mas reciente del registro antes de reintentar la modificacion.'
      }
    });
  }

  // ESCRITURA EXITOSA: Se incrementa la version de manera atomica
  const nextVersion = currentRecord.version + 1;
  const updatedRecord = {
    ...currentRecord,
    paciente: paciente || currentRecord.paciente,
    diagnostico: diagnostico || currentRecord.diagnostico,
    observaciones: observaciones !== undefined ? observaciones : currentRecord.observaciones,
    centroSalud: centroSalud || currentRecord.centroSalud,
    profesional: profesional || currentRecord.profesional,
    version: nextVersion,
    updatedAt: new Date().toISOString()
  };

  records[index] = updatedRecord;
  saveRecords(records);

  console.log(`[OCC-SUCCESS] Registro ${id} actualizado con exito. Version evolucionada de ${currentRecord.version} a ${nextVersion}.`);

  // Publicar evento asincrono de actualizacion via RabbitMQ
  publishAsyncEvent('clinical.record.updated', {
    recordId: id,
    paciente: updatedRecord.paciente,
    diagnostico: updatedRecord.diagnostico,
    previousVersion: currentRecord.version,
    newVersion: nextVersion,
    updatedBy: modificadoPor || 'Profesional medico',
    updatedAt: updatedRecord.updatedAt
  });

  return res.status(200).json({
    status: 'SUCCESS',
    code: 200,
    message: 'Historia clinica actualizada exitosamente mediante OCC.',
    data: updatedRecord
  });
});

// 7. Endpoint de demostracion: Simulacion directa de dos escrituras simultaneas
// Permite reproducir en una sola llamada la ejecucion paralela de dos hilos sobre el mismo registro
app.post('/api/records/:id/simulate-concurrency', async (req, res) => {
  const { id } = req.params;
  const records = loadRecords();
  const target = records.find(r => r.id === id);

  if (!target) {
    return res.status(404).json({ error: 'Registro clinico no encontrado', id });
  }

  const baseVersion = target.version;
  console.log(`[CONCURRENCY-DEMO] Iniciando simulacion de 2 escrituras simultaneas sobre ${id} a partir de version ${baseVersion}...`);

  // Hilo 1: Dra. Gomez intenta actualizar diagnostico a "Hipertension estadio 2"
  const payloadThread1 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dra. Gomez)`,
    observaciones: 'Evaluacion cardiologica urgente solicitada.',
    modificadoPor: 'Hilo-1 (Dra. Gomez)'
  };

  // Hilo 2: Dr. Ramirez intenta actualizar diagnostico a "Evaluacion completada - Alta medica"
  const payloadThread2 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dr. Ramirez)`,
    observaciones: 'Paciente estable, derivado a control ambulatorio.',
    modificadoPor: 'Hilo-2 (Dr. Ramirez)'
  };

  // Funcion interna que ejecuta la logica OCC
  function executeOCCWrite(payload) {
    const list = loadRecords();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return { status: 404, body: { error: 'No encontrado' } };

    const current = list[idx];
    if (current.version !== payload.version) {
      // Conflicto
      publishAsyncEvent('clinical.record.conflict', {
        recordId: id,
        expectedVersion: current.version,
        receivedVersion: payload.version,
        attemptedBy: payload.modificadoPor,
        timestamp: new Date().toISOString()
      });

      return {
        status: 409,
        success: false,
        thread: payload.modificadoPor,
        error: 'Conflicto de concurrencia detectado (HTTP 409 Conflict)',
        details: {
          currentVersionInDb: current.version,
          versionSent: payload.version,
          outcome: 'Escritura rechazada para prevenir sobreescritura ciega (Lost Update)'
        }
      };
    }

    // Exito
    const newVer = current.version + 1;
    const updated = {
      ...current,
      diagnostico: payload.diagnostico,
      observaciones: payload.observaciones,
      version: newVer,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    saveRecords(list);

    publishAsyncEvent('clinical.record.updated', {
      recordId: id,
      paciente: updated.paciente,
      previousVersion: current.version,
      newVersion: newVer,
      updatedBy: payload.modificadoPor
    });

    return {
      status: 200,
      success: true,
      thread: payload.modificadoPor,
      message: 'Escritura exitosa aplicada (HTTP 200 OK)',
      data: updated
    };
  }

  // Ejecucion concurrente (simultanea)
  const results = await Promise.all([
    new Promise(resolve => setTimeout(() => resolve(executeOCCWrite(payloadThread1)), 5)),
    new Promise(resolve => setTimeout(() => resolve(executeOCCWrite(payloadThread2)), 5))
  ]);

  const thread1Result = results[0];
  const thread2Result = results[1];

  res.status(200).json({
    simulation: 'Prueba de 2 Escrituras Simultaneas Concurrentes (OCC)',
    targetRecordId: id,
    initialVersion: baseVersion,
    timestamp: new Date().toISOString(),
    results: {
      thread1: thread1Result,
      thread2: thread2Result
    },
    concurrencyResolutionSummary: {
      successCount: results.filter(r => r.status === 200).length,
      conflictCount: results.filter(r => r.status === 409).length,
      lostUpdatePrevented: true,
      explanation: 'El Hilo que proceso primero incremento la version del registro. El segundo Hilo detecto la version obsoleta y fue rechazado con HTTP 409, evitando la perdida de datos clinicos.'
    }
  });
});

// 8. Canal Sincrono Inter-Servicio: Consulta directa hacia notification-service
app.get('/api/records/:id/sync-audit-check', async (req, res) => {
  const { id } = req.params;
  const startTime = Date.now();

  try {
    const targetUrl = `${NOTIFICATION_SERVICE_URL}/api/validate-audit?recordId=${id}`;
    console.log(`[SYNC-CALL] Realizando llamada sincrona HTTP a servicio de notificaciones: ${targetUrl}`);

    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
    const responseTimeMs = Date.now() - startTime;
    const body = await response.json();

    res.status(200).json({
      channel: 'Sincrono (HTTP REST Inter-Servicio)',
      sourceService: 'clinical-records-service',
      targetService: 'notification-service',
      url: targetUrl,
      httpStatus: response.status,
      responseTimeMs,
      dataFromNotificationService: body
    });
  } catch (err) {
    const responseTimeMs = Date.now() - startTime;
    res.status(503).json({
      channel: 'Sincrono (HTTP REST Inter-Servicio)',
      error: 'Servicio de notificaciones no disponible temporalmente',
      targetUrl: `${NOTIFICATION_SERVICE_URL}/api/validate-audit`,
      details: err.message,
      responseTimeMs
    });
  }
});

// 9. Reset de datos a estado inicial (Para facilitar pruebas al docente)
app.post('/api/records/reset', (req, res) => {
  saveRecords(SEED_DATA);
  console.log('[DATOS] Registros clinicos reiniciados al estado semilla.');
  res.status(200).json({
    message: 'Registros clinicos restablecidos al estado inicial con exito.',
    count: SEED_DATA.length,
    data: SEED_DATA
  });
});

// Iniciar servidor HTTP
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO BACKEND CLINICO] Escuchando en puerto ${PORT}`);
  console.log(`[PID: ${process.pid}] [HOST: ${os.hostname()}]`);
  console.log(`=======================================================`);

  // Iniciar conexion asincrona con RabbitMQ
  connectRabbitMQ();
});

// Cierre ordenado
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('[NODO BACKEND] Senal de terminacion recibida. Cerrando recursos...');
  server.close(async () => {
    if (mqChannel) await mqChannel.close().catch(() => {});
    if (mqConnection) await mqConnection.close().catch(() => {});
    console.log('[NODO BACKEND] Servidor HTTP y RabbitMQ cerrados limpiamente.');
    process.exit(0);
  });
}
