// STREET LEGACY — an original open-world crime game in Velmora City.
// Three.js (vendored), no network, no Rockstar/GTA assets. All art is procedural.
import * as THREE from 'three';

// ---------- utils ----------
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | fight | end | null
const SEED = parseInt(params.get('seed')||'7',10)||7;
const rng = mulberry32(SEED);
const rand=(a,b)=>a+rng()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const pick=arr=>arr[Math.floor(rng()*arr.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const $=id=>document.getElementById(id);
const WORLD=105; // half-size of playable ground

// ---------- game state ----------
const S = {
  mode:'menu', // menu | play | paused | over
  mission:0, // 0 free, 1..3 story, 4 done
  missionStep:0, missionActive:false,
  money:120, rep:0, health:100, maxHealth:100,
  wanted:0, wantedTimer:0, crimeCooldown:0,
  ammo:12, magSize:12, reloading:false, reloadT:0,
  time:18.4, night:false, dayLength:150, // hours, cycles
  kills:0, carsStolen:0, shotsFired:0,
  trauma:0, hitStop:0, timeScale:1,
  muted:false, lastDamage:0, dead:false, busted:false,
  save:null,
};
try{ S.save = JSON.parse(localStorage.getItem('streetlegacy-save')||'null'); }catch(e){ S.save=null; }
if(S.save && S.save.money!=null){ $('btnContinue').style.display='inline-block'; }

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e4a6b);
scene.fog = new THREE.Fog(0x2e4a6b, 70, 230);
const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 500);
camera.position.set(0, 8, 14);
const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
sun.position.set(60, 90, 30); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-90; sun.shadow.camera.right=90;
sun.shadow.camera.top=90; sun.shadow.camera.bottom=-90; sun.shadow.camera.far=260;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x3a2f22, 0.85); scene.add(hemi);
const amb = new THREE.AmbientLight(0x606070, 0.7); scene.add(amb); // lifts shadowed facades so the city reads at dusk
const moon = new THREE.DirectionalLight(0x8fb0ff, 0); moon.position.set(-40,80,-50); scene.add(moon);
// cool fill from the north-west (no shadows): lifts shadowed facades and car rears
const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); fill.position.set(-50,70,-80); scene.add(fill);
// --- sky dressing (cheap, no extra lights): sun disc, stars, drifting clouds ---
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, fog: false }));
sunDisc.position.set(60, 90, 30).normalize().multiplyScalar(380); scene.add(sunDisc);
const starGeo = new THREE.BufferGeometry();
{ const pts = []; for (let i = 0; i < 220; i++) { const a = rand(0, Math.PI * 2), e = rand(0.12, 1.4), r = 380;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8,
  sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
scene.add(stars);
const clouds = [];
for (let i = 0; i < 9; i++) {
  const c = new THREE.Mesh(new THREE.PlaneGeometry(rand(24, 44), rand(8, 14)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: rand(0.22, 0.4), side: THREE.DoubleSide, depthWrite: false }));
  c.rotation.x = -Math.PI / 2; c.position.set(rand(-130, 130), rand(72, 95), rand(-130, 130));
  scene.add(c); clouds.push(c);
}
addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); });

// ---------- canvas textures (procedural, original) ----------
function canvasTex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h); const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }
function buildingTex(base, win, lit){
  return canvasTex(128,256,(g,w,h)=>{ g.fillStyle=base; g.fillRect(0,0,w,h);
    g.fillStyle='rgba(255,255,255,.06)';
    for(let x=0;x<w;x+=32) g.fillRect(x,0,3,h); // pilasters
    g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(0,0,w,10); g.fillRect(0,h-14,w,14);
    g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h-20,w,20); // ground floor band
    g.fillStyle='rgba(255,255,255,.14)'; g.fillRect(0,h-20,w,2); // shopfront lintel
    for(let y=22;y<h-28;y+=20) for(let x=10;x<w-10;x+=18){
      const on=rng()<lit; g.fillStyle=on?'#ffd98a':'#202c3a';
      if(rng()<0.12) g.fillStyle=win;
      g.fillRect(x,y,11,13); } }); }
const TEX = {
  bldA: buildingTex('#6b5a48','#7fb3d5',0.35), bldB: buildingTex('#4a5a70','#8fd0c0',0.3),
  bldC: buildingTex('#7a6a55','#d5a07f',0.4), bldD: buildingTex('#5a4a68','#b7a6e0',0.3),
  bldE: buildingTex('#7d6244','#e0c07f',0.45),
  bldF: buildingTex('#8a4f3a','#cfe0ff',0.35), // brick red
  bldG: buildingTex('#2e5f6b','#9fd8ff',0.5),  // teal glass
};
function signTex(text, bg, fg){ return canvasTex(256,64,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h);
  g.strokeStyle=fg; g.lineWidth=4; g.strokeRect(4,4,w-8,h-8);
  g.fillStyle=fg; g.font='bold 30px system-ui,sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(text,w/2,h/2+1); }); }

// ---------- materials / geometry cache ----------
const MAT = {
  road: new THREE.MeshStandardMaterial({ color:0x23262e, roughness:.95 }),
  sidewalk: new THREE.MeshStandardMaterial({ color:0x8a8578, roughness:.95 }),
  ground: new THREE.MeshStandardMaterial({ color:0x3f5a3a, roughness:1 }),
  water: new THREE.MeshStandardMaterial({ color:0x1d4e63, roughness:.25, metalness:.4 }),
  lampPole: new THREE.MeshStandardMaterial({ color:0x2c2f36, roughness:.6, metalness:.6 }),
  lampGlow: new THREE.MeshStandardMaterial({ color:0xffe9a8, emissive:0xffc861, emissiveIntensity:1.6 }),
  trunk: new THREE.MeshStandardMaterial({ color:0x5a3d24, roughness:1 }),
  leaf: new THREE.MeshStandardMaterial({ color:0x2f6b34, roughness:1 }),
  leaf2: new THREE.MeshStandardMaterial({ color:0x4a7a2e, roughness:1 }),
  crate: new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1 }),
  container: new THREE.MeshStandardMaterial({ color:0xb3502e, roughness:.8 }),
  container2: new THREE.MeshStandardMaterial({ color:0x2e7a8a, roughness:.8 }),
  asphalt2: new THREE.MeshStandardMaterial({ color:0x2e3138, roughness:.95 }),
};
const boxGeo = new THREE.BoxGeometry(1,1,1);
function box(w,h,d,mat,x=0,y=0,z=0,parent=scene){ const m=new THREE.Mesh(boxGeo,mat);
  m.scale.set(w,h,d); m.position.set(x,y,z); parent.add(m); return m; }

// ---------- colliders ----------
const colliders=[]; // {minX,maxX,minZ,maxZ}
function addCollider(x,z,w,d){ colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2}); }
function collideCircle(p, r){
  for(const c of colliders){
    const cx=clamp(p.x,c.minX,c.maxX), cz=clamp(p.z,c.minZ,c.maxZ);
    const dx=p.x-cx, dz=p.z-cz, d2=dx*dx+dz*dz;
    if(d2 < r*r){ const d=Math.sqrt(d2)||0.001;
      const push=(r-d)/d; p.x+=dx*push; p.z+=dz*push; return true; } }
  p.x=clamp(p.x,-WORLD,WORLD); p.z=clamp(p.z,-WORLD,WORLD); return false; }
function pointInCollider(x,z,pad=0){ return colliders.some(c=>x>c.minX-pad&&x<c.maxX+pad&&z>c.minZ-pad&&z<c.maxZ+pad); }

// ---------- city layout ----------
const ROADS=[-90,-70,-50,-30,-10,10,30,50,70,90]; // street centre lines
const isRoad=(x,z)=>ROADS.some(r=>Math.abs(x-r)<4.6)||ROADS.some(r=>Math.abs(z-r)<4.6);
const onRoadX=z=>ROADS.some(r=>Math.abs(z-r)<4.6);
const onRoadZ=x=>ROADS.some(r=>Math.abs(x-r)<4.6);
const DISTRICTS={ downtown:{x:[-40,40],z:[-95,-25]}, market:{x:[-45,45],z:[-20,25]},
  homes:{x:[-95,95],z:[30,95]}, docks:{x:[55,100],z:[-95,-25]}, park:{x:[-20,20],z:[28,55]} };
function districtAt(x,z){ for(const [k,d] of Object.entries(DISTRICTS))
  if(x>=d.x[0]&&x<=d.x[1]&&z>=d.z[0]&&z<=d.z[1]) return k; return 'market'; }

// ground, roads, water
{
  const g=new THREE.Mesh(new THREE.PlaneGeometry(WORLD*2+40,WORLD*2+40), MAT.ground);
  g.rotation.x=-Math.PI/2; g.receiveShadow=true; scene.add(g);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(60,90), MAT.water);
  water.rotation.x=-Math.PI/2; water.position.set(128,-0.4,-60); scene.add(water);
  for(const r of ROADS){
    const rx=new THREE.Mesh(new THREE.PlaneGeometry(WORLD*2,9.2), MAT.road);
    rx.rotation.x=-Math.PI/2; rx.position.set(0,0.02,r); rx.receiveShadow=true; scene.add(rx);
    const rz=new THREE.Mesh(new THREE.PlaneGeometry(9.2,WORLD*2), MAT.road);
    rz.rotation.x=-Math.PI/2; rz.position.set(r,0.02,0); rz.receiveShadow=true; scene.add(rz);
    // centre dashes
    for(let t=-100;t<=100;t+=8){ box(2.4,0.02,0.35,new THREE.MeshBasicMaterial({color:0xd8c86a}),t,0.04,r);
      box(0.35,0.02,2.4,new THREE.MeshBasicMaterial({color:0xd8c86a}),r,0.04,t); }
  }
  // sidewalks: lighter strips along roads
  for(const r of ROADS){ for(const off of [-5.6,5.6]){
    const s1=new THREE.Mesh(new THREE.PlaneGeometry(WORLD*2,2.2), MAT.sidewalk);
    s1.rotation.x=-Math.PI/2; s1.position.set(0,0.015,r+off); scene.add(s1);
    const s2=new THREE.Mesh(new THREE.PlaneGeometry(2.2,WORLD*2), MAT.sidewalk);
    s2.rotation.x=-Math.PI/2; s2.position.set(r+off,0.015,0); scene.add(s2); } }
}

// buildings — one dense district, procedural
const buildingMats=[TEX.bldA,TEX.bldB,TEX.bldC,TEX.bldD,TEX.bldE,TEX.bldF,TEX.bldG].map(t=>
  new THREE.MeshStandardMaterial({ map:t, roughness:.85, emissive:0xffc98a, emissiveMap:t, emissiveIntensity:0.06 }));
