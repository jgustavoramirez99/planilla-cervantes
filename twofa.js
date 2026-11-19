// ============================================================
// twofa.js — Verificación en dos pasos (TOTP) para el sistema de planillas
//
// Compatible con Google Authenticator, Microsoft Authenticator, Authy, etc.
// (RFC 6238: SHA-1, 6 dígitos, cambio cada 30 segundos).
//
// Estado del despliegue (variable de entorno en Render):
//   TOTP_REQUIRED_ROLES = ""        -> nadie está obligado (por defecto).
//                                      Solo quien la active desde "Seguridad".
//   TOTP_REQUIRED_ROLES = "admin"   -> los admin DEBEN configurarla al entrar.
// ============================================================
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const QRCode    = require('qrcode');

const ISSUER = 'Planilla Cervantes';
const STEP_SECONDS = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- Base32 ----------
function base32Encode(buf) {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = ((value << 8) | byte) & 0xFFFFF;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str).replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0, value = 0;
    const out = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new Error('Clave base32 inválida');
        value = ((value << 5) | idx) & 0xFFFFF;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

// ---------- HOTP / TOTP ----------
function hotp(key, counter) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const h   = crypto.createHmac('sha1', key).update(buf).digest();
    const off = h[h.length - 1] & 0xf;
    const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return String(bin % 1000000).padStart(6, '0');
}

function pasoActual(nowMs = Date.now()) {
    return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

// Devuelve el "paso" (contador) que coincide con el código, o null.
// window = 1 tolera ±30 s de diferencia de reloj.
function totpCoincide(secretoB32, codigo, nowMs = Date.now(), window = 1) {
    const code = String(codigo || '').trim();
    if (!/^\d{6}$/.test(code)) return null;
    const key  = base32Decode(secretoB32);
    const base = pasoActual(nowMs);
    for (let w = -window; w <= window; w++) {
        const esperado = hotp(key, base + w);
        if (crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(code))) return base + w;
    }
    return null;
}

