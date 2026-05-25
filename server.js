const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');

require('dotenv').config();

const app        = express();
const rateLimit  = require('express-rate-limit');

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
    if (req.usuario.role !== 'admin') {
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
    if (req.usuario.role !== 'admin') {
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
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    const id  = parseInt(req.params.id);
    const mes = parseInt(req.body.mes) || 5;

    const {
        sueldo_base, pagado, afp,
        adelantos, faltas, pension, tardanza, bono,
        tipo_salud, creditos, prestamos,
        desmrito_nivel, desmrito_monto
    } = req.body;

    const sb = Number(sueldo_base) || 0;
    const pctAfpMap = { ONP:0.13, Habitat:0.1284, Integra:0.1292, Prima:0.1297, Profuturo:0.1306 };
    const afpPct    = (afp && afp !== 'NINGUNO') ? (pctAfpMap[afp] || 0.13) : 0;
    const afpMonto  = parseFloat((sb * afpPct).toFixed(2));
    // ESSALUD = 9% del sueldo base; SIS = S/ 25 fijo
    const tipoSaludVal = tipo_salud || 'ESSALUD';
    const esalud    = (tipoSaludVal === 'SIS') ? 25 : parseFloat((sb * 0.09).toFixed(2));
    // NETO/CONSOLIDADO: PAGADO + ESSALUD (aporte empleador) + BONO
    const consolidado = parseFloat(((Number(pagado) || 0) + esalud + (Number(bono) || 0)).toFixed(2));

    db.query(
        'UPDATE docentes SET sueldo_base = ?, pagado = ?, afp = ? WHERE id_docente = ?',
        [sueldo_base, pagado || 0, afp || null, id],
        (err) => { if (err) console.error('Error actualizando docentes:', err); }
    );

    const sqlUpsert = `
        INSERT INTO planillas
            (id_docente, mes, anio, adelantos, faltas, pension, tardanza, bono,
             tipo_salud, creditos, prestamos, desmrito_nivel, desmrito_monto, consolidado_bcp)
        VALUES (?, ?, 2026, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            adelantos       = VALUES(adelantos),
            faltas          = VALUES(faltas),
            pension         = VALUES(pension),
            tardanza        = VALUES(tardanza),
            bono            = VALUES(bono),
            tipo_salud      = VALUES(tipo_salud),
            creditos        = VALUES(creditos),
            prestamos       = VALUES(prestamos),
            desmrito_nivel  = VALUES(desmrito_nivel),
            desmrito_monto  = VALUES(desmrito_monto),
            consolidado_bcp = VALUES(consolidado_bcp)`;

    db.query(
        sqlUpsert,
        [id, mes, adelantos||0, faltas||0, pension||0, tardanza||0, bono||0,
         tipo_salud||'ESSALUD', creditos||0, prestamos||0,
         desmrito_nivel||'', desmrito_monto||0, consolidado],
        (err) => {
            if (err) {
                console.error('❌ Error en PUT /api/docentes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Planilla actualizada', consolidado });
        }
    );
});

// ============================================================
// PUT /api/docentes/:id/email — Guardar correo del docente
// ============================================================
app.put('/api/docentes/:id/email', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado.' });

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
        return res.status(400).json({ error: 'Faltan datos: filename o base64.' });
    }

    const nombreSeguro = path.basename(filename).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const rutaArchivo  = path.join(BOLETAS_DIR, nombreSeguro);

    try {
        fs.writeFileSync(rutaArchivo, Buffer.from(base64, 'base64'));
        const protocolo  = req.headers['x-forwarded-proto'] || req.protocol;
        const urlPublica = `${protocolo}://${req.get('host')}/boletas/${nombreSeguro}`;
        res.json({ success: true, url: urlPublica, filename: nombreSeguro });
    } catch (err) {
        console.error('Error al guardar boleta:', err);
        res.status(500).json({ error: 'No se pudo guardar el archivo.' });
    }
});

app.use('/boletas', express.static(BOLETAS_DIR));

// ============================================================
// GET /api/whatsapp-link
// ============================================================
app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo, filename } = req.query;
    const numero    = req.query.telefono || '';
    const protocolo = req.headers['x-forwarded-proto'] || req.protocol;
    const urlBoleta = `${protocolo}://${req.get('host')}/boletas/${filename}`;
    const texto     = `Hola *${nombre}*, adjunto tu boleta de pago.\n*Total Neto:* S/ ${sueldo}\n*Link:* ${urlBoleta}`;
    res.json({ link: `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}` });
});
// DELETE /api/planillas/limpiar?mes=1 — Solo admin
app.delete('/api/planillas/limpiar', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    const mes = parseInt(req.query.mes);
    if (!mes || mes < 1 || mes > 12) {
        return res.status(400).json({ error: 'Mes inválido.' });
    }
    db.query(
        'DELETE FROM planillas WHERE mes = ? AND anio = 2026',
        [mes],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, eliminados: result.affectedRows });
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