const roofMat=new THREE.MeshStandardMaterial({ color:0x33333a, roughness:1 });
const roofLights=[]; // blinking red antenna tips
const shopSigns=[
  ['TACOS 24H','#7a1f1f','#ffd166'],['AUTO FIX','#1f3a5e','#9fd8ff'],['VELMORA BAR','#2c1f3a','#e0aaff'],
  ['BURGER SHOT','#5e2f10','#ffe9a8'],['PHARMACY','#123a2a','#a8f0c0'],['LAUNDROMAT','#26303a','#cfe8ff'],
  ['PIZZA NOVA','#5e1f1f','#ffb3a0'],['GYM IRON','#1f1f1f','#ff6b4d'],
];
let shopCount=0;
function makeBuilding(x,z,w,d,h,district){
  const mat=buildingMats[Math.floor(rng()*buildingMats.length)];
  const m=new THREE.Mesh(boxGeo,mat); m.scale.set(w,h,d); m.position.set(x,h/2,z);
  m.receiveShadow=true; scene.add(m);
  box(w+0.6,0.8,d+0.6,roofMat,x,h+0.4,z);
  if(rng()<0.5) box(rand(1,2.4),rand(0.8,1.6),rand(1,2),roofMat,x+rand(-w/4,w/4),h+1.2,z+rand(-d/4,d/4));
  if(rng()<0.3){ // rooftop water tower
    const tw=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,2.2,8), MAT.crate);
    tw.position.set(x-w/4,h+1.9,z-d/4); scene.add(tw);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.3,1,8), roofMat);
    cone.position.set(x-w/4,h+3.4,z-d/4); scene.add(cone); }
  if(rng()<0.35){ box(1.6,0.7,1.2,roofMat,x+w/4,h+1.1,z+d/4); } // AC unit
  if(rng()<0.28 && h>14){ // antenna with blinking red tip
    const a=box(0.14,rand(5,9),0.14,MAT.lampPole,x+w/2-1.5,h+4,z);
    const tipMat=new THREE.MeshStandardMaterial({ color:0xff2020, emissive:0xff0000, emissiveIntensity:2 });
    const tip=new THREE.Mesh(new THREE.SphereGeometry(0.22,6,5), tipMat);
    tip.position.set(x+w/2-1.5,h+8,z); scene.add(tip); roofLights.push(tipMat); }
  if(rng()<0.25){ const a=box(0.3,rand(3,6),0.3,MAT.lampPole,x+w/2-1,h+3,z); }
  if(district==='market'&&rng()<0.6&&shopCount<10){
    const [txt,bg,fg]=shopSigns[shopCount%shopSigns.length]; shopCount++;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w-1,9),2.2),
      new THREE.MeshBasicMaterial({ map:signTex(txt,bg,fg) }));
    sign.position.set(x,3.4,z+d/2+0.06); scene.add(sign);
    // striped awning under the sign
    const awn=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w-1,9),1.1),
      new THREE.MeshStandardMaterial({ color:new THREE.Color(bg).lerp(new THREE.Color(0xffffff),0.25), roughness:.9, side:THREE.DoubleSide }));
    awn.position.set(x,2.1,z+d/2+0.7); awn.rotation.x=-0.5; scene.add(awn); }
  addCollider(x,z,w,d);
  return m;
}
{
  // blocks: centres between roads
  const centres=[]; for(let i=0;i<ROADS.length-1;i++) centres.push((ROADS[i]+ROADS[i+1])/2);
  for(const cx of centres) for(const cz of centres){
    if(Math.abs(cx)<16&&cz>26&&cz<56) continue; // park
    if(cx>52&&cz<-22) continue; // docks handled separately
    const d=districtAt(cx,cz);
    const tall = d==='downtown';
    const n = tall?1:randi(1,2);
    for(let k=0;k<n;k++){
      const w=rand(tall?10:7,tall?15:11), dep=rand(tall?10:7,tall?15:11);
      const ox=k===0?0:rand(-4,4), oz=k===0?0:rand(-4,4);
      const x=cx+ox, z=cz+oz;
      if(Math.abs(x)>98||Math.abs(z)>98) continue;
      makeBuilding(x,z,w,dep, tall?rand(22,46):rand(7,16), d);
    }
  }
  // park: trees + benches + pond
  for(let i=0;i<26;i++){ const x=rand(-18,18), z=rand(30,53);
    if(pointInCollider(x,z,1)) continue; makeTree(x,z); }
  box(10,0.3,6,new THREE.MeshStandardMaterial({color:0x2a6a8a,roughness:.3}),0,0.15,42);
  // docks: containers, cranes, warehouse
  for(let i=0;i<14;i++){ const x=rand(58,96), z=rand(-92,-30);
    if(rng()<0.5) continue;
    const c=box(7,2.6,2.6, rng()<0.5?MAT.container:MAT.container2, x,1.3,z);
    c.rotation.y=rng()<0.5?0:Math.PI/2; addCollider(x,z,7,2.6);
    if(rng()<0.35){ // second layer, stacked
      const c2=box(7,2.6,2.6, rng()<0.5?MAT.container2:MAT.container, x,3.9,z);
      c2.rotation.y=c.rotation.y; } }
  makeBuilding(78,-58,18,12,9,'docks'); // warehouse
  const craneMat=new THREE.MeshStandardMaterial({color:0xd8a02e,roughness:.6,metalness:.4});
  box(1.2,26,1.2,craneMat,88,13,-70); box(22,1.4,1.4,craneMat,80,25,-70);
  box(3,3,3,craneMat,88,27,-70);
  // billboards
  const bb=[['VELMORA','WELCOME TO THE CITY THAT NEVER SLEEPS','#20243a','#ffd166',-60,-96],
    ['HARBOUR ROW','FISH · FREIGHT · FORTUNE','#12303a','#9fd8ff',60,-96],
    ['STREET LEGACY','OWN THE NIGHT','#2a1020','#ff6b9d',-96,10]];
  for(const [t,s,bg,fg,x,z] of bb){
    const tex=canvasTex(512,128,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h);
      g.fillStyle=fg; g.font='bold 52px system-ui'; g.textAlign='center'; g.fillText(t,w/2,58);
      g.fillStyle='#fff'; g.font='22px system-ui'; g.fillText(s,w/2,100); });
    const b=new THREE.Mesh(new THREE.PlaneGeometry(16,4), new THREE.MeshBasicMaterial({map:tex}));
    b.position.set(x,9,z); b.rotation.y = x<0?Math.PI/2 : x>0?-Math.PI/2 : 0; scene.add(b);
    box(0.8,9,0.8,MAT.lampPole,x,4.5,z+(z<0?1:0));
  }
}
// --- street dressing: crosswalks, avenue trees, benches, bins, bus stop, skyline ---
{
  const zebraMat=new THREE.MeshBasicMaterial({ color:0xe8e8e0 });
  for(const [ix,iz] of [[10,-10],[10,30],[-30,10],[30,-30]]){
    for(let k=-2;k<=2;k++){ // stripes across the north-south road, then the east-west road
      box(0.85,0.02,3.0,zebraMat,ix+k*1.8,0.04,iz);
      box(3.0,0.02,0.85,zebraMat,ix,0.04,iz+k*1.8); } }
  // street trees along the main avenue (x=10) and market street (z=10)
  for(const [x,z] of [[15.6,-70],[15.6,-30],[15.6,10],[15.6,50],[4.4,-50],[4.4,50],[-35.6,-10],[-35.6,30],[35.6,-30],[35.6,10]]) makeTree(x,z);
  // park benches + flower beds
  const benchMat=new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1 });
  const bedMat=new THREE.MeshStandardMaterial({ color:0xb3507a, roughness:1 });
  for(const [x,z,ry] of [[-12,36,0],[12,36,0],[-12,50,Math.PI],[12,50,Math.PI],[40,20,Math.PI/2],[-40,-2,Math.PI/2]]){
    const b=new THREE.Group();
    const seat=box(2.2,0.14,0.6,benchMat,0,0.55,0,b); const back=box(2.2,0.6,0.12,benchMat,0,0.95,-0.28,b);
    box(0.12,0.55,0.5,MAT.lampPole,-0.9,0.28,0,b); box(0.12,0.55,0.5,MAT.lampPole,0.9,0.28,0,b);
    b.position.set(x,0,z); b.rotation.y=ry; scene.add(b); }
  for(const [x,z] of [[-8,44],[8,44],[0,34]]) box(2.4,0.5,1.2,bedMat,x,0.25,z);
  // trash bins + fire hydrants
  const binGeo=new THREE.CylinderGeometry(0.45,0.4,1,8);
  const binMat=new THREE.MeshStandardMaterial({ color:0x2e4a3a, roughness:.9 });
  for(const [x,z] of [[16,-8],[16,32],[-16,12],[36,-8],[-36,32],[56,12]]){
    const bin=new THREE.Mesh(binGeo,binMat); bin.position.set(x,0.5,z); scene.add(bin); }
  const hydMat=new THREE.MeshStandardMaterial({ color:0xc23b2e, roughness:.6 });
  for(const [x,z] of [[15.6,-12],[15.6,28],[-15.6,8],[35.6,-32]]){
    const hyd=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.32,0.9,8),hydMat);
    hyd.position.set(x,0.45,z); scene.add(hyd); }
  // bus stop shelter on market street
  box(0.18,2.6,0.18,MAT.lampPole,-38,1.3,14); box(0.18,2.6,0.18,MAT.lampPole,-34,1.3,14);
  box(4.4,0.18,1.6,roofMat,-36,2.7,14);
  box(3.6,0.14,0.55,benchMat,-36,0.55,14);
  // distant skyline backdrop — Velmora beyond the playable district (no colliders, no shadows)
  const skyPos=[[-120,-60],[-90,-125],[-40,-128],[10,-125],[60,-128],[105,-110],[-128,20],[-128,70],[128,40],[128,80],[-60,128],[40,128]];
  for(const [x,z] of skyPos){
    const h=rand(30,68), w=rand(14,22);
    const m=new THREE.Mesh(boxGeo, buildingMats[Math.floor(rng()*buildingMats.length)]);
    m.scale.set(w,h,rand(14,22)); m.position.set(x,h/2,z); scene.add(m); }
  // freighter moored at the harbour (backdrop, east water)
  box(9,4.5,36,new THREE.MeshStandardMaterial({ color:0x1c2733, roughness:.7, metalness:.3 }),128,1.8,-60);
  box(6,3,6,new THREE.MeshStandardMaterial({ color:0xd8d8d8, roughness:.8 }),128,6,-72);
  box(7,2.6,2.6,MAT.container,126,6.2,-52); box(7,2.6,2.6,MAT.container2,130,6.2,-62);
}
function makeTree(x,z){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.35,2.2,6), MAT.trunk);
  trunk.position.y=1.1; g.add(trunk);
  const leaf=new THREE.Mesh(new THREE.SphereGeometry(rand(1.4,2.1),8,6), rng()<0.5?MAT.leaf:MAT.leaf2);
  leaf.position.y=3.1; leaf.castShadow=true; g.add(leaf);
  g.position.set(x,0,z); scene.add(g); return g;
}
// street lamps + props along roads
const lamps=[];
for(const r of ROADS){ for(let t=-90;t<=90;t+=30){
  if(rng()<0.25) continue;
  const x=r+5.6, z=t; const pole=box(0.22,5.4,0.22,MAT.lampPole,x,2.7,z);
  const arm=box(1.6,0.18,0.18,MAT.lampPole,x-0.7,5.3,z);
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.32,8,6), MAT.lampGlow);
  bulb.position.set(x-1.4,5.2,z); scene.add(bulb); lamps.push(bulb);
  const x2=r-5.6, z2=t+15; box(0.22,5.4,0.22,MAT.lampPole,x2,2.7,z2);
  const bulb2=new THREE.Mesh(new THREE.SphereGeometry(0.32,8,6), MAT.lampGlow);
  bulb2.position.set(x2+1.4,5.2,z2); scene.add(bulb2); lamps.push(bulb2);
}}
for(let i=0;i<40;i++){ const x=rand(-95,95), z=rand(-95,95);
  if(isRoad(x,z)||pointInCollider(x,z,1.5)) continue;
  if(rng()<0.6){ box(rand(0.8,1.4),rand(0.8,1.4),rand(0.8,1.4),MAT.crate,x,0.6,z); addCollider(x,z,1.2,1.2); }
  else makeTree(x,z); }

