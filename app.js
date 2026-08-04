const GARITAS = ['garita1','garita2','garita3','garita4'];
const GARITA_LABEL = {garita1:'Garita 1',garita2:'Garita 2',garita3:'Garita 3',garita4:'Garita 4'};
const THRESHOLD = 25; // 1/4 de tanque
const POLL_MS = 30000; // refresco automático para reflejar cambios de otros usuarios

let db = { settings: { tecnico:'', supervisor:'' }, garitas: {} };
GARITAS.forEach(g => db.garitas[g] = { daily: [], weekly: [], compras: [] });

let weeklySelection = {};
GARITAS.forEach(g => weeklySelection[g] = { test1: null, test2: null });
let currentLogView = {};

/* ---------- Apps Script API helpers ---------- */
function setSync(state){
  const el = document.getElementById('syncIndicator');
  el.classList.remove('offline','saving');
  if(state==='offline'){ el.textContent='● sin conexión'; el.classList.add('offline'); }
  else if(state==='saving'){ el.textContent='● guardando…'; el.classList.add('saving'); }
  else { el.textContent='● conectado'; }
}

function isConfigured(){
  return typeof APPS_SCRIPT_URL === 'string' && APPS_SCRIPT_URL.startsWith('http');
}

async function apiGetData(){
  const res = await fetch(APPS_SCRIPT_URL + '?action=data');
  if(!res.ok) throw new Error('No se pudo leer el Sheet');
  const json = await res.json();
  if(json.error) throw new Error(json.error);
  return json;
}

// POST con Content-Type: text/plain para evitar el preflight CORS que
// Apps Script no soporta. El script igual parsea el body como JSON.
async function apiPost(action, payload){
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  if(!res.ok) throw new Error('Error de red al guardar');
  const json = await res.json();
  if(json.error) throw new Error(json.error);
  return json;
}

async function loadAll(){
  if(!isConfigured()){
    setSync('offline');
    showConfigWarning();
    return;
  }
  try{
    db = await apiGetData();
    setSync('ok');
  }catch(e){
    console.error(e);
    setSync('offline');
  }
}

function showConfigWarning(){
  const banner = document.getElementById('globalBanner');
  banner.innerHTML = '⚠ Falta configurar <b>APPS_SCRIPT_URL</b> en config.js con la URL de tu Web App de Google Apps Script.';
  banner.classList.add('show');
}

function todayStr(){ return new Date().toISOString().slice(0,10); }
function latest(arr){ return arr.length ? arr[arr.length-1] : null; }
function fuelColor(pct){
  if(pct < THRESHOLD) return 'var(--danger)';
  if(pct < 50) return 'var(--accent)';
  return 'var(--good)';
}
function garitaStatus(g){
  const dl = latest(db.garitas[g].daily);
  const wl = latest(db.garitas[g].weekly);
  const reasons = [];
  if(dl && dl.nivel < THRESHOLD) reasons.push(`Diésel bajo (${dl.nivel}%)`);
  if(wl && wl.test1 === 'no_bueno') reasons.push('Prueba eléctrica — No bueno');
  if(wl && wl.test2 === 'no_bueno') reasons.push('Prueba de arranque — No bueno');
  return { alert: reasons.length>0, reasons, dl, wl };
}

