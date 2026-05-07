const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

// Carpeta donde se guardan las boletas para el link de WhatsApp
const BOLETAS_DIR = path.join(__dirname, 'boletas');
if (!fs.existsSync(BOLETAS_DIR)) {
    fs.mkdirSync(BOLETAS_DIR, { recursive: true });
}

// ============================================================
// CONEXIÓN A BASE DE DATOS — Aiven requiere SSL obligatorio
// ============================================================

// Intentamos cargar el certificado CA de Aiven (ca.pem en la raíz del proyecto)
// Si no existe el archivo, usamos rejectUnauthorized:false como fallback
let sslConfig;
const caCertPath = path.join(__dirname, 'ca.pem');
if (fs.existsSync(caCertPath)) {
    sslConfig = { ca: fs.readFileSync(caCertPath) };
    console.log('🔒 SSL: usando ca.pem local.');
} else {
    // Fallback: acepta cualquier certificado (útil si configuras el CA
    // como variable de entorno en Render en vez de archivo)
    sslConfig = { rejectUnauthorized: false };
    console.warn('⚠️  SSL: ca.pem no encontrado, usando rejectUnauthorized:false.');
}

const db = mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'db_planilla_cervantes',
    port:     parseInt(process.env.DB_PORT) || 3306,
    ssl:      sslConfig,
    // Reconexión automática si se cae la conexión idle de Aiven
    connectTimeout: 10000
});

function conectarDB() {
    db.connect(err => {
        if (err) {
            console.error('❌ Error al conectar con la base de datos:', err.message);
            console.error('   Verifica DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME en tu .env / Render.');
            // Reintenta en 5 segundos si falla
            setTimeout(conectarDB, 5000);
        } else {
            console.log('✅ Conectado a MySQL (Aiven) correctamente.');
        }
    });

    db.on('error', err => {
        console.error('❌ Error de BD en tiempo de ejecución:', err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('🔄 Reconectando a la base de datos...');
            conectarDB();
        }
    });
}

conectarDB();

// ============================================================
// USUARIOS DEL SISTEMA
// ============================================================
const usuarios = [
    { user: 'admin_cervantes', pass: 'cervantes2026', role: 'admin', nombre: 'Promotor Edgar Cervantes', dni: null },
    { user: 'jaime_ramirez',   pass: 'boleta2026',    role: 'user',  nombre: 'Jaime Gustavo Ramirez',   dni: '76758994' }
];

// ============================================================
// POST /api/login
// FIX: el frontend ahora llama a este endpoint en vez de validar
//      las credenciales directamente en el cliente.
// ============================================================
app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;

    if (!user || !pass) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales.' });
    }

    const cuenta = usuarios.find(u => u.user === user && u.pass === pass);

    if (cuenta) {
        res.json({
            success: true,
            role:    cuenta.role,
            nombre:  cuenta.nombre,
            dni:     cuenta.dni
        });
    } else {
        // 401 para que el frontend muestre el mensaje de error correcto
        res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }
});

// ============================================================
// GET /api/docentes?mes=5
// Filtra por rol usando cabeceras enviadas por el frontend
// ============================================================
app.get('/api/docentes', (req, res) => {
    const mes  = parseInt(req.query.mes) || 5;
    const role = req.headers['x-user-role'] || '';
    const dni  = req.headers['x-user-dni']  || '';

    let sql = `
        SELECT d.*,
               IFNULL(p.adelantos,          0)  AS adelantos,
               IFNULL(p.faltas,             0)  AS faltas,
               IFNULL(p.pension,            0)  AS pension,
               IFNULL(p.tardanza,           0)  AS tardanza,
               IFNULL(p.bono,               0)  AS bono,
               IFNULL(p.otros_descuentos,   0)  AS otros_descuentos,
               IFNULL(p.otros_desc_detalle, '') AS otros_desc_detalle
        FROM docentes d
        LEFT JOIN planillas p
               ON d.id_docente = p.id_docente
              AND p.mes  = ?
              AND p.anio = 2026`;

    const params = [mes];

    if (role === 'user' && dni) {
        sql += ' WHERE d.dni = ?';
        params.push(dni);
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error en /api/docentes:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(result);
    });
});