// ---------- audio (procedural WebAudio, no files) ----------
const AudioSys={ ctx:null, master:null,
  init(){ if(this.ctx) return; try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain(); this.master.gain.value=0.25; this.master.connect(this.ctx.destination); }catch(e){} },
  tone(f,d=0.12,type='square',v=0.2,slide=0){ if(!this.ctx||S.muted) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain(); o.type=type; o.frequency.value=f;
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide), this.ctx.currentTime+d);
    g.gain.setValueAtTime(v,this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+d);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime+d); },
  noise(d=0.15,v=0.3){ if(!this.ctx||S.muted) return; const len=this.ctx.sampleRate*d;
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate), ch=buf.getChannelData(0);
    for(let i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len);
    const s=this.ctx.createBufferSource(); s.buffer=buf; const g=this.ctx.createGain(); g.gain.value=v;
    s.connect(g); g.connect(this.master); s.start(); },
  shoot(){ this.noise(0.12,0.5); this.tone(160,0.08,'sawtooth',0.25,-120); },
  punch(){ this.noise(0.08,0.35); },
  pickup(){ this.tone(660,0.09,'sine',0.25); setTimeout(()=>this.tone(990,0.12,'sine',0.25),70); },
  mission(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,0.18,'triangle',0.3),i*110)); },
  fail(){ [400,300,200].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sawtooth',0.2),i*140)); },
  siren(){ if(!this.ctx||S.muted) return; const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type='sine'; g.gain.value=0.05; o.connect(g); g.connect(this.master);
    let up=true; const iv=setInterval(()=>{ if(S.wanted===0||S.muted){ o.stop(); clearInterval(iv); return; }
      o.frequency.value=up?950:700; up=!up; },450); o.start(); },
};

// ---------- input ----------
const keys={};
let mouseDX=0, mouseDY=0, dragging=false, lastMX=0, lastMY=0;
addEventListener('keydown',e=>{ keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  if(e.code==='KeyP'&&S.mode==='play') pauseGame(true);
  else if(e.code==='KeyP'&&S.mode==='paused') pauseGame(false);
  if(e.code==='KeyM'){ S.muted=!S.muted; toast(S.muted?'🔇 Suara mati':'🔊 Suara nyala'); }
  if(e.code==='KeyN'){ S.night=!S.night; toast(S.night?'🌙 Malam — lampu kota menyala':'☀️ Siang — Velmora terang'); }
  if(e.code==='KeyH') toast('WASD gerak · E mobil · Klik tembak · F pukul · N siang/malam · P jeda');
  if(e.code==='KeyE') onInteract();
  if(e.code==='KeyF') doPunch();
  if(e.code==='KeyR') startReload();
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
addEventListener('mousedown',e=>{ if(S.mode!=='play') return; AudioSys.init();
  if(e.target.closest('.overlay,.btn,.card')) return;
  dragging=true; lastMX=e.clientX; lastMY=e.clientY;
  if(e.button===0 && !dialogueOpen) doShoot(); });
addEventListener('mouseup',()=>{ dragging=false; });
addEventListener('mousemove',e=>{ if(!dragging) return;
  mouseDX+=e.clientX-lastMX; mouseDY+=e.clientY-lastMY; lastMX=e.clientX; lastMY=e.clientY; });
addEventListener('contextmenu',e=>e.preventDefault());

// ---------- characters ----------
function makeHumanoid(shirt, pants, skin=0xc98e6b, hair=0x1a1a1a){
  const g=new THREE.Group();
  const mShirt=new THREE.MeshStandardMaterial({color:shirt,roughness:.85});
  const mPants=new THREE.MeshStandardMaterial({color:pants,roughness:.9});
  const mSkin=new THREE.MeshStandardMaterial({color:skin,roughness:.8});
  const mHair=new THREE.MeshStandardMaterial({color:hair,roughness:1});
  const torso=box(0.62,0.72,0.34,mShirt,0,1.18,0,g); torso.castShadow=true;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.24,10,8), mSkin);
  head.position.y=1.78; head.castShadow=true; g.add(head);
  const hairM=new THREE.Mesh(new THREE.SphereGeometry(0.25,10,8,0,Math.PI*2,0,Math.PI/2.2), mHair);
  hairM.position.y=1.82; g.add(hairM);
  const legL=box(0.22,0.8,0.24,mPants,-0.16,0.4,0,g), legR=box(0.22,0.8,0.24,mPants,0.16,0.4,0,g);
  const armL=box(0.18,0.66,0.2,mShirt,-0.42,1.2,0,g), armR=box(0.18,0.66,0.2,mShirt,0.42,1.2,0,g);
  const jacket=box(0.66,0.3,0.38,new THREE.MeshStandardMaterial({color:0x222222,roughness:.7}),0,1.42,0,g);
  g.userData={ legL, legR, armL, armR, torso, head, walkPhase:rand(0,6) };
  return g;
}
function animateWalk(g, speed, dt){
  const u=g.userData; u.walkPhase+=dt*speed*3.2;
  const s=Math.sin(u.walkPhase)*clamp(speed/6,0,1)*0.6;
  u.legL.rotation.x=s; u.legR.rotation.x=-s;
  u.armL.rotation.x=-s*0.8; u.armR.rotation.x=s*0.8;
  u.torso.position.y=1.18+Math.abs(Math.sin(u.walkPhase))*0.05;
}

// ---------- player ----------
const player={ pos:new THREE.Vector3(0,0,60), yaw:Math.PI, vel:new THREE.Vector3(),
  speed:0, onGround:true, vy:0, mesh:makeHumanoid(0x2e6b8a,0x2a2a30), inCar:null, health:100 };
player.mesh.position.copy(player.pos); scene.add(player.mesh);
const camYaw={ yaw:Math.PI, pitch:0.32, dist:7.5 };
let camShake=0;

// ---------- cars ----------
const beamGeo=new THREE.ConeGeometry(1.0,6,10,1,true);
const beamMat=new THREE.MeshBasicMaterial({ color:0xffe9a0, transparent:true, opacity:0.05,
  side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
const CAR_COLORS=[0xc23b2e,0x2e6bc2,0xd8a02e,0x3a9e5f,0x8a8f96,0x6b4d9e,0xe0d8c8,0x22262e];
function makeCar(color, police=false){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({ color: police?0x1a1d24:color, roughness:.28, metalness:.65 });
  const body=box(2.0,0.62,4.4,bodyMat,0,0.62,0,g); body.castShadow=true;
  const cabinMat=new THREE.MeshStandardMaterial({ color: police?0xf0f0f0:0x10151f, roughness:.12, metalness:.8 });
  const cabin=box(1.7,0.55,2.1,cabinMat,0,1.18,-0.25,g); cabin.castShadow=true;
  // chrome trim, grille, bumpers, mirrors — the details that sell a car at a glance
  const chromeMat=new THREE.MeshStandardMaterial({ color:0xd8dde2, roughness:.25, metalness:.9 });
  box(2.02,0.1,0.06,chromeMat,0,0.92,2.2,g);
  box(1.2,0.18,0.08,new THREE.MeshStandardMaterial({ color:0x14181f, roughness:.6, metalness:.4 }),0,0.5,2.22,g);
  box(2.0,0.16,0.16,chromeMat,0,0.34,2.24,g); box(2.0,0.16,0.16,chromeMat,0,0.34,-2.24,g);
  box(0.18,0.12,0.3,bodyMat,-1.06,1.05,0.6,g); box(0.18,0.12,0.3,bodyMat,1.06,1.05,0.6,g);
  if(color===0xff2020||(!police&&rng()<0.3)){ // sports spoiler
    box(1.8,0.08,0.42,bodyMat,0,1.12,-2.05,g);
    box(0.1,0.28,0.1,chromeMat,-0.7,0.95,-2.05,g); box(0.1,0.28,0.1,chromeMat,0.7,0.95,-2.05,g); }
  const wheelMat=new THREE.MeshStandardMaterial({ color:0x0c0c0c, roughness:.9 });
  const wheels=[];
  for(const [x,z] of [[-0.95,1.45],[0.95,1.45],[-0.95,-1.45],[0.95,-1.45]]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.28,12), wheelMat);
    w.rotation.z=Math.PI/2; w.position.set(x,0.38,z); w.castShadow=true; g.add(w); wheels.push(w); }
  const lightMat=new THREE.MeshStandardMaterial({ color:0xfff2b0, emissive:0xffe9a0, emissiveIntensity:1.6 });
  box(0.4,0.16,0.1,lightMat,-0.6,0.66,2.22,g); box(0.4,0.16,0.1,lightMat,0.6,0.66,2.22,g);
  const tailMat=new THREE.MeshStandardMaterial({ color:0xff2a1a, emissive:0xcc1400, emissiveIntensity:1.2 });
  box(0.4,0.14,0.1,tailMat,-0.6,0.66,-2.22,g); box(0.4,0.14,0.1,tailMat,0.6,0.66,-2.22,g);
  // headlight beam cone (visible at dusk/night, toggled in updateDayNight)
  const beam=new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0,0.55,5.0); beam.rotation.x=-Math.PI/2; beam.visible=false; g.add(beam);
  g.userData.beam=beam;
  if(police){
    box(1.7,0.08,0.5,new THREE.MeshBasicMaterial({color:0xffffff}),0,1.5,-0.25,g);
    const barR=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.2), new THREE.MeshStandardMaterial({color:0xff2020,emissive:0xff0000,emissiveIntensity:2}));
    barR.position.set(-0.35,1.56,-0.25); g.add(barR);
    const barB=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.2), new THREE.MeshStandardMaterial({color:0x2040ff,emissive:0x0040ff,emissiveIntensity:2}));
    barB.position.set(0.35,1.56,-0.25); g.add(barB);
    g.userData.lightbar={r:barR,b:barB};
  }
  g.userData.wheels=wheels;
  return g;
}
const cars=[]; // {mesh,pos,yaw,speed,steer,parked,police,traffic,owner, target?}
function spawnCar(x,z,yaw,color,opts={}){
  const mesh=makeCar(color,opts.police);
  mesh.position.set(x,0,z); mesh.rotation.y=yaw; scene.add(mesh);
  const c={ mesh, pos:mesh.position, yaw, speed:0, steer:0, parked:!!opts.parked,
    police:!!opts.police, traffic:!!opts.traffic, axis:opts.axis||'z', dir:opts.dir||1,
    lane:opts.lane||0, cruise:rand(7,11), stuck:0, siren:opts.police };
  cars.push(c); return c;
}
// parked cars around the city
const parkedSpots=[[8,50],[12,-14],[-12,34],[52,10],[-52,-14],[8,-54],[-8,74],[72,30],[-72,-54],[32,54],[-32,-74],[52,-34]];
for(const [x,z] of parkedSpots) spawnCar(x,z, (Math.abs(z)%40<20?0:Math.PI/2), pick(CAR_COLORS), {parked:true});
// traffic cars
for(let i=0;i<8;i++){ const horizontal=rng()<0.5; const road=pick(ROADS);
  spawnCar(horizontal?rand(-90,90):road, horizontal?road:rand(-90,90),
    horizontal?Math.PI/2:0, pick(CAR_COLORS), {traffic:true, axis:horizontal?'x':'z', dir:rng()<0.5?1:-1}); }
