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

// Configuración de BD (Asegúrate de tener tus variables en el .env)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'db_planilla_cervantes',
    port: process.env.DB_PORT || 3306
});

// USUARIOS OFICIALES
const usuarios = [
    { user: 'admin_cervantes', pass: 'cervantes2026', role: 'admin', nombre: 'Promotor Edgar Cervantes' },
    { user: 'jaime_ramirez', pass: 'boleta2026', role: 'user', nombre: 'Gustavo Ramirez', dni: '76758994' }
];

// --- LOGIN API ---
app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    const cuenta = usuarios.find(u => u.user === user && u.pass === pass);
    
    if (cuenta) {
        res.json({ success: true, role: cuenta.role, nombre: cuenta.nombre, dni: cuenta.dni || null });
    } else {
        res.status(401).json({ success: false, message: 'Usuario o clave incorrectos' });
    }
});

// --- RUTA WHATSAPP ---
app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo, filename } = req.query;
    const numero = "51943706872"; // Tu número de Claro
    const urlBoleta = `${req.protocol}://${req.get('host')}/boletas/${filename}`;
    
    const texto = `Hola *${nombre}*, te adjunto tu boleta del mes.%0A%0A*Total Neto:* S/ ${sueldo}%0A*Link:* ${urlBoleta}`;
    const link = `https://api.whatsapp.com/send?phone=${numero}&text=${texto}`;
    
    res.json({ link });
});

// --- LISTAR DOCENTES ---
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

    let params = [mes];
    if (role === 'user') {
        sql += ` WHERE d.dni = ?`;
        params.push(dni);
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));