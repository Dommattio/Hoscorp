// ==============================================================================
// HOSCORP - ENTREGA 3: DEMOSTRACION DE CONCURRENCIA (OCC)
// Script de prueba multiplataforma en Node.js (Dos peticiones HTTP en paralelo)
// ==============================================================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const NOTIF_URL = process.env.NOTIF_URL || 'http://localhost:5001';
const RECORD_ID = 'rec-1001';

async function runTest() {
  console.log('======================================================================');
  console.log('  HOSCORP: PRUEBA DE CONCURRENCIA DISTRIBUIDA (NODE.JS HTTP)');
  console.log('======================================================================\n');

  // 1. Reset data
  try {
    await fetch(`${BACKEND_URL}/api/records/reset`, { method: 'POST' });
    console.log('[PASO 1] Datos semilla reiniciados.');
  } catch (err) {
    console.log('[PASO 1] No se pudo invocar reset, continuando.');
  }

  // 2. Fetch current record to get base version
  console.log(`[PASO 2] Obteniendo version base del registro ${RECORD_ID}...`);
  const recordRes = await fetch(`${BACKEND_URL}/api/records/${RECORD_ID}`);
  const recordJson = await recordRes.json();
  const currentRecord = recordJson.data;
  const baseVersion = currentRecord.version;

  console.log(`  Paciente: ${currentRecord.paciente}`);
  console.log(`  Version base actual: ${baseVersion}`);

  // 3. Dispatch 2 parallel requests with the SAME base version
  console.log(`\n[PASO 3] Disparando 2 peticiones PUT simultaneas con version = ${baseVersion}...`);

  const payloadA = {
    version: baseVersion,
    diagnostico: `${currentRecord.diagnostico} (Modificado por Dra. Gomez)`,
    modificadoPor: 'Hilo-A (Dra. Gomez)'
  };

  const payloadB = {
    version: baseVersion,
    diagnostico: `${currentRecord.diagnostico} (Modificado por Dr. Ramirez)`,
    modificadoPor: 'Hilo-B (Dr. Ramirez)'
  };

  const startTime = Date.now();
  const [resA, resB] = await Promise.all([
    fetch(`${BACKEND_URL}/api/records/${RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadA)
    }),
    fetch(`${BACKEND_URL}/api/records/${RECORD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadB)
    })
  ]);

  const durationMs = Date.now() - startTime;
  const bodyA = await resA.json();
  const bodyB = await resB.json();

  console.log(`\n======================================================================`);
  console.log(`  RESULTADO DE LA EJECUCION CONCURRENTE (${durationMs} ms)`);
  console.log(`======================================================================`);

  console.log(`\n[PETICION A] Codigo HTTP: ${resA.status} ${resA.statusText}`);
  console.log(JSON.stringify(bodyA, null, 2));

  console.log(`\n[PETICION B] Codigo HTTP: ${resB.status} ${resB.statusText}`);
  console.log(JSON.stringify(bodyB, null, 2));

  const hasSuccess = resA.status === 200 || resB.status === 200;
  const hasConflict = resA.status === 409 || resB.status === 409;

  console.log('\n----------------------------------------------------------------------');
  if (hasSuccess && hasConflict) {
    console.log('[VEREDICTO] EXITO: Se demostro la resolucion del caso de concurrencia.');
    console.log('            1 peticion aplico el cambio y evoluciono la version.');
    console.log('            1 peticion fue detectada como obsoleta y rechazada con 409 Conflict.');
    console.log('            La anomalia Lost Update fue evitada.');
  } else {
    console.log('[VEREDICTO] Resultado inesperado en los codigos de estado.');
  }
  console.log('----------------------------------------------------------------------\n');
}

runTest().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
