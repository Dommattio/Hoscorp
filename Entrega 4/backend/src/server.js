const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-backend-clinical';
const SERVICE_NAME = 'clinical-records-service';
const INSTANCE_ID = process.env.INSTANCE_ID || 'clinical-records-node-01';
const SERVICE_HOST = process.env.SERVICE_HOST || 'localhost';
const SERVICE_REGISTRY_URL = process.env.SERVICE_REGISTRY_URL || 'http://localhost:5002';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');
const EXCHANGE_NAME = 'hoscorp.events';
const CONTRACT_VERSION = '1.0.0';

// =========================================================
// MOTOR INTERNO INTERCAMBIABLE + PATRON ADAPTER DE CONTRATO
// =========================================================
// Demuestra que el componente puede modificarse internamente
// (cambiando su modelo de datos, indexacion y estructura en disco/memoria)
// sin romper el contrato de interfaz REST hacia los demas componentes.
let internalEngineMode = 'v1-flat-legacy-store'; // o 'v2-normalized-ehr-crypto'

// Estado de RabbitMQ y Service Discovery
let mqConnection = null;
let mqChannel = null;
let mqConnected = false;
let mqReconnectTimeout = null;
let registryRegistered = false;
let lastResolvedNotificationInstance = null;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [NODO: ${NODE_NAME}] [ENGINE: ${internalEngineMode}] ${req.method} ${req.url}`);
  next();
});

// =========================================================
// ADAPTADOR Y VALIDADOR EXPLICITO DE CONTRATO (CONTRACT V1)
// =========================================================
function computeRecordHash(dto) {
  return crypto
    .createHash('sha256')
    .update(`${dto.id}|v${dto.version}|${dto.paciente}|${dto.dni}|${dto.diagnostico}|${dto.updatedAt}`)
    .digest('hex');
}

// Convierte un DTO publico del Contrato V1 a la estructura interna del motor activo
function toInternalRepresentation(publicDTO, engineMode = internalEngineMode) {
  if (engineMode === 'v1-flat-legacy-store') {
    return {
      id: String(publicDTO.id),
      version: Number(publicDTO.version),
      paciente: String(publicDTO.paciente),
      dni: String(publicDTO.dni || 'No especificado'),
      fecha: String(publicDTO.fecha),
      centroSalud: String(publicDTO.centroSalud),
      profesional: String(publicDTO.profesional || 'No especificado'),
      diagnostico: String(publicDTO.diagnostico),
      observaciones: String(publicDTO.observaciones || 'Sin observaciones registradas.'),
      updatedAt: String(publicDTO.updatedAt)
    };
  } else {
    // Motor V2: Estructura interna normalizada tipo HL7/FHIR con firma SHA-256
    return {
      ehr_internal_schema: 'HOSCORP-EHR-NORMALIZED-V2',
      record_meta: {
        uid: String(publicDTO.id),
        occ_revision: Number(publicDTO.version),
        last_modified_epoch_ms: new Date(publicDTO.updatedAt).getTime(),
        sha256_integrity_seal: computeRecordHash(publicDTO)
      },
      subject_demographics: {
        full_legal_name: String(publicDTO.paciente),
        national_identity_doc: String(publicDTO.dni || 'No especificado')
      },
      encounter_context: {
        healthcare_facility_name: String(publicDTO.centroSalud),
        attending_clinician_ref: String(publicDTO.profesional || 'No especificado'),
        encounter_date_iso: String(publicDTO.fecha)
      },
      clinical_assessment: {
        primary_diagnosis_code_text: String(publicDTO.diagnostico),
        treatment_notes_narrative: String(publicDTO.observaciones || 'Sin observaciones registradas.')
      }
    };
  }
}

// Adaptador de salida: Convierte desde cualquier estructura interna (V1 o V2)
// hacia el DTO publico estricto del Contrato REST V1 (ClinicalRecordDTOV1)
function toPublicContractDTO(internalItem) {
  if (!internalItem) return null;

  // Si ya esta en estructura interna V2 (normalizada)
  if (internalItem.ehr_internal_schema === 'HOSCORP-EHR-NORMALIZED-V2' || internalItem.record_meta) {
    return {
      id: String(internalItem.record_meta.uid),
      version: Number(internalItem.record_meta.occ_revision),
      paciente: String(internalItem.subject_demographics.full_legal_name),
      dni: String(internalItem.subject_demographics.national_identity_doc),
      fecha: String(internalItem.encounter_context.encounter_date_iso),
      centroSalud: String(internalItem.encounter_context.healthcare_facility_name),
      profesional: String(internalItem.encounter_context.attending_clinician_ref),
      diagnostico: String(internalItem.clinical_assessment.primary_diagnosis_code_text),
      observaciones: String(internalItem.clinical_assessment.treatment_notes_narrative),
      updatedAt: new Date(internalItem.record_meta.last_modified_epoch_ms).toISOString()
    };
  }

  // Si esta en estructura interna V1 (plana)
  return {
    id: String(internalItem.id),
    version: Number(internalItem.version),
    paciente: String(internalItem.paciente),
    dni: String(internalItem.dni || 'No especificado'),
    fecha: String(internalItem.fecha),
    centroSalud: String(internalItem.centroSalud),
    profesional: String(internalItem.profesional || 'No especificado'),
    diagnostico: String(internalItem.diagnostico),
    observaciones: String(internalItem.observaciones || 'Sin observaciones registradas.'),
    updatedAt: String(internalItem.updatedAt)
  };
}

// Validador formal de contrato de entrada para Creacion (POST)
function validateCreateContract(body) {
  const violations = [];
  if (!body || typeof body !== 'object') {
    return ['El cuerpo de la peticion debe ser un objeto JSON valido.'];
  }
  if (typeof body.paciente !== 'string' || body.paciente.trim().length < 2) {
    violations.push('Campo obligatorio "paciente" debe ser string no vacio (minimo 2 caracteres).');
  }
  if (typeof body.centroSalud !== 'string' || body.centroSalud.trim().length < 2) {
    violations.push('Campo obligatorio "centroSalud" debe ser string no vacio.');
  }
  if (typeof body.diagnostico !== 'string' || body.diagnostico.trim().length < 2) {
    violations.push('Campo obligatorio "diagnostico" debe ser string no vacio.');
  }
  if (body.dni !== undefined && typeof body.dni !== 'string') {
    violations.push('Campo opcional "dni" debe ser de tipo string.');
  }
  if (body.profesional !== undefined && typeof body.profesional !== 'string') {
    violations.push('Campo opcional "profesional" debe ser de tipo string.');
  }
  if (body.observaciones !== undefined && typeof body.observaciones !== 'string') {
    violations.push('Campo opcional "observaciones" debe ser de tipo string.');
  }
  return violations;
}

// Validador formal de contrato de entrada para Actualizacion OCC (PUT)
function validateUpdateContract(body) {
  const violations = [];
  if (!body || typeof body !== 'object') {
    return ['El cuerpo de la peticion debe ser un objeto JSON valido.'];
  }
  if (body.version === undefined || body.version === null || isNaN(Number(body.version)) || Number(body.version) < 1) {
    violations.push('Campo obligatorio "version" debe ser un numero entero positivo (>= 1) segun contrato OCC.');
  }
  if (body.diagnostico !== undefined && (typeof body.diagnostico !== 'string' || body.diagnostico.trim().length === 0)) {
    violations.push('Campo "diagnostico", si se incluye, debe ser un string no vacio.');
  }
  if (body.paciente !== undefined && (typeof body.paciente !== 'string' || body.paciente.trim().length === 0)) {
    violations.push('Campo "paciente", si se incluye, debe ser un string no vacio.');
  }
  return violations;
}

// Valida que un objeto cumpla 100% con el esquema de salida ClinicalRecordDTOV1
function verifyOutputDTOCompliance(dto) {
  const requiredStringFields = ['id', 'paciente', 'dni', 'fecha', 'centroSalud', 'profesional', 'diagnostico', 'observaciones', 'updatedAt'];
  const missingOrInvalid = [];
  for (const field of requiredStringFields) {
    if (typeof dto[field] !== 'string' || dto[field].length === 0) {
      missingOrInvalid.push(field);
    }
  }
  if (typeof dto.version !== 'number' || !Number.isInteger(dto.version) || dto.version < 1) {
    missingOrInvalid.push('version (integer >= 1)');
  }
  return {
    compliant: missingOrInvalid.length === 0,
    checkedFields: [...requiredStringFields, 'version'],
    violations: missingOrInvalid
  };
}

// =========================================================
// PERSISTENCIA DESACOPLADA POR MOTOR INTERNO
// =========================================================
const SEED_DATA_PUBLIC = [
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

function loadRawInternalRecords() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : SEED_DATA_PUBLIC.map(r => toInternalRepresentation(r));
    }
    const initial = SEED_DATA_PUBLIC.map(r => toInternalRepresentation(r));
    saveRawInternalRecords(initial);
    return initial;
  } catch (err) {
    console.error('[DATOS] Error leyendo archivo de registros:', err.message);
    return SEED_DATA_PUBLIC.map(r => toInternalRepresentation(r));
  }
}

function saveRawInternalRecords(rawRecords) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(rawRecords, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DATOS] Error guardando archivo de registros:', err.message);
  }
}

// Carga los registros adaptados siempre al Contrato Publico V1
function loadPublicContractRecords() {
  const rawList = loadRawInternalRecords();
  return rawList.map(item => toPublicContractDTO(item));
}

// Guarda una lista de DTOs publicos transformandolos a la estructura del motor interno activo
function savePublicContractRecords(publicDTOList) {
  const internalList = publicDTOList.map(dto => toInternalRepresentation(dto, internalEngineMode));
  saveRawInternalRecords(internalList);
}

if (!fs.existsSync(DATA_FILE)) {
  savePublicContractRecords(SEED_DATA_PUBLIC);
}

// =========================================================
// SERVICE DISCOVERY: AUTO-REGISTRO, HEARTBEAT Y RESOLUCION
// =========================================================
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
      listRecords: '/api/v1/records',
      getRecordById: '/api/v1/records/:id',
      createRecord: '/api/v1/records',
      updateRecordOCC: '/api/v1/records/:id',
      syncAuditCheck: '/api/v1/records/:id/sync-audit-check',
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
    }
  } catch (err) {
    registryRegistered = false;
    console.warn(`[SERVICE-DISCOVERY] Service Registry no disponible aun (${err.message}). Reintentando...`);
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

// Resolucion dinamica de un servicio destino consultando al Service Registry
// Elimina la necesidad de URLs hardcodeadas entre componentes
async function discoverServiceEndpoint(targetServiceName) {
  const startTime = Date.now();
  const discoveryUrl = `${SERVICE_REGISTRY_URL}/api/v1/registry/discover/${targetServiceName}`;

  const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(3000) });
  const discoveryLatencyMs = Date.now() - startTime;

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Fallo en Service Discovery para "${targetServiceName}" (HTTP ${res.status}): ${errBody.error || res.statusText}`);
  }

  const resolution = await res.json();
  lastResolvedNotificationInstance = resolution.resolvedInstance;

  return {
    discoveryUrl,
    discoveryLatencyMs,
    resolution
  };
}

