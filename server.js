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

    // 1. Crear tabla de docentes si no existe
    const tableDocentes = `
    CREATE TABLE IF NOT EXISTS docentes (
        id_docente INT PRIMARY KEY AUTO_INCREMENT,
        nombre VARCHAR(255) NOT NULL,
        dni VARCHAR(20) UNIQUE,
        sueldo_base DECIMAL(10, 2),
        tipo_pension VARCHAR(50)
    );`;

    // 2. Crear tabla de planillas si no existe
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

    db.query(tableDocentes, () => {
        db.query(tablePlanillas, () => {
            // CARGA INICIAL: Si no hay docentes, los insertamos todos de una vez
            db.query("SELECT COUNT(*) as total FROM docentes", (err, res) => {
                if (res && res[0].total === 0) {
                    const insertData = `
                    INSERT INTO docentes (nombre, dni, sueldo_base, tipo_pension) VALUES
                    ('ARIZOLA TINTAYA, Reyna Del Pilar', '1', 1800.00, 'AFP'),
                    ('ARONE ROMERO, Liseth', '2', 1500.00, 'ONP'),
                    ('BURGA ALCALA, Romulo Moroni', '3', 1800.00, 'AFP'),
                    ('CARAZA HUAMANI, Flor De Maria', '4', 1500.00, 'AFP'),
                    ('CASTILLEJO CHILINGANA, Samira Nicol', '5', 1500.00, 'AFP'),
                    ('CERVANTES REYES, Agripina', '6', 1800.00, 'ONP'),
                    ('CERVANTES REYES, Edgar', '7', 2500.00, 'AFP'),
                    ('CEVALLOS CARRILLO, Bony', '8', 1800.00, 'AFP'),
                    ('CHAVEZ CHIRINOS, Laura Soledad', '9', 1800.00, 'AFP'),
                    ('CORONADO VARGAS, Melissa Lizehtt', '10', 1800.00, 'AFP'),
                    ('CRUZ BELENDEZ, Humberto Maria', '11', 2000.00, 'AFP'),
                    ('DOMINGUEZ GOMEZ, Ana Elena', '12', 1800.00, 'AFP'),
                    ('FLORES RIVERA, Edgar', '13', 1800.00, NULL),
                    ('GARCIA CARRION, Eloy', '14', 1800.00, NULL),
                    ('GARCIA FERNANDEZ, Russell', '15', 1800.00, NULL),
                    ('GUERRERO LEYVA, Maria', '16', 1800.00, NULL),
                    ('MEDINA BELLON, Julinho Americo Jesus', '17', 1800.00, NULL),
                    ('MENDOZA JUEZ DE TENORIO, Belen Milagros', '18', 1800.00, NULL),
                    ('MEZA SALAZAR, Jarlen Jaqueline', '19', 2000.00, NULL),
                    ('MUÑOZ CERVANTES, Erika', '20', 2500.00, NULL),
                    ('ORDINOLA CORREA, Roberto Alexander', '21', 1800.00, NULL),
                    ('PAOLA ESTUPIÑAN, Ibeth', '22', 1800.00, NULL),
                    ('PALACIOS BALDEON, Edison', '23', 2000.00, NULL),
                    ('PERFECTO ALEJO, Russell', '24', 2000.00, NULL),
                    ('PONCE HERRERA, Maria Elena', '25', 1500.00, NULL),
                    ('PUMAPUILLO CJUIRO, Fatima Rosario', '26', 2000.00, NULL),
                    ('QUISPE BUSTAMANTE, Lucia', '27', 1800.00, NULL),
                    ('RAMIREZ RAMIREZ, Jaime Gustavo', '76758994', 1500.00, NULL),
                    ('RAMOS FLORES, Nicole Jamile', '29', 1800.00, NULL),
                    ('RIVAS ANGOMA, Eduardo Elias', '30', 1800.00, NULL),
                    ('RODRIGUEZ RIVAS, Carmen', '31', 1500.00, NULL),
                    ('ROSALES ESPINOZA, Luz Nelly', '32', 1800.00, NULL),
                    ('SALVATIERRA MEZA, Angel', '33', 2000.00, NULL),
                    ('SOLIS GUTIERREZ, Naydelyn', '34', 1500.00, NULL),
                    ('TAFUR YACTAYO, Yulisa Del Carmen', '35', 2000.00, NULL),
                    ('TELLO HUAYN, Dylan', '36', 1500.00, NULL),
                    ('VELARDE MENDOZA, Noemi Victoria', '37', 1800.00, NULL),
                    ('VERANO VILLAR, Hector', '38', 1800.00, NULL),
                    ('VILCHEZ ROSALES, Elena Carolina', '39', 1500.00, NULL);`;

                    db.query(insertData, (err) => {
                        if (err) console.error("Error al cargar profesores:", err);
                        else console.log("¡40 Profesores cargados exitosamente!");
                    });
                }
            });
        });
    });
});

// GET: Obtener todos los docentes con planilla mensual
app.get('/api/docentes', (req, res) => {
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
        if (err) return res.status(500).json({ error: "Error en la base de datos" });
        res.json(result);
    });
});

// PUT: Actualizar planilla
app.put('/api/docentes/:id', (req, res) => {
    const { id } = req.params;
    const { adelantos, faltas, pension, tardanza, mes } = req.body;
    const anio = 2026;
    const m = parseInt(mes) || 5;

    const checkSql = "SELECT id_planilla FROM planillas WHERE id_docente = ? AND mes = ? AND anio = ?";
    
    db.query(checkSql, [id, m, anio], (err, results) => {
        if (err) return res.status(500).json({ error: "Error de servidor" });

        if (results.length > 0) {
            const updateSql = `UPDATE planillas SET adelantos=?, faltas=?, pension=?, tardanza=? WHERE id_docente=? AND mes=? AND anio=?`;
            db.query(updateSql, [adelantos, faltas, pension, tardanza, id, m, anio], (err) => {
                if (err) return res.status(500).json({ error: "Error al actualizar" });
                res.json({ message: "OK" });
            });
        } else {
            const insertSql = `INSERT INTO planillas (id_docente, mes, anio, adelantos, faltas, pension, tardanza) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.query(insertSql, [id, m, anio, adelantos, faltas, pension, tardanza], (err) => {
                if (err) return res.status(500).json({ error: "Error al crear" });
                res.json({ message: "OK" });
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));