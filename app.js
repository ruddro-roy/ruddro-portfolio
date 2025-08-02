// ─────────────────────────────────────────────────────────────────────────────
// MISSION CONTROL  –  HIGH-FIDELITY SATELLITE VISUALISATION
// ─────────────────────────────────────────────────────────────────────────────

// -------------------------  CONFIG  -----------------------------------------
const TLE_URL         = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const SATCAT_URL_BASE = "https://celestrak.org/satcat/records.php";
const SELECTED_ICON   = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iNSIgeTE9IjEyIiB4Mj0iMTkiIHkyPSIxMiI+PC9saW5lPjxsaW5lIHgxPSIxMiIgeTE9IjUiIHgyPSIxMiIgeTI9IjE5Ij48L2xpbmU+PC9zdmc+';

const ORBIT_STEP_SEC  = 60;
const ORBIT_PERIODS   = 2;

// ------------------  SECURE TOKEN (patched in CI)  --------------------------
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzY2FlZjgzZi1iYzVhLTQxZjEtYTdmMi1lYTFhOWE1OTFkNGYiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNDk0NTR9.gxKHxL2Mcmgn6xwmWL0lE5LzPgsNh2hJkD1kvT1LZ3w';

// ------------------  STATE  -------------------------------------------------
let sats      = [];
let byName    = Object.create(null);
let selected  = null;
let satcat    = Object.create(null);

// ------------------  VIEWER  ------------------------------------------------
const viewer = new Cesium.Viewer('cesiumContainer',{
  imageryProvider: new Cesium.IonImageryProvider({assetId:2}),
  skyAtmosphere:   new Cesium.SkyAtmosphere(),
  skyBox:          new Cesium.SkyBox(),
  baseLayerPicker:false, geocoder:false, homeButton:false, infoBox:false,
  navigationHelpButton:false, sceneModePicker:false, timeline:false, animation:false
});
viewer.scene.globe.enableLighting = true;
viewer.scene.requestRenderMode    = true;
viewer.scene.maximumRenderTimeChange = Infinity;

// ------------------  BOOT  --------------------------------------------------
document.addEventListener('DOMContentLoaded',async()=>{
  if(Cesium.Ion.defaultAccessToken==='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzY2FlZjgzZi1iYzVhLTQxZjEtYTdmMi1lYTFhOWE1OTFkNGYiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNDk0NTR9.gxKHxL2Mcmgn6xwmWL0lE5LzPgsNh2hJkD1kvT1LZ3w'){
    document.getElementById('loadingIndicator')
            .innerHTML='<p style="color:yellow;text-align:center">Add your Cesium Ion token.</p>';
    return;
  }
  wireUI();
  await initSatellites();
});