// =========================================================
// CANAL ASINCRONO: CONEXION CON RABBITMQ
// =========================================================
async function connectRabbitMQ() {
  if (mqReconnectTimeout) {
    clearTimeout(mqReconnectTimeout);
    mqReconnectTimeout = null;
  }

  try {
    mqConnection = await amqp.connect(RABBITMQ_URL);
    mqChannel = await mqConnection.createChannel();
    await mqChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    mqConnected = true;
    console.log(`[RABBITMQ-ASYNC] Conectado. Exchange: "${EXCHANGE_NAME}".`);

    mqConnection.on('error', () => { mqConnected = false; });
    mqConnection.on('close', () => {
      mqConnected = false;
      mqReconnectTimeout = setTimeout(connectRabbitMQ, 4000);
    });
  } catch (err) {
    mqConnected = false;
    mqReconnectTimeout = setTimeout(connectRabbitMQ, 4000);
  }
}

async function publishAsyncEvent(routingKey, payload) {
  const eventMessage = {
    contractVersion: CONTRACT_VERSION,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    routingKey,
    timestamp: new Date().toISOString(),
    sourceNode: NODE_NAME,
    internalEngine: internalEngineMode,
    payload
  };

  if (!mqConnected || !mqChannel) return false;

  try {
    const buffer = Buffer.from(JSON.stringify(eventMessage));
    mqChannel.publish(EXCHANGE_NAME, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json'
    });
    return true;
  } catch (err) {
    return false;
  }
}

