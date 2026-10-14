const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_NAME = process.env.NODE_NAME || 'hoscorp-backend-clinical';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for physical node trace
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] [Nodo: ${NODE_NAME}] [PID: ${process.pid}] ${req.method} ${req.url} - Client IP: ${req.ip}`);
  next();
});

// Helper: Load records from persistent JSON file
function loadRecords() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
    return [];
  } catch (err) {
    console.error('Error al leer el archivo de registros:', err.message);
    return [];
  }
}

// Helper: Save records to persistent JSON file
function saveRecords(records) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error al guardar el archivo de registros:', err.message);
  }
}

// Ensure initial file exists
if (!fs.existsSync(DATA_FILE)) {
  const initialData = [
    {
      id: 'rec-1001',
      paciente: 'Carlos Gómez',
      dni: '32.456.789',
      fecha: '2026-10-10',
      centroSalud: 'Hospital Central de Córdoba',
      profesional: 'Dra. Sofía Albarracín (Mat. 44521)',
      diagnostico: 'Hipertensión arterial estadio 1',
      observaciones: 'Control trimestral de presión. Se indica dieta hiposódica y enalapril 10mg.'
    },
    {
      id: 'rec-1002',
      paciente: 'María Elena Walsh',
      dni: '28.112.334',
      fecha: '2026-10-12',
      centroSalud: 'Clínica Privada San Lucas',
      profesional: 'Dr. Fernando Morales (Mat. 39820)',
      diagnostico: 'Traumatismo leve de muñeca izquierda',
      observaciones: 'Radiografía sin signos de fractura ósea. Férula inmovilizadora por 7 días.'
    }
  ];
  saveRecords(initialData);
}

// ==========================================
// ENDPOINTS DEL NODO BACKEND
// ==========================================

// 1. Healthcheck Endpoint (Verifica que este nodo físico está vivo)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    node: NODE_NAME,
    service: 'clinical-records-service',
    role: 'Backend API Clínico',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    pid: process.pid,
    memoryUsageMB: {
      rss: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2),
      heapUsed: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)
    }
  });
});

// 2. Info de Arquitectura y Nodo Distribuido
app.get('/api/info', (req, res) => {
  res.status(200).json({
    project: 'Hoscorp - Gestión Unificada de Historias Clínicas',
    course: 'Programación Distribuida y Componentes',
    group: 'Grupo 2',
    authors: ['Donato Mattio', 'Cristian Carilavi'],
    delivery: 'Entrega 2 - Arquitectura de Infraestructura',
    nodeInfo: {
      nodeId: 'node-backend-01',
      name: NODE_NAME,
      port: PORT,
      executionModel: 'Cliente-Servidor / Microservicios orientados a dominio',
      executionModelJustification: 'Separación física estricta entre el frontend de usuario y la lógica clínica para garantizar soberanía del dato, control de accesos y resiliencia.',
      isolationType: 'Proceso/Contenedor independiente con namespace y cgroups aislados'
    },
    endpoints: [
      { method: 'GET', path: '/health', description: 'Healthcheck del nodo físico' },
      { method: 'GET', path: '/api/info', description: 'Metadatos arquitecturales del nodo' },
      { method: 'GET', path: '/api/records', description: 'Obtener historial clínico unificado' },
      { method: 'POST', path: '/api/records', description: 'Cargar nuevo registro médico' },
      { method: 'DELETE', path: '/api/records/:id', description: 'Eliminar registro médico por ID' }
    ]
  });
});

// 3. Obtener todos los registros clínicos
app.get('/api/records', (req, res) => {
  const records = loadRecords();
  res.status(200).json({
    node: NODE_NAME,
    count: records.length,
    data: records
  });
});

// 4. Crear un nuevo registro clínico
app.post('/api/records', (req, res) => {
  const { paciente, dni, centroSalud, profesional, diagnostico, observaciones } = req.body;

  if (!paciente || !diagnostico || !centroSalud) {
    return res.status(400).json({
      error: 'Campos requeridos faltantes: paciente, diagnostico y centroSalud son obligatorios.'
    });
  }

  const records = loadRecords();
  const newRecord = {
    id: `rec-${Date.now()}`,
    paciente: paciente.trim(),
    dni: dni ? dni.trim() : 'Sin DNI',
    fecha: new Date().toISOString().split('T')[0],
    centroSalud: centroSalud.trim(),
    profesional: profesional ? profesional.trim() : 'Profesional de Guardia',
    diagnostico: diagnostico.trim(),
    observaciones: observaciones ? observaciones.trim() : 'Sin observaciones adicionales.'
  };

  records.unshift(newRecord);
  saveRecords(records);

  console.log(`[INFO] Nuevo registro clínico creado con éxito: ID ${newRecord.id} para paciente ${newRecord.paciente}`);
  res.status(201).json({
    message: 'Registro clínico guardado exitosamente en el nodo backend',
    node: NODE_NAME,
    data: newRecord
  });
});

// 5. Eliminar un registro clínico por ID
app.delete('/api/records/:id', (req, res) => {
  const { id } = req.params;
  let records = loadRecords();
  const index = records.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Registro con ID ${id} no encontrado.` });
  }

  const deleted = records.splice(index, 1)[0];
  saveRecords(records);

  console.log(`[INFO] Registro clínico eliminado: ID ${id}`);
  res.status(200).json({
    message: 'Registro eliminado exitosamente',
    data: deleted
  });
});

// Manejo de rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado en este nodo.' });
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================================');
  console.log(`[NODO BACKEND HOSCORP] Iniciado con exito`);
  console.log(`Escuchando en: http://0.0.0.0:${PORT}`);
  console.log(`Servicio: clinical-records-service`);
  console.log(`Hostname: ${os.hostname()} | PID: ${process.pid}`);
  console.log(`Directorio de datos: ${DATA_DIR}`);
  console.log('=====================================================');
});

// Cierre elegante (Graceful shutdown)
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM. Deteniendo nodo backend de forma controlada...');
  server.close(() => {
    console.log('Nodo backend finalizado correctamente.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT (Ctrl+C). Deteniendo nodo backend...');
  server.close(() => {
    console.log('Nodo backend finalizado correctamente.');
    process.exit(0);
  });
});