// ------------------  UI  ----------------------------------------------------
function wireUI(){
  document.getElementById('toggleThemeBtn').onclick =()=>document.body.classList.toggle('light');
  document.getElementById('resetViewBtn').onclick   = resetCamera;
  document.getElementById('togglePanelBtn').onclick =()=>document.getElementById('sidebar').classList.toggle('hide');
  document.getElementById('searchBox').onchange     = e=>{
    const q=e.target.value.trim().toUpperCase();
    if(byName[q]) selectSatellite(byName[q]);
  };
  viewer.screenSpaceEventHandler.setInputAction(handleClick,Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function handleClick(m){
  const p=viewer.scene.pick(m.position);
  if(p?.id?.id){ const k=p.id.id.toUpperCase(); byName[k]&&selectSatellite(byName[k]); }
}

// ------------------  SAT INITIALISATION  -----------------------------------
async function initSatellites(){
  const load=document.getElementById('loadingIndicator');
  try{
    const res=await fetch(TLE_URL);
    if(!res.ok) throw Error('TLE fetch failed');
    parseTLE(await res.text());
    populateSearch();
    createEntities();
  }catch(e){
    console.error(e);
    load.innerHTML='<p style="color:red">Failed to load data.</p>';
  }finally{ load.style.display='none'; }
}

function parseTLE(txt){
  const lines=txt.split(/\r?\n/);
  for(let i=0;i<lines.length-2;i+=3){
    const name=lines[i].trim();
    if(!name) continue;
    const [l1,l2]=[lines[i+1].trim(),lines[i+2].trim()];
    try{
      const rec=satellite.twoline2satrec(l1,l2);
      if(rec.error) continue;
      const s={name,l1,l2,rec,details:null,entity:null};
      sats.push(s);             byName[name.toUpperCase()]=s;
    }catch{}
  }
}

function populateSearch(){
  const dl=document.getElementById('satList'), frag=document.createDocumentFragment();
  sats.forEach(s=>{const o=document.createElement('option');o.value=s.name;frag.appendChild(o);});
  dl.appendChild(frag);
}

// ------------------  ENTITY CREATION  --------------------------------------
function createEntities(){
  const now=Cesium.JulianDate.now();
  sats.forEach(s=>{
    const path=orbitPath(s.rec,now); if(!path) return;
    s.entity=viewer.entities.add({
      id:s.name, position:path, orientation:new Cesium.VelocityOrientationProperty(path),
      point:{pixelSize:4,color:Cesium.Color.SKYBLUE,outlineColor:Cesium.Color.BLACK,outlineWidth:1,
             disableDepthTestDistance:Number.POSITIVE_INFINITY},
      path:{resolution:120,material:new Cesium.PolylineGlowMaterialProperty({glowPower:.1,color:Cesium.Color.WHITE.withAlpha(.5)}),
            width:1,trailTime:0,leadTime:(s.rec.no_kozai*60*ORBIT_PERIODS)}
    });
  });
  viewer.scene.requestRender();
}

function orbitPath(rec,start){
  const prop=new Cesium.SampledPositionProperty();
  const period=(1/rec.no_kozai)*2*Math.PI/60, totalSec=period*60*ORBIT_PERIODS;
  for(let t=0;t<=totalSec;t+=ORBIT_STEP_SEC){
    const time=Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate());
    const pv=satellite.propagate(rec,Cesium.JulianDate.toDate(time)).position;
    if(!pv) continue;
    const pos=Cesium.Cartesian3.fromArray([pv.x,pv.y,pv.z]).multiplyByScalar(1000);
    const fixed=Cesium.Transforms.computeIcrfToFixed(time).multiplyByPoint(pos,new Cesium.Cartesian3());
    prop.addSample(time,fixed);
  }
  return prop;
}

// ------------------  SELECTION  --------------------------------------------
async function selectSatellite(s){
  if(!s||!s.entity) return;

  if(selected?.entity){
    selected.entity.point.pixelSize=4;
    selected.entity.path.material.color=Cesium.Color.WHITE.withAlpha(.5);
    if(selected.bill){ viewer.entities.remove(selected.bill); selected.bill=null; }
  }

  selected=s;
  s.entity.point.pixelSize=10;
  s.entity.path.material.color=Cesium.Color.ORANGERED.withAlpha(.8);
  s.bill=viewer.entities.add({position:s.entity.position,
    billboard:{image:SELECTED_ICON,width:24,height:24,disableDepthTestDistance:Number.POSITIVE_INFINITY}});

  viewer.flyTo(s.entity,{duration:2,offset:new Cesium.HeadingPitchRange(0,-Cesium.Math.toRadians(45),1500e3)});
  if(innerWidth<=800) document.getElementById('sidebar').classList.remove('hide');

  document.getElementById('infoPanel').innerHTML='<div class="spinner"></div><p>Fetching…</p>';
  await fetchSatcat(s);  renderInfo(s);
}

async function fetchSatcat(s){
  if(s.details) return;
  try{
    const id=s.l2.substring(2,7);
    const r=await fetch(`${SATCAT_URL_BASE}?CATNR=${id}&FORMAT=JSON`);
    if(!r.ok) throw Error('SATCAT');
    const d=(await r.json())[0]||{};
    s.details=d; satcat[s.name.toUpperCase()]=d;
  }catch(e){s.details={OBJECT_NAME:s.name,COMMENT:'Catalog fetch failed'};}
}

function renderInfo(s){
  const d=s.details,v=(x)=>x||'N/A';
  document.getElementById('infoPanel').innerHTML=`
    <h2>${v(d.OBJECT_NAME)}</h2>
    <p>NORAD ${v(d.NORAD_CAT_ID)} | ${v(d.OBJECT_ID)}</p>
    <h3>Operational</h3>
    <div class="info-grid">
      <div><span class="label">Owner</span>${v(d.OWNER)}</div>
      <div><span class="label">Launch</span>${v(d.LAUNCH_DATE)}</div>
      <div><span class="label">Site</span>${v(d.LAUNCH_SITE)}</div>
      <div><span class="label">Type</span>${v(d.OBJECT_TYPE)}</div>
    </div>
    <h3>Orbit</h3>
    <div class="info-grid">
      <div><span class="label">Period (min)</span>${v(d.PERIOD)}</div>
      <div><span class="label">Incl (°)</span>${v(d.INCLINATION)}</div>
      <div><span class="label">Apogee (km)</span>${v(d.APOGEE)}</div>
      <div><span class="label">Perigee (km)</span>${v(d.PERIGEE)}</div>
    </div>`;
}

// ------------------  RESET  -------------------------------------------------
function resetCamera(){
  if(selected?.entity){
    selected.entity.point.pixelSize=4;
    selected.entity.path.material.color=Cesium.Color.WHITE.withAlpha(.5);
    if(selected.bill){viewer.entities.remove(selected.bill);selected.bill=null;}
  }
  selected=null;
  document.getElementById('infoPanel').innerHTML='<p class="placeholder-text">No satellite selected.</p>';
  viewer.flyTo(viewer.entities,{duration:2});
}
