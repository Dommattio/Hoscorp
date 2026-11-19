// ==============================================================================
// HOSCORP - ENTREGA 6 FINAL: DEMO EN VIVO DE PUNTA A PUNTA (NODE.JS)
// ==============================================================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runDemo() {
  console.log('======================================================================');
  console.log('  HOSCORP: DEMO EN VIVO DE PUNTA A PUNTA - LAS 6 CAPAS (NODE.JS)');
  console.log('======================================================================\n');

  const e2e = await fetch(`${BACKEND_URL}/api/v1/demo/run-e2e-all-layers`, { method: 'POST' }).then(r => r.json());
  for (const l of e2e.layersReport) {
    console.log(`  [${l.status}] ${l.layerName}`);
    console.log(`      ${l.evidence}`);
  }

  console.log('\n[2] Probando Escalabilidad Horizontal (4 Nodos + Balanceo Round-Robin)...');
  const scale = await fetch(`${BACKEND_URL}/api/v1/scalability/scale-cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetReplicas: 4 })
  }).then(r => r.json());

  console.log(`  [OK] Instancias activas: ${scale.activeInstancesCount} | Distribucion:`, scale.roundRobinDistribution);

  const metrics = await fetch(`${BACKEND_URL}/api/v1/scalability/metrics`).then(r => r.json());
  console.log(`  [OK] Cache L1 Hit Ratio: ${metrics.cacheMetrics.hitRatioPercent} | Circuit Breaker: ${metrics.circuitBreaker.state}`);
  console.log('\nDemo en vivo finalizada exitosamente.');
}

runDemo().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
