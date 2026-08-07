const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const ANIO_ACTUAL = new Date().getFullYear(); // ← NUEVO
require('dotenv').config();

const app        = express();
const rateLimit  = require('express-rate-limit');

// ✅ AGREGA ESTA LÍNEA AQUÍ:
app.set('trust proxy', 1);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,                   // máximo 10 intentos por IP
    message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET no está definido en las variables de entorno.');
    process.exit(1);
}

// ============================================================
// MIDDLEWARES
// ============================================================
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://planilla-cervantes.onrender.com',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

// ============================================================
// CONEXIÓN A LA BASE DE DATOS — Una sola vez, sin doble connect
// ============================================================
const db = mysql.createPool({
    host              : process.env.DB_HOST,
    port              : parseInt(process.env.DB_PORT) || 25060,   // Aiven usa 25060 por defecto
    user              : process.env.DB_USER,
    password          : process.env.DB_PASSWORD,
    database          : process.env.DB_NAME,
    ssl               : { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit   : 10,
    queueLimit        : 0
});

console.log('✅ Pool de conexiones MySQL (Aiven) configurado correctamente.');

// ============================================================
// CARPETAS Y NODEMAILER
// ============================================================
const BOLETAS_DIR = path.join(__dirname, 'boletas');
if (!fs.existsSync(BOLETAS_DIR)) fs.mkdirSync(BOLETAS_DIR, { recursive: true });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
console.log('📧 Transporter de correo configurado');

// ============================================================
// MIDDLEWARE JWT
// ============================================================
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token requerido.' });

    const token = authHeader.split(' ')[1];
    if (!token)  return res.status(401).json({ error: 'Token inválido.' });

    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token expirado o inválido.' });
    }
}

// ============================================================
// POST /api/login — Valida contra la BD
// ============================================================
app.post('/api/login', loginLimiter, async (req, res) => {
    const { user, pass } = req.body;

    if (!user || !pass) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales.' });
    }

    db.query('SELECT * FROM usuarios WHERE user = ?', [user], async (err, results) => {
        if (err) {
            console.error('Error BD en login:', err);
            return res.status(500).json({ success: false, message: 'Error del servidor.' });
        }
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const cuenta = results[0];
        const passValida = await bcrypt.compare(pass, cuenta.pass);

        if (!passValida) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const token = jwt.sign(
            { user: cuenta.user, role: cuenta.role, dni: cuenta.dni },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            success : true,
            token,
            user    : cuenta.user,
            role    : cuenta.role,
            nombre  : cuenta.nombre,
            dni     : cuenta.dni,
            telefono: cuenta.telefono
        });
    });
});

// ============================================================
// PUT /api/usuario/cambiar-password
// El usuario debe ingresar su contraseña actual para cambiarla.
// Si pone su correo, se actualiza también en la BD.
// ============================================================
app.put('/api/usuario/cambiar-password', verificarToken, async (req, res) => {
    const { passwordActual, passwordNuevo, email } = req.body;
    const username = req.usuario.user;

    if (!passwordActual || !passwordNuevo) {
        return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }

    db.query('SELECT * FROM usuarios WHERE user = ?', [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const cuenta   = results[0];
        const esValida = await bcrypt.compare(passwordActual, cuenta.pass);

        if (!esValida) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        }

        const nuevoHash  = await bcrypt.hash(passwordNuevo, 10);
        const emailFinal = email ? email.toLowerCase() : cuenta.email;

        db.query(
            'UPDATE usuarios SET pass = ?, email = ? WHERE user = ?',
            [nuevoHash, emailFinal, username],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ success: true, message: '✅ Contraseña y correo actualizados correctamente.' });
            }
        );
    });
});

