/* ---------------- CONFIG: real coordinates for Västerbottens fjäll ---------------- */
/* x/y hand-placed by rank (not raw lat/lon) so every valley keeps its correct
   west-east and north-south order relative to all the others while staying
   legible — not a true geographic projection, but the ordering matches
   reality so the stylized map isn't misleading. Kittelfjäll, Björkvattnet
   and Saxnäs were added later; coordinates verified against Wikipedia/
   regional fishing sources (see conversation), not fabricated. */
const locations = [
  { id:'ammarnas',     name:'Ammarnäs',      lat:65.966, lon:16.200, x:514, y:95,
    subs:[ {name:'Aigert', dx:-38, dy:-24}, {name:'Kraddsele', dx:34, dy:20} ] },
  { id:'vindelfjallen',name:'Vindelfjällen', lat:65.883, lon:16.383, x:570, y:129,
    subs:[ {name:'Ransaredet', dx:-36, dy:20}, {name:'Gautosjö', dx:38, dy:-22} ] },
  { id:'hemavan',      name:'Hemavan',       lat:65.817, lon:15.167, x:233, y:163,
    subs:[ {name:'Syterskalet', dx:-40, dy:-18}, {name:'Artfjällsstugan', dx:38, dy:24} ] },
  { id:'tarnaby',      name:'Tärnaby',       lat:65.717, lon:15.267, x:345, y:197,
    subs:[ {name:'Laxfjället', dx:-36, dy:22}, {name:'Kraskträsk', dx:32, dy:-22} ] },
  { id:'bjorkvattnet', name:'Björkvattnet',  lat:65.610, lon:15.212, x:289, y:231,
    subs:[ {name:'Virisen', dx:-36, dy:22}, {name:'Västansjö', dx:34, dy:-20} ] },
  { id:'kittelfjall',  name:'Kittelfjäll',   lat:65.251, lon:15.506, x:458, y:265,
    subs:[ {name:'Saksensjön', dx:-38, dy:-20}, {name:'Bergsjön', dx:36, dy:22} ] },
  { id:'klimpfjall',   name:'Klimpfjäll',    lat:65.050, lon:14.983, x:120, y:298,
    subs:[ {name:'Ransarån', dx:-34, dy:24}, {name:'Borkasjön', dx:36, dy:-20} ] },
  { id:'marsfjallet',  name:'Marsfjället',   lat:65.033, lon:15.033, x:176, y:332,
    subs:[ {name:'Klippen', dx:-38, dy:-20}, {name:'Dikanäs', dx:34, dy:22} ] },
  { id:'saxnas',       name:'Saxnäs',        lat:64.972, lon:15.346, x:401, y:365,
    subs:[ {name:'Marsliden', dx:-36, dy:20}, {name:'Fatmomakke', dx:38, dy:-22} ] },
];

const DRY_THRESHOLD_MM = 1.0;
const days = [
  {key:'today', label:'Idag', offset:0},
  {key:'d1', label:'Imorgon', offset:1},
  {key:'d2', label:'+2 dygn', offset:2},
  {key:'d3', label:'+3 dygn', offset:3},
];

let activeDay = 'today';
let activeValley = 'vindelfjallen';
let zoomed = false;
let zoomTarget = null;
let isLoading = false;
let lastReferenceTime = null;

/* ---------------- SMHI SNOW1gv1 fetching ---------------- */

function forecastUrl(lat, lon){
  return `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`;
}

function stockholmDateKey(date){
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone:'Europe/Stockholm', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(date);
}

function keyForOffset(offset){
  const now = new Date();
  const stockholmNow = new Date(now.toLocaleString('en-US', {timeZone:'Europe/Stockholm'}));
  stockholmNow.setDate(stockholmNow.getDate() + offset);
  return stockholmDateKey(stockholmNow);
}

function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

// degrees wrap around, so a plain average of e.g. 350° and 10° would wrongly give 180°
function circularAvgDeg(arr){
  if(!arr.length) return null;
  let sinSum = 0, cosSum = 0;
  arr.forEach(deg=>{
    const rad = deg * Math.PI/180;
    sinSum += Math.sin(rad); cosSum += Math.cos(rad);
  });
  const deg = Math.atan2(sinSum/arr.length, cosSum/arr.length) * 180/Math.PI;
  return (deg + 360) % 360;
}

