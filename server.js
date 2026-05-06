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
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado exitosamente a la base de datos');

    // --- PASO 1: BORRAMOS LA TABLA ANTIGUA ---
    db.query("DROP TABLE IF EXISTS docentes", (err) => {
        if (err) {
            console.error("Error al borrar tabla antigua:", err);
        } else {
            console.log("Tabla antigua eliminada. Creando versión actualizada...");

            // --- PASO 2: CREACIÓN DE TABLA CORREGIDA ---
            // Corregido: Agregada coma después de tipo_pension y quitada la coma final antes del paréntesis
            const createTableQuery = `
            CREATE TABLE docentes (
                id_docente INT PRIMARY KEY,
                nombre VARCHAR(255),
                dni VARCHAR(20),
                sueldo_base DECIMAL(10, 2),
                tipo_pension VARCHAR(50),
                adelantos DECIMAL(10, 2) DEFAULT 0.00,
                faltas DECIMAL(10, 2) DEFAULT 0.00
            );`;

            db.query(createTableQuery, (err) => {
                if (err) {
                    console.error("Error al crear la tabla nueva:", err);
                } else {
                    console.log("Tabla 'docentes' creada con éxito");

                    // --- PASO 3: INSERCIÓN CORREGIDA (7 columnas ahora) ---
                    // IMPORTANTE: Agregamos 0, 0 al final de cada fila para adelantos y faltas iniciales
                    const insertDataQuery = `
                    INSERT INTO docentes (id_docente, nombre, dni, sueldo_base, tipo_pension, adelantos, faltas) VALUES
                    (1, 'Juan Perez', '12345678', 2500.00, 'AFP', 0, 0),
                    (2, 'ARIZOLA TINTAYA, Reyna Del Pilar', '1', 1800.00, 'AFP', 0, 0),
                    (3, 'ARONE ROMERO, Liseth', '2', 1500.00, 'ONP', 0, 0),
                    (4, 'BURGA ALCALA, Romulo Moroni', '3', 1800.00, 'AFP', 0, 0),
                    (5, 'CARAZA HUAMANI, Flor De Maria', '4', 1500.00, 'AFP', 0, 0),
                    (6, 'CASTILLEJO CHILINGANA, Samira Nicol', '5', 1500.00, 'AFP', 0, 0),
                    (7, 'CERVANTES REYES, Agripina', '6', 1800.00, 'ONP', 0, 0),
                    (8, 'CERVANTES REYES, Edgar', '7', 2500.00, 'AFP', 0, 0),
                    (9, 'CEVALLOS CARRILLO, Bony', '8', 1800.00, 'AFP', 0, 0),
                    (10, 'CHAVEZ CHIRINOS, Laura Soledad', '9', 1800.00, 'AFP', 0, 0),
                    (11, 'CORONADO VARGAS, Melissa Lizehtt', '10', 1800.00, 'AFP', 0, 0),
                    (12, 'CRUZ BELENDEZ, Humberto Maria', '11', 2000.00, 'AFP', 0, 0),
                    (13, 'DOMINGUEZ GOMEZ, Ana Elena', '12', 1800.00, 'AFP', 0, 0),
                    (14, 'FLORES RIVERA, Edgar', '13', 1800.00, NULL, 0, 0),
                    (15, 'GARCIA CARRION, Eloy', '14', 1800.00, NULL, 0, 0),
                    (16, 'GARCIA FERNANDEZ, Russell', '15', 1800.00, NULL, 0, 0),
                    (17, 'GUERRERO LEYVA, Maria', '16', 1800.00, NULL, 0, 0),
                    (18, 'MEDINA BELLON, Julinho Americo Jesus', '17', 1800.00, NULL, 0, 0),
                    (19, 'MENDOZA JUEZ DE TENORIO, Belen Milagros', '18', 1800.00, NULL, 0, 0),
                    (20, 'MEZA SALAZAR, Jarlen Jaqueline', '19', 2000.00, NULL, 0, 0),
                    (21, 'MUÑOZ CERVANTES, Erika', '20', 2500.00, NULL, 0, 0),
                    (22, 'ORDINOLA CORREA, Roberto Alexander', '21', 1800.00, NULL, 0, 0),
                    (23, 'PAOLA ESTUPIÑAN, Ibeth', '22', 1800.00, NULL, 0, 0),
                    (24, 'PALACIOS BALDEON, Edison', '23', 2000.00, NULL, 0, 0),
                    (25, 'PERFECTO ALEJO, Russell', '24', 2000.00, NULL, 0, 0),
                    (26, 'PONCE HERRERA, Maria Elena', '25', 1500.00, NULL, 0, 0),
                    (27, 'PUMAPUILLO CJUIRO, Fatima Rosario', '26', 2000.00, NULL, 0, 0),
                    (28, 'QUISPE BUSTAMANTE, Lucia', '27', 1800.00, NULL, 0, 0),
                    (29, 'RAMIREZ RAMIREZ, Jaime Gustavo', '76758994', 1500.00, NULL, 0, 0),
                    (30, 'RAMOS FLORES, Nicole Jamile', '29', 1800.00, NULL, 0, 0),
                    (31, 'RIVAS ANGOMA, Eduardo Elias', '30', 1800.00, NULL, 0, 0),
                    (32, 'RODRIGUEZ RIVAS, Carmen', '31', 1500.00, NULL, 0, 0),
                    (33, 'ROSALES ESPINOZA, Luz Nelly', '32', 1800.00, NULL, 0, 0),
                    (34, 'SALVATIERRA MEZA, Angel', '33', 2000.00, NULL, 0, 0),
                    (35, 'SOLIS GUTIERREZ, Naydelyn', '34', 1500.00, NULL, 0, 0),
                    (36, 'TAFUR YACTAYO, Yulisa Del Carmen', '35', 2000.00, NULL, 0, 0),
                    (37, 'TELLO HUAYN, Dylan', '36', 1500.00, NULL, 0, 0),
                    (38, 'VELARDE MENDOZA, Noemi Victoria', '37', 1800.00, NULL, 0, 0),
                    (39, 'VERANO VILLAR, Hector', '38', 1800.00, NULL, 0, 0),
                    (40, 'VILCHEZ ROSALES, Elena Carolina', '39', 1500.00, NULL, 0, 0);`;

                    db.query(insertDataQuery, (err) => {
                        if (err) console.error("Error al insertar los 40 registros:", err);
                        else console.log("¡Éxito! 40 docentes insertados.");
                    });
                }
            });
        }
    });
});

app.get('/api/docentes', (req, res) => {
    const sql = "SELECT * FROM docentes";
    db.query(sql, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Error en el servidor" });
        }
        return res.json(result);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});