// the mission-2 target sports car (red, at showroom)
const targetCar=spawnCar(48,26,Math.PI/2,0xff2020,{parked:true});
targetCar.isTarget=true;

// ---------- pedestrians ----------
const peds=[];
const PED_SHIRTS=[0xd8d8d8,0xc23b2e,0x3a9e5f,0xd8a02e,0x6b4d9e,0x2e6bc2,0xe07a5f,0x7a8a99];
function spawnPed(x,z){
  const mesh=makeHumanoid(pick(PED_SHIRTS), pick([0x2a2a30,0x4a3a28,0x3a4a5e]),
    pick([0xc98e6b,0x8a5a3b,0xe8b98a,0x6b4423]), pick([0x1a1a1a,0x3a2a1a,0x888888,0x5a3a1a,0x2a1a0a]));
  mesh.position.set(x,0,z); scene.add(mesh);
  const p={ mesh, pos:mesh.position, yaw:rand(0,Math.PI*2), speed:rand(1.2,2.2),
    state:'walk', target:new THREE.Vector3(x,0,z), fleeT:0, health:50 };
  peds.push(p); return p;
}
for(let i=0;i<14;i++){ let x,z,tries=0;
  do{ x=rand(-95,95); z=rand(-95,95); tries++; }while((isRoad(x,z)||pointInCollider(x,z,1))&&tries<20);
  spawnPed(x,z); }

// ---------- pickups / cash / health ----------
const pickups=[];
function makePickup(x,z,kind){
  const g=new THREE.Group();
  if(kind==='cash'){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.12,0.45),
    new THREE.MeshStandardMaterial({color:0x3fae5a,emissive:0x1a5a2a,emissiveIntensity:.6}));
    m.rotation.y=0.6; g.add(m); }
  else { const a=box(0.7,0.22,0.22,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.4}),0,0,0,g);
    box(0.22,0.7,0.22,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.4}),0,0,0,g); }
  g.position.set(x,0.7,z); scene.add(g);
  pickups.push({ mesh:g, pos:g.position, kind, taken:false, bob:rand(0,6) });
}
for(let i=0;i<8;i++){ let x,z; do{ x=rand(-90,90); z=rand(-90,90); }while(isRoad(x,z)||pointInCollider(x,z,1));
  makePickup(x,z,'cash'); }
for(const [x,z] of [[-8,44],[44,-44],[80,-60]]) makePickup(x,z,'health');

// ---------- police ----------
const policeCars=[];
function spawnPolice(){
  const ang=rand(0,Math.PI*2); const d=rand(45,60);
  const x=clamp(player.pos.x+Math.cos(ang)*d,-95,95), z=clamp(player.pos.z+Math.sin(ang)*d,-95,95);
  const c=spawnCar(x,z,Math.atan2(player.pos.x-x,player.pos.z-z),0,{police:true});
  policeCars.push(c); if(policeCars.length===1) AudioSys.siren(); return c;
}
const footCops=[];
function spawnFootCop(){
  const m=makeHumanoid(0x1a2a4a,0x1a1d24,0xc98e6b,0x1a1a1a);
  const ang=rand(0,Math.PI*2);
  m.position.set(clamp(player.pos.x+Math.cos(ang)*14,-95,95),0,clamp(player.pos.z+Math.sin(ang)*14,-95,95));
  scene.add(m); const c={ mesh:m, pos:m.position, yaw:0, speed:4.6, health:60, shootT:rand(1,2) };
  footCops.push(c); return c;
}

// ---------- rivals (mission 3) ----------
const rivals=[];
function spawnRival(x,z){
  const mesh=makeHumanoid(0x8a1f1f,0x222222,0xb07a55,0x000000);
  mesh.position.set(x,0,z); scene.add(mesh);
  const r={ mesh, pos:mesh.position, yaw:0, health:100, shootT:rand(0.5,1.5), state:'guard', dead:false };
  rivals.push(r); return r;
}

// ---------- particles / tracers ----------
const particles=[];
const pGeo=new THREE.SphereGeometry(0.12,6,5);
function burst(pos,color,n=14,spread=3){
  for(let i=0;i<n;i++){ const m=new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({color}));
    m.position.copy(pos); scene.add(m);
    particles.push({ mesh:m, vel:new THREE.Vector3(rand(-spread,spread),rand(1,spread),rand(-spread,spread)), life:rand(0.4,0.8) }); } }
const tracers=[];
function tracer(from,to){
  const geo=new THREE.BufferGeometry().setFromPoints([from,to]);
  const line=new THREE.Line(geo, new THREE.LineBasicMaterial({color:0xffe9a0,transparent:true,opacity:0.9}));
  scene.add(line); tracers.push({ line, life:0.08 }); }

// ---------- HUD / dialogue ----------
let toastTimer=null;
function toast(msg, ms=2600){ const t=$('toast'); t.textContent=msg; t.style.opacity=1;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.style.opacity=0, ms); }
function banner(title, sub='', ms=2600){ $('bannerTitle').textContent=title; $('bannerSub').textContent=sub;
  $('banner').classList.add('show'); setTimeout(()=>$('banner').classList.remove('show'), ms); }
let dialogueOpen=false, dlgQueue=[], dlgIdx=0, dlgTimer=null;
function showDialogue(who, lines){ dlgQueue=lines; dlgIdx=0; dialogueOpen=true;
  $('dialogue').style.display='block'; renderDlg(who); }
function renderDlg(who){ $('dlgWho').textContent=who; $('dlgLine').textContent=dlgQueue[dlgIdx];
  clearTimeout(dlgTimer); dlgTimer=setTimeout(()=>advanceDlg(), 3200); }
function advanceDlg(){ if(!dialogueOpen) return; dlgIdx++;
  if(dlgIdx>=dlgQueue.length){ closeDialogue(); } else renderDlg($('dlgWho').textContent); }
function closeDialogue(){ dialogueOpen=false; $('dialogue').style.display='none'; clearTimeout(dlgTimer); }
function setObjective(title, text, dist=''){ $('objTitle').textContent=title; $('objText').textContent=text; $('objDist').textContent=dist; }
function updateHUD(){
  const stars=$('stars'); let s='';
  for(let i=0;i<5;i++) s+=`<span class="${i<S.wanted?'':'off'}">★</span>`; stars.innerHTML=s;
  stars.classList.toggle('hot', S.wanted>=3);
  $('healthfill').style.width=`${clamp(S.health,0,100)}%`;
  $('healthfill').style.background=S.health>50?'linear-gradient(90deg,#37d67a,#a8e063)':S.health>25?'linear-gradient(90deg,#f0a830,#ffd166)':'linear-gradient(90deg,#ff4d3d,#ff8a7a)';
  $('cash').textContent=`$${S.money}`;
  $('ammo').textContent=S.reloading?'🔫 reloading…':`🔫 ${S.ammo}/${S.magSize}`;
  $('rep').textContent=S.rep;
  const h=Math.floor(S.time), m=Math.floor((S.time-h)*60);
  $('clock').textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  $('speed').textContent=player.inCar?`${Math.round(Math.abs(player.inCar.speed)*3.6)} km/h`:`${Math.round(player.speed*3.6)} km/h`;
  $('crosshair').style.display=(S.mode==='play'&&!player.inCar&&!dialogueOpen)?'block':'none';
}
function addMoney(n, why=''){ S.money+=n; toast(`💵 +$${n} ${why}`); AudioSys.pickup(); }
function addWanted(n, why=''){ if(S.crimeCooldown>0) return; S.crimeCooldown=3;
  const before=S.wanted; S.wanted=clamp(S.wanted+n,0,5);
  if(S.wanted>before){ toast(`⭐ WANTED +${S.wanted-before} — ${why}`); $('damage').style.opacity=0.5;
    setTimeout(()=>$('damage').style.opacity=0,300); } }
function damagePlayer(n, src=''){
  if(S.mode!=='play'||S.dead) return;
  S.health-=n; S.lastDamage=performance.now(); S.trauma=Math.min(1,S.trauma+0.35);
  $('damage').style.opacity=0.7; setTimeout(()=>{ if(S.mode==='play') $('damage').style.opacity=0; },220);
  if(S.health<=0){ S.health=0; wasted(); } }
function saveGame(){ try{ localStorage.setItem('streetlegacy-save', JSON.stringify(
  { money:S.money, rep:S.rep, mission:S.mission, health:100,
    x:+player.pos.x.toFixed(1), z:+player.pos.z.toFixed(1) })); }catch(e){} }