function processTimeSeries(json){
  const byDay = {}; // dateKey -> {mm, temps:[], winds:[]}
  (json.timeSeries || []).forEach(entry=>{
    const dateKey = stockholmDateKey(new Date(entry.time));
    if(!byDay[dateKey]) byDay[dateKey] = { mm:0, temps:[], winds:[], winddirs:[], hasPrecip:false };
    const d = entry.data || {};

    if(d.precipitation_amount_mean !== undefined && d.precipitation_amount_mean !== 9999){
      const startT = new Date(entry.intervalParametersStartTime || entry.time);
      const endT = new Date(entry.time);
      const hours = Math.max(0.001, (endT - startT) / 3600000);
      byDay[dateKey].mm += d.precipitation_amount_mean * hours;
      byDay[dateKey].hasPrecip = true;
    }
    if(d.air_temperature !== undefined && d.air_temperature !== 9999) byDay[dateKey].temps.push(d.air_temperature);
    if(d.wind_speed !== undefined && d.wind_speed !== 9999) byDay[dateKey].winds.push(d.wind_speed);
    if(d.wind_from_direction !== undefined && d.wind_from_direction !== 9999) byDay[dateKey].winddirs.push(d.wind_from_direction);
  });
  return byDay;
}

async function fetchValley(loc){
  const url = forecastUrl(loc.lat, loc.lon);
  const res = await fetch(url);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const byDay = processTimeSeries(json);

  const mm = {}, temp = {}, wind = {}, winddir = {};
  days.forEach(d=>{
    const key = keyForOffset(d.offset);
    const rec = byDay[key];
    mm[d.key] = rec ? Math.round(rec.mm * 10) / 10 : null;
    temp[d.key] = rec ? Math.round(avg(rec.temps)) : null;
    wind[d.key] = rec ? Math.round(avg(rec.winds)) : null;
    winddir[d.key] = rec ? circularAvgDeg(rec.winddirs) : null;
  });

  return { mm, temp, wind, winddir, referenceTime: json.referenceTime, error:false };
}

async function loadAllData(){
  isLoading = true;
  document.getElementById('refreshBtn').classList.add('loading');
  const statusBar = document.getElementById('statusBar');
  statusBar.classList.remove('visible');
  renderScrubber(); renderDetail(); renderRank(); renderMap();

  const results = await Promise.allSettled(locations.map(loc => fetchValley(loc)));

  const failed = [];
  results.forEach((r, i)=>{
    const loc = locations[i];
    if(r.status === 'fulfilled'){
      loc.mm = r.value.mm;
      loc.temp = r.value.temp;
      loc.wind = r.value.wind;
      loc.winddir = r.value.winddir;
      if(r.value.referenceTime) lastReferenceTime = r.value.referenceTime;
    } else {
      loc.mm = { today:null, d1:null, d2:null, d3:null };
      loc.temp = { today:null, d1:null, d2:null, d3:null };
      loc.wind = { today:null, d1:null, d2:null, d3:null };
      loc.winddir = { today:null, d1:null, d2:null, d3:null };
      failed.push(loc.name);
    }
  });

  isLoading = false;
  document.getElementById('refreshBtn').classList.remove('loading');

  if(failed.length){
    statusBar.classList.add('visible');
    statusBar.innerHTML = `Kunde inte hämta väderdata för: ${failed.join(', ')}. Kan bero på nätverk/CORS. <a id="retryLink">Försök igen</a>`;
    document.getElementById('retryLink').onclick = loadAllData;
  }

  if(lastReferenceTime){
    const t = new Date(lastReferenceTime);
    const timeStr = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm', hour:'2-digit', minute:'2-digit'}).format(t);
    document.getElementById('updatedTag').textContent = `UPPDATERAD ${timeStr} · SMHI`;
  }

  renderAll();
}