/* ---------- Global banner + tab dots ---------- */
function refreshGlobal(){
  if(!isConfigured()) return; // el aviso de configuración ya está mostrado
  const banner = document.getElementById('globalBanner');
  let parts = [];
  GARITAS.forEach(g=>{
    const st = garitaStatus(g);
    document.getElementById('dot-'+g).classList.toggle('show', st.alert);
    if(st.alert) parts.push(`<b>${GARITA_LABEL[g]}:</b> ${st.reasons.join(' · ')}`);
  });
  if(parts.length){
    banner.innerHTML = '⚠ ' + parts.join('  &nbsp;|&nbsp;  ');
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
}

/* ---------- Resumen ---------- */
function renderSummary(){
  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = '';
  GARITAS.forEach(g=>{
    const st = garitaStatus(g);
    const pct = st.dl ? st.dl.nivel : null;
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.onclick = ()=>switchTab(g);
    card.innerHTML = `
      <div class="top">
        <h3>${GARITA_LABEL[g]}</h3>
        <span class="badge ${st.alert ? 'alert' : (st.dl||st.wl ? 'ok':'na')}">${st.alert ? 'Alerta' : (st.dl||st.wl ? 'Operativo' : 'Sin datos')}</span>
      </div>
      <div class="fuel-row">
        <span class="mono" style="color:${pct!==null?fuelColor(pct):'var(--text-muted)'}">${pct!==null? pct+'%':'—'}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct||0}%;background:${pct!==null?fuelColor(pct):'var(--border)'}"></div></div>
      </div>
      <div class="meta">
        Última diaria: ${st.dl ? st.dl.fecha : '—'}<br>
        Última semanal: ${st.wl ? st.wl.fecha : '—'}
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ---------- Garita view builder ---------- */
function buildGaritaView(g){
  const wrap = document.createElement('div');
  wrap.className = 'panel-view hidden';
  wrap.id = 'view-'+g;
  wrap.innerHTML = `
    <div class="garita-head">
      <div>
        <h2>${GARITA_LABEL[g]}</h2>
        <div class="sub">Planta eléctrica de respaldo</div>
      </div>
      <span class="badge" id="statusBadge-${g}"></span>
    </div>

    <div class="gauge-panel">
      <div class="gauge-readout">
        <div class="label">Nivel de diésel actual</div>
        <div class="value mono" id="fuelValue-${g}">—</div>
        <div class="updated" id="fuelUpdated-${g}">Sin registros aún</div>
      </div>
      <div style="flex:2;min-width:200px;">
        <div class="bar-track" style="height:14px;"><div class="bar-fill" id="fuelBar-${g}" style="width:0%;"></div></div>
        <div class="threshold-note">Alerta automática de reposición cuando el nivel baja de ${THRESHOLD}% (¼ de tanque).</div>
      </div>
      <button class="fuel-btn" id="purchaseBtn-${g}" data-g="${g}">⛽ Compra de combustible</button>
    </div>

    <div id="alertBlock-${g}"></div>

    <div class="card">
      <h3>Inspección diaria</h3>
      <div class="card-sub">Registro del nivel de combustible del tanque de diésel.</div>
      <div class="field">
        <label>Fecha</label>
        <input type="date" id="dailyDate-${g}">
      </div>
      <div class="field">
        <label>Técnico</label>
        <input type="text" id="dailyTecnico-${g}" placeholder="Nombre del técnico">
      </div>
      <div class="field">
        <label>Nivel de diésel</label>
        <div class="slider-row">
          <input type="range" min="0" max="100" value="75" id="dailySlider-${g}">
          <span class="pct mono" id="dailyPct-${g}">75%</span>
        </div>
      </div>
      <button class="save-btn" id="dailySave-${g}">Guardar inspección diaria</button>
      <span class="saved-flash" id="dailyFlash-${g}">Guardado ✓</span>
      <span class="error-flash" id="dailyError-${g}"></span>
    </div>

    <div class="card">
      <h3>Inspección semanal — Prueba funcional</h3>
      <div class="card-sub">Verificación operativa del generador.</div>
      <div class="field">
        <label>Fecha</label>
        <input type="date" id="weeklyDate-${g}">
      </div>
      <div class="field">
        <label>Supervisor</label>
        <input type="text" id="weeklySupervisor-${g}" placeholder="Nombre del supervisor">
      </div>
      <div class="field">
        <label>1. Prueba eléctrica — pantalla y componentes</label>
        <div class="toggle-row">
          <button class="toggle-btn good" data-test="test1" data-val="bueno" data-g="${g}">Bueno</button>
          <button class="toggle-btn bad" data-test="test1" data-val="no_bueno" data-g="${g}">No bueno</button>
        </div>
      </div>
      <div class="field">
        <label>2. Prueba de arranque del generador</label>
        <div class="toggle-row">
          <button class="toggle-btn good" data-test="test2" data-val="bueno" data-g="${g}">Bueno</button>
          <button class="toggle-btn bad" data-test="test2" data-val="no_bueno" data-g="${g}">No bueno</button>
        </div>
      </div>
      <div class="field">
        <label>Observaciones (opcional)</label>
        <textarea id="weeklyNotas-${g}" placeholder="Detalles de la prueba, hallazgos, acciones tomadas..."></textarea>
      </div>
      <button class="save-btn" id="weeklySave-${g}">Guardar inspección semanal</button>
      <span class="saved-flash" id="weeklyFlash-${g}">Guardado ✓</span>
      <span class="error-flash" id="weeklyError-${g}"></span>
    </div>

    <div class="card">
      <h3>Historial</h3>
      <div class="log-toggle">
        <button class="active" data-log="daily" data-g="${g}">Diaria</button>
        <button data-log="weekly" data-g="${g}">Semanal</button>
        <button data-log="compras" data-g="${g}">Compras</button>
      </div>
      <div id="logTable-${g}"></div>
    </div>
  `;
  return wrap;
}

function renderGarita(g){
  document.getElementById('dailyDate-'+g).value = todayStr();
  document.getElementById('weeklyDate-'+g).value = todayStr();
  document.getElementById('dailyTecnico-'+g).value = db.settings.tecnico || '';
  document.getElementById('weeklySupervisor-'+g).value = db.settings.supervisor || '';

  const st = garitaStatus(g);
  const badge = document.getElementById('statusBadge-'+g);
  if(st.dl || st.wl){
    badge.textContent = st.alert ? 'Alerta' : 'Operativo';
    badge.className = 'badge ' + (st.alert ? 'alert' : 'ok');
  } else {
    badge.textContent = 'Sin datos';
    badge.className = 'badge na';
  }

  const fv = document.getElementById('fuelValue-'+g);
  const fb = document.getElementById('fuelBar-'+g);
  const fu = document.getElementById('fuelUpdated-'+g);
  if(st.dl){
    fv.textContent = st.dl.nivel + '%';
    fv.style.color = fuelColor(st.dl.nivel);
    fb.style.width = st.dl.nivel + '%';
    fb.style.background = fuelColor(st.dl.nivel);
    fu.textContent = 'Último registro: ' + st.dl.fecha + (st.dl.tecnico ? ' · '+st.dl.tecnico : '');
  } else {
    fv.textContent = '—';
    fb.style.width = '0%';
    fu.textContent = 'Sin registros aún';
  }

  const alertBlock = document.getElementById('alertBlock-'+g);
  if(st.alert){
    alertBlock.innerHTML = '<div class="alert-list">' + st.reasons.map(r=>`<div class="alert-item">⚠ ${r}</div>`).join('') + '</div>';
  } else if(st.dl || st.wl){
    alertBlock.innerHTML = `<div class="ok-item">✓ Sin alertas activas — generador operativo</div>`;
  } else {
    alertBlock.innerHTML = '';
  }

  renderLog(g, currentLogView[g] || 'daily');
}

function renderLog(g, type){
  currentLogView[g] = type;
  const container = document.getElementById('logTable-'+g);
  const rows = db.garitas[g][type].slice().reverse();
  if(!rows.length){
    container.innerHTML = '<div class="empty-log">Aún no hay registros.</div>';
    return;
  }
  if(type==='daily'){
    container.innerHTML = `<table><thead><tr><th>Fecha</th><th>Técnico</th><th>Nivel</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="mono">${r.fecha}</td><td>${r.tecnico||'—'}</td><td class="mono" style="color:${fuelColor(r.nivel)}">${r.nivel}%${r.nivel<THRESHOLD?' ⚠':''}</td></tr>`).join('')}
    </tbody></table>`;
  } else if(type==='weekly'){
    container.innerHTML = `<table><thead><tr><th>Fecha</th><th>Supervisor</th><th>Prueba eléctrica</th><th>Arranque</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="mono">${r.fecha}</td><td>${r.supervisor||'—'}</td><td style="color:${r.test1==='bueno'?'var(--good)':'#f6b3ac'}">${r.test1==='bueno'?'Bueno':'No bueno'}</td><td style="color:${r.test2==='bueno'?'var(--good)':'#f6b3ac'}">${r.test2==='bueno'?'Bueno':'No bueno'}</td></tr>`).join('')}
    </tbody></table>`;
  } else {
    container.innerHTML = `<table><thead><tr><th>Fecha</th><th>Hora</th><th>Cantidad</th><th>Costo</th><th>Responsable</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="mono">${r.fecha}</td><td class="mono">${r.hora||'—'}</td><td class="mono">${formatGal(r.cantidad)}</td><td class="mono">${formatQ(r.costo)}</td><td>${r.responsable||'—'}</td></tr>`).join('')}
    </tbody></table>`;
  }
}

