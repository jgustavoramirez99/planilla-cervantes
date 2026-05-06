const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, './')));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_NAME || 'db_planilla_cervantes',
    port: process.env.DB_PORT || 3306
});

// --- LISTAR DOCENTES (Ajustado para el nuevo index) ---
app.get('/api/docentes', (req, res) => {
    const mes = parseInt(req.query.mes) || 5;
    // Capturamos el filtro de nombre si viene del frontend
    const nombreFiltro = req.query.nombre; 

    let sql = `
        SELECT d.*, 
               IFNULL(p.adelantos, 0) as adelantos, 
               IFNULL(p.faltas, 0) as faltas, 
               IFNULL(p.pension, 0) as pension, 
               IFNULL(p.tardanza, 0) as tardanza
        FROM docentes d
        LEFT JOIN planillas p ON d.id_docente = p.id_docente AND p.mes = ? AND p.anio = 2026`;

    let params = [mes];

    // Si no es admin, filtramos por el nombre que viene del login
    if (nombreFiltro) {
        sql += ` WHERE d.nombre LIKE ?`;
        params.push(`%${nombreFiltro}%`);
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

// --- NUEVA RUTA: ACTUALIZAR PLANILLA (Súper importante) ---
// Esta es la que permite que el botón "Actualizar Datos" del modal funcione
app.put('/api/docentes/:id', (req, res) => {
    const { id } = req.params;
    const { sueldo_base, adelantos, faltas, pension, tardanza, mes } = req.body;

    // 1. Actualizamos el sueldo base en la tabla 'docentes'
    const sqlDocente = `UPDATE docentes SET sueldo_base = ? WHERE id_docente = ?`;
    
    // 2. Actualizamos o Insertamos los descuentos en la tabla 'planillas'
    const sqlPlanilla = `
        INSERT INTO planillas (id_docente, mes, anio, adelantos, faltas, pension, tardanza)
        VALUES (?, ?, 2026, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            adelantos = VALUES(adelantos), 
            faltas = VALUES(faltas), 
            pension = VALUES(pension), 
            tardanza = VALUES(tardanza)`;

    db.query(sqlDocente, [sueldo_base, id], (err) => {
        if (err) return res.status(500).json({ error: "Error al actualizar sueldo" });

        db.query(sqlPlanilla, [id, mes, adelantos, faltas, pension, tardanza], (err2) => {
            if (err2) return res.status(500).json({ error: "Error al actualizar descuentos" });
            res.json({ success: true, message: "Datos sincronizados correctamente" });
        });
    });
});

// --- RUTA WHATSAPP (Se mantiene igual) ---
app.get('/api/whatsapp-link', (req, res) => {
    const { nombre, sueldo } = req.query;
    const numero = "51943706872";
    const texto = `Hola *${nombre}*, se ha actualizado tu planilla.%0A%0A*Monto Neto:* S/ ${sueldo}%0A%0AConsulta los detalles en el sistema.`;
    const link = `https://api.whatsapp.com/send?phone=${numero}&text=${texto}`;
    res.json({ link });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor de Cervantes School corriendo en puerto ${PORT}`));