/* ---------------- Rendering (same visual language as mockup) ---------------- */

function isDry(mm){ return mm !== null && mm !== undefined && mm < DRY_THRESHOLD_MM; }
function isWet(mm){ return mm !== null && mm !== undefined && mm >= DRY_THRESHOLD_MM; }
function fmtMm(mm){ return (mm === null || mm === undefined) ? '—' : mm.toFixed(1) + ' mm'; }

function renderScrubber(){
  const box = document.getElementById('scrubber');
  box.innerHTML = '';
  days.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'scrub-tab' + (d.key===activeDay ? ' active' : '');
    const dateLabel = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm', day:'2-digit', month:'short'}).format(
      new Date(Date.now() + d.offset*86400000)
    ).toUpperCase();
    el.innerHTML = d.label + '<span class="tab-sub">' + dateLabel + '</span>';
    el.onclick = ()=>{ activeDay = d.key; renderAll(); };
    box.appendChild(el);
  });
}

function colorForMm(mm){
  if(mm === null || mm === undefined) return 'var(--text-dim)';
  if(mm < DRY_THRESHOLD_MM) return 'var(--dry)';
  if(mm > 5) return 'var(--rain-heavy)';
  if(mm > 2) return 'var(--rain-mod)';
  return 'var(--rain-light)';
}

const RAIN_TIERS = [
  { test: mm => mm > 5, gradient:'radarIntense', rx:110, ry:55, filter:'cloudDistort1' },
  { test: mm => mm > 2, gradient:'radarModerate', rx:82, ry:42, filter:'cloudDistort2' },
  { test: mm => true,   gradient:'radarLight',    rx:56, ry:30, filter:'cloudDistort3' },
];

function renderRainbands(){
  const layer = document.getElementById('rainbandLayer');
  layer.innerHTML = '';
  locations.forEach((v, i)=>{
    const mm = v.mm ? v.mm[activeDay] : null;
    if(!isWet(mm)) return; // no cloud where it's actually dry
    const tier = RAIN_TIERS.find(t => t.test(mm));
    const windFrom = v.winddir ? v.winddir[activeDay] : null;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('filter', `url(#${tier.filter})`);

    const ellipse = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
    ellipse.setAttribute('cx', v.x);
    ellipse.setAttribute('cy', v.y);
    ellipse.setAttribute('rx', tier.rx);
    ellipse.setAttribute('ry', tier.ry);
    ellipse.setAttribute('fill', `url(#${tier.gradient})`);

    // gentle breathing so the band still feels alive even when there's no wind reading
    const dur = 16 + i * 2.5;
    const growRx = document.createElementNS('http://www.w3.org/2000/svg','animate');
    growRx.setAttribute('attributeName','rx'); growRx.setAttribute('values', `${tier.rx};${tier.rx*1.18};${tier.rx}`);
    growRx.setAttribute('dur', `${dur}s`); growRx.setAttribute('repeatCount','indefinite');
    const growRy = document.createElementNS('http://www.w3.org/2000/svg','animate');
    growRy.setAttribute('attributeName','ry'); growRy.setAttribute('values', `${tier.ry};${tier.ry*1.18};${tier.ry}`);
    growRy.setAttribute('dur', `${dur}s`); growRy.setAttribute('repeatCount','indefinite');
    ellipse.appendChild(growRx);
    ellipse.appendChild(growRy);

    // drift back and forth along the direction the wind is actually carrying the
    // precipitation (wind_from_direction + 180°), so movement reflects real data
    // instead of an arbitrary drift — kept small so the band stays over its valley
    if(windFrom !== null){
      const moveDir = (windFrom + 180) % 360;
      const rad = moveDir * Math.PI / 180;
      const dx = Math.sin(rad), dy = -Math.cos(rad);
      const amp = Math.min(26, tier.rx * 0.3);
      const driftDur = dur * 1.3;
      const driftX = document.createElementNS('http://www.w3.org/2000/svg','animate');
      driftX.setAttribute('attributeName','cx');
      driftX.setAttribute('values', `${v.x - dx*amp};${v.x + dx*amp};${v.x - dx*amp}`);
      driftX.setAttribute('dur', `${driftDur}s`); driftX.setAttribute('repeatCount','indefinite');
      const driftY = document.createElementNS('http://www.w3.org/2000/svg','animate');
      driftY.setAttribute('attributeName','cy');
      driftY.setAttribute('values', `${v.y - dy*amp};${v.y + dy*amp};${v.y - dy*amp}`);
      driftY.setAttribute('dur', `${driftDur}s`); driftY.setAttribute('repeatCount','indefinite');
      ellipse.appendChild(driftX);
      ellipse.appendChild(driftY);
    }

    g.appendChild(ellipse);
    layer.appendChild(g);
  });
}

