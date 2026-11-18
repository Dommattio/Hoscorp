const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5002;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-service-registry';
const DEFAULT_TTL_MS = 18000; // 18 segundos antes de marcar instancia como expirada

app.use(cors());
app.use(express.json());

// Almacenamiento en memoria del registro de servicios
// Estructura: Map<serviceName, Map<instanceId, InstanceObject>>
const registry = new Map();
const roundRobinCounters = new Map();
const discoveryHistory = [];
const MAX_HISTORY = 100;

let totalRegistrations = 0;
let totalLookups = 0;
let totalHeartbeats = 0;

// Logger de peticiones HTTP
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [NODO: ${NODE_NAME}] [PID: ${process.pid}] ${req.method} ${req.url}`);
  next();
});

function recordDiscoveryEvent(type, serviceName, instanceId, details) {
  discoveryHistory.unshift({
    eventId: `dsc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    serviceName,
    instanceId,
    timestamp: new Date().toISOString(),
    details
  });
  if (discoveryHistory.length > MAX_HISTORY) {
    discoveryHistory.pop();
  }
}

// Verificador periodico de expiracion de TTL (Eviction / Health Check pasivo)
setInterval(() => {
  const now = Date.now();
  for (const [serviceName, instances] of registry.entries()) {
    for (const [instanceId, inst] of instances.entries()) {
      const elapsed = now - new Date(inst.lastHeartbeat).getTime();
      const ttlMs = (inst.ttlSeconds || 18) * 1000;
      if (elapsed > ttlMs && inst.status === 'UP') {
        inst.status = 'DOWN_TTL_EXPIRED';
        console.warn(`[SERVICE-REGISTRY] Instancia expirada por TTL: ${serviceName} (${instanceId}) - ${Math.round(elapsed / 1000)}s sin heartbeat.`);
        recordDiscoveryEvent('TTL_EXPIRED', serviceName, instanceId, `Sin heartbeat por mas de ${inst.ttlSeconds}s`);
      }
    }
  }
}, 3000);