// ---------- mission system ----------
const MARKERS={};
function makeMarker(x,z,color=0xffb02e){
  const g=new THREE.Group();
  const cyl=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,0.15,24),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.45}));
  cyl.position.y=0.1; g.add(cyl);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.4,26,12,1,true),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.22,side:THREE.DoubleSide,depthWrite:false}));
  beam.position.y=13; g.add(beam);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,0.12,8,32),
    new THREE.MeshBasicMaterial({color}));
  ring.rotation.x=Math.PI/2; ring.position.y=0.15; g.add(ring);
  g.position.set(x,0,z); scene.add(g); return g;
}
let missionMarker=null, missionTarget=null;
function setMissionMarker(x,z,color){ if(missionMarker) scene.remove(missionMarker);
  missionMarker=makeMarker(x,z,color); missionTarget=new THREE.Vector3(x,0,z); }
function clearMissionMarker(){ if(missionMarker){ scene.remove(missionMarker); missionMarker=null; } missionTarget=null; }
const MISSIONS={
  1:{ title:'MISSION 1 — COMING HOME', steps:[
    { text:'Temui Marco di Velmora Bar (−30, −14).', target:[-30,-14],
      dlg:['MARCO','Kai. Lima tahun. Kupikir kau mati di luar sana.','Keluarga Voss menguasai pelabuhan sekarang. Utang kakakmu… mereka yang menagih.','Kerja pertama: ambil paket di dermaga timur, antar ke bengkel Auto Fix. Jangan buat keributan.'] },
    { text:'Ambil paket di dermaga timur (78, −58).', target:[78,-58] },
    { text:'Antar paket ke Auto Fix (−52, −14). Tekan E di marker.', target:[-52,-14], deliver:true },
  ], reward:250, end:'Marco mengangguk. "Bagus. Kau masih ingat cara kerja jalanan."'},
  2:{ title:'MISSION 2 — HOT WHEELS', steps:[
    { text:'Curi mobil sport merah di showroom (48, 26). Tekan E di dekatnya.', target:[48,26], steal:true },
    { text:'Bawa mobil itu ke Auto Fix (−52, −14). Polisi akan mengejarmu — kabur!', target:[-52,-14], deliver:true, wanted:2 },
  ], reward:400, end:'"Mobil Voss, di tangan kita. Mereka akan marah besar." — Marco'},
  3:{ title:'MISSION 3 — DOCK WAR', steps:[
    { text:'Ke dermaga (78, −58). Habisi 5 anak buah Voss.', target:[78,-58], fight:true },
    { text:'Kabur ke safehouse di pemukiman (−70, 70).', target:[-70,70], deliver:true },
  ], reward:700, end:'Pelabuhan kembali bernapas. Velmora mengingat namamu.'},
};
let missionKills=0;
function startMission(n){
  closeDialogue();
  S.mission=n; S.missionStep=0; S.missionActive=true; missionKills=0;
  const M=MISSIONS[n]; banner(M.title,'Selesaikan objektif — ikuti marker kuning'); AudioSys.mission();
  setStep(0);
}
function setStep(i){
  const M=MISSIONS[S.mission]; if(!M) return;
  S.missionStep=i; const st=M.steps[i];
  setObjective(M.title, st.text);
  setMissionMarker(st.target[0], st.target[1]);
  if(st.dlg) showDialogue(st.dlg[0], st.dlg.slice(1)); else closeDialogue();
  if(st.wanted){ S.wanted=Math.max(S.wanted, st.wanted); }
  if(st.fight){ spawnRivalsForMission(); }
}
function spawnRivalsForMission(){
  rivals.forEach(r=>{ scene.remove(r.mesh); }); rivals.length=0;
  const spots=[[74,-52],[82,-64],[70,-66],[86,-52],[78,-72]];
  spots.forEach(([x,z])=>spawnRival(x,z));
  toast('🔫 5 anak buah Voss menjaga dermaga!'); }
function missionStepDone(){
  const M=MISSIONS[S.mission]; const next=S.missionStep+1;
  if(next>=M.steps.length){ completeMission(); }
  else { AudioSys.pickup(); setStep(next); }
}
function completeMission(){
  const M=MISSIONS[S.mission]; S.money+=M.reward; S.rep+=15;
  banner('MISSION COMPLETE', `+$${M.reward} · ${M.end}`, 3800);
  toast(`💵 Mission selesai! +$${M.reward}`); AudioSys.mission();
  clearMissionMarker(); S.missionActive=false;
  const done=S.mission; S.mission=done+1; saveGame(); // save the NEXT mission, not the one just finished
  if(done>=3){ S.mission=4; setTimeout(()=>{ if(S.mode==='play') showEnd(true,'STREET LEGEND','Velmora mengingat namamu, Kai.'); },4000);
    setObjective('STREET LEGEND','Semua misi selesai. Velmora milikmu — free roam, cari uang, dan jaga reputasimu.'); return; }
  setObjective('MISSION BERIKUTNYA', `Misi ${done+1} siap — berjalanlah ke marker berikutnya. Tekan E di marker untuk mulai.`);
  setTimeout(()=>{ if(S.mode==='play'&&!S.missionActive) startMission(S.mission); }, 5000);
}
function failMission(reason){
  if(!S.missionActive) return;
  banner('MISSION FAILED', reason, 3000); AudioSys.fail(); S.missionActive=false; clearMissionMarker();
  setObjective('MISSION GAGAL', 'Tekan E di marker awal untuk mengulang misi.');
  const M=MISSIONS[S.mission]; setMissionMarker(M.steps[0].target[0], M.steps[0].target[1], 0xff4d3d);
}
function atMarker(dist=3.2){ return missionTarget && player.pos.distanceTo(missionTarget)<dist; }
function wasted(){ if(S.dead) return; S.dead=true; S.mode='over';
  const lost=Math.min(S.money,200); S.money-=lost;
  if(S.missionActive) failMission('Kau tumbang di tengah misi.');
  showEnd(false,'WASTED',`Kau tumbang di jalanan Velmora. Kehilangan $${lost}.`); AudioSys.fail(); }
function busted(){ if(S.dead) return; S.dead=true; S.mode='over';
  const lost=Math.min(S.money,150); S.money-=lost; S.wanted=0;
  if(S.missionActive) failMission('Polisi menangkapmu di tengah misi.');
  showEnd(false,'BUSTED',`Velmora PD menangkapmu. Denda $${lost}.`); AudioSys.fail(); }
function showEnd(win,title,sub){
  $('endTitle').textContent=title; $('endSub').textContent=sub;
  $('endText').textContent=`Uang: $${S.money} · Reputasi: ${S.rep} · Mobil dicuri: ${S.carsStolen} · Musuh dihabisi: ${S.kills}`;
  $('endScreen').style.display='flex';
}
function respawn(){
  S.dead=false; S.health=100; S.wanted=0; S.mode='play';
  player.pos.set(0,0,60); player.yaw=Math.PI; player.mesh.position.copy(player.pos);
  player.inCar=null; policeCars.forEach(c=>{ scene.remove(c.mesh); }); policeCars.length=0;
  footCops.forEach(c=>{ scene.remove(c.mesh); }); footCops.length=0;
  $('endScreen').style.display='none'; $('menu').style.display='none';
  if(S.missionActive){ const M=MISSIONS[S.mission]; setStep(S.missionStep); }
  else if(S.mission>0&&S.mission<4&&!S.missionActive){ /* retry prompt marker stays */ }
  updateHUD();
}
$('btnRetry').addEventListener('click',()=>{ AudioSys.init(); respawn(); });
$('btnRoam').addEventListener('click',()=>{ AudioSys.init(); S.missionActive=false; S.mission=0; clearMissionMarker(); respawn();
  setObjective('FREE ROAM','Explore Velmora. Steal a car with E, cause trouble — and watch the stars.'); });
function pauseGame(p){ if(p){ S.mode='paused'; toast('⏸ Jeda — tekan P untuk lanjut'); }
  else { S.mode='play'; toast('▶ Lanjut'); } }

// ---------- combat ----------
const raycaster=new THREE.Raycaster();
function doShoot(){
  if(S.mode!=='play'||player.inCar||dialogueOpen) return;
  if(S.reloading) return;
  if(S.ammo<=0){ startReload(); return; }
  S.ammo--; S.shotsFired++; AudioSys.shoot(); S.trauma=Math.min(1,S.trauma+0.12);
  const from=camera.position.clone();
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  raycaster.set(from,dir); raycaster.far=80;
  const targets=[...rivals.filter(r=>!r.dead).map(r=>r.mesh),
    ...footCops.map(c=>c.mesh), ...peds.map(p=>p.mesh)];
  const hits=raycaster.intersectObjects(targets,true);
  const end=hits.length?hits[0].point.clone():from.clone().add(dir.multiplyScalar(60));
  tracer(from.clone().add(dir.clone().multiplyScalar(1.2)), end);
  if(hits.length){ const obj=hits[0].object; let owner=null;
    owner=rivals.find(r=>r.mesh===obj||r.mesh.children.includes(obj))||
      footCops.find(c=>c.mesh===obj||c.mesh.children.includes(obj))||
      peds.find(p=>p.mesh===obj||p.mesh.children.includes(obj));
    burst(end,0xff5040,8,2);
    if(owner){ hitCharacter(owner,34); } }
  // gunfire is loud: nearby peds flee, wanted if police near
  peds.forEach(p=>{ if(p.pos.distanceTo(player.pos)<25) fleePed(p); });
  addWanted(1,'Tembakan di jalanan');
}
function hitCharacter(ch, dmg){
  ch.health-=dmg; burst(ch.pos.clone().add(new THREE.Vector3(0,1.3,0)),0xff2020,10,2.5);
  if(ch.health<=0){ killCharacter(ch); }
  else if(ch.state!==undefined){ ch.state='flee'; ch.fleeT=3; }
}
function killCharacter(ch){
  if(ch.dead) return; ch.dead=true; S.kills++;
  S.hitStop=0.09; S.trauma=Math.min(1,S.trauma+0.4); AudioSys.tone(90,0.2,'sawtooth',0.3,-60);
  const isRival=rivals.includes(ch);
  if(isRival){ missionKills++; burst(ch.pos.clone().add(new THREE.Vector3(0,1,0)),0xff2020,22,4);
    toast(`💀 Rival dihabisi (${missionKills}/5)`);
    ch.mesh.rotation.x=-Math.PI/2; ch.mesh.position.y=0.3;
    if(missionKills>=5 && S.mission===3 && S.missionStep===0){ setTimeout(()=>missionStepDone(),600); } }
  else if(footCops.includes(ch)){ addWanted(2,'Polisi gugur'); ch.mesh.rotation.x=-Math.PI/2; ch.mesh.position.y=0.3; }
  else { addWanted(2,'Warga sipil jadi korban'); ch.mesh.rotation.x=-Math.PI/2; ch.mesh.position.y=0.3;
    setTimeout(()=>{ scene.remove(ch.mesh); const i=peds.indexOf(ch); if(i>=0) peds.splice(i,1); }, 4000); }
}
function doPunch(){
  if(S.mode!=='play'||player.inCar||dialogueOpen) return;
  AudioSys.punch(); S.trauma=Math.min(1,S.trauma+0.08);
  const fwd=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
  for(const p of [...peds, ...footCops, ...rivals.filter(r=>!r.dead)]){
    const d=p.pos.clone().sub(player.pos); d.y=0;
    if(d.length()<2.6 && (d.length()<1.2 || d.normalize().dot(fwd)>0.3)){
      p.pos.add(fwd.clone().multiplyScalar(1.2)); hitCharacter(p,25);
      addWanted(1,'Pemukulan di jalanan'); break; } }
}
function startReload(){ if(S.reloading||S.ammo===S.magSize) return; S.reloading=true; S.reloadT=1.1;
  setTimeout(()=>{ S.ammo=S.magSize; S.reloading=false; },1100); }