function renderMap(){
  const layer = document.getElementById('valleyLayer');
  layer.innerHTML = '';
  locations.forEach(v=>{
    const mm = v.mm ? v.mm[activeDay] : null;
    const dry = isDry(mm);
    const color = colorForMm(mm);
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');

    if(dry){
      const halo = document.createElementNS('http://www.w3.org/2000/svg','circle');
      halo.setAttribute('cx', v.x); halo.setAttribute('cy', v.y); halo.setAttribute('r', 14);
      halo.setAttribute('fill', 'none'); halo.setAttribute('stroke', color);
      halo.setAttribute('stroke-width', '1'); halo.setAttribute('opacity', '0.5');
      const anim = document.createElementNS('http://www.w3.org/2000/svg','animate');
      anim.setAttribute('attributeName','r'); anim.setAttribute('values','7;16;7');
      anim.setAttribute('dur','2.6s'); anim.setAttribute('repeatCount','indefinite');
      const animOp = document.createElementNS('http://www.w3.org/2000/svg','animate');
      animOp.setAttribute('attributeName','opacity'); animOp.setAttribute('values','0.5;0;0.5');
      animOp.setAttribute('dur','2.6s'); animOp.setAttribute('repeatCount','indefinite');
      halo.appendChild(anim); halo.appendChild(animOp);
      g.appendChild(halo);
    }

    const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx', v.x); dot.setAttribute('cy', v.y); dot.setAttribute('r', v.id===activeValley ? 7 : 5.5);
    dot.setAttribute('fill', color);
    dot.setAttribute('class', 'valley-dot' + (isLoading ? ' skeleton' : ''));
    dot.setAttribute('stroke', v.id===activeValley ? 'var(--text)' : 'none');
    dot.setAttribute('stroke-width','1.5');
    dot.onclick = (e)=>{ e.stopPropagation(); activeValley = v.id; renderAll(); };
    g.appendChild(dot);

    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', v.x+13); label.setAttribute('y', v.y-8);
    label.setAttribute('class','valley-label');
    label.textContent = v.name;
    g.appendChild(label);

    const mmLabel = document.createElementNS('http://www.w3.org/2000/svg','text');
    mmLabel.setAttribute('x', v.x+13);
    mmLabel.setAttribute('y', v.y+10);
    mmLabel.setAttribute('class','valley-mm');
    mmLabel.textContent = isLoading ? '···' : fmtMm(mm);
    g.appendChild(mmLabel);

    layer.appendChild(g);
  });
}

function renderSubVillages(){
  const layer = document.getElementById('subLayer');
  layer.innerHTML = '';
  if(!zoomTarget) return;
  zoomTarget.subs.forEach(s=>{
    const sx = zoomTarget.x + s.dx;
    const sy = zoomTarget.y + s.dy;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('r', 3);
    dot.setAttribute('fill', 'var(--text-dim)');
    dot.setAttribute('class','sub-dot');
    g.appendChild(dot);
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('x', sx+7); label.setAttribute('y', sy+3);
    label.setAttribute('class','sub-label');
    label.textContent = s.name;
    g.appendChild(label);
    layer.appendChild(g);
  });
}