function formatQ(n){ return 'Q ' + Number(n||0).toFixed(2); }
function formatGal(n){ return Number(n||0).toFixed(1) + ' gal'; }
function nowTimeStr(){
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/* ---------- Tabs ---------- */
function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  document.querySelectorAll('.panel-view').forEach(v=>v.classList.add('hidden'));
  document.getElementById('view-'+name).classList.remove('hidden');
  if(name==='resumen') renderSummary();
  else if(name==='historial') renderHistorial();
  else renderGarita(name);
}

document.getElementById('tabs').addEventListener('click', e=>{
  const btn = e.target.closest('.tab');
  if(btn) switchTab(btn.dataset.tab);
});

/* ---------- Build garita views ---------- */
const garitaViewsContainer = document.getElementById('garitaViews');
GARITAS.forEach(g=> garitaViewsContainer.appendChild(buildGaritaView(g)));

/* ---------- Wire up interactions per garita ---------- */
GARITAS.forEach(g=>{
  const slider = document.getElementById('dailySlider-'+g);
  const pctLabel = document.getElementById('dailyPct-'+g);
  slider.addEventListener('input', ()=>{
    pctLabel.textContent = slider.value + '%';
    pctLabel.style.color = fuelColor(parseInt(slider.value));
  });

  document.getElementById('dailySave-'+g).addEventListener('click', async ()=>{
    const btn = document.getElementById('dailySave-'+g);
    const errEl = document.getElementById('dailyError-'+g);
    errEl.classList.remove('show');
    if(!isConfigured()){ errEl.textContent='Falta configurar APPS_SCRIPT_URL en config.js'; errEl.classList.add('show'); return; }
    btn.disabled = true;
    setSync('saving');
    try{
      const entry = {
        garita: g,
        fecha: document.getElementById('dailyDate-'+g).value || todayStr(),
        tecnico: document.getElementById('dailyTecnico-'+g).value.trim(),
        nivel: parseInt(slider.value)
      };
      await apiPost('saveDaily', entry);
      await loadAll();
      flash('dailyFlash-'+g);
      renderGarita(g);
      refreshGlobal();
    }catch(e){
      errEl.textContent = 'Error al guardar: ' + e.message;
      errEl.classList.add('show');
      setSync('offline');
    }finally{
      btn.disabled = false;
    }
  });

  document.getElementById('weeklySave-'+g).addEventListener('click', async ()=>{
    const sel = weeklySelection[g];
    const errEl = document.getElementById('weeklyError-'+g);
    errEl.classList.remove('show');
    if(!isConfigured()){ errEl.textContent='Falta configurar APPS_SCRIPT_URL en config.js'; errEl.classList.add('show'); return; }
    if(!sel.test1 || !sel.test2){
      errEl.textContent = 'Selecciona el resultado de ambas pruebas antes de guardar.';
      errEl.classList.add('show');
      return;
    }
    const btn = document.getElementById('weeklySave-'+g);
    btn.disabled = true;
    setSync('saving');
    try{
      const entry = {
        garita: g,
        fecha: document.getElementById('weeklyDate-'+g).value || todayStr(),
        supervisor: document.getElementById('weeklySupervisor-'+g).value.trim(),
        test1: sel.test1,
        test2: sel.test2,
        notas: document.getElementById('weeklyNotas-'+g).value.trim()
      };
      await apiPost('saveWeekly', entry);
      await loadAll();
      flash('weeklyFlash-'+g);
      weeklySelection[g] = {test1:null,test2:null};
      document.querySelectorAll(`.toggle-btn[data-g="${g}"]`).forEach(b=>b.classList.remove('selected'));
      renderGarita(g);
      refreshGlobal();
    }catch(e){
      errEl.textContent = 'Error al guardar: ' + e.message;
      errEl.classList.add('show');
      setSync('offline');
    }finally{
      btn.disabled = false;
    }
  });

  document.getElementById('purchaseBtn-'+g).addEventListener('click', ()=>{
    openPurchaseModal(g);
  });

  document.querySelectorAll(`.log-toggle button[data-g="${g}"]`).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll(`.log-toggle button[data-g="${g}"]`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderLog(g, btn.dataset.log);
    });
  });
});

