const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config(); // IMPORTANTE: Para leer tus contraseñas seguras

const app = express();
app.use(cors());
app.use(express.json()); // Útil si luego quieres guardar datos

// --- CONFIGURACIÓN DE LA CONEXIÓN (Modificada para la nube) ---
// Usaremos variables de entorno (process.env) para que tus datos reales no estén en GitHub
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'db_planilla_cervantes',
    port: process.env.DB_PORT || 3306,
    // Esto es vital para bases de datos en la nube
    ssl: {
        rejectUnauthorized: false
    }
});

// Probar conexión
db.connect((err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado exitosamente a la base de datos');
});

// Ruta para obtener los docentes
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

// --- EL CAMBIO MAESTRO PARA RENDER ---
// Render asigna un puerto automáticamente en la variable process.env.PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});