// ---------- Cifrado del secreto en la BD (AES-256-GCM) ----------
function claveCifrado(jwtSecret) {
    return crypto.createHash('sha256').update('totp-v1:' + jwtSecret).digest();
}
function cifrar(texto, key) {
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc    = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return [iv, tag, enc].map(b => b.toString('base64')).join(':');
}
function descifrar(payload, key) {
    const [iv, tag, enc] = String(payload).split(':').map(s => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ============================================================
// Registro de rutas
//   deps = { db, JWT_SECRET, verificarToken, emitirSesion }
// ============================================================
function registrar(app, deps) {
    const { db, JWT_SECRET, verificarToken, emitirSesion } = deps;
    const KEY = claveCifrado(JWT_SECRET);

    const rolesObligatorios = (process.env.TOTP_REQUIRED_ROLES || '')
        .split(',').map(s => s.trim()).filter(Boolean);

    const q = (sql, params = []) => new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    // --- Esquema: agrega las columnas si no existen (seguro de repetir) ---
    async function asegurarEsquema() {
        const cols = await q(
            "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS " +
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'"
        );
        const nombres = cols.map(r => r.c);
        if (!nombres.includes('totp_secret'))
            await q('ALTER TABLE usuarios ADD COLUMN totp_secret VARCHAR(255) NULL');
        if (!nombres.includes('totp_enabled'))
            await q('ALTER TABLE usuarios ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0');
        if (!nombres.includes('totp_last_step'))
            await q('ALTER TABLE usuarios ADD COLUMN totp_last_step BIGINT NULL');
    }
    const esquemaListo = asegurarEsquema()
        .then(() => console.log('🔐 2FA: columnas de usuarios verificadas.'))
        .catch(err => console.error('❌ 2FA: no se pudo preparar la tabla usuarios:', err.message));

    // --- Límites de intentos ---
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 40,
        message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
        standardHeaders: true,
        legacyHeaders: false
    });

    const fallos = new Map(); // usuario -> { n, hasta }
    function minutosBloqueo(user) {
        const f = fallos.get(user);
        if (!f || !f.hasta) return 0;
        if (f.hasta > Date.now()) return Math.ceil((f.hasta - Date.now()) / 60000);
        fallos.delete(user);
        return 0;
    }
    function registrarFallo(user) {
        const f = fallos.get(user) || { n: 0 };
        f.n += 1;
        if (f.n >= 5) { f.hasta = Date.now() + 15 * 60 * 1000; f.n = 0; }
        fallos.set(user, f);
    }

    // --- Utilidades ---
    function leerToken(req) {
        const t = (req.headers['authorization'] || '').split(' ')[1];
        if (!t) return null;
        try { return jwt.verify(t, JWT_SECRET); } catch (e) { return null; }
    }
    // Quién llama: token temporal del login (paso 2) o sesión completa.
    function actor(req) {
        const d = leerToken(req);
        if (!d) return null;
        if (d.purpose === '2fa') return { user: d.user, temporal: true };
        if (d.role)             return { user: d.user, temporal: false };
        return null;
    }
    async function buscarCuenta(user) {
        const rows = await q('SELECT * FROM usuarios WHERE user = ?', [user]);
        return rows[0] || null;
    }
    const noSesion = res => res.status(401).json({ success: false, message: 'Sesión no válida o vencida. Vuelve a iniciar sesión.' });
    const errorSrv = (res, e) => {
        console.error('Error 2FA:', e);
        return res.status(500).json({ success: false, message: 'Error del servidor.' });
    };
    function validarCodigo(cuenta, codigo) {
        if (!cuenta.totp_secret) return null;
        const paso = totpCoincide(descifrar(cuenta.totp_secret, KEY), codigo);
        if (paso === null) return null;
        // Anti-reutilización: un código ya usado no sirve otra vez.
        if (cuenta.totp_last_step != null && paso <= Number(cuenta.totp_last_step)) return null;
        return paso;
    }

    // ---------- API usada por server.js (login) ----------
    function requiereSegundoPaso(cuenta) {
        return Number(cuenta.totp_enabled) === 1 || rolesObligatorios.includes(cuenta.role);
    }
    function iniciarDesafio(cuenta) {
        const tempToken = jwt.sign({ user: cuenta.user, purpose: '2fa' }, JWT_SECRET, { expiresIn: '10m' });
        return {
            success: true,
            requires2fa: true,
            mode: Number(cuenta.totp_enabled) === 1 ? 'code' : 'setup',
            needsEmail: !cuenta.email,
            tempToken
        };
    }

    // ============================================================
    // POST /api/2fa/setup — genera el secreto y el QR
    // ============================================================
    app.post('/api/2fa/setup', limiter, async (req, res) => {
        try {
            await esquemaListo;
            const a = actor(req);
            if (!a) return noSesion(res);
            const cuenta = await buscarCuenta(a.user);
            if (!cuenta) return noSesion(res);

            if (!a.temporal && !['admin', 'superadmin'].includes(cuenta.role)) {
                return res.status(403).json({ success: false, message: 'Acceso denegado.' });
            }
            if (Number(cuenta.totp_enabled) === 1) {
                return res.status(400).json({ success: false, message: 'Ya está activado. Si cambiaste de celular, pide al superadmin que lo reinicie.' });
            }

            // Correo: obligatorio si la cuenta aún no tiene uno
            if (!cuenta.email) {
                const correo = String((req.body && req.body.email) || '').trim().toLowerCase();
                if (!EMAIL_RE.test(correo) || correo.length > 100) {
                    return res.status(400).json({ success: false, needsEmail: true, message: 'Escribe un correo válido.' });
                }
                await q('UPDATE usuarios SET email = ? WHERE user = ?', [correo, cuenta.user]);
            }

            const secreto = base32Encode(crypto.randomBytes(20));
            await q(
                'UPDATE usuarios SET totp_secret = ?, totp_enabled = 0, totp_last_step = NULL WHERE user = ?',
                [cifrar(secreto, KEY), cuenta.user]
            );

            const uri = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(cuenta.user)}` +
                        `?secret=${secreto}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
            const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });

            res.json({ success: true, qr, secret: secreto.match(/.{1,4}/g).join(' ') });
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // POST /api/2fa/activate — confirma con el primer código
    // ============================================================
    app.post('/api/2fa/activate', limiter, async (req, res) => {
        try {
            await esquemaListo;
            const a = actor(req);
            if (!a) return noSesion(res);
            const cuenta = await buscarCuenta(a.user);
            if (!cuenta) return noSesion(res);

            const espera = minutosBloqueo(cuenta.user);
            if (espera) return res.status(429).json({ success: false, message: `Demasiados intentos fallidos. Espera ${espera} min.` });
            if (Number(cuenta.totp_enabled) === 1 || !cuenta.totp_secret) {
                return res.status(400).json({ success: false, message: 'Primero genera el código QR.' });
            }

            const paso = validarCodigo(cuenta, req.body && req.body.code);
            if (paso === null) {
                registrarFallo(cuenta.user);
                return res.status(401).json({ success: false, message: 'Código incorrecto. Revisa que la hora de tu celular esté en automático.' });
            }
            await q('UPDATE usuarios SET totp_enabled = 1, totp_last_step = ? WHERE user = ?', [paso, cuenta.user]);
            fallos.delete(cuenta.user);

            if (a.temporal) return res.json(emitirSesion(cuenta));
            res.json({ success: true, message: 'Verificación en dos pasos activada.' });
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // POST /api/2fa/verify — segundo paso del login (cuenta ya activada)
    // ============================================================
    app.post('/api/2fa/verify', limiter, async (req, res) => {
        try {
            await esquemaListo;
            const a = actor(req);
            if (!a || !a.temporal) return noSesion(res);
            const cuenta = await buscarCuenta(a.user);
            if (!cuenta) return noSesion(res);

            const espera = minutosBloqueo(cuenta.user);
            if (espera) return res.status(429).json({ success: false, message: `Demasiados intentos fallidos. Espera ${espera} min.` });
            if (Number(cuenta.totp_enabled) !== 1) {
                return res.status(400).json({ success: false, message: 'La verificación en dos pasos no está activada.' });
            }

            const paso = validarCodigo(cuenta, req.body && req.body.code);
            if (paso === null) {
                registrarFallo(cuenta.user);
                return res.status(401).json({ success: false, message: 'Código incorrecto o ya usado. Espera al siguiente código de tu app.' });
            }
            await q('UPDATE usuarios SET totp_last_step = ? WHERE user = ?', [paso, cuenta.user]);
            fallos.delete(cuenta.user);
            res.json(emitirSesion(cuenta));
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // GET /api/2fa/estado — estado de MI cuenta (sesión completa)
    // ============================================================
    app.get('/api/2fa/estado', verificarToken, async (req, res) => {
        try {
            await esquemaListo;
            const cuenta = await buscarCuenta(req.usuario.user);
            if (!cuenta) return noSesion(res);
            res.json({
                success: true,
                enabled: Number(cuenta.totp_enabled) === 1,
                requerido: rolesObligatorios.includes(cuenta.role),
                puedeActivar: ['admin', 'superadmin'].includes(cuenta.role),
                tieneEmail: !!cuenta.email
            });
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // POST /api/2fa/desactivar — apagar MI 2FA (pide un código válido)
    // ============================================================
    app.post('/api/2fa/desactivar', limiter, verificarToken, async (req, res) => {
        try {
            await esquemaListo;
            const cuenta = await buscarCuenta(req.usuario.user);
            if (!cuenta) return noSesion(res);
            if (rolesObligatorios.includes(cuenta.role)) {
                return res.status(403).json({ success: false, message: 'Tu rol exige la verificación en dos pasos; no se puede desactivar.' });
            }
            if (Number(cuenta.totp_enabled) !== 1) {
                return res.status(400).json({ success: false, message: 'No está activada.' });
            }
            const espera = minutosBloqueo(cuenta.user);
            if (espera) return res.status(429).json({ success: false, message: `Demasiados intentos fallidos. Espera ${espera} min.` });

            if (validarCodigo(cuenta, req.body && req.body.code) === null) {
                registrarFallo(cuenta.user);
                return res.status(401).json({ success: false, message: 'Código incorrecto.' });
            }
            await q('UPDATE usuarios SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE user = ?', [cuenta.user]);
            fallos.delete(cuenta.user);
            res.json({ success: true, message: 'Verificación en dos pasos desactivada.' });
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // GET /api/2fa/cuentas — admins y superadmins (solo superadmin)
    // ============================================================
    app.get('/api/2fa/cuentas', verificarToken, async (req, res) => {
        try {
            await esquemaListo;
            if (req.usuario.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Acceso denegado.' });
            const rows = await q(
                "SELECT id, user, nombre, role, email, totp_enabled FROM usuarios " +
                "WHERE role IN ('admin','superadmin') ORDER BY role DESC, nombre"
            );
            res.json({ success: true, cuentas: rows.map(r => ({
                id: r.id, user: r.user, nombre: r.nombre, role: r.role,
                email: r.email || '', enabled: Number(r.totp_enabled) === 1
            })) });
        } catch (e) { errorSrv(res, e); }
    });

    // ============================================================
    // POST /api/2fa/reiniciar/:id — el superadmin reinicia el 2FA de alguien
    // ============================================================
    app.post('/api/2fa/reiniciar/:id', verificarToken, async (req, res) => {
        try {
            await esquemaListo;
            if (req.usuario.role !== 'superadmin') return res.status(403).json({ success: false, message: 'Acceso denegado.' });
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(400).json({ success: false, message: 'Usuario inválido.' });
            const rows = await q('SELECT user FROM usuarios WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

            await q('UPDATE usuarios SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?', [id]);
            fallos.delete(rows[0].user);
            console.log(`[2FA] ${new Date().toISOString()} — ${req.usuario.user} reinició el 2FA de "${rows[0].user}" (id ${id}).`);
            res.json({ success: true, message: 'Verificación en dos pasos reiniciada. En su próximo ingreso deberá configurarla de nuevo.' });
        } catch (e) { errorSrv(res, e); }
    });

    return { requiereSegundoPaso, iniciarDesafio, esquemaListo };
}

module.exports = {
    registrar,
    // exportados para las pruebas
    _interno: { base32Encode, base32Decode, hotp, totpCoincide, cifrar, descifrar, claveCifrado, pasoActual }
};
