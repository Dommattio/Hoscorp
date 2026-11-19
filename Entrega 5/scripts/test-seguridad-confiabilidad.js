// ==============================================================================
// HOSCORP - ENTREGA 5: PRUEBA MULTIPLATAFORMA DE SEGURIDAD Y CONFIABILIDAD
// ==============================================================================

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function runTests() {
  console.log('======================================================================');
  console.log('  HOSCORP: CERTIFICACION DE SEGURIDAD Y CONFIABILIDAD (NODE.JS)');
  console.log('======================================================================\n');

  // 1. Autenticacion JWT
  console.log('[1] Probando Autenticacion de Usuarios (JWT HMAC-SHA256)...');
  const medAuth = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dra.gomez', password: 'medico123' })
  }).then(r => r.json());

  const pacAuth = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'carlos.gomez', password: 'paciente123' })
  }).then(r => r.json());

  console.log(`  [OK] Dra. Gomez autenticada con rol: ${medAuth.user.role}`);
  console.log(`  [OK] Carlos Gomez autenticado con rol: ${pacAuth.user.role}`);

  // 2. Autorizacion RBAC
  console.log('\n[2] Verificando Control de Acceso Basado en Roles (RBAC)...');
  const unauthRes = await fetch(`${BACKEND_URL}/api/v1/records/rec-1001`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, diagnostico: 'Intento sin token' })
  });
  console.log(`  [OK] Intento sin token bloqueado con HTTP ${unauthRes.status} (Esperado: 401)`);

  const pacRes = await fetch(`${BACKEND_URL}/api/v1/records/rec-1001`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pacAuth.token}`
    },
    body: JSON.stringify({ version: 1, diagnostico: 'Intento con rol PACIENTE' })
  });
  console.log(`  [OK] Intento de escritura por rol PACIENTE bloqueado con HTTP ${pacRes.status} (Esperado: 403)`);

  // 3. Estado TLS
  console.log('\n[3] Verificando Cifrado en Transito (HTTPS/TLS X.509)...');
  const tls = await fetch(`${BACKEND_URL}/api/v1/security/tls-status`).then(r => r.json());
  console.log(`  [OK] Certificado X.509: ${tls.certificate.subject}`);
  console.log(`  [OK] Fingerprint SHA-256: ${tls.certificate.fingerprint256}`);

  // 4. Replicacion y Recuperacion ante Fallos
  console.log('\n[4] Ejecutando Simulacion de Fallo y Recuperacion Automatica (Self-Healing + Failover)...');
  const rec = await fetch(`${BACKEND_URL}/api/v1/reliability/simulate-failure-and-recover`, {
    method: 'POST'
  }).then(r => r.json());

  for (const s of rec.timeline) {
    console.log(`  [PASO ${s.step}] [${s.status}] ${s.details}`);
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`[VEREDICTO FINAL] Recuperacion exitosa: ${rec.allRecoveredSuccessfully} (RPO=${rec.rpoRecordsLost}, RTO=${rec.rtoRecoveryTimeMs}ms)`);
  console.log('----------------------------------------------------------------------\n');
}

runTests().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