document.querySelectorAll('.toggle-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const g = btn.dataset.g, test = btn.dataset.test, val = btn.dataset.val;
    weeklySelection[g][test] = val;
    document.querySelectorAll(`.toggle-btn[data-g="${g}"][data-test="${test}"]`).forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

function flash(id){
  const el = document.getElementById(id);
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 1600);
}

/* ---------- Settings modal ---------- */
const settingsModal = document.getElementById('settingsModal');
document.getElementById('btnSettings').addEventListener('click', ()=>{
  document.getElementById('defTecnico').value = db.settings.tecnico || '';
  document.getElementById('defSupervisor').value = db.settings.supervisor || '';
  settingsModal.classList.add('show');
});
document.getElementById('closeSettings').addEventListener('click', ()=> settingsModal.classList.remove('show'));
settingsModal.addEventListener('click', e=>{ if(e.target===settingsModal) settingsModal.classList.remove('show'); });
document.getElementById('saveSettings').addEventListener('click', async ()=>{
  const tecnico = document.getElementById('defTecnico').value.trim();
  const supervisor = document.getElementById('defSupervisor').value.trim();
  try{
    await apiPost('saveSettings', { tecnico, supervisor });
    db.settings = { tecnico, supervisor };
    settingsModal.classList.remove('show');
  }catch(e){
    alert('No se pudieron guardar los ajustes: ' + e.message);
  }
});