function applyZoomTransform(){
  const content = document.getElementById('mapContent');
  const svg = document.getElementById('mapSvg');
  const subLayer = document.getElementById('subLayer');
  const resetBtn = document.getElementById('zoomReset');
  if(zoomed && zoomTarget){
    const scale = 2.3;
    const tx = 360 - zoomTarget.x*scale;
    const ty = 230 - zoomTarget.y*scale;
    content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    svg.classList.add('zoomed');
    resetBtn.classList.add('visible');
    subLayer.classList.add('visible');
  } else {
    content.style.transform = 'translate(0px, 0px) scale(1)';
    svg.classList.remove('zoomed');
    resetBtn.classList.remove('visible');
    subLayer.classList.remove('visible');
  }
}

function nearestValley(px, py){
  let best = null, bestDist = Infinity;
  locations.forEach(v=>{
    const d = Math.hypot(v.x-px, v.y-py);
    if(d < bestDist){ bestDist = d; best = v; }
  });
  return best;
}

function setupMapClick(){
  const svg = document.getElementById('mapSvg');
  svg.onclick = (e)=>{
    if(zoomed){ zoomed = false; zoomTarget = null; applyZoomTransform(); renderSubVillages(); return; }
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * 720;
    const py = (e.clientY - rect.top) / rect.height * 460;
    zoomTarget = nearestValley(px, py);
    activeValley = zoomTarget.id;
    zoomed = true;
    applyZoomTransform();
    renderMap(); renderSubVillages(); renderDetail(); renderRank();
  };
  document.getElementById('zoomReset').onclick = (e)=>{
    e.stopPropagation();
    zoomed = false; zoomTarget = null;
    applyZoomTransform();
    renderSubVillages();
  };
  document.getElementById('refreshBtn').onclick = ()=>{ if(!isLoading) loadAllData(); };
}

function renderDetail(){
  const v = locations.find(v=>v.id===activeValley);
  const mm = v.mm ? v.mm[activeDay] : null;
  const temp = v.temp ? v.temp[activeDay] : null;
  const wind = v.wind ? v.wind[activeDay] : null;
  const box = document.getElementById('detailBox');
  let statusClass = 'status-unknown', statusText = '● VÄNTAR PÅ DATA';
  if(isDry(mm)){ statusClass='status-dry'; statusText='● FISKBART TORRT'; }
  else if(isWet(mm)){ statusClass='status-wet'; statusText='● NEDERBÖRD'; }
  box.innerHTML = `
    <div class="readout-name">${v.name}</div>
    <div class="readout-status ${statusClass}">${statusText}</div>
    <div class="metric-row"><span class="metric-label">Nederbörd</span><span class="metric-value">${isLoading ? '···' : fmtMm(mm)}</span></div>
    <div class="metric-row"><span class="metric-label">Vind</span><span class="metric-value">${isLoading || wind===null ? '—' : wind + ' m/s'}</span></div>
    <div class="metric-row"><span class="metric-label">Temperatur</span><span class="metric-value">${isLoading || temp===null ? '—' : temp + '°C'}</span></div>
  `;
}

function renderRank(){
  const sorted = [...locations].sort((a,b)=>{
    const mmA = a.mm ? a.mm[activeDay] : null;
    const mmB = b.mm ? b.mm[activeDay] : null;
    if(mmA === null) return 1;
    if(mmB === null) return -1;
    return mmA - mmB;
  });
  const box = document.getElementById('rankBox');
  box.innerHTML = sorted.map((v,i)=>{
    const mm = v.mm ? v.mm[activeDay] : null;
    return `
    <div class="rank-item" onclick="selectValley('${v.id}')">
      <div class="rank-left">
        <span class="rank-num">${String(i+1).padStart(2,'0')}</span>
        <span class="rank-name">${v.name}</span>
      </div>
      <span class="rank-mm">${isLoading ? '···' : fmtMm(mm)}</span>
    </div>
  `}).join('');
}

window.selectValley = function(id){ activeValley = id; renderAll(); };

function renderAll(){
  renderScrubber();
  renderRainbands();
  renderMap();
  renderSubVillages();
  renderDetail();
  renderRank();
}

setupMapClick();
loadAllData();
setInterval(loadAllData, 15 * 60 * 1000); // auto-refresh var 15:e minut