// ==========================================
// CONTRATO FORMAL OPENAPI 3.0.3 DEL REGISTRY
// ==========================================
const REGISTRY_OPENAPI_CONTRACT = {
  openapi: '3.0.3',
  info: {
    title: 'Hoscorp Service Discovery & Contract Registry API',
    version: '1.0.0',
    description: 'Contrato formal del servidor de descubrimiento de servicios (Service Registry) de Hoscorp. Permite el auto-registro dinamico, monitoreo por heartbeat con TTL y resolucion de ubicacion en tiempo de ejecucion sin URLs hardcodeadas.',
    contact: {
      name: 'Grupo 2 - Donato Mattio & Cristian Carilavi'
    }
  },
  servers: [
    { url: 'http://localhost:5002', description: 'Acceso local directo al Service Registry' },
    { url: 'http://service-registry:5002', description: 'Acceso interno en red Docker hoscorp-net' }
  ],
  paths: {
    '/api/v1/registry/register': {
      post: {
        summary: 'Auto-registrar una instancia de microservicio',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ServiceRegistrationInput' }
            }
          }
        },
        responses: {
          '201': { description: 'Instancia registrada exitosamente' },
          '400': { description: 'Violacion de contrato de registro (campos obligatorios faltantes)' }
        }
      }
    },
    '/api/v1/registry/heartbeat/{serviceName}/{instanceId}': {
      put: {
        summary: 'Renovar TTL de una instancia mediante Heartbeat',
        parameters: [
          { name: 'serviceName', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'instanceId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Heartbeat procesado y TTL renovado' },
          '404': { description: 'Instancia no encontrada en el registro' }
        }
      }
    },
    '/api/v1/registry/discover/{serviceName}': {
      get: {
        summary: 'Descubrir y resolver dinamicamente una instancia activa de un servicio',
        parameters: [
          { name: 'serviceName', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Ubicacion y metadatos de contrato resueltos dinamicamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceDiscoveryResolution' }
              }
            }
          },
          '404': { description: 'Ninguna instancia saludable disponible para el servicio solicitado' }
        }
      }
    },
    '/api/v1/registry/services': {
      get: {
        summary: 'Obtener el catalogo completo de servicios registrados y metricas de discovery',
        responses: {
          '200': { description: 'Catalogo de servicios activos e historial de eventos' }
        }
      }
    }
  },
  components: {
    schemas: {
      ServiceRegistrationInput: {
        type: 'object',
        required: ['serviceName', 'instanceId', 'host', 'port', 'contractVersion'],
        properties: {
          serviceName: { type: 'string', example: 'notification-service' },
          instanceId: { type: 'string', example: 'notification-service-node-01' },
          host: { type: 'string', example: 'notification-service' },
          port: { type: 'integer', example: 5001 },
          protocol: { type: 'string', example: 'http' },
          contractVersion: { type: 'string', example: '1.0.0' },
          healthCheckUrl: { type: 'string', example: 'http://notification-service:5001/health' },
          contractUrl: { type: 'string', example: 'http://notification-service:5001/api/v1/contract' },
          internalEngine: { type: 'string', example: 'v1-standard' },
          endpoints: { type: 'object' }
        }
      },
      ServiceDiscoveryResolution: {
        type: 'object',
        required: ['status', 'serviceName', 'contractVersion', 'resolvedInstance', 'resolvedAt'],
        properties: {
          status: { type: 'string', enum: ['RESOLVED'] },
          serviceName: { type: 'string' },
          contractVersion: { type: 'string' },
          resolvedInstance: {
            type: 'object',
            required: ['instanceId', 'baseUrl', 'host', 'port'],
            properties: {
              instanceId: { type: 'string' },
              baseUrl: { type: 'string' },
              host: { type: 'string' },
              port: { type: 'integer' },
              internalEngine: { type: 'string' },
              endpoints: { type: 'object' }
            }
          },
          resolvedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};

// ==========================================
// ENDPOINTS DEL SERVICE REGISTRY
// ==========================================

// 1. Healthcheck del Service Registry
app.get('/health', (req, res) => {
  let activeInstances = 0;
  for (const instances of registry.values()) {
    for (const inst of instances.values()) {
      if (inst.status === 'UP') activeInstances++;
    }
  }

  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: 'service-registry',
    role: 'Servidor de Descubrimiento de Servicios y Registro de Contratos',
    contractVersion: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    pid: process.pid,
    metrics: {
      registeredServiceTypes: registry.size,
      activeHealthyInstances: activeInstances,
      totalRegistrations,
      totalLookups,
      totalHeartbeats
    }
  });
});

// 2. Exponer Contrato Formal OpenAPI 3.0
app.get(['/api/v1/contract', '/api/registry/contract'], (req, res) => {
  res.status(200).json(REGISTRY_OPENAPI_CONTRACT);
});

// 3. Auto-registro de un microservicio (Validacion estricta de contrato)
app.post(['/api/v1/registry/register', '/api/registry/register'], (req, res) => {
  const {
    serviceName,
    instanceId,
    host,
    port,
    protocol = 'http',
    contractVersion,
    healthCheckUrl,
    contractUrl,
    internalEngine = 'v1-default',
    endpoints = {},
    ttlSeconds = 18
  } = req.body;

  // Validacion formal del contrato de registro
  const missingFields = [];
  if (!serviceName) missingFields.push('serviceName');
  if (!instanceId) missingFields.push('instanceId');
  if (!host) missingFields.push('host');
  if (port === undefined || port === null || isNaN(Number(port))) missingFields.push('port (integer)');
  if (!contractVersion) missingFields.push('contractVersion');

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: 'CONTRACT_VIOLATION',
      code: 400,
      contract: 'ServiceRegistrationInput v1.0.0',
      error: 'El payload de registro incumple el contrato formal de interfaz.',
      missingOrInvalidFields: missingFields
    });
  }

  if (!registry.has(serviceName)) {
    registry.set(serviceName, new Map());
    roundRobinCounters.set(serviceName, 0);
  }

  const serviceInstances = registry.get(serviceName);
  const now = new Date().toISOString();
  const baseUrl = `${protocol}://${host}:${Number(port)}`;

  const existing = serviceInstances.get(instanceId);
  const instanceRecord = {
    serviceName,
    instanceId,
    host,
    port: Number(port),
    protocol,
    baseUrl,
    contractVersion,
    healthCheckUrl: healthCheckUrl || `${baseUrl}/health`,
    contractUrl: contractUrl || `${baseUrl}/api/v1/contract`,
    internalEngine,
    endpoints,
    status: 'UP',
    ttlSeconds,
    registeredAt: existing ? existing.registeredAt : now,
    lastHeartbeat: now,
    heartbeatCount: existing ? existing.heartbeatCount + 1 : 1,
    lookupHits: existing ? existing.lookupHits : 0
  };

  serviceInstances.set(instanceId, instanceRecord);
  totalRegistrations++;

  console.log(`[SERVICE-REGISTRY] [REGISTER] Servicio "${serviceName}" (${instanceId}) registrado en ${baseUrl} | Contrato v${contractVersion} | Motor interno: ${internalEngine}`);
  recordDiscoveryEvent('REGISTER', serviceName, instanceId, `Registrado en ${baseUrl} (Contrato v${contractVersion}, Motor: ${internalEngine})`);

  return res.status(201).json({
    status: 'REGISTERED',
    message: 'Instancia registrada exitosamente bajo contrato formal v1.0.0',
    instance: instanceRecord
  });
});

// 4. Heartbeat de instancia para mantener estado UP
app.put(['/api/v1/registry/heartbeat/:serviceName/:instanceId', '/api/registry/heartbeat/:serviceName/:instanceId'], (req, res) => {
  const { serviceName, instanceId } = req.params;
  const { internalEngine } = req.body || {};

  if (!registry.has(serviceName) || !registry.get(serviceName).has(instanceId)) {
    return res.status(404).json({
      status: 'NOT_FOUND',
      error: `Instancia ${instanceId} del servicio ${serviceName} no figura en el registro. Debe re-registrarse.`
    });
  }

  const inst = registry.get(serviceName).get(instanceId);
  const wasDown = inst.status !== 'UP';
  inst.lastHeartbeat = new Date().toISOString();
  inst.status = 'UP';
  inst.heartbeatCount += 1;
  if (internalEngine) {
    inst.internalEngine = internalEngine;
  }
  totalHeartbeats++;

  if (wasDown) {
    recordDiscoveryEvent('RECOVERED', serviceName, instanceId, `Instancia recuperada via heartbeat en ${inst.baseUrl}`);
  }

  return res.status(200).json({
    status: 'HEARTBEAT_ACK',
    serviceName,
    instanceId,
    lastHeartbeat: inst.lastHeartbeat,
    internalEngine: inst.internalEngine
  });
});