// ============================================================
// POST /api/usuario/recuperar-password
// Envía un enlace de restablecimiento al correo registrado.
// ============================================================
app.post('/api/usuario/recuperar-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email es requerido.' });

    db.query('SELECT * FROM usuarios WHERE email = ?', [email.toLowerCase()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Error del servidor.' });

        // Respuesta genérica por seguridad (no revela si el email existe o no)
        if (results.length === 0) {
            return res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace.' });
        }

        const cuenta     = results[0];
        const resetToken = jwt.sign({ user: cuenta.user }, JWT_SECRET, { expiresIn: '1h' });

        db.query(
            'UPDATE usuarios SET reset_token = ?, reset_expira = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE user = ?',
            [resetToken, cuenta.user]
        );

        const protocolo = req.headers['x-forwarded-proto'] || req.protocol;
        const resetLink = `${protocolo}://${req.get('host')}/reset-password.html?token=${resetToken}`;

        try {
            await transporter.sendMail({
                from   : `"Sistema de Planillas Cervantes" <${process.env.EMAIL_USER}>`,
                to     : email,
                subject: '🔑 Restablecer Contraseña - Cervantes Planilla',
                html   : `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                        <h2 style="color:#2c3e50;">Restablecer tu Contraseña</h2>
                        <p>Hola <strong>${cuenta.nombre}</strong>,</p>
                        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en el Sistema de Planillas.</p>
                        <div style="text-align:center;margin:30px 0;">
                            <a href="${resetLink}"
                               style="background:#3498db;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
                                Restablecer Contraseña
                            </a>
                        </div>
                        <p>Este enlace expirará en <strong>1 hora</strong>.</p>
                        <p style="color:#999;font-size:12px;">Si no solicitaste esto, puedes ignorar este correo.</p>
                        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                        <p style="color:#aaa;font-size:11px;">Sistema de Planillas Digitales · Cervantes Educa SAC</p>
                    </div>`
            });

            res.json({ success: true, message: 'Se ha enviado un enlace de recuperación a tu correo.' });

        } catch (e) {
            console.error('Error al enviar correo:', e.message);
            res.status(500).json({ error: 'No se pudo enviar el correo. Verifica EMAIL_USER y EMAIL_PASS en el .env' });
        }
    });
});

// ============================================================
// POST /api/usuario/reset-password
// Restablece la contraseña usando el token del enlace.
// ============================================================
app.post('/api/usuario/reset-password', async (req, res) => {
    const { token, nuevaPassword } = req.body;
    if (!token || !nuevaPassword) {
        return res.status(400).json({ error: 'Token y nueva contraseña son requeridos.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        db.query(
            'SELECT * FROM usuarios WHERE user = ? AND reset_token = ? AND reset_expira > NOW()',
            [decoded.user, token],
            async (err, results) => {
                if (err || results.length === 0) {
                    return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });
                }

                const nuevoHash = await bcrypt.hash(nuevaPassword, 10);

                db.query(
                    'UPDATE usuarios SET pass = ?, reset_token = NULL, reset_expira = NULL WHERE user = ?',
                    [nuevoHash, decoded.user],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({ success: true, message: '✅ Contraseña restablecida correctamente. Ya puedes iniciar sesión.' });
                    }
                );
            }
        );
    } catch (e) {
        return res.status(400).json({ error: 'Token inválido o expirado.' });
    }
});

