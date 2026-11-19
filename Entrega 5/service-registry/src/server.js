const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5002;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-service-registry';

app.use(cors());
app.use(express.json());

const registry = new Map();
const roundRobinCounters = new Map();
const discoveryHistory = [];
const MAX_HISTORY = 100;

let totalRegistrations = 0;
let totalLookups = 0;
let totalHeartbeats = 0;
let totalFailovers = 0;

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

// Verificador periodico de expiracion de TTL
setInterval(() => {
  const now = Date.now();
  for (const [serviceName, instances] of registry.entries()) {
    for (const [instanceId, inst] of instances.entries()) {
      if (inst.simulatedDown) continue; // Respetar estado simulado de fallo hasta restauracion
      const elapsed = now - new Date(inst.lastHeartbeat).getTime();
      const ttlMs = (inst.ttlSeconds || 18) * 1000;
      if (elapsed > ttlMs && inst.status === 'UP') {
        inst.status = 'DOWN_TTL_EXPIRED';
        recordDiscoveryEvent('TTL_EXPIRED', serviceName, instanceId, `Sin heartbeat por mas de ${inst.ttlSeconds}s`);
      }
    }
  }
}, 3000);

const REGISTRY_OPENAPI_CONTRACT = {
  openapi: '3.0.3',
  info: {
    title: 'Hoscorp Service Discovery & Failover Registry API',
    version: '1.0.0',
    description: 'Contrato formal del servidor de descubrimiento de servicios de Hoscorp (Entrega 5). Soporta auto-registro de instancias primarias y replicas, monitoreo por heartbeat con TTL y conmutacion automatica ante fallos (Failover).'
  },
  servers: [
    { url: 'http://localhost:5002', description: 'Acceso local directo al Service Registry' },
    { url: 'http://service-registry:5002', description: 'Acceso interno en red Docker hoscorp-net' }
  ],
  paths: {
    '/api/v1/registry/register': {
      post: {
        summary: 'Auto-registrar una instancia primaria o replica',
        responses: { '201': { description: 'Instancia registrada' } }
      }
    },
    '/api/v1/registry/discover/{serviceName}': {
      get: {
        summary: 'Resolver dinamicamente una instancia saludable con Failover automatico a replica',
        responses: { '200': { description: 'Instancia saludable resuelta' } }
      }
    },
    '/api/v1/registry/simulate-failover/{serviceName}': {
      post: {
        summary: 'Simular caida del nodo primario y verificar Failover automatico hacia la instancia replica',
        responses: { '200': { description: 'Failover ejecutado hacia instancia replica' } }
      }
    }
  }
};

// 1. Healthcheck
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
    role: 'Servidor de Descubrimiento, Replicacion y Failover',
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
      totalHeartbeats,
      totalFailovers
    }
  });
});

// 2. Contrato OpenAPI
app.get(['/api/v1/contract', '/api/registry/contract'], (req, res) => {
  res.status(200).json(REGISTRY_OPENAPI_CONTRACT);
});

// 3. Auto-registro de instancia (primaria o replica)
app.post(['/api/v1/registry/register', '/api/registry/register'], (req, res) => {
  const {
    serviceName,
    instanceId,
    host,
    port,
    protocol = 'http',
    contractVersion,
    role = 'PRIMARY',
    healthCheckUrl,
    contractUrl,
    internalEngine = 'v1-default',
    endpoints = {},
    ttlSeconds = 18
  } = req.body;

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
  const isSimulatedDown = existing ? Boolean(existing.simulatedDown) : false;

  const instanceRecord = {
    serviceName,
    instanceId,
    role,
    host,
    port: Number(port),
    protocol,
    baseUrl,
    contractVersion,
    healthCheckUrl: healthCheckUrl || `${baseUrl}/health`,
    contractUrl: contractUrl || `${baseUrl}/api/v1/contract`,
    internalEngine,
    endpoints,
    status: isSimulatedDown ? 'DOWN_SIMULATED_CRASH' : 'UP',
    simulatedDown: isSimulatedDown,
    ttlSeconds,
    registeredAt: existing ? existing.registeredAt : now,
    lastHeartbeat: now,
    heartbeatCount: existing ? existing.heartbeatCount + 1 : 1,
    lookupHits: existing ? existing.lookupHits : 0
  };

  serviceInstances.set(instanceId, instanceRecord);
  totalRegistrations++;

  recordDiscoveryEvent('REGISTER', serviceName, instanceId, `Registrado [${role}] en ${baseUrl} (Motor: ${internalEngine})`);

  return res.status(201).json({
    status: 'REGISTERED',
    instance: instanceRecord
  });
});

// 4. Heartbeat
app.put(['/api/v1/registry/heartbeat/:serviceName/:instanceId', '/api/registry/heartbeat/:serviceName/:instanceId'], (req, res) => {
  const { serviceName, instanceId } = req.params;
  const { internalEngine } = req.body || {};

  if (!registry.has(serviceName) || !registry.get(serviceName).has(instanceId)) {
    return res.status(404).json({ status: 'NOT_FOUND', error: 'Instancia no encontrada' });
  }

  const inst = registry.get(serviceName).get(instanceId);
  inst.lastHeartbeat = new Date().toISOString();
  if (!inst.simulatedDown) {
    inst.status = 'UP';
  }
  inst.heartbeatCount += 1;
  if (internalEngine) inst.internalEngine = internalEngine;
  totalHeartbeats++;

  return res.status(200).json({
    status: 'HEARTBEAT_ACK',
    serviceName,
    instanceId,
    currentStatus: inst.status
  });
});

