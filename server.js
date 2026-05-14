const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const nodemailer = require('nodemailer');

require('dotenv').config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'cervantes_secret_2026';

// --- 1. CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

// --- 2. CONEXIÓN A LA DB (MOVIDO ARRIBA) ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'planilla_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando a la DB:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
    // === AGREGA ESTO AQUÍ PARA GENERAR TU HASH COMPATIBLE ===
    bcrypt.hash('cervantes2026', 10).then(hash => {
        console.log("------------------------------------------");
        console.log("COPIA ESTE HASH PARA TABLEPLUS:");
        console.log(hash);
        console.log("------------------------------------------");
        }).catch(e => console.error(e));
});

// --- 3. CARPETAS Y NODEMAILER ---
const BOLETAS_DIR = path.join(__dirname, 'boletas');
if (!fs.existsSync(BOLETAS_DIR)) {
    fs.mkdirSync(BOLETAS_DIR, { recursive: true });
}



// --- 4. RUTAS DE SEGURIDAD ---

app.post('/usuario/cambiar-password', async (req, res) => {
    const { userId, nuevaPassword } = req.body; 
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHasheada = await bcrypt.hash(nuevaPassword, salt);

        // OJO: Asegúrate que tu columna sea 'pass' o 'password' según tu DB
        const query = "UPDATE usuarios SET pass = ? WHERE id = ?"; 
        db.query(query, [passwordHasheada, userId], (err, result) => {
            if (err) return res.status(500).json({ error: "Error en DB" });
            res.json({ mensaje: "¡Tu contraseña ha sido actualizada!" });
        });
    } catch (error) {
        res.status(500).send("Error de cifrado");
    }
});

app.post('/admin/actualizar-correo', (req, res) => {
    const { usuarioId, nuevoEmail } = req.body;
    const query = "UPDATE usuarios SET email = ? WHERE id = ?";
    db.query(query, [nuevoEmail, usuarioId], (err, result) => {
        if (err) return res.status(500).json({ error: "Error al guardar correo" });
        res.json({ mensaje: "Correo del trabajador actualizado." });
    });
});
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
// ===================== CONFIGURACIÓN DE CORREO =====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