// ============================================================
// GET /api/personal — Lista todos los usuarios (solo admin)
// Para el botón "Gestión de Personal"
// ============================================================
app.get('/api/personal', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    db.query(
        'SELECT id, user, nombre, role, dni, telefono, email, created_at FROM usuarios ORDER BY nombre',
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

// ============================================================
// PUT /api/personal/:id — Editar usuario (solo admin)
// ============================================================
app.put('/api/personal/:id', verificarToken, async (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { nombre, email, telefono, dni, role, nuevaPassword } = req.body;
    const id = parseInt(req.params.id);

    let sql    = 'UPDATE usuarios SET nombre=?, email=?, telefono=?, dni=?, role=?';
    let params = [nombre, email, telefono, dni, role];

    if (nuevaPassword) {
        const hash = await bcrypt.hash(nuevaPassword, 10);
        sql    += ', pass=?';
        params.push(hash);
    }

    sql += ' WHERE id=?';
    params.push(id);

    db.query(sql, params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Usuario actualizado correctamente.' });
    });
});

// ============================================================
// GET /api/docentes?mes=5
// ============================================================
app.get('/api/docentes', verificarToken, (req, res) => {
    const mes  = parseInt(req.query.mes) || 5;
    const role = req.usuario.role || '';

    let sql = `
        SELECT d.*,
               IFNULL(p.pagado,      d.pagado_fijo)   AS pagado,
               d.sb_fijo                              AS sueldo_base,
               IFNULL(p.afp,                NULL)          AS afp,
               IFNULL(p.adelantos,           0)            AS adelantos,
               IFNULL(p.faltas,              0)            AS faltas,
               IFNULL(p.pension,             0)            AS pension,
               IFNULL(p.tardanza,            0)            AS tardanza,
               IFNULL(p.bono,                0)            AS bono,
               IFNULL(p.otros_descuentos,    0)            AS otros_descuentos,
               IFNULL(p.otros_desc_detalle,  '')           AS otros_desc_detalle,
               IFNULL(p.tipo_afp,            'AFP')        AS tipo_afp,
               IFNULL(p.tipo_salud,          'ESSALUD')    AS tipo_salud,
               IFNULL(p.creditos,            0)            AS creditos,
               IFNULL(p.prestamos,           0)            AS prestamos,
               IFNULL(p.desmrito_nivel,      '')           AS desmrito_nivel,
               IFNULL(p.desmrito_monto,      0)            AS desmrito_monto,
               IFNULL(p.num_faltas,          0)            AS num_faltas,
               IFNULL(p.num_tardanzas,       0)            AS num_tardanzas,
               IFNULL(p.pago_color,          'azul')       AS pago_color,
               IFNULL(p.actividades,         0)            AS actividades,
               COALESCE(dm.incluido,         1)            AS incluido
        FROM docentes d
        LEFT JOIN planillas p
               ON d.id_docente = p.id_docente
              AND p.mes  = ?
              AND p.anio = ${ANIO_ACTUAL}
        LEFT JOIN docentes_mes dm
               ON d.id_docente = dm.id_docente
              AND dm.mes  = ?
              AND dm.anio = ${ANIO_ACTUAL}
        WHERE d.activo = 1
          AND IFNULL(dm.incluido, 1) = 1`;

    const params = [mes, mes];

    const dniUsuario = req.usuario.dni || '';
    if (role === 'user' && dniUsuario) {
        sql += ' AND d.dni = ?';
        params.push(dniUsuario);
    }

    db.query(sql, params, (err, result) => {
        if (err) {
            console.error('Error en /api/docentes:', err);
            return res.status(500).json({ error: err.message });
        }
        const resultadoConGasto = result.map(doc => ({
            ...doc,
            gastos_eventos_especiales: 30
            
        }));
        res.json(resultadoConGasto);
    });
});

// ============================================================
// PUT /api/docentes/:id
// ============================================================
app.put('/api/docentes/:id', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const id  = parseInt(req.params.id);
    const mes = parseInt(req.body.mes) || 5;

    const {
        sueldo_base, pagado, afp,
        adelantos, faltas, pension, tardanza, bono,
        tipo_salud, creditos, prestamos,
        desmrito_nivel, desmrito_monto,
        // ✅ CAMPOS QUE FALTABAN:
        otros_descuentos, otros_desc_detalle,
        num_faltas, num_tardanzas,
        actividades
    } = req.body;

    const sb = Number(sueldo_base) || 0;
    const pctAfpMap = { ONP:0.13, Habitat:0.1284, Integra:0.1292, Prima:0.1297, Profuturo:0.1306 };
    const afpPct    = (afp && afp !== 'NINGUNO') ? (pctAfpMap[afp] || 0.13) : 0;
    const afpMonto  = parseFloat((sb * afpPct).toFixed(2));
    const tipoSaludVal = tipo_salud || 'ESSALUD';
    const esalud    = (tipoSaludVal === 'SIS') ? 25 : parseFloat((sb * 0.09).toFixed(2));
    const consolidado = parseFloat(((Number(pagado) || 0) + esalud + (Number(bono) || 0)).toFixed(2));

    db.query(
        'UPDATE docentes SET sueldo_base = ?, pagado_fijo = ?, sb_fijo = ? WHERE id_docente = ?',
        [sueldo_base, pagado||0, sueldo_base, id],
        (err) => { if (err) console.error('Error actualizando docentes:', err); }
    );

    const sqlUpsert = `
        INSERT INTO planillas
            (id_docente, mes, anio, pagado, afp, adelantos, faltas, pension, tardanza, bono,
             tipo_salud, creditos, prestamos, desmrito_nivel, desmrito_monto, consolidado_bcp,
             otros_descuentos, otros_desc_detalle, num_faltas, num_tardanzas, actividades)
        VALUES (?, ?, ${ANIO_ACTUAL}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            pagado           = VALUES(pagado),
            afp              = VALUES(afp),
            adelantos        = VALUES(adelantos),
            faltas           = VALUES(faltas),
            pension          = VALUES(pension),
            tardanza         = VALUES(tardanza),
            bono             = VALUES(bono),
            tipo_salud       = VALUES(tipo_salud),
            creditos         = VALUES(creditos),
            prestamos        = VALUES(prestamos),
            desmrito_nivel   = VALUES(desmrito_nivel),
            desmrito_monto   = VALUES(desmrito_monto),
            consolidado_bcp  = VALUES(consolidado_bcp),
            otros_descuentos    = VALUES(otros_descuentos),
            otros_desc_detalle  = VALUES(otros_desc_detalle),
            num_faltas          = VALUES(num_faltas),
            num_tardanzas       = VALUES(num_tardanzas),
            actividades         = VALUES(actividades)`;

    db.query(
        sqlUpsert,
        [id, mes, pagado||0, afp||null, adelantos||0, faltas||0, pension||0, tardanza||0, bono||0,
         tipo_salud||'ESSALUD', creditos||0, prestamos||0,
         desmrito_nivel||'', desmrito_monto||0, consolidado,
         otros_descuentos||0, otros_desc_detalle||'', num_faltas||0, num_tardanzas||0, actividades||0],
        (err) => {
            if (err) {
                console.error('❌ Error en PUT /api/docentes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Planilla actualizada', consolidado });
        }
    );
});