function fleePed(p){ p.state='flee'; p.fleeT=rand(2,4); }

// ---------- driving / interact ----------
function nearestCar(maxD=4){
  let best=null, bd=maxD;
  for(const c of cars){ if(c===player.inCar) continue;
    const d=c.pos.distanceTo(player.pos); if(d<bd){ bd=d; best=c; } }
  return best;
}
function onInteract(){
  if(S.mode!=='play') return;
  if(dialogueOpen){ advanceDlg(); return; }
  if(player.inCar){ exitCar(); return; }
  // mission marker interaction
  if(atMarker(3.5)){
    const M=MISSIONS[S.mission];
    if(!S.missionActive && S.mission>=1 && S.mission<=3 && M){ startMission(S.mission); return; }
    if(S.missionActive){ const st=M.steps[S.missionStep];
      if(st&&st.deliver){ missionStepDone(); return; } }
  }
  const c=nearestCar(4);
  if(c){ enterCar(c); return; }
}
function enterCar(c){
  if(c.police){ toast('🚔 Itu mobil polisi — terlalu berisiko!'); return; }
  if(c.traffic){ c.traffic=false; c.parked=false; addWanted(1,'Mobil dicuri dari pengemudi'); }
  else if(c.parked && !c.stolen){ c.stolen=true; c.parked=false; S.carsStolen++;
    addWanted(1,'Mobil dicuri'); toast('🚗 Mobil dicuri! Polisi waspada.'); }
  if(c.isTarget && S.mission===2 && S.missionActive && S.missionStep===0) missionStepDone();
  player.inCar=c; c.speed=0; player.mesh.visible=false;
  toast(`🚗 Mengemudi — W/S gas & rem, A/D belok, E keluar`);
  AudioSys.tone(220,0.15,'sawtooth',0.2,110);
}
function exitCar(){
  const c=player.inCar; if(!c) return;
  player.inCar=null; player.mesh.visible=true;
  const side=new THREE.Vector3(Math.cos(c.yaw),0,-Math.sin(c.yaw));
  player.pos.copy(c.pos).add(side.multiplyScalar(2.4)); player.pos.y=0;
  player.mesh.position.copy(player.pos); player.yaw=c.yaw;
  collideCircle(player.pos,0.6);
}
function payNSprayCheck(){
  // Auto Fix garage at (-52,-14): drive in, $50 clears wanted
  if(player.inCar && Math.abs(player.inCar.pos.x+52)<6 && Math.abs(player.inCar.pos.z+14)<6 && S.wanted>0){
    if(S.money>=50 && !payNSprayCheck.cd){ payNSprayCheck.cd=true; setTimeout(()=>payNSprayCheck.cd=false,5000);
      S.money-=50; S.wanted=0; policeCars.forEach(pc=>{ scene.remove(pc.mesh); }); policeCars.length=0;
      footCops.forEach(fc=>{ scene.remove(fc.mesh); }); footCops.length=0;
      banner('PAY \'N SPRAY','Cat baru, plat baru — wanted bersih. −$50'); AudioSys.pickup(); }
    else if(S.money<50){ toast('🛠 Pay \'n Spray butuh $50 untuk membersihkan wanted.'); }
  }
}