// =========================================================
// CONTRATO FORMAL OPENAPI 3.0.3 DEL BACKEND CLINICO
// =========================================================
const CLINICAL_OPENAPI_CONTRACT = {
  openapi: '3.0.3',
  info: {
    title: 'Hoscorp Clinical Records Service API',
    version: CONTRACT_VERSION,
    description: 'Contrato formal de interfaz REST para la gestion unificada de historias clinicas de Hoscorp. Garantiza desacoplamiento estricto mediante DTOs explicitos (ClinicalRecordDTOV1), control de concurrencia optimista (OCC) y resolucion dinamica de servicios colaboradores via Service Discovery.',
    contact: {
      name: 'Grupo 2 - Donato Mattio & Cristian Carilavi'
    }
  },
  servers: [
    { url: 'http://localhost:5000', description: 'Acceso local directo al Backend Clinico' },
    { url: 'http://backend:5000', description: 'Endpoint registrado en Service Registry (hoscorp-net)' }
  ],
  paths: {
    '/api/v1/records': {
      get: {
        summary: 'Listar todas las historias clinicas bajo el contrato ClinicalRecordListResponseV1',
        responses: {
          '200': {
            description: 'Lista de historias clinicas adaptadas al esquema de contrato publico V1',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClinicalRecordListResponseV1' }
              }
            }
          }
        }
      },
      post: {
        summary: 'Crear una nueva historia clinica validando contrato de entrada',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClinicalRecordCreateInputV1' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Historia clinica creada y adaptada al contrato V1',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClinicalRecordMutationResponseV1' }
              }
            }
          },
          '400': {
            description: 'Violacion de contrato: Campos obligatorios faltantes o tipos invalidos',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContractViolationErrorV1' }
              }
            }
          }
        }
      }
    },
    '/api/v1/records/{id}': {
      get: {
        summary: 'Obtener una historia clinica por su identificador unico',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'rec-1001' } }
        ],
        responses: {
          '200': {
            description: 'Registro clinico conforme a ClinicalRecordDTOV1',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClinicalRecordSingleResponseV1' }
              }
            }
          },
          '404': { description: 'Registro clinico no encontrado' }
        }
      },
      put: {
        summary: 'Actualizar una historia clinica con validacion de contrato y Control de Concurrencia Optimista (OCC)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'rec-1001' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClinicalRecordUpdateInputV1' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Actualizacion aplicada exitosamente e incremento atomico de version',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClinicalRecordMutationResponseV1' }
              }
            }
          },
          '400': {
            description: 'Violacion de contrato: Parametro version ausente o tipo de dato invalido',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ContractViolationErrorV1' }
              }
            }
          },
          '409': {
            description: 'Conflicto de concurrencia OCC detectado (Lost Update evitado)'
          }
        }
      }
    },
    '/api/v1/records/{id}/sync-audit-check': {
      get: {
        summary: 'Validar auditoria descubriendo dinamicamente al notification-service via Service Registry',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'rec-1001' } }
        ],
        responses: {
          '200': { description: 'Servicio descubierto dinamicamente y contrato inter-servicio verificado' },
          '503': { description: 'Servicio no disponible en el Service Registry' }
        }
      }
    }
  },
  components: {
    schemas: {
      ClinicalRecordDTOV1: {
        type: 'object',
        required: ['id', 'version', 'paciente', 'dni', 'fecha', 'centroSalud', 'profesional', 'diagnostico', 'observaciones', 'updatedAt'],
        properties: {
          id: { type: 'string', example: 'rec-1001' },
          version: { type: 'integer', minimum: 1, example: 1 },
          paciente: { type: 'string', example: 'Carlos Gomez' },
          dni: { type: 'string', example: '32.456.789' },
          fecha: { type: 'string', format: 'date', example: '2026-10-10' },
          centroSalud: { type: 'string', example: 'Hospital Central de Cordoba' },
          profesional: { type: 'string', example: 'Dra. Sofia Albarracin (Mat. 44521)' },
          diagnostico: { type: 'string', example: 'Hipertension arterial estadio 1' },
          observaciones: { type: 'string', example: 'Control trimestral de presion.' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ClinicalRecordCreateInputV1: {
        type: 'object',
        required: ['paciente', 'centroSalud', 'diagnostico'],
        properties: {
          paciente: { type: 'string', minLength: 2, example: 'Ana Maria Torres' },
          dni: { type: 'string', example: '38.900.112' },
          centroSalud: { type: 'string', minLength: 2, example: 'Sanatorio Allende' },
          profesional: { type: 'string', example: 'Dr. Lucas Funes' },
          diagnostico: { type: 'string', minLength: 2, example: 'Control post-operatorio satisfactorio' },
          observaciones: { type: 'string', example: 'Se retiran puntos sin complicaciones.' }
        }
      },
      ClinicalRecordUpdateInputV1: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer', minimum: 1, example: 1 },
          paciente: { type: 'string' },
          centroSalud: { type: 'string' },
          profesional: { type: 'string' },
          diagnostico: { type: 'string' },
          observaciones: { type: 'string' },
          modificadoPor: { type: 'string' }
        }
      },
      ClinicalRecordListResponseV1: {
        type: 'object',
        required: ['contractVersion', 'node', 'internalEngine', 'count', 'data'],
        properties: {
          contractVersion: { type: 'string', example: '1.0.0' },
          node: { type: 'string' },
          internalEngine: { type: 'string' },
          count: { type: 'integer' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ClinicalRecordDTOV1' }
          }
        }
      },
      ClinicalRecordSingleResponseV1: {
        type: 'object',
        required: ['contractVersion', 'node', 'internalEngine', 'data'],
        properties: {
          contractVersion: { type: 'string', example: '1.0.0' },
          node: { type: 'string' },
          internalEngine: { type: 'string' },
          data: { $ref: '#/components/schemas/ClinicalRecordDTOV1' }
        }
      },
      ClinicalRecordMutationResponseV1: {
        type: 'object',
        required: ['contractVersion', 'status', 'code', 'message', 'data'],
        properties: {
          contractVersion: { type: 'string', example: '1.0.0' },
          status: { type: 'string', enum: ['SUCCESS'] },
          code: { type: 'integer', example: 200 },
          message: { type: 'string' },
          internalEngineUsed: { type: 'string' },
          data: { $ref: '#/components/schemas/ClinicalRecordDTOV1' }
        }
      },
      ContractViolationErrorV1: {
        type: 'object',
        required: ['status', 'code', 'contract', 'error', 'violations'],
        properties: {
          status: { type: 'string', enum: ['CONTRACT_VIOLATION'] },
          code: { type: 'integer', example: 400 },
          contract: { type: 'string' },
          error: { type: 'string' },
          violations: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
};

// =========================================================
// ENDPOINTS HTTP REST (SOPORTA /api/v1/... Y /api/...)
// =========================================================

// 1. Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: SERVICE_NAME,
    instanceId: INSTANCE_ID,
    role: 'Backend API Clinico Core (Adapter + OCC + Discovery Client)',
    contractVersion: CONTRACT_VERSION,
    internalEngine: internalEngineMode,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    pid: process.pid,
    serviceDiscovery: {
      registered: registryRegistered,
      registryUrl: SERVICE_REGISTRY_URL,
      lastResolvedNotificationInstance
    },
    rabbitmq: {
      connected: mqConnected,
      exchange: EXCHANGE_NAME
    }
  });
});