console.log('📧 Transporter de correo configurado');
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
    console.log('📨 Body recibido:', req.body);
    const { user, pass } = req.body;

    if (!user || !pass) {
        return res.status(400).json({ success: false, message: 'Faltan credenciales.' });
    }

    db.query('SELECT * FROM usuarios WHERE user = ?', [user], async (err, results) => {
        
        console.log('🔍 Error BD:', err);
        console.log('👤 Usuario encontrado:', results);  // ← esto es clave
        
        if (err || results.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const cuenta = results[0];
        
        console.log('🔑 Hash en BD:', cuenta.pass);
        console.log('🔑 Pass recibida:', pass);
        
        const passValida = await bcrypt.compare(pass, cuenta.pass);
        
        console.log('✅ Pass válida:', passValida); // ← si sale false aquí, el hash está mal

        if (!passValida) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const token = jwt.sign(
            { user: cuenta.user, role: cuenta.role, dni: cuenta.dni },
            JWT_SECRET,
            { expiresIn: '8h' }
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

// ===================== PUT /api/docentes/:id =====================
app.put('/api/docentes/:id', verificarToken, (req, res) => {
    const id  = parseInt(req.params.id);
    const mes = parseInt(req.body.mes) || 5;

    const { 
        sueldo_base, 
        pagado,
        afp,                    // permanente
        adelantos, faltas, pension, tardanza, bono, 
        tipo_salud, creditos, prestamos, 
        desmrito_nivel, desmrito_monto
    } = req.body;

    // === CÁLCULO DEL CONSOLIDADO  ===
    const esalud = (Number(sueldo_base) || 0) * 0.09;
    const consolidado = (Number(pagado) || 0) + esalud + (Number(bono) || 0);

    console.log(`💰 Consolidado calculado para docente ${id}: S/ ${consolidado}`);

    // 1. Actualizar datos permanentes (docentes)
    db.query(
        'UPDATE docentes SET sueldo_base = ?, pagado = ?, afp = ? WHERE id_docente = ?',
        [sueldo_base, pagado || 0, afp || null, id],
        (err) => { 
            if (err) console.error('Error actualizando docentes:', err); 
        }
    );

    // 2. Guardar datos mensuales + CONSOLIDADO en planillas
    const sqlUpsert = `
        INSERT INTO planillas
            (id_docente, mes, anio, adelantos, faltas, pension, tardanza, bono,
             tipo_salud, creditos, prestamos, desmrito_nivel, desmrito_monto, consolidado_bcp)
        VALUES (?, ?, 2026, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            adelantos          = VALUES(adelantos),
            faltas             = VALUES(faltas),
            pension            = VALUES(pension),
            tardanza           = VALUES(tardanza),
            bono               = VALUES(bono),
            tipo_salud         = VALUES(tipo_salud),
            creditos           = VALUES(creditos),
            prestamos          = VALUES(prestamos),
            desmrito_nivel     = VALUES(desmrito_nivel),
            desmrito_monto     = VALUES(desmrito_monto),
            consolidado_bcp    = VALUES(consolidado_bcp)`;

    db.query(
        sqlUpsert,
        [id, mes, adelantos||0, faltas||0, pension||0, tardanza||0, bono||0,
         tipo_salud||'ESSALUD', creditos||0, prestamos||0, desmrito_nivel||'', 
         desmrito_monto||0, consolidado],
        (err) => {
            if (err) {
                console.error('❌ Error en PUT /api/docentes:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ 
                success: true, 
                message: 'Planilla actualizada',
                consolidado: consolidado 
            });
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
// ===================== CRUD DOCENTES (ADMIN) =====================

// GET - Obtener todos los docentes (para el formulario)
app.get('/api/docentes/all', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin') return res.status(403).json({error: 'Acceso denegado'});

    db.query('SELECT id_docente, nombre, dni, codigo_trabajador, sueldo_base FROM docentes ORDER BY nombre', (err, result) => {
        if (err) return res.status(500).json({error: err.message});
        res.json(result);
    });
});

// POST - Crear nuevo docente
app.post('/api/docentes', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin') return res.status(403).json({error: 'Acceso denegado'});

    const { nombre, dni, codigo_trabajador, sueldo_base } = req.body;

    if (!nombre || !dni) {
        return res.status(400).json({error: 'Nombre y DNI son obligatorios'});
    }

    db.query(
        'INSERT INTO docentes (nombre, dni, codigo_trabajador, sueldo_base) VALUES (?, ?, ?, ?)',
        [nombre, dni, codigo_trabajador || dni, sueldo_base || 0],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({error: 'Ya existe un docente con ese DNI'});
                }
                return res.status(500).json({error: err.message});
            }
            res.json({success: true, message: 'Docente agregado correctamente', id: result.insertId});
        }
    );
});

// DELETE - Eliminar docente
app.delete('/api/docentes/:id', verificarToken, (req, res) => {
    if (req.usuario.role !== 'admin') return res.status(403).json({error: 'Acceso denegado'});

    const id = parseInt(req.params.id);

    // Primero borramos sus planillas
    db.query('DELETE FROM planillas WHERE id_docente = ?', [id], (err) => {
        if (err) console.error(err);

        // Luego borramos el docente
        db.query('DELETE FROM docentes WHERE id_docente = ?', [id], (err) => {
            if (err) return res.status(500).json({error: err.message});
            res.json({success: true, message: 'Docente eliminado correctamente'});
        });
    });
});

// ===================== CAMBIAR CONTRASEÑA + ACTUALIZAR EMAIL =====================
app.put('/api/usuario/cambiar-password', verificarToken, async (req, res) => {
    const { passwordActual, passwordNuevo, email } = req.body;
    const username = req.usuario.user;

    if (!passwordActual || !passwordNuevo) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // ✅ Busca en la BD directamente
    db.query('SELECT * FROM usuarios WHERE user = ?', [username], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const cuenta = results[0];
        const esValida = await bcrypt.compare(passwordActual, cuenta.pass);

        if (!esValida) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const nuevoHash = await bcrypt.hash(passwordNuevo, 10);

        db.query(
            'UPDATE usuarios SET pass = ?, email = ? WHERE user = ?',
            [nuevoHash, email || cuenta.email, username],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ success: true, message: '✅ Contraseña y correo actualizados correctamente' });
            }
        );
    });
});
// ============================================================
// INICIO DEL SERVIDOR
// ============================================================
// ===================== RECUPERAR CONTRASEÑA (Olvidé mi contraseña) =====================
app.post('/api/usuario/recuperar-password', async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: 'Email es requerido' });

    // ✅ Busca en la BD directamente
    db.query('SELECT * FROM usuarios WHERE email = ?', [email.toLowerCase()], async (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error del servidor' });
        }

        // Respuesta genérica por seguridad (no revela si el email existe)
        if (results.length === 0) {
            return res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace.' });
        }

        const cuenta = results[0];

        try {
            const resetToken = jwt.sign({ user: cuenta.user }, JWT_SECRET, { expiresIn: '1h' });

            db.query(
                'UPDATE usuarios SET reset_token = ?, reset_expira = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE user = ?',
                [resetToken, cuenta.user]
            );

            const resetLink = `https://${req.get('host')}/reset-password.html?token=${resetToken}`;

            await transporter.sendMail({
                from: `"Sistema de Planillas" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "🔑 Restablecer Contraseña - Cervantes Planilla",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Restablecer tu Contraseña</h2>
                        <p>Hola <strong>${cuenta.nombre}</strong>,</p>
                        <p>Has solicitado restablecer tu contraseña del Sistema de Planillas.</p>
                        <p style="margin: 30px 0;">
                            <a href="${resetLink}" 
                               style="background: #3498db; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                                Restablecer Contraseña
                            </a>
                        </p>
                        <p>Este enlace expirará en <strong>1 hora</strong>.</p>
                        <small>Si no solicitaste esto, ignora este correo.</small>
                    </div>
                `
            });

            res.json({ success: true, message: 'Se ha enviado un enlace de recuperación a tu correo.' });

        } catch (e) {
            console.error('Error al enviar correo:', e);
            res.status(500).json({ error: 'Error al enviar el correo. Verifica EMAIL_USER y EMAIL_PASS en el .env' });
        }
    });
});
// ===================== RESTABLECER CONTRASEÑA (desde el enlace del correo) =====================
app.post('/api/usuario/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.user;

        // Verificar que el token no haya expirado
        db.query(
            'SELECT * FROM usuarios WHERE user = ? AND reset_token = ? AND reset_expira > NOW()',
            [username, token],
            async (err, results) => {
                if (err || results.length === 0) {
                    return res.status(400).json({ success: false, error: 'Enlace inválido o expirado' });
                }

                const nuevoHash = await bcrypt.hash(password, 10);

                db.query(
                    'UPDATE usuarios SET pass = ?, reset_token = NULL, reset_expira = NULL WHERE user = ?',
                    [nuevoHash, username],
                    (err2) => {
                        if (err2) return res.status(500).json({ success: false, error: 'Error al actualizar' });
                        
                        res.json({ success: true, message: 'Contraseña restablecida correctamente' });
                    }
                );
            }
        );
    } catch (e) {
        res.status(400).json({ success: false, error: 'Enlace inválido o expirado' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});