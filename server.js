const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');

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
// USUARIOS DEL SISTEMA — cargados desde .env (hashes bcrypt)
// ============================================================
let usuarios = [];
try {
    usuarios = JSON.parse(process.env.USUARIOS_JSON || '[]');
} catch(e) {
    console.error('❌ Error al parsear USUARIOS_JSON del .env:', e.message);
}

// ============================================================
// POST /api/login
// FIX: el frontend ahora llama a este endpoint en vez de validar
//      las credenciales directamente en el cliente.
// ============================================================
app.post('/api/login', async (req, res) => {
    console.log(req.body);
    const { user, pass } = req.body;

    if (!user || !pass) {

        return res.status(400).json({
            success: false,
            message: 'Faltan credenciales.'
        });
    }

    const cuenta = usuarios.find(u => u.user === user);

    if (!cuenta) {
        return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    const passValida = await bcrypt.compare(pass, cuenta.pass);

    if (!passValida) {
        return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }

    // ========================================================
    // TOKEN JWT
    // ========================================================
    const token = jwt.sign(
        {
            user: cuenta.user,
            role: cuenta.role,
            dni: cuenta.dni
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
        dni: cuenta.dni,
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
    const dni =
    req.usuario.dni || '';

    let sql = `
        SELECT d.*,
               IFNULL(p.adelantos,           0)   AS adelantos,
               IFNULL(p.faltas,              0)   AS faltas,
               IFNULL(p.pension,             0)   AS pension,
               IFNULL(p.tardanza,            0)   AS tardanza,
               IFNULL(p.bono,                0)   AS bono,
               IFNULL(p.otros_descuentos,    0)   AS otros_descuentos,
               IFNULL(p.otros_desc_detalle,  '')  AS otros_desc_detalle,
               IFNULL(p.tipo_afp,            'AFP') AS tipo_afp,
               IFNULL(p.tipo_salud,          'ESSALUD') AS tipo_salud,
               IFNULL(p.creditos,            0)   AS creditos,
               IFNULL(p.prestamos,           0)   AS prestamos,
               IFNULL(p.desmrito_nivel,      '')  AS desmrito_nivel,
               IFNULL(p.desmrito_monto,      0)   AS desmrito_monto,
               IFNULL(p.num_faltas,          0)   AS num_faltas,
               IFNULL(p.num_tardanzas,       0)   AS num_tardanzas
        FROM docentes d
        LEFT JOIN planillas p
               ON d.id_docente = p.id_docente
              AND p.mes  = ?
              AND p.anio = 2026`;

    const params = [mes];
 
    const dniUsuario = req.usuario.dni || '';
    if (role === 'user' && dniUsuario) {
        sql += ' WHERE d.dni = ?';
        params.push(dniUsuario);
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

// PUT /api/docentes/:id  — actualizar planilla + campos permanentes
app.put('/api/docentes/:id', verificarToken, (req, res) => {
    const id  = parseInt(req.params.id);
    const mes = parseInt(req.body.mes) || 5;

    const { 
        sueldo_base, 
        pagado,
        afp,                    // ← AFP permanente
        tipo_afp,               // ← para compatibilidad
        adelantos, faltas, pension, tardanza, bono, 
        otros_descuentos, otros_desc_detalle,
        tipo_salud, creditos, prestamos, 
        desmrito_nivel, desmrito_monto,
        num_faltas, num_tardanzas
    } = req.body;

    // 1. Actualizar datos PERMANENTES en tabla docentes
    db.query(
        'UPDATE docentes SET sueldo_base = ?, pagado = ?, afp = ? WHERE id_docente = ?',
        [sueldo_base, pagado || 0, afp || null, id],
        (err) => { 
            if (err) console.error('Error actualizando datos permanentes:', err); 
        }
    );

    // 2. Upsert en planillas (datos variables por mes)
    const sqlUpsert = `
        INSERT INTO planillas
            (id_docente, mes, anio, adelantos, faltas, pension, tardanza, bono,
             otros_descuentos, otros_desc_detalle, tipo_salud,
             creditos, prestamos, desmrito_nivel, desmrito_monto, num_faltas, num_tardanzas)
        VALUES (?, ?, 2026, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            adelantos          = VALUES(adelantos),
            faltas             = VALUES(faltas),
            pension            = VALUES(pension),
            tardanza           = VALUES(tardanza),
            bono               = VALUES(bono),
            otros_descuentos   = VALUES(otros_descuentos),
            otros_desc_detalle = VALUES(otros_desc_detalle),
            tipo_salud         = VALUES(tipo_salud),
            creditos           = VALUES(creditos),
            prestamos          = VALUES(prestamos),
            desmrito_nivel     = VALUES(desmrito_nivel),
            desmrito_monto     = VALUES(desmrito_monto),
            num_faltas         = VALUES(num_faltas),
            num_tardanzas      = VALUES(num_tardanzas)`;

    db.query(
        sqlUpsert,
        [id, mes, adelantos||0, faltas||0, pension||0, tardanza||0, bono||0,
         otros_descuentos||0, otros_desc_detalle||'', tipo_salud||'ESSALUD',
         creditos||0, prestamos||0, desmrito_nivel||'', desmrito_monto||0,
         num_faltas||0, num_tardanzas||0],
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