// PUT /api/docentes/:id/pago-color — Marcar como pagado (azul/verde)
app.put('/api/docentes/:id/pago-color', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    const { id } = req.params;
    const { color, mes } = req.body;
    db.query(
        'UPDATE planillas SET pago_color = ? WHERE id_docente = ? AND mes = ? AND anio = ?',
        [color, id, mes, ANIO_ACTUAL],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});
// ============================================================
// PUT /api/docentes/:id/datos — Editar nombre, dni, telefono
// ============================================================
app.put('/api/docentes/:id/datos', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    const { nombre, dni, telefono } = req.body;
    if (!nombre || !dni) return res.status(400).json({ error: 'Nombre y DNI son obligatorios.' });
    db.query(
        'UPDATE docentes SET nombre = ?, dni = ?, telefono = ? WHERE id_docente = ?',
        [nombre.trim(), dni.trim(), telefono || '', req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});
// ============================================================
// PUT /api/docentes/:id/email — Guardar correo del docente
// ============================================================
app.put('/api/docentes/:id/email', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin') return res.status(403).json({ error: 'Acceso denegado.' });

    const id    = parseInt(req.params.id);
    const email = req.body.email || '';

    db.query('UPDATE docentes SET email = ? WHERE id_docente = ?', [email, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============================================================
// POST /api/guardar-boleta
// ============================================================

app.post('/api/guardar-boleta', verificarToken, (req, res) => {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
        return res.status(400).json({ error: 'Faltan datos.' });
    }
    const nombreSeguro = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, '_');
    
    db.query(
        'INSERT INTO boletas (filename, datos, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE datos = VALUES(datos), created_at = NOW()',
        [nombreSeguro, base64],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            const protocolo = req.headers['x-forwarded-proto'] || req.protocol;
            const urlPublica = `${protocolo}://${req.get('host')}/api/boleta/${nombreSeguro}`;
            res.json({ success: true, url: urlPublica, filename: nombreSeguro });
        }
    );
});

// Nuevo endpoint para servir el PDF siempre desde BD:
app.get('/api/boleta/:filename', (req, res) => {
    const nombre = req.params.filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
    db.query('SELECT datos FROM boletas WHERE filename = ?', [nombre], (err, rows) => {
        if (err || !rows.length) return res.status(404).send('Boleta no encontrada.');
        const buffer = Buffer.from(rows[0].datos, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
        res.send(buffer);
    });
});

// app.use('/boletas', express.static(BOLETAS_DIR));

// ============================================================
// GET /api/whatsapp-link
// ============================================================
app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo, filename } = req.query;
    const numero    = req.query.telefono || '';
    const protocolo = req.headers['x-forwarded-proto'] || req.protocol;
    const urlBoleta = `${protocolo}://${req.get('host')}/api/boleta/${filename}`;
    const texto     = `Hola *${nombre}*, adjunto tu boleta de pago.\n*Total Neto:* S/ ${sueldo}\n*Link:* ${urlBoleta}`;
    res.json({ link: `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}` });
});
// ============================================================
// POST /api/docentes — Agregar nuevo docente
// ============================================================
app.post('/api/docentes', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    const { nombre, dni, telefono, email } = req.body;
    if (!nombre || !dni) return res.status(400).json({ error: 'Nombre y DNI son obligatorios.' });
    db.query(
        'INSERT INTO docentes (nombre, dni, telefono, email, activo, sueldo_base) VALUES (?, ?, ?, ?, 1, 0)',
        [nombre.trim(), dni.trim(), telefono || '', email || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            const nuevoId    = result.insertId;
            const mesActual  = new Date().getMonth() + 1; // 1-12

            // Excluir explícitamente al docente nuevo de los meses ya pasados
            const filas = [];
            for (let m = 1; m < mesActual; m++) {
                filas.push([nuevoId, m, ANIO_ACTUAL, 0]);
            }

            if (filas.length === 0) {
                return res.json({ success: true, id: nuevoId });
            }

            db.query(
                'INSERT INTO docentes_mes (id_docente, mes, anio, incluido) VALUES ?',
                [filas],
                (err2) => {
                    if (err2) console.error('Error creando docentes_mes para docente nuevo:', err2);
                    res.json({ success: true, id: nuevoId });
                }
            );
        }
    );
});