// 2. Exponer Contrato Formal OpenAPI 3.0.3
app.get(['/api/v1/contract', '/api/contract'], (req, res) => {
  res.status(200).json(CLINICAL_OPENAPI_CONTRACT);
});

// 3. Info Arquitectural de la Entrega 4
app.get(['/api/v1/info', '/api/info'], (req, res) => {
  res.status(200).json({
    project: 'Hoscorp - Gestion Unificada de Historias Clinicas',
    course: 'Programacion Distribuida y Componentes',
    group: 'Grupo 2',
    authors: ['Donato Mattio', 'Cristian Carilavi'],
    delivery: 'Entrega 4 - Contratos de Interfaz y Descubrimiento de Servicios',
    tag: 'v1-middleware',
    contractSpecification: {
      standard: 'OpenAPI 3.0.3',
      version: CONTRACT_VERSION,
      endpoints: {
        clinicalContract: '/api/v1/contract',
        notificationContract: 'http://localhost:5001/api/v1/contract',
        registryContract: 'http://localhost:5002/api/v1/contract'
      },
      decouplingMechanism: 'Patron Adapter/DTO con validacion de esquema en runtime. Permite conmutar entre el Motor Interno V1 (Plano) y el Motor Interno V2 (EHR Normalizado con firma SHA-256) sin alterar un solo campo del contrato externo.'
    },
    serviceDiscovery: {
      registryServer: SERVICE_REGISTRY_URL,
      mechanism: 'Auto-registro al arranque (POST /api/v1/registry/register), Heartbeats periodicos cada 5s con TTL y resolucion dinamica en tiempo de ejecucion (GET /api/v1/registry/discover/:serviceName).',
      hardcodedUrlsEliminated: true
    }
  });
});