// ---------- per-frame updates ----------
const tmpV=new THREE.Vector3();
function updatePlayer(dt){
  camYaw.yaw-=mouseDX*0.0032; camYaw.pitch=clamp(camYaw.pitch+mouseDY*0.0022,0.05,1.1);
  mouseDX=0; mouseDY=0;
  // Dialogue shows over the game but never freezes movement (GTA-style).
  const sprint=keys['ShiftLeft']||keys['ShiftRight'];
  const sp=sprint?7.5:4.4;
  let mx=0,mz=0;
  if(keys['KeyW']||keys['ArrowUp']) mz+=1; if(keys['KeyS']||keys['ArrowDown']) mz-=1;
  if(keys['KeyA']||keys['ArrowLeft']) mx-=1; if(keys['KeyD']||keys['ArrowRight']) mx+=1;
  const moving=(mx||mz);
  if(moving){
    const len=Math.hypot(mx,mz); mx/=len; mz/=len;
    // move relative to where the camera looks (projected on the ground)
    const fwd=new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    const right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0));
    const move=fwd.clone().multiplyScalar(mz).add(right.multiplyScalar(mx)).normalize();
    player.pos.add(move.multiplyScalar(sp*dt));
    player.yaw=Math.atan2(move.x,move.z);
    player.speed=sp;
    collideCircle(player.pos,0.55);
    animateWalk(player.mesh,sp,dt);
  } else { player.speed=0; animateWalk(player.mesh,0,dt); }
  // jump
  if(keys['Space']&&player.onGround){ player.vy=6.5; player.onGround=false; }
  if(!player.onGround){ player.vy-=18*dt; player.pos.y+=player.vy*dt;
    if(player.pos.y<=0){ player.pos.y=0; player.onGround=true; player.vy=0; } }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y=player.yaw;
  // pickups
  for(const pk of pickups){ if(pk.taken) continue;
    pk.bob+=dt; pk.mesh.position.y=0.7+Math.sin(pk.bob*2)*0.15; pk.mesh.rotation.y+=dt;
    if(player.pos.distanceTo(pk.pos)<1.6){ pk.taken=true; pk.mesh.visible=false;
      if(pk.kind==='cash') addMoney(25,'di jalanan');
      else { S.health=Math.min(100,S.health+40); toast('❤️ +40 HP'); AudioSys.pickup(); } } }
  // mission step triggers (walk-in)
  if(S.missionActive){ const st=MISSIONS[S.mission].steps[S.missionStep];
    if(st&&!st.deliver&&atMarker(3.5)){ if(st.steal){ /* wait for E on car */ } else missionStepDone(); } }
}
function updateCar(dt){
  const c=player.inCar; if(!c) return;
  const fwd=(keys['KeyW']||keys['ArrowUp'])?1:0, back=(keys['KeyS']||keys['ArrowDown'])?1:0;
  const left=(keys['KeyA']||keys['ArrowLeft'])?1:0, right=(keys['KeyD']||keys['ArrowRight'])?1:0;
  const maxF=26, maxR=10;
  if(fwd) c.speed+=22*dt; else if(back) c.speed-=c.speed>0.5?30*dt:14*dt;
  else c.speed-=Math.sign(c.speed)*8*dt;
  if(Math.abs(c.speed)<0.2&&!fwd&&!back) c.speed=0;
  c.speed=clamp(c.speed,-maxR,maxF);
  const steerInput=(left?1:0)-(right?1:0);
  const steerTarget=steerInput*0.55*(c.speed>=0?1:-1)*clamp(Math.abs(c.speed)/8,0.25,1);
  c.steer=lerp(c.steer,steerTarget,1-Math.pow(0.001,dt));
  c.yaw+=c.steer*(c.speed/maxF)*dt*2.2;
  const nx=c.pos.x+Math.sin(c.yaw)*c.speed*dt, nz=c.pos.z+Math.cos(c.yaw)*c.speed*dt;
  const before=c.pos.clone(); c.pos.x=nx; c.pos.z=nz;
  if(collideCircle(c.pos,1.9)){ c.speed*=0.45; S.trauma=Math.min(1,S.trauma+0.15);
    if(Math.abs(c.speed)>8) AudioSys.noise(0.15,0.4); }
  // car vs car
  for(const o of cars){ if(o===c) continue; const d=o.pos.distanceTo(c.pos);
    if(d<3.6&&d>0.01){ const push=(3.6-d)/2; const dir=c.pos.clone().sub(o.pos).normalize();
      c.pos.add(dir.clone().multiplyScalar(push)); if(!o.police) o.pos.add(dir.clone().multiplyScalar(-push));
      if(Math.abs(c.speed)>6){ c.speed*=0.7; S.trauma=Math.min(1,S.trauma+0.2); AudioSys.noise(0.1,0.3); } } }
  // run over peds (crime!)
  for(const p of peds){ if(p.pos.distanceTo(c.pos)<2.2&&Math.abs(c.speed)>4){
      hitCharacter(p,100); addWanted(2,'PeDESTRIAN tertabrak'); } }
  c.mesh.rotation.y=c.yaw;
  const wheelSpin=c.speed*dt*1.6;
  c.mesh.userData.wheels.forEach((w,i)=>{ w.rotation.x+=wheelSpin; });
  c.mesh.userData.wheels[0].rotation.y=c.steer*0.5; c.mesh.userData.wheels[1].rotation.y=c.steer*0.5;
  player.pos.copy(c.pos); player.yaw=c.yaw;
  // headlights at night
  if(Math.abs(c.speed)>20) camera.fov=lerp(camera.fov,68,dt*2); else camera.fov=lerp(camera.fov,62,dt*2);
  camera.updateProjectionMatrix();
  payNSprayCheck();
}
function updateTraffic(dt){
  for(const c of cars){
    if(!c.traffic) continue;
    // slow for player car ahead
    let slow=false;
    if(player.inCar){ const d=c.pos.distanceTo(player.inCar.pos); if(d<9) slow=true; }
    const target=slow?0:c.cruise;
    c.speed=lerp(c.speed,target,dt*1.5);
    // move along axis; at intersections sometimes turn
    if(c.axis==='x'){ c.pos.x+=c.dir*c.speed*dt; c.yaw=Math.PI/2*c.dir; }
    else { c.pos.z+=c.dir*c.speed*dt; c.yaw=c.dir>0?0:Math.PI; }
    if(Math.abs(c.pos.x)>98||Math.abs(c.pos.z)>98){ c.dir*=-1; }
    if(rng()<dt*0.06){ // random turn at intersection
      if(c.axis==='x'&&ROADS.some(r=>Math.abs(c.pos.x-r)<2)){ c.axis='z'; c.dir=rng()<0.5?1:-1;
        c.pos.x=Math.round(c.pos.x/20)*20; }
      else if(c.axis==='z'&&ROADS.some(r=>Math.abs(c.pos.z-r)<2)){ c.axis='x'; c.dir=rng()<0.5?1:-1;
        c.pos.z=Math.round(c.pos.z/20)*20; } }
    c.mesh.rotation.y=c.yaw;
    c.mesh.userData.wheels.forEach(w=>{ w.rotation.x+=c.speed*dt*1.6; });
  }
}
function updatePeds(dt){
  for(const p of peds){
    if(p.dead) continue;
    if(p.state==='flee'){ p.fleeT-=dt;
      const away=p.pos.clone().sub(player.pos).setY(0).normalize();
      p.pos.add(away.multiplyScalar(5.5*dt)); p.yaw=Math.atan2(away.x,away.z);
      collideCircle(p.pos,0.5); animateWalk(p.mesh,5.5,dt);
      if(p.fleeT<=0) p.state='walk'; }
    else {
      const d=p.target.distanceTo(p.pos);
      if(d<1){ // new sidewalk target
        let x,z,t=0; do{ x=rand(-95,95); z=rand(-95,95); t++; }
        while((isRoad(x,z)||pointInCollider(x,z,1))&&t<20); p.target.set(x,0,z); }
      const dir=p.target.clone().sub(p.pos).setY(0).normalize();
      p.pos.add(dir.multiplyScalar(p.speed*dt)); p.yaw=Math.atan2(dir.x,dir.z);
      collideCircle(p.pos,0.5); animateWalk(p.mesh,p.speed,dt); }
    p.mesh.position.copy(p.pos); p.mesh.rotation.y=p.yaw;
  }
}
function updatePolice(dt){
  // spawn / despawn to match wanted
  const want=S.wanted>=4?3:S.wanted>=2?2:S.wanted>=1?1:0;
  while(policeCars.length<want) spawnPolice();
  while(policeCars.length>want){ const c=policeCars.pop(); scene.remove(c.mesh);
    const i=cars.indexOf(c); if(i>=0) cars.splice(i,1); }
  // foot cops when player on foot and wanted >=2
  if(S.wanted>=2&&!player.inCar&&footCops.length<2&&rng()<dt*0.5) spawnFootCop();
  if(S.wanted===0){ footCops.forEach(c=>scene.remove(c.mesh)); footCops.length=0; }
  const now=performance.now();
  for(const c of policeCars){
    if(c.dead) continue;
    const toPlayer=player.pos.clone().sub(c.pos); toPlayer.y=0;
    const dist=toPlayer.length();
    const targetYaw=Math.atan2(toPlayer.x,toPlayer.z);
    let dy=targetYaw-c.yaw; while(dy>Math.PI) dy-=Math.PI*2; while(dy<-Math.PI) dy+=Math.PI*2;
    c.yaw+=clamp(dy,-1.6*dt,1.6*dt);
    const spd=dist>30?30:dist>12?24:14;
    c.speed=lerp(c.speed,spd,dt);
    c.pos.x+=Math.sin(c.yaw)*c.speed*dt; c.pos.z+=Math.cos(c.yaw)*c.speed*dt;
    if(collideCircle(c.pos,1.9)) c.speed*=0.6;
    c.mesh.rotation.y=c.yaw;
    c.mesh.userData.wheels.forEach(w=>{ w.rotation.x+=c.speed*dt*1.6; });
    if(c.mesh.userData.lightbar){ const on=Math.floor(now/250)%2===0;
      c.mesh.userData.lightbar.r.material.emissiveIntensity=on?2.5:0.2;
      c.mesh.userData.lightbar.b.material.emissiveIntensity=on?0.2:2.5; }
    // ram player car / catch player on foot
    if(dist<3.2){
      if(player.inCar){ player.inCar.speed*=0.92; S.trauma=Math.min(1,S.trauma+0.25);
        if(rng()<dt*0.5) AudioSys.noise(0.12,0.35); }
      else { c.bustT=(c.bustT||0)+dt; if(c.bustT>1.2) busted(); }
    } else c.bustT=0;
    // police shoot if player on foot and close
    if(!player.inCar&&dist<18&&rng()<dt*0.4){ tracer(c.pos.clone().add(new THREE.Vector3(0,1.4,0)),
        player.pos.clone().add(new THREE.Vector3(0,1.2,0)));
      if(rng()<0.35) damagePlayer(6,'police'); }
  }
  for(const c of footCops){
    if(c.dead) continue;
    const toPlayer=player.pos.clone().sub(c.pos); toPlayer.y=0; const dist=toPlayer.length();
    const dir=toPlayer.normalize();
    c.pos.add(dir.multiplyScalar(c.speed*dt)); c.yaw=Math.atan2(dir.x,dir.z);
    collideCircle(c.pos,0.5); animateWalk(c.mesh,c.speed,dt);
    c.mesh.position.copy(c.pos); c.mesh.rotation.y=c.yaw;
    c.shootT-=dt;
    if(dist<16&&c.shootT<=0){ c.shootT=rand(1.2,2);
      tracer(c.pos.clone().add(new THREE.Vector3(0,1.4,0)), player.pos.clone().add(new THREE.Vector3(0,1.2,0)));
      AudioSys.noise(0.1,0.25); if(rng()<0.3) damagePlayer(5,'police'); }
    if(dist<1.8){ c.bustT=(c.bustT||0)+dt; if(c.bustT>1.2) busted(); } else c.bustT=0;
  }
  // wanted decay: hidden = no police within 25m and no crime recently
  if(S.wanted>0){ S.crimeCooldown=Math.max(0,S.crimeCooldown-dt);
    const nearPolice=policeCars.some(c=>c.pos.distanceTo(player.pos)<25)||footCops.some(c=>c.pos.distanceTo(player.pos)<25);
    if(!nearPolice&&S.crimeCooldown<=0){ S.wantedTimer+=dt;
      if(S.wantedTimer>10){ S.wanted--; S.wantedTimer=0; toast(S.wanted>0?`⭐ Wanted turun ke ${S.wanted}`:'⭐ Wanted bersih — kau lolos.'); } }
    else S.wantedTimer=0; }
}
function updateRivals(dt){
  for(const r of rivals){
    if(r.dead) continue;
    const toPlayer=player.pos.clone().sub(r.pos); toPlayer.y=0; const dist=toPlayer.length();
    if(dist<30){ r.state='attack';
      const dir=toPlayer.normalize();
      if(dist>8) r.pos.add(dir.multiplyScalar(3.2*dt));
      r.yaw=Math.atan2(dir.x,dir.z); animateWalk(r.mesh,3.2,dt);
      r.shootT-=dt;
      if(dist<26&&r.shootT<=0){ r.shootT=rand(1.4,2.4);
        tracer(r.pos.clone().add(new THREE.Vector3(0,1.4,0)), player.pos.clone().add(new THREE.Vector3(0,1.2,0)));
        AudioSys.noise(0.1,0.25); if(rng()<0.25) damagePlayer(7,'rival'); } }
    else { r.state='guard'; animateWalk(r.mesh,0,dt); }
    r.mesh.position.copy(r.pos); r.mesh.rotation.y=r.yaw;
  }
}
function updateDayNight(dt){
  S.time+=dt*(24/S.dayLength); if(S.time>=24) S.time-=24;
  const t=S.time; // 6-18 day, else night-ish
  const dayF=clamp(Math.sin((t-6)/12*Math.PI),0,1);
  const golden=clamp(1-Math.abs(t-17.5)/2.4,0,1); // golden hour ~15:30-19:30
  const skyDay=new THREE.Color(0x8fc0e8), skyGold=new THREE.Color(0xf0a35e), skyNight=new THREE.Color(0x0d1428);
  const sky=skyNight.clone().lerp(skyDay,Math.max(dayF,0.28)).lerp(skyGold,golden*0.5);
  if(S.night){
    sun.intensity=0.12; moon.intensity=0.75; hemi.intensity=0.42; amb.intensity=0.5;
    scene.background.setHex(0x0b1026); scene.fog.color.setHex(0x0b1026);
    scene.fog.near=50; scene.fog.far=200;
    renderer.toneMappingExposure=1.0;
    sunDisc.visible=false; stars.material.opacity=0.9;
  } else {
    // sun stays high enough that facades never go black; warm at golden hour
    sun.color.copy(new THREE.Color(0xfff3d6).lerp(new THREE.Color(0xff9a3c),golden*0.85));
    sun.intensity=lerp(1.1,2.6,dayF); moon.intensity=0;
    hemi.intensity=lerp(0.62,0.95,dayF); amb.intensity=lerp(0.62,0.85,dayF);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    scene.fog.near=golden>0.5?60:80; scene.fog.far=golden>0.5?210:260;
    const sunA=(t/24)*Math.PI*2;
    sun.position.set(Math.cos(sunA)*80, Math.max(38, 45+Math.sin(sunA)*55), 40);
    renderer.toneMappingExposure=1.12;
    // sun disc follows the sun; stars fade in only as it gets truly dark
    sunDisc.visible=dayF>0.04;
    sunDisc.position.copy(sun.position).normalize().multiplyScalar(380);
    sunDisc.material.color.copy(sun.color);
    sunDisc.lookAt(camera.position);
    stars.material.opacity=dayF<0.15?0.5:0;
  }
  // lit windows glow as daylight fades; lamps + headlight beams switch on with them
  const glow=S.night||dayF<0.35;
  const winGlow=S.night?0.55:dayF<0.35?0.4:0.06;
  for(const m of buildingMats) m.emissiveIntensity=winGlow;
  lamps.forEach(l=>{ l.material.emissiveIntensity=glow?1.8:0.15; });
  for(const c of cars) if(c.mesh.userData.beam) c.mesh.userData.beam.visible=glow;
  roofLights.forEach(m=>{ m.emissiveIntensity=(Math.floor(performance.now()/600)%2===0)?2.2:0.3; });
  for(const c of clouds){ c.position.x+=dt*1.5; if(c.position.x>145) c.position.x=-145; }
}
function updateCamera(dt){
  let target, look;
  if(player.inCar){ const c=player.inCar;
    const back=new THREE.Vector3(-Math.sin(c.yaw),0,-Math.cos(c.yaw));
    target=c.pos.clone().add(back.multiplyScalar(9)).add(new THREE.Vector3(0,4.2,0));
    look=c.pos.clone().add(new THREE.Vector3(Math.sin(c.yaw),0,Math.cos(c.yaw)).multiplyScalar(6)).add(new THREE.Vector3(0,1.5,0));
    // allow mouse orbit offset while driving
    const ox=Math.sin(camYaw.yaw-c.yaw)*0; }
  else { const yaw=camYaw.yaw;
    target=player.pos.clone().add(new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)).multiplyScalar(camYaw.dist))
      .add(new THREE.Vector3(0,2.2+camYaw.pitch*3,0));
    look=player.pos.clone().add(new THREE.Vector3(0,1.6,0)); }
  // keep camera out of buildings (simple: raise if inside collider)
  if(pointInCollider(target.x,target.z,0.5)) target.y+=3;
  camera.position.lerp(target,1-Math.pow(0.0001,dt));
  if(S.trauma>0){ S.trauma=Math.max(0,S.trauma-dt*1.4);
    camera.position.x+=rand(-1,1)*S.trauma*0.25; camera.position.y+=rand(-1,1)*S.trauma*0.25; }
  camera.lookAt(look);
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=dt;
    if(p.life<=0){ scene.remove(p.mesh); particles.splice(i,1); continue; }
    p.vel.y-=9*dt; p.mesh.position.add(p.vel.clone().multiplyScalar(dt)); p.mesh.scale.setScalar(Math.max(0.2,p.life*2)); }
  for(let i=tracers.length-1;i>=0;i--){ const t=tracers[i]; t.life-=dt;
    if(t.life<=0){ scene.remove(t.line); tracers.splice(i,1); } }
  if(missionMarker){ missionMarker.rotation.y+=dt*0.8;
    missionMarker.children[0].scale.setScalar(1+Math.sin(performance.now()/300)*0.08); }
}
// ---------- minimap ----------
const mm=$('minimap').getContext('2d');
function drawMinimap(){
  const W=190, sc=W/(WORLD*2+20);
  mm.fillStyle='#10131c'; mm.fillRect(0,0,W,W);
  mm.fillStyle='#2c313c';
  for(const r of ROADS){ mm.fillRect(0,(r+WORLD+10)*sc,W,9.2*sc); mm.fillRect((r+WORLD+10)*sc,0,9.2*sc,W); }
  mm.fillStyle='#4a4438';
  for(const c of colliders){ mm.fillRect((c.minX+WORLD+10)*sc,(c.minZ+WORLD+10)*sc,
    (c.maxX-c.minX)*sc,(c.maxZ-c.minZ)*sc); }
  mm.fillStyle='#1d4e63'; mm.fillRect((118+WORLD+10)*sc,( -105+WORLD+10)*sc,60*sc,90*sc);
  const dot=(x,z,color,r=3)=>{ mm.fillStyle=color; mm.beginPath();
    mm.arc((x+WORLD+10)*sc,(z+WORLD+10)*sc,r,0,7); mm.fill(); };
  for(const pk of pickups) if(!pk.taken) dot(pk.pos.x,pk.pos.z,'#7be495',2);
  for(const c of cars) if(c.traffic) dot(c.pos.x,c.pos.z,'#c8c8c8',2);
  for(const c of policeCars) dot(c.pos.x,c.pos.z,'#3fa9ff',3.5);
  for(const r of rivals) if(!r.dead) dot(r.pos.x,r.pos.z,'#ff4d3d',3);
  if(missionTarget) dot(missionTarget.x,missionTarget.z,'#ffb02e',5);
  // player arrow
  const px=(player.pos.x+WORLD+10)*sc, pz=(player.pos.z+WORLD+10)*sc;
  mm.save(); mm.translate(px,pz); mm.rotate(Math.PI-player.yaw); mm.fillStyle='#fff';
  mm.beginPath(); mm.moveTo(0,-6); mm.lineTo(4,5); mm.lineTo(-4,5); mm.closePath(); mm.fill(); mm.restore();
  if(missionTarget){ const d=Math.round(player.pos.distanceTo(missionTarget));
    $('objDist').textContent=`📍 ${d}m ke objektif`; }
  else $('objDist').textContent='';
}