// 5. Descubrimiento Dinamico con Failover a Replica
app.get(['/api/v1/registry/discover/:serviceName', '/api/registry/discover/:serviceName'], (req, res) => {
  const { serviceName } = req.params;
  totalLookups++;

  if (!registry.has(serviceName)) {
    return res.status(404).json({
      status: 'SERVICE_NOT_FOUND',
      code: 404,
      serviceName,
      error: `El servicio "${serviceName}" no se encuentra registrado.`
    });
  }

  const allInstances = Array.from(registry.get(serviceName).values());
  const healthyInstances = allInstances.filter(i => i.status === 'UP');
  const downInstances = allInstances.filter(i => i.status !== 'UP');

  if (healthyInstances.length === 0) {
    return res.status(503).json({
      status: 'NO_HEALTHY_INSTANCES',
      code: 503,
      serviceName,
      error: `No hay instancias saludables (UP) para "${serviceName}".`
    });
  }

  const currentCounter = roundRobinCounters.get(serviceName) || 0;
  const selectedIndex = currentCounter % healthyInstances.length;
  roundRobinCounters.set(serviceName, currentCounter + 1);

  const selected = healthyInstances[selectedIndex];
  selected.lookupHits += 1;

  const failoverActive = downInstances.length > 0;
  if (failoverActive) {
    totalFailovers++;
    recordDiscoveryEvent('FAILOVER_ROUTED', serviceName, selected.instanceId, `Primario caido (${downInstances[0].instanceId}). Trafico redirigido automaticamente a replica saludable ${selected.instanceId}`);
  } else {
    recordDiscoveryEvent('DISCOVER_RESOLVED', serviceName, selected.instanceId, `Resuelto a ${selected.baseUrl} [${selected.role}]`);
  }

  return res.status(200).json({
    status: 'RESOLVED',
    serviceName,
    contractVersion: selected.contractVersion,
    failoverTriggered: failoverActive,
    failedInstancesSkipped: downInstances.map(d => d.instanceId),
    totalHealthyInstances: healthyInstances.length,
    loadBalancingStrategy: failoverActive ? 'Failover-to-Healthy-Replica' : 'Round-Robin',
    resolvedInstance: {
      instanceId: selected.instanceId,
      role: selected.role,
      baseUrl: selected.baseUrl,
      host: selected.host,
      port: selected.port,
      protocol: selected.protocol,
      internalEngine: selected.internalEngine,
      endpoints: selected.endpoints,
      lookupHits: selected.lookupHits
    },
    resolvedAt: new Date().toISOString()
  });
});

// 6. Simular Caida de Instancia Primaria para probar Failover hacia Replica
app.post(['/api/v1/registry/simulate-failover/:serviceName', '/api/registry/simulate-failover/:serviceName'], (req, res) => {
  const { serviceName } = req.params;
  if (!registry.has(serviceName)) {
    return res.status(404).json({ error: `Servicio ${serviceName} no registrado` });
  }

  const instances = Array.from(registry.get(serviceName).values());
  const primary = instances.find(i => i.role === 'PRIMARY') || instances[0];
  const replica = instances.find(i => i.instanceId !== primary.instanceId);

  if (primary) {
    primary.status = 'DOWN_SIMULATED_CRASH';
    primary.simulatedDown = true;
    totalFailovers++;
    recordDiscoveryEvent('PRIMARY_CRASH_SIMULATED', serviceName, primary.instanceId, `Fallo inyectado en nodo primario ${primary.instanceId}. Conmutando trafico a replica ${replica ? replica.instanceId : 'N/A'}.`);
  }

  res.status(200).json({
    status: 'FAILOVER_SIMULATED',
    serviceName,
    crashedPrimaryInstance: primary ? primary.instanceId : null,
    activeReplicaInstance: replica ? replica.instanceId : null,
    message: `La instancia primaria "${primary ? primary.instanceId : ''}" fue marcada como DOWN_SIMULATED_CRASH. El Service Registry redirigira automaticamente todas las consultas a la instancia replica "${replica ? replica.instanceId : ''}".`
  });
});

// 7. Restaurar todas las instancias caidas
app.post(['/api/v1/registry/restore-instances', '/api/registry/restore-instances'], (req, res) => {
  const restored = [];
  for (const [serviceName, instances] of registry.entries()) {
    for (const [instanceId, inst] of instances.entries()) {
      if (inst.simulatedDown || inst.status !== 'UP') {
        inst.simulatedDown = false;
        inst.status = 'UP';
        inst.lastHeartbeat = new Date().toISOString();
        restored.push(`${serviceName}/${instanceId}`);
      }
    }
  }
  recordDiscoveryEvent('CLUSTER_RESTORED', 'ALL', 'ALL', `Instancias restauradas a estado UP: ${restored.join(', ') || 'Ninguna caida'}`);
  res.status(200).json({
    status: 'INSTANCES_RESTORED',
    restoredInstances: restored
  });
});

// 8. Catalogo completo de servicios
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
      totalFailovers,
      registeredServiceCount: catalog.length
    },
    services: catalog,
    recentEvents: discoveryHistory.slice(0, 25)
  });
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[NODO SERVICE REGISTRY] Escuchando en puerto ${PORT}`);
  console.log(`=======================================================`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
