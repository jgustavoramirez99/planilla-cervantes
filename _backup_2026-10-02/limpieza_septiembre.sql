-- Limpieza de datos duplicados — planillas de SEPTIEMBRE 2026
-- Generado a partir de los CSV exportados el 2026-10-02 (backup en esta misma carpeta).
-- Cada UPDATE exige el valor ACTUAL en el WHERE: si algo cambió, esa fila NO se modifica.
-- Revisar antes de ejecutar. Arone Romero Liseth NO está incluida (pendiente de decidir).

-- Castillejo Chilingano Samira Nicol
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 589 AND id_docente = 16 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 66;

-- Cevallos Castillo Maria Ines
UPDATE planillas SET otros_descuentos = 60, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":30,"cuota_actual":1,"cuotas":1}]', tardanza = 0
 WHERE id_planilla = 591 AND id_docente = 35 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 300 AND tardanza = 20;

-- Coronado Vargas Melisa
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]', adelantos = 0, tardanza = 0
 WHERE id_planilla = 595 AND id_docente = 6 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 587 AND adelantos = 200 AND tardanza = 137;

-- Espíritu Vasquez Karina Fiorella
UPDATE planillas SET otros_descuentos = 163, otros_desc_detalle = '[{"tipo":"BUZO","monto":70,"cuota_actual":1,"cuotas":1},{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":28,"cuota_actual":1,"cuotas":1},{"tipo":"POLO","monto":35,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 580 AND id_docente = 38 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 699;

-- Guerrero Leyva Maria
UPDATE planillas SET otros_descuentos = 45, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":15,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 600 AND id_docente = 4 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 53;

-- Julinho Americo Jesús
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 602 AND id_docente = 34 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 52;

-- Mendoza Jesus Beleem Milagros
UPDATE planillas SET otros_descuentos = 73, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":28,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":15,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 606 AND id_docente = 9 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 323;

-- Meza Salazar Jaqueline Jarlen
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 608 AND id_docente = 12 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 530;

-- Palacios Baldeon Edison
UPDATE planillas SET otros_descuentos = 0, otros_desc_detalle = '[]'
 WHERE id_planilla = 612 AND id_docente = 18 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 51;

-- Perfecto Alejo Russell Kewin
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 614 AND id_docente = 21 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 48;

-- Quispe Bustamante Lucia
UPDATE planillas SET otros_descuentos = 75, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":45,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 618 AND id_docente = 7 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 325;

-- Ramirez Ramirez Jaime Gustavo
UPDATE planillas SET otros_descuentos = 45, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":15,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 620 AND id_docente = 27 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 245;

-- Ramos Flores Nicole
UPDATE planillas SET otros_descuentos = 75, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":45,"cuota_actual":1,"cuotas":1}]', prestamos = 0, tardanza = 0
 WHERE id_planilla = 622 AND id_docente = 33 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 888 AND prestamos = 500 AND tardanza = 93;

-- Rivas Angoma Eduardo Elias
UPDATE planillas SET otros_descuentos = 30, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 624 AND id_docente = 22 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 99;

-- Rosales Espinoza Luz mery
UPDATE planillas SET otros_descuentos = 108, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":48,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 626 AND id_docente = 30 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 648;

-- Salvatierra Meza Angel
UPDATE planillas SET otros_descuentos = 123, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"INASISTECIA","monto":93,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 631 AND id_docente = 24 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 403;

-- Solari Carhuamaca Daniel Antonio
UPDATE planillas SET otros_descuentos = 450, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"SASTRE","monto":420,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 633 AND id_docente = 41 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 650;

-- Tafur Yactayo Yulisa del Carmen
UPDATE planillas SET otros_descuentos = 45, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":15,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 635 AND id_docente = 13 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 574.75;

-- Tello Anton Butler Salomon
UPDATE planillas SET otros_descuentos = 50, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":20,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 637 AND id_docente = 20 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 300;

-- Velarde Mendoza Noemi victoria
UPDATE planillas SET otros_descuentos = 60, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"POLLO A LA BRASA","monto":30,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 639 AND id_docente = 5 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 340;

-- Yangua Briones Tania Carolina
UPDATE planillas SET otros_descuentos = 46, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":16,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 643 AND id_docente = 14 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 296;

-- Yaquelin Soca Gutirrez
UPDATE planillas SET otros_descuentos = 70, otros_desc_detalle = '[{"tipo":"EVENTOS","monto":30,"cuota_actual":1,"cuotas":1},{"tipo":"LIBRO","monto":40,"cuota_actual":1,"cuotas":1}]'
 WHERE id_planilla = 645 AND id_docente = 28 AND mes = 9 AND anio = 2026
   AND otros_descuentos = 580;