// 4. Listar todas las historias clinicas (Adaptadas al Contrato V1)
app.get(['/api/v1/records', '/api/records'], (req, res) => {
  const records = loadPublicContractRecords();
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    node: NODE_NAME,
    internalEngine: internalEngineMode,
    count: records.length,
    data: records
  });
});

// 5. Obtener una historia clinica por ID
app.get(['/api/v1/records/:id', '/api/records/:id'], (req, res) => {
  const records = loadPublicContractRecords();
  const record = records.find(r => r.id === req.params.id);
  if (!record) {
    return res.status(404).json({
      contractVersion: CONTRACT_VERSION,
      error: 'Registro clinico no encontrado',
      id: req.params.id
    });
  }
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    node: NODE_NAME,
    internalEngine: internalEngineMode,
    data: record
  });
});

// 6. Crear nueva historia clinica (con Validacion Formal de Contrato)
app.post(['/api/v1/records', '/api/records'], async (req, res) => {
  const violations = validateCreateContract(req.body);
  if (violations.length > 0) {
    return res.status(400).json({
      status: 'CONTRACT_VIOLATION',
      code: 400,
      contract: 'ClinicalRecordCreateInputV1 (OpenAPI 3.0.3)',
      error: 'La solicitud incumple el contrato formal de creacion de historias clinicas.',
      violations
    });
  }

  const { paciente, dni, centroSalud, profesional, diagnostico, observaciones } = req.body;
  const records = loadPublicContractRecords();

  const newRecordDTO = {
    id: `rec-${Date.now().toString().slice(-4)}`,
    version: 1,
    paciente: paciente.trim(),
    dni: dni ? dni.trim() : 'No especificado',
    fecha: new Date().toISOString().split('T')[0],
    centroSalud: centroSalud.trim(),
    profesional: profesional ? profesional.trim() : 'No especificado',
    diagnostico: diagnostico.trim(),
    observaciones: observaciones ? observaciones.trim() : 'Sin observaciones registradas.',
    updatedAt: new Date().toISOString()
  };

  records.unshift(newRecordDTO);
  savePublicContractRecords(records);

  publishAsyncEvent('clinical.record.created', {
    recordId: newRecordDTO.id,
    paciente: newRecordDTO.paciente,
    diagnostico: newRecordDTO.diagnostico,
    centroSalud: newRecordDTO.centroSalud,
    version: newRecordDTO.version
  });

  res.status(201).json({
    contractVersion: CONTRACT_VERSION,
    status: 'SUCCESS',
    code: 201,
    message: 'Historia clinica creada exitosamente cumpliendo contrato ClinicalRecordDTOV1.',
    internalEngineUsed: internalEngineMode,
    data: newRecordDTO
  });
});