// ============================================================
// PUT /api/docentes/:id/desactivar — Mover a inactivos
// ============================================================
app.put('/api/docentes/:id/desactivar', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    db.query(
        'UPDATE docentes SET activo = 0 WHERE id_docente = ?',
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// ============================================================
// PUT /api/docentes/:id/activar — Reactivar docente
// ============================================================
app.put('/api/docentes/:id/activar', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    db.query(
        'UPDATE docentes SET activo = 1 WHERE id_docente = ?',
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// ============================================================
// GET /api/docentes/inactivos — Listar inactivos
// ============================================================
// GET /api/docentes/:id/historial — Ver planillas de un docente (activo o inactivo)
app.get('/api/docentes/:id/historial', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    const id = parseInt(req.params.id);
    db.query(
        `SELECT p.*, d.nombre, d.dni
         FROM planillas p
         JOIN docentes d ON d.id_docente = p.id_docente
         WHERE p.id_docente = ?
         ORDER BY p.anio DESC, p.mes DESC`,
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});
app.get('/api/docentes/inactivos', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });
    db.query(
        'SELECT id_docente, nombre, dni, telefono FROM docentes WHERE activo = 0 ORDER BY nombre',
        [],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(result);
        }
    );
});
// DELETE /api/planillas/limpiar?mes=1 — Solo admin
app.delete('/api/planillas/limpiar', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    const mes = parseInt(req.query.mes);
    if (!mes || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'Mes inválido.' });
    }
    // Borrar solo las planillas del mes seleccionado
    // pagado y afp ya viven en planillas, asi que con borrar la fila es suficiente
    db.query(
        'DELETE FROM planillas WHERE mes = ? AND anio = ?', [mes, ANIO_ACTUAL],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            // También resetear sueldo_base y actividades en docentes
            db.query(
                // DESPUÉS:
                'UPDATE docentes SET sueldo_base = 0 WHERE activo = 1',
                [],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ success: true, eliminados: result.affectedRows });
                }
            );
        }
    );
});
// ============================================================
// GET /api/docentes-mes?mes=1&anio=2026
// ============================================================
app.get('/api/docentes-mes', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const mes  = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);

    // Trae todos los docentes activos, y si tiene registro en docentes_mes
    // muestra si está incluido o no. Si no tiene registro, por defecto es 1 (incluido)
    db.query(
        `SELECT d.id_docente, d.nombre, d.dni,
                COALESCE(dm.incluido, 1) AS incluido
         FROM docentes d
         LEFT JOIN docentes_mes dm 
            ON dm.id_docente = d.id_docente 
            AND dm.mes = ? 
            AND dm.anio = ?
         WHERE d.activo = 1
         ORDER BY d.nombre`,
        [mes, anio],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});