/* ---------- Modal de compra de combustible ---------- */
let purchaseGarita = null;
const purchaseModal = document.getElementById('purchaseModal');

function openPurchaseModal(g){
  purchaseGarita = g;
  document.getElementById('purchaseModalTitle').textContent = `Compra de combustible — ${GARITA_LABEL[g]}`;
  document.getElementById('purchaseFecha').value = todayStr();
  document.getElementById('purchaseHora').value = nowTimeStr();
  document.getElementById('purchaseCantidad').value = '';
  document.getElementById('purchaseCosto').value = '';
  document.getElementById('purchaseResponsable').value = db.settings.tecnico || '';
  document.getElementById('purchaseError').classList.remove('show');
  purchaseModal.classList.add('show');
}
document.getElementById('closePurchase').addEventListener('click', ()=> purchaseModal.classList.remove('show'));
purchaseModal.addEventListener('click', e=>{ if(e.target===purchaseModal) purchaseModal.classList.remove('show'); });

document.getElementById('purchaseSave').addEventListener('click', async ()=>{
  const errEl = document.getElementById('purchaseError');
  errEl.classList.remove('show');
  if(!isConfigured()){ errEl.textContent='Falta configurar APPS_SCRIPT_URL en config.js'; errEl.classList.add('show'); return; }

  const cantidad = parseFloat(document.getElementById('purchaseCantidad').value);
  const costo = parseFloat(document.getElementById('purchaseCosto').value);
  if(isNaN(cantidad) || cantidad <= 0){ errEl.textContent='Ingresa una cantidad de combustible válida.'; errEl.classList.add('show'); return; }
  if(isNaN(costo) || costo < 0){ errEl.textContent='Ingresa un costo válido.'; errEl.classList.add('show'); return; }

  const btn = document.getElementById('purchaseSave');
  btn.disabled = true;
  setSync('saving');
  try{
    const entry = {
      garita: purchaseGarita,
      fecha: document.getElementById('purchaseFecha').value || todayStr(),
      hora: document.getElementById('purchaseHora').value || nowTimeStr(),
      cantidad,
      costo,
      responsable: document.getElementById('purchaseResponsable').value.trim()
    };
    await apiPost('savePurchase', entry);
    await loadAll();
    purchaseModal.classList.remove('show');
    renderGarita(purchaseGarita);
    refreshGlobal();
  }catch(e){
    errEl.textContent = 'Error al guardar: ' + e.message;
    errEl.classList.add('show');
    setSync('offline');
  }finally{
    btn.disabled = false;
  }
});

