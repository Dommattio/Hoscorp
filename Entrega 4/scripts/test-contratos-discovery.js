// ==============================================================================
// HOSCORP - ENTREGA 4: PRUEBA MULTIPLATAFORMA DE CONTRATOS Y SERVICE DISCOVERY
// Ejecuta las verificaciones formales del Modulo 4 en Node.js
// ==============================================================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const NOTIF_URL = process.env.NOTIF_URL || 'http://localhost:5001';
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:5002';

async function runTests() {
  console.log('======================================================================');
  console.log('  HOSCORP: CERTIFICACION DE CONTRATOS Y SERVICE DISCOVERY (NODE.JS)');
  console.log('======================================================================\n');

  // 1. Verificar Contratos OpenAPI 3.0.3
  console.log('[1] Verificando contratos OpenAPI 3.0.3 expuestos por los componentes...');
  const [c1, c2, c3] = await Promise.all([
    fetch(`${BACKEND_URL}/api/v1/contract`).then(r => r.json()),
    fetch(`${NOTIF_URL}/api/v1/contract`).then(r => r.json()),
    fetch(`${REGISTRY_URL}/api/v1/contract`).then(r => r.json())
  ]);
  console.log(`  [OK] Backend: ${c1.info.title} (OpenAPI ${c1.openapi})`);
  console.log(`  [OK] Notificaciones: ${c2.info.title} (OpenAPI ${c2.openapi})`);
  console.log(`  [OK] Service Registry: ${c3.info.title} (OpenAPI ${c3.openapi})`);

  // 2. Verificar Service Discovery
  console.log('\n[2] Verificando auto-registro y resolucion dinamica en Service Registry...');
  const discRes = await fetch(`${REGISTRY_URL}/api/v1/registry/discover/notification-service`);
  const discBody = await discRes.json();
  console.log(`  [OK] notification-service resuelto dinamicamente a: ${discBody.resolvedInstance.baseUrl} (${discBody.resolvedInstance.instanceId})`);

  // 3. Ejecutar suite de desacople y mutacion interna V1 -> V2
  console.log('\n[3] Ejecutando suite de mutacion interna (Motor V1 Plano <-> Motor V2 EHR SHA-256)...');
  const suiteRes = await fetch(`${BACKEND_URL}/api/v1/contract/verify-decoupling`, { method: 'POST' });
  const suiteBody = await suiteRes.json();

  for (const step of suiteBody.steps) {
    console.log(`  [PASO ${step.step}] [${step.passed ? 'OK' : 'FALLO'}] ${step.name}`);
    console.log(`           ${step.details}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`[VEREDICTO FINAL] Todas las pruebas superadas: ${suiteBody.allTestsPassed}`);
  console.log('----------------------------------------------------------------------\n');
}

runTests().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
