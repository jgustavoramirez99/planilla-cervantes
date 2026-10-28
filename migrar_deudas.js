// migrar_deudas.js
// -----------------------------------------------------------------------
// Script de migracion de UNA SOLA VEZ.
//
// Que hace: recorre TODAS las filas de "planillas", busca sus registros
// en "registros_deuda", y separa los montos de tipo ADELANTO, PRESTAMOS,
// PENSION y TARDANZA hacia las columnas nuevas (adelantos_deuda,
// prestamos_deuda, pension_deuda, tardanza_deuda), restandolos de
// otros_descuentos / otros_desc_detalle. El total (neto a pagar) NO
// cambia, solo se reordena en la columna correcta.
//
// Es seguro correrlo mas de una vez (siempre recalcula desde cero a
// partir de registros_deuda, no suma incrementalmente).
//
// ANTES DE CORRERLO:
// 1) Ya corriste el ALTER TABLE en TablePlus (adelantos_deuda,
//    prestamos_deuda, pension_deuda, tardanza_deuda).
// 2) Completa las credenciales reales de tu base Aiven abajo (las mismas
//    que usas en TablePlus: host, usuario, password, puerto, database).
//
// COMO CORRERLO (desde la carpeta del proyecto, en tu terminal de VS Code):
//    node migrar_deudas.js
// -----------------------------------------------------------------------

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: 'mysql-2a17c5f0-jgustavo-1a91.d.aivencloud.com',      // ver instrucción abajo
  port: 24853,
  user: 'avnadmin',
  password: process.env.DB_PASSWORD,  // ver instrucción abajo
  database: 'defaultdb',
  ssl: { rejectUnauthorized: false }
};

const TIPOS_CON_COLUMNA_PROPIA = {
  'ADELANTO':  'adelantosDeuda',
  'PRESTAMOS': 'prestamosDeuda',
  'PENSIÓN':   'pensionDeuda',
  'TARDANZA':  'tardanzaDeuda'
};

async function main() {
  if (DB_CONFIG.host === 'TU_HOST_AIVEN_AQUI') {
    console.error('Falta completar las credenciales reales de la base de datos en este archivo antes de correrlo.');
    process.exit(1);
  }

  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('Conectado a la base de datos.\n');

  const [planillas] = await conn.execute(
    `SELECT id_planilla, id_docente, mes, anio FROM planillas`
  );

  let actualizadas = 0;
  let sinCambios = 0;

  for (const p of planillas) {
    const [regs] = await conn.execute(
      `SELECT tipo, monto, cuota_actual, cuotas FROM registros_deuda
       WHERE id_docente = ? AND mes = ? AND anio = ?`,
      [p.id_docente, p.mes, p.anio]
    );

    if (regs.length === 0) {
      sinCambios++;
      continue;
    }

    let adelantosDeuda = 0, prestamosDeuda = 0, pensionDeuda = 0, tardanzaDeuda = 0;
    const otros = [];

    for (const r of regs) {
      const monto = Number(r.monto) || 0;
      const campo = TIPOS_CON_COLUMNA_PROPIA[r.tipo];
      if (campo === 'adelantosDeuda')      adelantosDeuda += monto;
      else if (campo === 'prestamosDeuda') prestamosDeuda += monto;
      else if (campo === 'pensionDeuda')   pensionDeuda   += monto;
      else if (campo === 'tardanzaDeuda')  tardanzaDeuda  += monto;
      else otros.push(r);
    }

    const totalOtros = otros.reduce((acc, r) => acc + (Number(r.monto) || 0), 0);
    const detalleJSON = JSON.stringify(otros.map(r => ({
      tipo: r.tipo, monto: Number(r.monto), cuota_actual: r.cuota_actual, cuotas: r.cuotas
    })));

    await conn.execute(
      `UPDATE planillas
       SET adelantos_deuda = ?, prestamos_deuda = ?, pension_deuda = ?, tardanza_deuda = ?,
           otros_descuentos = ?, otros_desc_detalle = ?
       WHERE id_planilla = ?`,
      [adelantosDeuda, prestamosDeuda, pensionDeuda, tardanzaDeuda, totalOtros, detalleJSON, p.id_planilla]
    );

    actualizadas++;
    console.log(
      `Planilla #${p.id_planilla} (docente ${p.id_docente}, mes ${p.mes}/${p.anio}) -> ` +
      `Adelanto: S/${adelantosDeuda.toFixed(2)}, Prestamo: S/${prestamosDeuda.toFixed(2)}, ` +
      `Pension: S/${pensionDeuda.toFixed(2)}, Tardanza: S/${tardanzaDeuda.toFixed(2)}, Otros: S/${totalOtros.toFixed(2)}`
    );
  }

  console.log(`\n===============================`);
  console.log(`Listo. ${actualizadas} planillas actualizadas, ${sinCambios} sin cambios (no tenian deudas registradas).`);
  console.log(`===============================`);

  await conn.end();
}

main().catch(err => {
  console.error('Error en la migracion:', err);
  process.exit(1);
});