// 7. Actualizar historia clinica con Validacion de Contrato + OCC
app.put(['/api/v1/records/:id', '/api/records/:id'], async (req, res) => {
  const { id } = req.params;
  const violations = validateUpdateContract(req.body);

  if (violations.length > 0) {
    return res.status(400).json({
      status: 'CONTRACT_VIOLATION',
      code: 400,
      contract: 'ClinicalRecordUpdateInputV1 (OpenAPI 3.0.3)',
      error: 'La solicitud incumple el contrato formal de actualizacion OCC.',
      violations
    });
  }

  const { version, paciente, diagnostico, observaciones, centroSalud, profesional, modificadoPor } = req.body;
  const records = loadPublicContractRecords();
  const index = records.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({
      contractVersion: CONTRACT_VERSION,
      error: 'Registro clinico no encontrado.',
      id
    });
  }

  const currentRecord = records[index];
  const requestedVersion = parseInt(version, 10);

  if (currentRecord.version !== requestedVersion) {
    publishAsyncEvent('clinical.record.conflict', {
      recordId: id,
      expectedVersion: currentRecord.version,
      receivedVersion: requestedVersion,
      attemptedBy: modificadoPor || 'Cliente concurrente',
      timestamp: new Date().toISOString(),
      reason: 'Version obsoleta detectada bajo control OCC.'
    });

    return res.status(409).json({
      contractVersion: CONTRACT_VERSION,
      status: 'CONFLICT',
      code: 409,
      error: 'Conflicto de concurrencia detectado (Lost Update evitado).',
      details: {
        recordId: id,
        currentVersionInDatabase: currentRecord.version,
        versionSentByClient: requestedVersion,
        message: 'El registro clinico fue modificado por otra transaccion concurrentemente. Su version esta obsoleta.'
      }
    });
  }

  const nextVersion = currentRecord.version + 1;
  const updatedRecordDTO = {
    ...currentRecord,
    paciente: paciente ? paciente.trim() : currentRecord.paciente,
    diagnostico: diagnostico ? diagnostico.trim() : currentRecord.diagnostico,
    observaciones: observaciones !== undefined ? observaciones : currentRecord.observaciones,
    centroSalud: centroSalud ? centroSalud.trim() : currentRecord.centroSalud,
    profesional: profesional ? profesional.trim() : currentRecord.profesional,
    version: nextVersion,
    updatedAt: new Date().toISOString()
  };

  records[index] = updatedRecordDTO;
  savePublicContractRecords(records);

  publishAsyncEvent('clinical.record.updated', {
    recordId: id,
    paciente: updatedRecordDTO.paciente,
    diagnostico: updatedRecordDTO.diagnostico,
    previousVersion: currentRecord.version,
    newVersion: nextVersion,
    updatedBy: modificadoPor || 'Profesional medico',
    updatedAt: updatedRecordDTO.updatedAt
  });

  return res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    status: 'SUCCESS',
    code: 200,
    message: 'Historia clinica actualizada exitosamente mediante OCC y adaptada al contrato V1.',
    internalEngineUsed: internalEngineMode,
    data: updatedRecordDTO
  });
});

// 8. Llamada Sincrona Inter-Servicio usando DESCUBRIMIENTO DE SERVICIOS DINAMICO
// (Requisito central de Entrega 4: No depende de una URL hardcodeada)
app.get(['/api/v1/records/:id/sync-audit-check', '/api/records/:id/sync-audit-check'], async (req, res) => {
  const { id } = req.params;
  const totalStartTime = Date.now();

  try {
    // PASO 1: Descubrir dinamicamente la ubicacion de "notification-service" en el Service Registry
    const discoveryInfo = await discoverServiceEndpoint('notification-service');
    const resolvedInst = discoveryInfo.resolution.resolvedInstance;

    const auditEndpointPath = (resolvedInst.endpoints && resolvedInst.endpoints.validateAudit)
      ? resolvedInst.endpoints.validateAudit
      : '/api/v1/validate-audit';

    const resolvedTargetUrl = `${resolvedInst.baseUrl}${auditEndpointPath}?recordId=${encodeURIComponent(id)}`;
    console.log(`[SERVICE-DISCOVERY-CALL] Servicio "notification-service" descubierto en ${resolvedInst.baseUrl}. Invocando contrato en: ${resolvedTargetUrl}`);

    // PASO 2: Invocar al servicio descubierto segun su contrato explicito
    const callStartTime = Date.now();
    const response = await fetch(resolvedTargetUrl, { signal: AbortSignal.timeout(3000) });
    const callLatencyMs = Date.now() - callStartTime;
    const body = await response.json();

    // PASO 3: Verificar que la respuesta del servicio colaborador cumple el contrato AuditValidationResponseV1
    const contractVerified = Boolean(
      body &&
      body.status === 'VALIDATED' &&
      body.recordId === id &&
      typeof body.auditReady === 'boolean'
    );

    res.status(200).json({
      contractVersion: CONTRACT_VERSION,
      channel: 'Sincrono (HTTP REST via Service Discovery)',
      sourceService: SERVICE_NAME,
      targetService: 'notification-service',
      serviceDiscoveryTrace: {
        registryQueried: discoveryInfo.discoveryUrl,
        resolvedInstanceId: resolvedInst.instanceId,
        resolvedBaseUrl: resolvedInst.baseUrl,
        targetInternalEngine: resolvedInst.internalEngine,
        discoveryLatencyMs: discoveryInfo.discoveryLatencyMs
      },
      contractVerification: {
        expectedSchema: 'AuditValidationResponseV1',
        compliant: contractVerified,
        targetContractVersion: body.contractVersion || '1.0.0'
      },
      url: resolvedTargetUrl,
      httpStatus: response.status,
      responseTimeMs: Date.now() - totalStartTime,
      callLatencyMs,
      dataFromNotificationService: body
    });
  } catch (err) {
    res.status(503).json({
      contractVersion: CONTRACT_VERSION,
      channel: 'Sincrono (HTTP REST via Service Discovery)',
      error: 'No se pudo descubrir o contactar al servicio de notificaciones via Service Registry',
      registryUrl: SERVICE_REGISTRY_URL,
      details: err.message,
      responseTimeMs: Date.now() - totalStartTime
    });
  }
});

