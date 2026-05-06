const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

    // --- BLOQUE DE CREACIÓN AUTOMÁTICA DE TABLA ---
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS docentes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100),
        apellido VARCHAR(100),
        dni VARCHAR(8),
        cargo VARCHAR(50)
    );`;

    db.query(createTableQuery, (err, result) => {
        if (err) {
            console.error("Error al crear la tabla 'docentes':", err);
        } else {
            console.log("Tabla 'docentes' verificada/creada correctamente en la nube");
            
            // Insertamos un docente de prueba para que veas algo en tu web
            const checkData = "SELECT COUNT(*) AS total FROM docentes";
            db.query(checkData, (err, rows) => {
                if (!err && rows[0].total === 0) {
                    const insertFirst = "INSERT INTO docentes (nombre, apellido, dni, cargo) VALUES ('Gustavo', 'Ramirez', '12345678', 'Ingeniero de Sistemas')";
                    db.query(insertFirst);
                    console.log("Dato de prueba insertado.");
                }
            });
        }
    });
    // --- FIN DEL BLOQUE ---
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