const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const jwt = require('jsonwebtoken'); // <--- FALTA ESTA LÍNEA

require('dotenv').config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'cervantes_secret_2026';

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

// Carpeta donde se guardan las boletas para el link de WhatsApp
const BOLETAS_DIR = path.join(__dirname, 'boletas');
if (!fs.existsSync(BOLETAS_DIR)) {
    fs.mkdirSync(BOLETAS_DIR, { recursive: true });
}

// ============================================================
// MIDDLEWARE JWT
// ============================================================
function verificarToken(req, res, next) {

    const authHeader = req.headers['authorization'];

    if (!authHeader) {

        return res.status(401).json({
            error: 'Token requerido.'
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {

        return res.status(401).json({
            error: 'Token inválido.'
        });
    }

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        req.usuario = decoded;

        next();

    } catch (err) {

        return res.status(401).json({
            error: 'Token expirado o inválido.'
        });
    }
}

// ============================================================
// CONEXIÓN A BASE DE DATOS — Aiven requiere SSL obligatorio
// ============================================================

// ============================================================
// CONEXIÓN LOCAL MYSQL XAMPP
// ============================================================

const sslConfig = false;

const db = mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'db_planilla_cervantes',
    port:     parseInt(process.env.DB_PORT) || 3306,
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
    {
        user: 'admin_cervantes',
        pass: 'cervantes2026',
        role: 'admin',
        nombre: 'Promotor Edgar Cervantes',
        codigo_trabajador: null,
        telefono: null
    },
    // ── Docentes ──────────────────────────────────────────────
    { user: 'user_E000058', pass: 'pass123', role: 'user', nombre: 'ARIZO...', codigo_trabajador: 'E000058', telefono: '923885144' },
    { user: 'user_E000071', pass: 'pass123', role: 'user', nombre: 'ARONE...', codigo_trabajador: 'E000071', telefono: '987685524' },
    { user: 'user_E000051', pass: 'pass123', role: 'user', nombre: 'BURGA...', codigo_trabajador: 'E000051', telefono: '934116384' },
    { user: 'user_E000065', pass: 'pass123', role: 'user', nombre: 'CARAZA...', codigo_trabajador: 'E000065', telefono: '902631171' },
    { user: 'user_E000066', pass: 'pass123', role: 'user', nombre: 'CASTIL...', codigo_trabajador: 'E000066', telefono: '931916714' },
    { user: 'user_E000002', pass: 'pass123', role: 'user', nombre: 'CERVAN...', codigo_trabajador: 'E000002', telefono: null },
    { user: 'user_E000001', pass: 'pass123', role: 'user', nombre: 'CERVAN...', codigo_trabajador: 'E000001', telefono: null },
    { user: 'user_E000031', pass: 'pass123', role: 'user', nombre: 'CEVALL...', codigo_trabajador: 'E000031', telefono: null },
    { user: 'user_E000072', pass: 'pass123', role: 'user', nombre: 'CHAVEZ...', codigo_trabajador: 'E000072', telefono: null },
    { user: 'user_E000052', pass: 'pass123', role: 'user', nombre: 'CORONA...', codigo_trabajador: 'E000052', telefono: '947325101' },
    { user: 'user_E000033', pass: 'pass123', role: 'user', nombre: 'CRUZ B...', codigo_trabajador: 'E000033', telefono: null },
    { user: 'user_E000011', pass: 'pass123', role: 'user', nombre: 'DOMING...', codigo_trabajador: 'E000011', telefono: null },
    { user: 'user_E000018', pass: 'pass123', role: 'user', nombre: 'FLORES...', codigo_trabajador: 'E000018', telefono: null },
    { user: 'user_E000030', pass: 'pass123', role: 'user', nombre: 'GARCIA...', codigo_trabajador: 'E000030', telefono: null },
    { user: 'user_E000035', pass: 'pass123', role: 'user', nombre: 'GARCIA...', codigo_trabajador: 'E000035', telefono: null },
    { user: 'user_E000036', pass: 'pass123', role: 'user', nombre: 'GUERRE...', codigo_trabajador: 'E000036', telefono: null },
    { user: 'user_E000047', pass: 'pass123', role: 'user', nombre: 'MEDINA...', codigo_trabajador: 'E000047', telefono: null },
    { user: 'user_E000038', pass: 'pass123', role: 'user', nombre: 'MENDOZ...', codigo_trabajador: 'E000038', telefono: null },
    { user: 'user_E000067', pass: 'pass123', role: 'user', nombre: 'MEZA S...', codigo_trabajador: 'E000067', telefono: null },
    { user: 'user_E000055', pass: 'pass123', role: 'user', nombre: 'MUÑOZ...', codigo_trabajador: 'E000055', telefono: null },
    { user: 'user_E000074', pass: 'pass123', role: 'user', nombre: 'ORDINO...', codigo_trabajador: 'E000074', telefono: null },
    { user: 'user_E000003', pass: 'pass123', role: 'user', nombre: 'PAOLA...', codigo_trabajador: 'E000003', telefono: null },
    { user: 'user_E000063', pass: 'pass123', role: 'user', nombre: 'PALACI...', codigo_trabajador: 'E000063', telefono: null },
    { user: 'user_E000020', pass: 'pass123', role: 'user', nombre: 'PERFEC...', codigo_trabajador: 'E000020', telefono: null },
    { user: 'user_E000070', pass: 'pass123', role: 'user', nombre: 'PONCE...', codigo_trabajador: 'E000070', telefono: null },
    { user: 'user_E000062', pass: 'pass123', role: 'user', nombre: 'PUMAPU...', codigo_trabajador: 'E000062', telefono: '988310783' },
    { user: 'user_E000006', pass: 'pass123', role: 'user', nombre: 'QUISPE...', codigo_trabajador: 'E000006', telefono: null },
    { user: 'user_E000076', pass: 'pass123', role: 'user', nombre: 'RAMIRE...', codigo_trabajador: 'E000076', telefono: '943706872' },
    { user: 'user_E000060', pass: 'pass123', role: 'user', nombre: 'RAMOS...', codigo_trabajador: 'E000060', telefono: '963961696' },
    { user: 'user_E000021', pass: 'pass123', role: 'user', nombre: 'RIVAS...', codigo_trabajador: 'E000021', telefono: null },
    { user: 'user_E000056', pass: 'pass123', role: 'user', nombre: 'RODRIG...', codigo_trabajador: 'E000056', telefono: null },
    { user: 'user_E000073', pass: 'pass123', role: 'user', nombre: 'ROSALE...', codigo_trabajador: 'E000073', telefono: '971630057' },
    { user: 'user_E000022', pass: 'pass123', role: 'user', nombre: 'SALVAT...', codigo_trabajador: 'E000022', telefono: null }
   // { user: 'user_E000057', pass: 'pass123', role: 'user', nombre: 'SOLIS...', codigo_trabajador: 'E000057', telefono: null}
];

// ============================================================
// POST /api/login
// FIX: el frontend ahora llama a este endpoint en vez de validar
//      las credenciales directamente en el cliente.
// ============================================================
app.post('/api/login', (req, res) => {
    console.log(req.body);
    const { user, pass } = req.body;

    if (!user || !pass) {

        return res.status(400).json({
            success: false,
            message: 'Faltan credenciales.'
        });
    }

    const cuenta = usuarios.find(
        u => u.user === user && u.pass === pass
    );

    if (!cuenta) {

        return res.status(401).json({
            success: false,
            message: 'Usuario o contraseña incorrectos.'
        });
    }

    // ========================================================
    // TOKEN JWT
    // ========================================================
    const token = jwt.sign(
        {
            user: cuenta.user,
            role: cuenta.role,
            codigo_trabajador: cuenta.codigo_trabajador
        },
        JWT_SECRET,
        {
            expiresIn: '8h'
        }
    );

    res.json({
        success: true,
        token,
        user: cuenta.user,
        role: cuenta.role,
        nombre: cuenta.nombre,
        codigo_trabajador: cuenta.codigo_trabajador,
        telefono: cuenta.telefono
    });
});

// ============================================================
// GET /api/docentes?mes=5
// Filtra por rol usando cabeceras enviadas por el frontend
// ============================================================
app.get('/api/docentes', verificarToken, (req, res) => {
    const mes  = parseInt(req.query.mes) || 5;
    const role = req.usuario.role || '';
    const codigoTrabajador =
    req.usuario.codigo_trabajador || '';

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

    if (role === 'user' && codigoTrabajador) {

    sql += ' WHERE d.codigo_trabajador = ?';

    params.push(codigoTrabajador);
}
    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error en /api/docentes:', err);
            return res.status(500).json({ error: err.message });
        }
        // Agregar gasto fijo S/30 "Gastos para Eventos Especiales" a cada docente
        const resultadoConGasto = result.map(doc => ({
            ...doc,
            gastos_eventos_especiales: 30
        }));
        res.json(resultadoConGasto);
    });
});

// ============================================================
// PUT /api/docentes/:id  — actualizar planilla de un docente
// FIX: ahora también permite actualizar sueldo_base
// ============================================================
app.put('/api/docentes/:id', verificarToken, (req, res) => {
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

// =================================================================
// POST /api/guardar-boleta
// FIX: este endpoint faltaba en el server original.
//      Recibe el PDF en base64, lo guarda en /boletas/ y devuelve
//      la URL pública para enviarla por WhatsApp.
// =================================================================
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
    const numero = req.query.telefono || '';
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