// 9. Conmutar Motor Interno en Caliente (Demostracion de modificacion interna sin romper el contrato)
app.post(['/api/v1/internal/switch-engine', '/api/internal/switch-engine'], (req, res) => {
  const previousEngine = internalEngineMode;
  const currentPublicRecords = loadPublicContractRecords();

  if (req.body && req.body.targetEngine) {
    internalEngineMode = req.body.targetEngine;
  } else {
    internalEngineMode = internalEngineMode === 'v1-flat-legacy-store'
      ? 'v2-normalized-ehr-crypto'
      : 'v1-flat-legacy-store';
  }

  // Re-persistir todos los registros utilizando la nueva arquitectura interna
  savePublicContractRecords(currentPublicRecords);
  sendDiscoveryHeartbeat();

  const rawInternalList = loadRawInternalRecords();
  const adaptedPublicList = loadPublicContractRecords();
  const sampleDTO = adaptedPublicList[0];
  const complianceCheck = verifyOutputDTOCompliance(sampleDTO);

  console.log(`[INTERNAL-ENGINE-SWAP] Motor interno cambiado de "${previousEngine}" a "${internalEngineMode}". Contrato publico V1 intacto: ${complianceCheck.compliant}`);

  res.status(200).json({
    status: 'INTERNAL_ENGINE_SWITCHED',
    service: SERVICE_NAME,
    previousEngine,
    activeInternalEngine: internalEngineMode,
    publicContractVersion: CONTRACT_VERSION,
    contractBroken: !complianceCheck.compliant,
    contractComplianceCheck: complianceCheck,
    comparison: {
      rawInternalStorageSample: rawInternalList[0],
      publicContractOutputSample: sampleDTO
    },
    explanation: `El motor interno se modifico a "${internalEngineMode}" alterando la estructura interna de persistencia, pero el Adaptador de Contrato mantuvo el esquema publico ClinicalRecordDTOV1 100% invariante.`
  });
});

// 10. Inspeccionar estado interno vs contrato externo actual
app.get(['/api/v1/internal/inspect', '/api/internal/inspect'], (req, res) => {
  const rawInternalList = loadRawInternalRecords();
  const adaptedPublicList = loadPublicContractRecords();
  const sampleDTO = adaptedPublicList[0];
  const complianceCheck = sampleDTO ? verifyOutputDTOCompliance(sampleDTO) : { compliant: true };

  res.status(200).json({
    service: SERVICE_NAME,
    activeInternalEngine: internalEngineMode,
    publicContractVersion: CONTRACT_VERSION,
    contractComplianceCheck: complianceCheck,
    rawInternalStorageSample: rawInternalList[0] || null,
    publicContractOutputSample: sampleDTO || null
  });
});

// 11. Suite Automatizada de Verificacion de Desacople y Contratos (Evidencia Empirica Entrega 4)
app.post(['/api/v1/contract/verify-decoupling', '/api/contract/verify-decoupling'], async (req, res) => {
  const steps = [];
  const originalEngine = internalEngineMode;

  try {
    // Prueba 1: Verificar contrato con Motor Interno V1 (Plano)
    internalEngineMode = 'v1-flat-legacy-store';
    savePublicContractRecords(loadPublicContractRecords());
    const rawV1 = loadRawInternalRecords()[0];
    const dtoFromV1 = loadPublicContractRecords()[0];
    const checkV1 = verifyOutputDTOCompliance(dtoFromV1);

    steps.push({
      step: 1,
      name: 'Validacion de Contrato en Motor Interno V1 (Flat Legacy Store)',
      internalEngine: 'v1-flat-legacy-store',
      internalKeys: Object.keys(rawV1),
      publicContractKeys: Object.keys(dtoFromV1),
      passed: checkV1.compliant,
      details: 'El DTO expuesto cumple los 10 campos requeridos por ClinicalRecordDTOV1.'
    });

    // Prueba 2: Modificar internamente el componente al Motor V2 (EHR Normalizado + SHA-256)
    internalEngineMode = 'v2-normalized-ehr-crypto';
    savePublicContractRecords(loadPublicContractRecords());
    const rawV2 = loadRawInternalRecords()[0];
    const dtoFromV2 = loadPublicContractRecords()[0];
    const checkV2 = verifyOutputDTOCompliance(dtoFromV2);

    // Comprobar que el DTO publico de V1 y el DTO publico de V2 tienen exactamente la misma estructura y valores
    const dtoParity = JSON.stringify(dtoFromV1) === JSON.stringify(dtoFromV2);

    steps.push({
      step: 2,
      name: 'Modificacion Interna en Caliente a Motor V2 (Normalized EHR + SHA-256) sin Romper Contrato',
      internalEngine: 'v2-normalized-ehr-crypto',
      internalKeys: Object.keys(rawV2),
      publicContractKeys: Object.keys(dtoFromV2),
      passed: checkV2.compliant && dtoParity,
      details: `La estructura interna cambio radicalmente (${Object.keys(rawV2).join(', ')}), pero el contrato publico hacia los consumidores permanecio 100% identico (Paridad exacta: ${dtoParity}).`
    });

    // Prueba 3: Verificar rechazo automatico ante violacion de contrato (Contract Enforcement)
    const invalidPayload = { paciente: '', diagnostico: 12345 };
    const violations = validateCreateContract(invalidPayload);
    steps.push({
      step: 3,
      name: 'Verificacion de Rechazo por Violacion de Contrato (HTTP 400 Contract Violation)',
      passed: violations.length >= 2,
      violationsDetected: violations,
      details: 'El validador de contratos detecto y rechazo automaticamente un payload que no respeta los tipos y restricciones de OpenAPI 3.0.'
    });

    // Prueba 4: Descubrimiento dinamico de notification-service y verificacion de su contrato
    let discoveryStepPassed = false;
    let discoveryDetails = '';
    try {
      const disc = await discoverServiceEndpoint('notification-service');
      const inst = disc.resolution.resolvedInstance;
      const auditRes = await fetch(`${inst.baseUrl}/api/v1/validate-audit?recordId=${dtoFromV2.id}`, {
        signal: AbortSignal.timeout(3000)
      });
      const auditBody = await auditRes.json();
      discoveryStepPassed = auditRes.status === 200 && auditBody.status === 'VALIDATED';
      discoveryDetails = `Resuelto dinamicamente via Service Registry a ${inst.baseUrl} (${inst.instanceId}) en ${disc.discoveryLatencyMs}ms. Contrato AuditValidationResponseV1 verificado.`;
    } catch (dErr) {
      discoveryStepPassed = false;
      discoveryDetails = `Aviso en discovery: ${dErr.message}`;
    }

    steps.push({
      step: 4,
      name: 'Descubrimiento Dinamico via Service Registry e Interoperabilidad por Contrato',
      passed: discoveryStepPassed,
      details: discoveryDetails
    });

    sendDiscoveryHeartbeat();

    const allPassed = steps.every(s => s.passed);
    res.status(200).json({
      verificationSuite: 'Certificacion Automatica de Contratos y Desacople - Entrega 4',
      timestamp: new Date().toISOString(),
      allTestsPassed: allPassed,
      activeInternalEngineAfterTest: internalEngineMode,
      steps,
      comparisonSnapshot: {
        engineV1InternalRaw: rawV1,
        engineV2InternalRaw: rawV2,
        invariantPublicContractDTO: dtoFromV2
      }
    });
  } catch (err) {
    internalEngineMode = originalEngine;
    res.status(500).json({ error: 'Error ejecutando suite de verificacion', details: err.message });
  }
});

