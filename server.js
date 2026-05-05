const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(cors()); // Permite que minode HTML acceda a los datos

// Configuración de la conexión a XAMPP
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Por defecto XAMPP no tiene contraseña
    database: 'db_planilla_cervantes'
});

// Ruta para obtener los docentes
app.get('/api/docentes', (req, res) => {
    const sql = "SELECT * FROM docentes";
    db.query(sql, (err, result) => {
        if (err) return res.json(err);
        return res.json(result);
    });
});

app.listen(3000, () => {
    console.log("Servidor corriendo en el puerto 3000");
});