// 5. Des-registro explicito
app.delete(['/api/v1/registry/deregister/:serviceName/:instanceId', '/api/registry/deregister/:serviceName/:instanceId'], (req, res) => {
  const { serviceName, instanceId } = req.params;
  if (registry.has(serviceName) && registry.get(serviceName).has(instanceId)) {
    registry.get(serviceName).delete(instanceId);
    recordDiscoveryEvent('DEREGISTER', serviceName, instanceId, 'Instancia eliminada limpiamente del registro.');
    return res.status(200).json({ status: 'DEREGISTERED', serviceName, instanceId });
  }
  return res.status(404).json({ status: 'NOT_FOUND', error: 'Instancia no encontrada' });
});

// 6. Descubrimiento Dinamico de un Servicio (Service Discovery Lookup)
app.get(['/api/v1/registry/discover/:serviceName', '/api/registry/discover/:serviceName'], (req, res) => {
  const { serviceName } = req.params;
  totalLookups++;

  if (!registry.has(serviceName)) {
    recordDiscoveryEvent('DISCOVER_MISS', serviceName, 'N/A', 'Servicio no registrado en el directorio.');
    return res.status(404).json({
      status: 'SERVICE_NOT_FOUND',
      code: 404,
      serviceName,
      error: `El servicio "${serviceName}" no se encuentra registrado en el Service Registry.`
    });
  }

  const allInstances = Array.from(registry.get(serviceName).values());
  const healthyInstances = allInstances.filter(i => i.status === 'UP');

  if (healthyInstances.length === 0) {
    recordDiscoveryEvent('DISCOVER_UNHEALTHY', serviceName, 'N/A', 'Existen instancias registradas pero ninguna tiene estado UP.');
    return res.status(503).json({
      status: 'NO_HEALTHY_INSTANCES',
      code: 503,
      serviceName,
      error: `No hay instancias saludables (UP) para el servicio "${serviceName}".`
    });
  }

  // Balanceo Round-Robin entre instancias saludables registradas
  const currentCounter = roundRobinCounters.get(serviceName) || 0;
  const selectedIndex = currentCounter % healthyInstances.length;
  roundRobinCounters.set(serviceName, currentCounter + 1);

  const selected = healthyInstances[selectedIndex];
  selected.lookupHits += 1;

  console.log(`[SERVICE-REGISTRY] [DISCOVER] "${serviceName}" resuelto dinamicamente -> ${selected.baseUrl} (${selected.instanceId})`);
  recordDiscoveryEvent('DISCOVER_RESOLVED', serviceName, selected.instanceId, `Resuelto dinamicamente a ${selected.baseUrl} (Hit #${selected.lookupHits})`);

  return res.status(200).json({
    status: 'RESOLVED',
    serviceName,
    contractVersion: selected.contractVersion,
    totalHealthyInstances: healthyInstances.length,
    loadBalancingStrategy: 'Round-Robin',
    resolvedInstance: {
      instanceId: selected.instanceId,
      baseUrl: selected.baseUrl,
      host: selected.host,
      port: selected.port,
      protocol: selected.protocol,
      healthCheckUrl: selected.healthCheckUrl,
      contractUrl: selected.contractUrl,
      internalEngine: selected.internalEngine,
      endpoints: selected.endpoints,
      lookupHits: selected.lookupHits
    },
    resolvedAt: new Date().toISOString()
  });
});

// 7. Catalogo completo de servicios e historial de eventos de discovery
app.get(['/api/v1/registry/services', '/api/registry/services'], (req, res) => {
  const now = Date.now();
  const catalog = [];

  for (const [serviceName, instances] of registry.entries()) {
    const instList = Array.from(instances.values()).map(inst => ({
      ...inst,
      secondsSinceLastHeartbeat: Math.max(0, Math.round((now - new Date(inst.lastHeartbeat).getTime()) / 1000))
    }));
    catalog.push({
      serviceName,
      totalInstances: instList.length,
      healthyInstances: instList.filter(i => i.status === 'UP').length,
      instances: instList
    });
  }

  res.status(200).json({
    registryNode: NODE_NAME,
    contractVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    metrics: {
      totalRegistrations,
      totalLookups,
      totalHeartbeats,
      registeredServiceCount: catalog.length
    },
    services: catalog,
    recentEvents: discoveryHistory.slice(0, 25)
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO SERVICE REGISTRY] Escuchando en puerto ${PORT}`);
  console.log(`[PID: ${process.pid}] [HOST: ${os.hostname()}]`);
  console.log(`=======================================================`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
