const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'db_planilla_cervantes',
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado a la BD de Cervantes School');

    // Creación de tablas si no existen (Sin borrar datos previos)
    const tableDocentes = `
    CREATE TABLE IF NOT EXISTS docentes (
        id_docente INT PRIMARY KEY AUTO_INCREMENT,
        nombre VARCHAR(255) NOT NULL,
        dni VARCHAR(20) UNIQUE,
        sueldo_base DECIMAL(10, 2),
        tipo_pension VARCHAR(50)
    );`;

    const tablePlanillas = `
    CREATE TABLE IF NOT EXISTS planillas (
        id_planilla INT PRIMARY KEY AUTO_INCREMENT,
        id_docente INT,
        mes INT,
        anio INT,
        adelantos DECIMAL(10, 2) DEFAULT 0.00,
        faltas DECIMAL(10, 2) DEFAULT 0.00,
        pension DECIMAL(10, 2) DEFAULT 0.00,
        tardanza DECIMAL(10, 2) DEFAULT 0.00,
        FOREIGN KEY (id_docente) REFERENCES docentes(id_docente)
    );`;

    db.query(tableDocentes);
    db.query(tablePlanillas);
});

// GET: Obtener docentes + datos de planilla del mes seleccionado
app.get('/api/docentes', (req, res) => {
    // Capturamos el mes desde la URL (ej: ?mes=5) o usamos 5 (Mayo) por defecto
    const mes = parseInt(req.query.mes) || 5; 
    const anio = 2026;

    const sql = `
        SELECT d.*, 
               IFNULL(p.adelantos, 0) as adelantos, 
               IFNULL(p.faltas, 0) as faltas, 
               IFNULL(p.pension, 0) as pension, 
               IFNULL(p.tardanza, 0) as tardanza
        FROM docentes d
        LEFT JOIN planillas p ON d.id_docente = p.id_docente AND p.mes = ? AND p.anio = ?
        ORDER BY d.nombre ASC`;

    db.query(sql, [mes, anio], (err, result) => {
        if (err) {
            console.error("Error en SELECT:", err);
            return res.status(500).json({ error: "Error al obtener datos" });
        }
        res.json(result);
    });
});

// PUT: Actualizar o Crear registro de planilla para un docente
app.put('/api/docentes/:id', (req, res) => {
    const { id } = req.params;
    const { adelantos, faltas, pension, tardanza, mes } = req.body;
    const anio = 2026;
    const m = parseInt(mes) || 5;

    // Lógica "Upsert": Si existe actualiza, si no, inserta
    const checkSql = "SELECT id_planilla FROM planillas WHERE id_docente = ? AND mes = ? AND anio = ?";
    
    db.query(checkSql, [id, m, anio], (err, results) => {
        if (err) return res.status(500).json({ error: "Error de servidor" });

        if (results.length > 0) {
            const updateSql = `UPDATE planillas SET adelantos=?, faltas=?, pension=?, tardanza=? WHERE id_docente=? AND mes=? AND anio=?`;
            db.query(updateSql, [adelantos, faltas, pension, tardanza, id, m, anio], (err) => {
                if (err) return res.status(500).json({ error: "Error al actualizar" });
                res.json({ message: "Planilla actualizada con éxito" });
            });
        } else {
            const insertSql = `INSERT INTO planillas (id_docente, mes, anio, adelantos, faltas, pension, tardanza) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertSql, [id, m, anio, adelantos, faltas, pension, tardanza], (err) => {
                if (err) return res.status(500).json({ error: "Error al crear registro" });
                res.json({ message: "Registro mensual creado" });
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));