// ============================================================
// PUT /api/docentes/:id  — actualizar planilla de un docente
// FIX: ahora también permite actualizar sueldo_base
// ============================================================
app.put('/api/docentes/:id', (req, res) => {
    const id  = parseInt(req.params.id);
    const mes = parseInt(req.body.mes) || 5;

    const { sueldo_base, adelantos, faltas, pension, tardanza, bono, otros_descuentos, otros_desc_detalle } = req.body;

    // 1. Actualizar sueldo_base en la tabla docentes (si viene)
    if (sueldo_base !== undefined) {
        db.query(
            'UPDATE docentes SET sueldo_base = ? WHERE id_docente = ?',
            [sueldo_base, id],
            (err) => { if (err) console.error('Error actualizando sueldo:', err); }
        );
    }

    // 2. Upsert en planillas — incluye bono, otros_descuentos y detalle
    const sqlUpsert = `
        INSERT INTO planillas
            (id_docente, mes, anio, adelantos, faltas, pension, tardanza, bono, otros_descuentos, otros_desc_detalle)
        VALUES (?, ?, 2026, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            adelantos          = VALUES(adelantos),
            faltas             = VALUES(faltas),
            pension            = VALUES(pension),
            tardanza           = VALUES(tardanza),
            bono               = VALUES(bono),
            otros_descuentos   = VALUES(otros_descuentos),
            otros_desc_detalle = VALUES(otros_desc_detalle)`;

    db.query(
        sqlUpsert,
        [id, mes, adelantos||0, faltas||0, pension||0, tardanza||0, bono||0, otros_descuentos||0, otros_desc_detalle||''],
        (err) => {
            if (err) {
                console.error('Error en PUT /api/docentes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Planilla actualizada correctamente.' });
        }
    );
});

// ============================================================
// POST /api/guardar-boleta
// FIX: este endpoint faltaba en el server original.
//      Recibe el PDF en base64, lo guarda en /boletas/ y devuelve
//      la URL pública para enviarla por WhatsApp.
// ============================================================
app.post('/api/guardar-boleta', (req, res) => {
    const { filename, base64 } = req.body;

    if (!filename || !base64) {
        return res.status(400).json({ error: 'Faltan datos: filename o base64.' });
    }

    // Validar nombre de archivo para evitar path traversal
    const nombreSeguro = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const rutaArchivo  = path.join(BOLETAS_DIR, nombreSeguro);

    try {
        const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(rutaArchivo, buffer);

        // URL pública del archivo guardado
        const protocolo = req.headers['x-forwarded-proto'] || req.protocol;
        const host      = req.get('host');
        const urlPublica = `${protocolo}://${host}/boletas/${nombreSeguro}`;

        console.log(`📄 Boleta guardada: ${nombreSeguro}`);
        res.json({ success: true, url: urlPublica, filename: nombreSeguro });

    } catch (err) {
        console.error('Error al guardar boleta:', err);
        res.status(500).json({ error: 'No se pudo guardar el archivo.' });
    }
});

// Servir archivos de boletas guardadas
app.use('/boletas', express.static(BOLETAS_DIR));

// ============================================================
// GET /api/whatsapp-link  (ruta existente, mejorada)
// ============================================================
app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo, filename } = req.query;
    const numero     = '51943706872';
    const protocolo  = req.headers['x-forwarded-proto'] || req.protocol;
    const urlBoleta  = `${protocolo}://${req.get('host')}/boletas/${filename}`;
    const texto      = `Hola *${nombre}*, adjunto tu boleta de pago.\n*Total Neto:* S/ ${sueldo}\n*Link:* ${urlBoleta}`;
    const link       = `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`;
    res.json({ link });
});

// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});