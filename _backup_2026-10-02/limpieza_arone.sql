-- Arone Romero Liseth (septiembre 2026): su otros_descuentos volvió a inflarse al guardar con el código viejo.
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 583 AND id_docente = 29 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 287;