// ---------- main loop ----------
let lastT=performance.now(), acc=0, fpsCount=0, fpsT=performance.now(), fps=0;
function frame(now){
  requestAnimationFrame(frame);
  let dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
  if(S.hitStop>0){ S.hitStop-=dt; dt*=0.25; }
  if(S.mode==='play'){
    updateDayNight(dt);
    if(player.inCar) updateCar(dt); else updatePlayer(dt);
    updateTraffic(dt); updatePeds(dt); updatePolice(dt); updateRivals(dt);
    updateParticles(dt);
    if(S.health<100&&now-S.lastDamage>8000) S.health=Math.min(100,S.health+2*dt);
    if(S.reloading){ S.reloadT-=dt; if(S.reloadT<=0){ S.ammo=S.magSize; S.reloading=false; } }
    updateHUD(); drawMinimap();
    fpsCount++; if(now-fpsT>1000){ fps=fpsCount; fpsCount=0; fpsT=now; $('fps').textContent=`${fps} fps · ${renderer.info.render.triangles} tris`; }
  }
  if(S.mode!=='menu') updateCamera(S.mode==='play'?dt:0.016);
  renderer.render(scene,camera);
}

// ---------- menu / start ----------
function startGame(story=true){
  AudioSys.init();
  $('menu').style.display='none'; $('endScreen').style.display='none';
  S.mode='play'; S.dead=false;
  if(story){ if(S.mission===0) startMission(1);
    else if(!S.missionActive&&S.mission<4) startMission(S.mission); }
  else { S.mission=0; S.missionActive=false; clearMissionMarker();
    setObjective('FREE ROAM','Explore Velmora. Steal a car with E, cause trouble — and watch the stars.'); }
  if(story&&S.mission>=4) setObjective('STREET LEGEND','Semua misi selesai. Velmora milikmu.');
  const storyToast=S.mission>=1&&S.mission<=3?`🎬 STREET LEGACY — ${MISSIONS[S.mission].title}`:'🏆 STREET LEGEND — Velmora milikmu';
  toast(story?storyToast:'🌆 Free roam — Velmora milikmu');
  updateHUD();
}
$('btnStart').addEventListener('click',()=>startGame(true));
$('btnFree').addEventListener('click',()=>startGame(false));
$('btnContinue').addEventListener('click',()=>{ if(!S.save) return;
  S.money=S.save.money??120; S.rep=S.save.rep??0; S.mission=S.save.mission??1;
  startGame(true);
  if(typeof S.save.x==='number'&&typeof S.save.z==='number'){
    player.pos.set(S.save.x,0,S.save.z); player.mesh.position.copy(player.pos); }
  toast('💾 Save dimuat — lanjutkan ceritamu'); });

// ---------- shot mode (deterministic captures for the dossier) ----------
function setupShot(){
  $('menu').style.display='none'; $('loading').style.display='none';
  S.mode='play'; S.time=16.8; // golden hour: bright, warm, readable
  if(SHOT==='start'){ S.mode='menu'; $('menu').style.display='flex';
    player.pos.set(10,0,40); player.mesh.position.copy(player.pos); }
  else if(SHOT==='play'){
    // staged action: speeding up the avenue (road x=10) with wanted 2, police in pursuit
    // (spawned clear of the parked car at (8,-54) so the staged car keeps rolling)
    const car=spawnCar(10,-75,0,0xc23b2e,{});
    player.pos.copy(car.pos); enterCar(car);
    player.inCar.speed=16; player.inCar.yaw=0;
    S.wanted=2; S.money=685; S.rep=25; S.health=82;
    spawnPolice(); spawnPolice();
    if(policeCars[0]){ policeCars[0].pos.set(10,0,-37); policeCars[0].yaw=Math.PI; policeCars[0].speed=18; }
    if(policeCars[1]){ policeCars[1].pos.set(14,0,-95); policeCars[1].yaw=0; policeCars[1].speed=20; }
    setObjective('MISSION 2 — HOT WHEELS','Bawa mobil itu ke Auto Fix (−52, −14). Polisi akan mengejarmu — kabur!');
    setMissionMarker(-52,-14);
    camYaw.yaw=Math.PI;
  }
  else if(SHOT==='fight'){
    // staged action: Mission 3 shootout at the east docks, at dusk, on foot —
    // Kai on road x=50 facing 5 live Voss rivals advancing from the container yard
    S.time=17.6; // dusk: low warm sun, lamps already glowing, rivals readable
    S.mission=3; S.missionStep=0; S.missionActive=true; missionKills=0;
    S.wanted=3; S.money=820; S.rep=38; S.health=94; S.ammo=9;
    player.pos.set(50,0,-58); player.yaw=Math.PI/2;
    player.mesh.position.copy(player.pos); player.mesh.rotation.y=Math.PI/2;
    spawnRival(58,-66); spawnRival(61,-50); spawnRival(57,-58);
    spawnRival(63,-68); spawnRival(59,-44);
    setObjective('MISSION 3 — DOCK WAR','Ke dermaga (78, −58). Habisi 5 anak buah Voss.');
    setMissionMarker(78,-58);
    camYaw.yaw=-Math.PI/2; // camera west of Kai, looking east at the rivals + warehouse
    camYaw.dist=5.5; camYaw.pitch=0.25; // closer + lower: Kai bigger, less empty road
  }
  else if(SHOT==='end'){
    S.money=1350; S.rep=45; S.mission=4;
    banner('MISSION COMPLETE','+$700 · Pelabuhan kembali bernapas. Velmora mengingat namamu.',60000);
    setObjective('STREET LEGEND','Semua misi selesai. Velmora milikmu.');
    S.time=17.2;
    player.pos.set(50,0,-58); player.yaw=Math.PI/2; player.mesh.position.copy(player.pos); player.mesh.rotation.y=Math.PI/2;
    camYaw.yaw=-Math.PI/2; // camera west of Kai, looking east at the warehouse + fallen rival
    spawnRival(72,-54); // one rival visible, defeated nearby
    rivals[0].dead=true; rivals[0].mesh.rotation.x=-Math.PI/2; rivals[0].mesh.position.y=0.3;
  }
  updateHUD(); drawMinimap(); $('fps').style.display='none';
  let frames=0;
  const iv=setInterval(()=>{ frames++;
    if(frames>=2){ clearInterval(iv); window.__shotReady=true; } }, 500);
}
window.__game={ S, player, cars, peds, policeCars, rivals,
  startMission, startGame, respawn, addWanted, damagePlayer, doPunch, doShoot, hitCharacter,
  version:'street-legacy-1.0' };

// ---------- boot ----------
requestAnimationFrame(frame);
$('loading').style.display='none';
if(SHOT){ setupShot(); }
else { // attract mode behind menu: slow orbit
  const orbit=()=>{ if(S.mode!=='menu') return;
    const t=performance.now()/1000*0.05;
    camera.position.set(Math.sin(t)*60, 26, Math.cos(t)*60);
    camera.lookAt(0,4,0); requestAnimationFrame(orbit); };
  orbit();
}