/* ---------- Historial general (con filtros) ---------- */
function buildCombinedHistory(){
  const rows = [];
  GARITAS.forEach(g=>{
    db.garitas[g].daily.forEach(r => rows.push({
      garita:g, tipo:'daily', tipoLabel:'Inspección diaria', fecha:r.fecha,
      detalle: `Diésel: ${r.nivel}%${r.nivel<THRESHOLD?' ⚠':''}`, responsable:r.tecnico
    }));
    db.garitas[g].weekly.forEach(r => rows.push({
      garita:g, tipo:'weekly', tipoLabel:'Inspección semanal', fecha:r.fecha,
      detalle: `Eléctrica: ${r.test1==='bueno'?'Bueno':'No bueno'} · Arranque: ${r.test2==='bueno'?'Bueno':'No bueno'}`,
      responsable:r.supervisor
    }));
    (db.garitas[g].compras||[]).forEach(r => rows.push({
      garita:g, tipo:'compra', tipoLabel:'Compra de combustible', fecha:r.fecha,
      detalle: `${formatGal(r.cantidad)} · ${formatQ(r.costo)}${r.hora?' · '+r.hora:''}`,
      responsable:r.responsable
    }));
  });
  rows.sort((a,b)=> (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return rows;
}

function renderHistorial(){
  const garitaFilter = document.getElementById('filterGarita').value;
  const tipoFilter = document.getElementById('filterTipo').value;
  let rows = buildCombinedHistory();
  if(garitaFilter !== 'all') rows = rows.filter(r=>r.garita===garitaFilter);
  if(tipoFilter !== 'all') rows = rows.filter(r=>r.tipo===tipoFilter);

  const container = document.getElementById('historialTable');
  if(!rows.length){
    container.innerHTML = '<div class="empty-log">No hay registros con estos filtros.</div>';
    return;
  }
  container.innerHTML = `<table><thead><tr><th>Fecha</th><th>Garita</th><th>Tipo</th><th>Detalle</th><th>Responsable</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td class="mono">${r.fecha}</td><td>${GARITA_LABEL[r.garita]}</td><td>${r.tipoLabel}</td><td>${r.detalle}</td><td>${r.responsable||'—'}</td></tr>`).join('')}
  </tbody></table>`;
}

document.getElementById('filterGarita').addEventListener('change', renderHistorial);
document.getElementById('filterTipo').addEventListener('change', renderHistorial);

/* ---------- Descarga de respaldo ---------- */
function toCSV(rows, headers){
  const escape = v => `"${String(v===undefined||v===null?'':v).replace(/"/g,'""')}"`;
  const lines = [headers.map(escape).join(',')];
  rows.forEach(r => lines.push(headers.map(h=>escape(r[h])).join(',')));
  return lines.join('\r\n');
}

function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('btnDownloadJSON').addEventListener('click', ()=>{
  downloadFile(`xochi-generadores-${todayStr()}.json`, JSON.stringify(db, null, 2), 'application/json');
});

document.getElementById('btnDownloadCSV').addEventListener('click', ()=>{
  const dailyRows = [];
  const weeklyRows = [];
  const purchaseRows = [];
  GARITAS.forEach(g=>{
    db.garitas[g].daily.forEach(r=> dailyRows.push({garita:g, ...r}));
    db.garitas[g].weekly.forEach(r=> weeklyRows.push({garita:g, ...r}));
    (db.garitas[g].compras||[]).forEach(r=> purchaseRows.push({garita:g, ...r}));
  });
  const dailyCSV = toCSV(dailyRows, ['garita','fecha','tecnico','nivel','alerta']);
  const weeklyCSV = toCSV(weeklyRows, ['garita','fecha','supervisor','test1','test2','notas','alerta']);
  const purchaseCSV = toCSV(purchaseRows, ['garita','fecha','hora','cantidad','costo','responsable']);
  downloadFile(`xochi-generadores-diaria-${todayStr()}.csv`, dailyCSV, 'text/csv');
  setTimeout(()=> downloadFile(`xochi-generadores-semanal-${todayStr()}.csv`, weeklyCSV, 'text/csv'), 300);
  setTimeout(()=> downloadFile(`xochi-generadores-compras-${todayStr()}.csv`, purchaseCSV, 'text/csv'), 600);
});

/* ---------- Init + polling de sincronización ---------- */
async function init(){
  await loadAll();
  refreshGlobal();
  renderSummary();
  const activeTab = document.querySelector('.tab.active');
  if(activeTab && activeTab.dataset.tab !== 'resumen') renderGarita(activeTab.dataset.tab);
}
init();

setInterval(async ()=>{
  await loadAll();
  refreshGlobal();
  const activeTab = document.querySelector('.tab.active');
  if(!activeTab) return;
  if(activeTab.dataset.tab === 'resumen') renderSummary();
  else if(activeTab.dataset.tab === 'historial') renderHistorial();
  else renderGarita(activeTab.dataset.tab);
}, POLL_MS);