// ============================================================
// POST /api/docentes-mes — Guardar participación del mes
// Body: { mes, anio, docentes: [{ id_docente, incluido }] }
// ============================================================
app.post('/api/docentes-mes', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const { mes, anio, docentes } = req.body;
    if (!mes || !anio || !Array.isArray(docentes))
        return res.status(400).json({ error: 'Datos incompletos.' });

    // Inserta o actualiza cada docente
    const valores = docentes.map(d => [d.id_docente, mes, anio, d.incluido]);

    db.query(
        `INSERT INTO docentes_mes (id_docente, mes, anio, incluido)
         VALUES ?
         ON DUPLICATE KEY UPDATE incluido = VALUES(incluido)`,
        [valores],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});
// ============================================================
// MÓDULO: CONTROL DE UNIFORMES Y DEUDAS
// ============================================================

// Lista de docentes activos para el desplegable (no se escribe nada a mano)
app.get('/api/deudas/docentes', verificarToken, (req, res) => {
    db.query(
        `SELECT id_docente, nombre, dni FROM docentes WHERE activo = 1 ORDER BY nombre`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Resumen del panel: total acumulado + estado de confirmación, por docente, para un mes/año
app.get('/api/deudas', verificarToken, (req, res) => {
    const mes  = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);
    if (!mes || !anio) return res.status(400).json({ error: 'Falta mes o año.' });

    db.query(
        `SELECT d.id_docente, d.nombre,
                IFNULL(SUM(r.monto), 0) AS total_deuda,
                IFNULL(c.confirmado, 0) AS confirmado,
                c.confirmado_por, c.confirmado_at
         FROM docentes d
         LEFT JOIN registros_deuda r
                ON r.id_docente = d.id_docente AND r.mes = ? AND r.anio = ?
         LEFT JOIN confirmacion_deudas c
                ON c.id_docente = d.id_docente AND c.mes = ? AND c.anio = ?
         WHERE d.activo = 1
         GROUP BY d.id_docente, d.nombre, c.confirmado, c.confirmado_por, c.confirmado_at
         ORDER BY d.nombre`,
        [mes, anio, mes, anio],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Historial de movimientos de un docente en un mes (para ver/editar el detalle)
app.get('/api/deudas/:id_docente/registros', verificarToken, (req, res) => {
    const id_docente = parseInt(req.params.id_docente);
    const mes  = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);

    db.query(
        `SELECT * FROM registros_deuda WHERE id_docente = ? AND mes = ? AND anio = ?
         ORDER BY fecha DESC, id_registro DESC`,
        [id_docente, mes, anio],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Resumen rápido de UN docente (lo usa el modal de editar planilla al abrirse)
app.get('/api/deudas/:id_docente/resumen', verificarToken, (req, res) => {
    const id_docente = parseInt(req.params.id_docente);
    const mes  = parseInt(req.query.mes);
    const anio = parseInt(req.query.anio);

    db.query(
        `SELECT IFNULL(SUM(monto),0) AS total FROM registros_deuda WHERE id_docente = ? AND mes = ? AND anio = ?`,
        [id_docente, mes, anio],
        (err, sumRows) => {
            if (err) return res.status(500).json({ error: err.message });
            db.query(
                `SELECT confirmado FROM confirmacion_deudas WHERE id_docente = ? AND mes = ? AND anio = ?`,
                [id_docente, mes, anio],
                (err2, confRows) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({
                        total: sumRows[0].total,
                        confirmado: confRows.length ? !!confRows[0].confirmado : false,
                        tieneRegistros: sumRows[0].total > 0
                    });
                }
            );
        }
    );
});

// Si el período ya estaba confirmado y se agrega/edita/borra algo, vuelve a "pendiente"
function reabrirConfirmacion(id_docente, mes, anio, cb) {
    db.query(
        `UPDATE confirmacion_deudas SET confirmado = 0, confirmado_por = NULL, confirmado_at = NULL
         WHERE id_docente = ? AND mes = ? AND anio = ?`,
        [id_docente, mes, anio],
        cb || (() => {})
    );
}

// Registrar un movimiento diario
app.post('/api/deudas/registro', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const { id_docente, fecha, tipo, descripcion, monto } = req.body;
    if (!id_docente || !fecha || !tipo || monto == null)
        return res.status(400).json({ error: 'Datos incompletos.' });

    const f = new Date(fecha);
    const mes  = f.getMonth() + 1;
    const anio = f.getFullYear();
    const usuario = req.usuario.user || '';

    db.query(
        `INSERT INTO registros_deuda (id_docente, fecha, tipo, descripcion, monto, mes, anio, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_docente, fecha, tipo, descripcion || '', monto, mes, anio, usuario],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            reabrirConfirmacion(id_docente, mes, anio);
            res.json({ success: true });
        }
    );
});

// Editar un movimiento
app.put('/api/deudas/registro/:id', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const id = parseInt(req.params.id);
    const { fecha, tipo, descripcion, monto } = req.body;

    db.query(`SELECT id_docente, mes, anio FROM registros_deuda WHERE id_registro = ?`, [id], (errSel, rows) => {
        if (errSel) return res.status(500).json({ error: errSel.message });
        if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });

        db.query(
            `UPDATE registros_deuda SET fecha=?, tipo=?, descripcion=?, monto=? WHERE id_registro=?`,
            [fecha, tipo, descripcion || '', monto, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                const { id_docente, mes, anio } = rows[0];
                reabrirConfirmacion(id_docente, mes, anio);
                res.json({ success: true });
            }
        );
    });
});

// Eliminar un movimiento
app.delete('/api/deudas/registro/:id', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const id = parseInt(req.params.id);
    db.query(`SELECT id_docente, mes, anio FROM registros_deuda WHERE id_registro = ?`, [id], (errSel, rows) => {
        if (errSel) return res.status(500).json({ error: errSel.message });
        if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado.' });

        db.query(`DELETE FROM registros_deuda WHERE id_registro = ?`, [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            const { id_docente, mes, anio } = rows[0];
            reabrirConfirmacion(id_docente, mes, anio);
            res.json({ success: true });
        });
    });
});

// Confirmar el acumulado del mes de UN docente (solo admin/superadmin)
app.post('/api/deudas/confirmar', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin' && req.usuario.role !== 'superadmin')
        return res.status(403).json({ error: 'Acceso denegado.' });

    const { id_docente, mes, anio } = req.body;
    if (!id_docente || !mes || !anio) return res.status(400).json({ error: 'Datos incompletos.' });

    const usuario = req.usuario.user || '';

    db.query(
        `INSERT INTO confirmacion_deudas (id_docente, mes, anio, confirmado, confirmado_por, confirmado_at)
         VALUES (?, ?, ?, 1, ?, NOW())
         ON DUPLICATE KEY UPDATE confirmado = 1, confirmado_por = VALUES(confirmado_por), confirmado_at = NOW()`,
        [id_docente, mes, anio, usuario],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});
// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});