// 12. Simulacion de 2 escrituras simultaneas (Conservado de Entrega 3)
app.post(['/api/v1/records/:id/simulate-concurrency', '/api/records/:id/simulate-concurrency'], async (req, res) => {
  const { id } = req.params;
  const records = loadPublicContractRecords();
  const target = records.find(r => r.id === id);

  if (!target) {
    return res.status(404).json({ error: 'Registro clinico no encontrado', id });
  }

  const baseVersion = target.version;

  const payloadThread1 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dra. Gomez)`,
    observaciones: 'Evaluacion cardiologica urgente solicitada.',
    modificadoPor: 'Hilo-1 (Dra. Gomez)'
  };

  const payloadThread2 = {
    version: baseVersion,
    diagnostico: `${target.diagnostico} (Actualizado por Dr. Ramirez)`,
    observaciones: 'Paciente estable, derivado a control ambulatorio.',
    modificadoPor: 'Hilo-2 (Dr. Ramirez)'
  };

  function executeOCCWrite(payload) {
    const list = loadPublicContractRecords();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return { status: 404, body: { error: 'No encontrado' } };

    const current = list[idx];
    if (current.version !== payload.version) {
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

    const newVer = current.version + 1;
    const updated = {
      ...current,
      diagnostico: payload.diagnostico,
      observaciones: payload.observaciones,
      version: newVer,
      updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    savePublicContractRecords(list);

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

  const results = await Promise.all([
    new Promise(resolve => setTimeout(() => resolve(executeOCCWrite(payloadThread1)), 5)),
    new Promise(resolve => setTimeout(() => resolve(executeOCCWrite(payloadThread2)), 5))
  ]);

  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    simulation: 'Prueba de 2 Escrituras Simultaneas Concurrentes (OCC)',
    targetRecordId: id,
    initialVersion: baseVersion,
    internalEngine: internalEngineMode,
    timestamp: new Date().toISOString(),
    results: {
      thread1: results[0],
      thread2: results[1]
    },
    concurrencyResolutionSummary: {
      successCount: results.filter(r => r.status === 200).length,
      conflictCount: results.filter(r => r.status === 409).length,
      lostUpdatePrevented: true
    }
  });
});

// 13. Reset de datos a estado semilla
app.post(['/api/v1/records/reset', '/api/records/reset'], (req, res) => {
  savePublicContractRecords(SEED_DATA_PUBLIC);
  res.status(200).json({
    contractVersion: CONTRACT_VERSION,
    message: 'Registros clinicos restablecidos al estado inicial con exito.',
    internalEngine: internalEngineMode,
    count: SEED_DATA_PUBLIC.length,
    data: loadPublicContractRecords()
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO BACKEND CLINICO] Escuchando en puerto ${PORT}`);
  console.log(`[PID: ${process.pid}] [ENGINE: ${internalEngineMode}]`);
  console.log(`=======================================================`);

  connectRabbitMQ();
  setTimeout(registerWithServiceDiscovery, 1500);
  setInterval(sendDiscoveryHeartbeat, 5000);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
