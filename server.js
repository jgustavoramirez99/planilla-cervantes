const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

// Configuración de BD
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'db_planilla_cervantes',
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
});

// Usuarios del sistema
const usuarios = [
    { user: 'admin_cervantes', pass: 'cervantes2026', role: 'admin', nombre: 'Administrador' },
    { user: 'gustavo_ramirez', pass: 'cesac2026', role: 'worker', nombre: 'RAMIREZ RAMIREZ, Jaime Gustavo', dni: '76758994' }
];

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    const cuenta = usuarios.find(u => u.user === user && u.pass === pass);
    
    if (cuenta) {
        res.json({ success: true, role: cuenta.role, nombre: cuenta.nombre, dni: cuenta.dni || null });
    } else {
        res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }
});

// --- RUTA WHATSAPP ---

app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo, filename } = req.query;
    // Datos de prueba configurados para tu número
    const numero = "51943706872"; 
    const urlBoleta = `${req.protocol}://${req.get('host')}/boletas/${filename}`;
    
    const texto = `Hola *${nombre}*, te adjunto tu boleta de pago.%0A%0A*Total Neto:* S/ ${sueldo}%0A*Link:* ${urlBoleta}`;
    const link = `https://api.whatsapp.com/send?phone=${numero}&text=${texto}`;
    
    res.json({ link });
});

// --- GESTIÓN DE PLANILLAS ---

app.get('/api/docentes', (req, res) => {
    const mes = parseInt(req.query.mes) || 5;
    const role = req.headers['x-user-role'];
    const dni = req.headers['x-user-dni'];

    let sql = `
        SELECT d.*, 
               IFNULL(p.adelantos, 0) as adelantos, 
               IFNULL(p.faltas, 0) as faltas, 
               IFNULL(p.pension, 0) as pension, 
               IFNULL(p.tardanza, 0) as tardanza
        FROM docentes d
        LEFT JOIN planillas p ON d.id_docente = p.id_docente AND p.mes = ? AND p.anio = 2026`;

    // Filtro de seguridad: El trabajador solo se ve a sí mismo
    let params = [mes];
    if (role === 'worker') {
        sql += ` WHERE d.dni = ?`;
        params.push(dni);
    } else {
        sql += ` ORDER BY d.nombre ASC`;
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

// Guardar PDF en el servidor
app.post('/api/guardar-boleta', (req, res) => {
    const { filename, base64 } = req.body;
    const folder = path.join(__dirname, 'boletas');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const filePath = path.join(folder, filename);
    fs.writeFile(filePath, Buffer.from(base64, 'base64'), (err) => {
        if (err) return res.status(500).json({ error: 'Error al guardar PDF' });
        res.json({ success: true });
    });
});

// ... (Aquí mantienes tu código de PUT para actualizar la planilla)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));