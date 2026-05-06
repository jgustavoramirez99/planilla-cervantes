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
    console.log('Conectado exitosamente a la base de datos');

    // 1. Crear Tabla de Docentes (Datos Maestros)
    const tableDocentes = `
    CREATE TABLE IF NOT EXISTS docentes (
        id_docente INT PRIMARY KEY AUTO_INCREMENT,
        nombre VARCHAR(255) NOT NULL,
        dni VARCHAR(20) UNIQUE,
        sueldo_base DECIMAL(10, 2),
        tipo_pension VARCHAR(50)
    );`;

    // 2. Crear Tabla de Planillas (Datos Mensuales)
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

    db.query(tableDocentes, (err) => {
        if (err) return console.error("Error docentes:", err);
        
        db.query(tablePlanillas, (err) => {
            if (err) return console.error("Error planillas:", err);
            
            // Insertar datos iniciales solo si la tabla está vacía
            db.query("SELECT COUNT(*) as total FROM docentes", (err, res) => {
                if (res[0].total === 0) {
                    const insertDocentes = `
                    INSERT INTO docentes (nombre, dni, sueldo_base, tipo_pension) VALUES
                    ('ARIZOLA TINTAYA, Reyna Del Pilar', '1', 1800.00, 'AFP'),
                    ('ARONE ROMERO, Liseth', '2', 1500.00, 'ONP'),
                    ('BURGA ALCALA, Romulo Moroni', '3', 1800.00, 'AFP'),
                    ('RAMIREZ RAMIREZ, Jaime Gustavo', '76758994', 1500.00, 'AFP'),
                    ('MUÑOZ CERVANTES, Erika', '20', 2500.00, 'AFP');`; 
                    // Nota: He resumido la lista para el ejemplo, puedes pegar todos aquí.
                    
                    db.query(insertDocentes, () => console.log("Carga inicial de docentes lista."));
                }
            });
        });
    });
});

// Obtener docentes con su planilla del mes actual (Mayo 2026)
app.get('/api/docentes', (req, res) => {
    const mes = req.query.mes || 5;
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
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

// Actualizar o Insertar datos de planilla
app.put('/api/docentes/:id', (req, res) => {
    const { id } = req.params;
    const { adelantos, faltas, pension, tardanza, mes = 5, anio = 2026 } = req.body;
    
    // Usamos ON DUPLICATE KEY o primero verificamos si existe
    const checkSql = "SELECT id_planilla FROM planillas WHERE id_docente = ? AND mes = ? AND anio = ?";
    
    db.query(checkSql, [id, mes, anio], (err, results) => {
        if (err) return res.status(500).json({ error: "Error de búsqueda" });

        if (results.length > 0) {
            // Actualizar
            const updateSql = `UPDATE planillas SET adelantos=?, faltas=?, pension=?, tardanza=? WHERE id_docente=? AND mes=? AND anio=?`;
            db.query(updateSql, [adelantos, faltas, pension, tardanza, id, mes, anio], (err) => {
                if (err) return res.status(500).json({ error: "Error al actualizar" });
                res.json({ message: "Planilla actualizada" });
            });
        } else {
            // Insertar nuevo registro mensual
            const insertSql = `INSERT INTO planillas (id_docente, mes, anio, adelantos, faltas, pension, tardanza) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertSql, [id, mes, anio, adelantos, faltas, pension, tardanza], (err) => {
                if (err) return res.status(500).json({ error: "Error al insertar" });
                res.json({ message: "Registro de mes creado" });
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de Planilla corriendo en puerto ${PORT}`));