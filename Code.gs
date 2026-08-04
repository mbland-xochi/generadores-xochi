/**
 * Xochi · Generadores — backend en Google Apps Script
 * -----------------------------------------------------
 * Este script va PEGADO en Extensiones > Apps Script del Google Sheet que
 * va a servir de base de datos. No se sube a GitHub (vive dentro de Google).
 *
 * Crea automáticamente 4 pestañas la primera vez que se usa:
 *   - "Diaria"   : registros de nivel de diésel
 *   - "Semanal"  : registros de prueba funcional
 *   - "Compras"  : registros de compra de combustible
 *   - "Ajustes"  : nombres por defecto (técnico / supervisor)
 *
 * Para descargar los datos en cualquier momento: abre el Sheet y usa
 * Archivo > Descargar > Microsoft Excel (.xlsx) o CSV. No hace falta
 * tocar este script para eso.
 */

const GARITAS = ['garita1', 'garita2', 'garita3', 'garita4'];
const THRESHOLD = 25; // 1/4 de tanque

const SS = SpreadsheetApp.getActiveSpreadsheet();

/* ---------------- Rutas HTTP ---------------- */

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'data';
  if (action === 'data') return jsonResponse(getAllData());
  return jsonResponse({ error: 'Acción no reconocida: ' + action });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Cuerpo de la solicitud inválido' });
  }
  try {
    switch (body.action) {
      case 'saveDaily':
        return jsonResponse(saveDaily(body));
      case 'saveWeekly':
        return jsonResponse(saveWeekly(body));
      case 'savePurchase':
        return jsonResponse(savePurchase(body));
      case 'saveSettings':
        return jsonResponse(saveSettings(body));
      default:
        return jsonResponse({ error: 'Acción no reconocida: ' + body.action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Hojas ---------------- */

function getSheet(name, headers) {
  let sh = SS.getSheetByName(name);
  if (!sh) {
    sh = SS.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '')) // ignora filas vacías
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

/* ---------------- Lectura combinada ---------------- */

function getAllData() {
  const dailySheet = getSheet('Diaria', ['garita', 'fecha', 'tecnico', 'nivel', 'alerta', 'timestamp']);
  const weeklySheet = getSheet('Semanal', ['garita', 'fecha', 'supervisor', 'test1', 'test2', 'notas', 'alerta', 'timestamp']);
  const purchaseSheet = getSheet('Compras', ['garita', 'fecha', 'hora', 'cantidad', 'costo', 'responsable', 'timestamp']);
  const settingsSheet = getSheet('Ajustes', ['clave', 'valor']);

  const daily = sheetToObjects(dailySheet);
  const weekly = sheetToObjects(weeklySheet);
  const purchases = sheetToObjects(purchaseSheet);

  const garitas = {};
  GARITAS.forEach(g => { garitas[g] = { daily: [], weekly: [], compras: [] }; });
  daily.forEach(r => { if (garitas[r.garita]) garitas[r.garita].daily.push(normalizeDaily(r)); });
  weekly.forEach(r => { if (garitas[r.garita]) garitas[r.garita].weekly.push(normalizeWeekly(r)); });
  purchases.forEach(r => { if (garitas[r.garita]) garitas[r.garita].compras.push(normalizePurchase(r)); });

  const settingsRows = settingsSheet.getDataRange().getValues().slice(1);
  const settings = { tecnico: '', supervisor: '' };
  settingsRows.forEach(row => {
    if (row[0] === 'tecnico') settings.tecnico = row[1];
    if (row[0] === 'supervisor') settings.supervisor = row[1];
  });

  return { settings, garitas };
}

function normalizeDaily(r) {
  return {
    fecha: formatDate(r.fecha),
    tecnico: r.tecnico || '',
    nivel: Number(r.nivel),
    alerta: r.alerta === true || r.alerta === 'TRUE' || r.alerta === 'true'
  };
}
function normalizeWeekly(r) {
  return {
    fecha: formatDate(r.fecha),
    supervisor: r.supervisor || '',
    test1: r.test1,
    test2: r.test2,
    notas: r.notas || '',
    alerta: r.alerta === true || r.alerta === 'TRUE' || r.alerta === 'true'
  };
}
function normalizePurchase(r) {
  return {
    fecha: formatDate(r.fecha),
    hora: r.hora || '',
    cantidad: Number(r.cantidad),
    costo: Number(r.costo),
    responsable: r.responsable || ''
  };
}
function formatDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

/* ---------------- Escritura ---------------- */

function saveDaily(body) {
  const { garita, fecha, tecnico, nivel } = body;
  if (!GARITAS.includes(garita)) throw new Error('Garita inválida');
  const n = Number(nivel);
  if (isNaN(n) || n < 0 || n > 100) throw new Error('El nivel debe ser un número entre 0 y 100');
  const alerta = n < THRESHOLD;
  const sheet = getSheet('Diaria', ['garita', 'fecha', 'tecnico', 'nivel', 'alerta', 'timestamp']);
  const ts = new Date().toISOString();
  sheet.appendRow([garita, fecha || todayStr(), tecnico || '', n, alerta, ts]);
  return { garita, fecha: fecha || todayStr(), tecnico, nivel: n, alerta, timestamp: ts };
}

function saveWeekly(body) {
  const { garita, fecha, supervisor, test1, test2, notas } = body;
  if (!GARITAS.includes(garita)) throw new Error('Garita inválida');
  if (!['bueno', 'no_bueno'].includes(test1) || !['bueno', 'no_bueno'].includes(test2)) {
    throw new Error('test1 y test2 deben ser "bueno" o "no_bueno"');
  }
  const alerta = test1 === 'no_bueno' || test2 === 'no_bueno';
  const sheet = getSheet('Semanal', ['garita', 'fecha', 'supervisor', 'test1', 'test2', 'notas', 'alerta', 'timestamp']);
  const ts = new Date().toISOString();
  sheet.appendRow([garita, fecha || todayStr(), supervisor || '', test1, test2, notas || '', alerta, ts]);
  return { garita, fecha: fecha || todayStr(), supervisor, test1, test2, notas, alerta, timestamp: ts };
}

function savePurchase(body) {
  const { garita, fecha, hora, cantidad, costo, responsable } = body;
  if (!GARITAS.includes(garita)) throw new Error('Garita inválida');
  const cant = Number(cantidad);
  const cost = Number(costo);
  if (isNaN(cant) || cant <= 0) throw new Error('La cantidad de combustible debe ser mayor a 0');
  if (isNaN(cost) || cost < 0) throw new Error('El costo debe ser un número válido');
  const sheet = getSheet('Compras', ['garita', 'fecha', 'hora', 'cantidad', 'costo', 'responsable', 'timestamp']);
  const ts = new Date().toISOString();
  sheet.appendRow([garita, fecha || todayStr(), hora || '', cant, cost, responsable || '', ts]);
  return { garita, fecha: fecha || todayStr(), hora, cantidad: cant, costo: cost, responsable, timestamp: ts };
}

function saveSettings(body) {
  const tecnico = body.tecnico || '';
  const supervisor = body.supervisor || '';
  const sheet = getSheet('Ajustes', ['clave', 'valor']);
  setKeyValue(sheet, 'tecnico', tecnico);
  setKeyValue(sheet, 'supervisor', supervisor);
  return { tecnico, supervisor };
}

function setKeyValue(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
