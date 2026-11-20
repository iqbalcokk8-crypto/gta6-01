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

// Tahap 2: 2 pola jendela baru (prosedural, orisinal) — curtain-wall kantor
// (strip kaca vertikal, ala menara Brickell/DTLA) & ribbon apartemen (jendela
// pita + pintu balkon, ala apartemen LA). rng SENDIRI (mulberry32 seed tetap)
// supaya urutan rng bersama (posisi/ukuran plot seed 7) TIDAK bergeser.
function curtainTex(){ const r2=mulberry32(4102); return canvasTex(128,256,(g,w,h)=>{
  g.fillStyle='#20262c'; g.fillRect(0,0,w,h);
  for(let x=6;x<w;x+=16){ const lit=r2()<0.5;
    g.fillStyle=lit?'#9fd8ff':'#2e5f6b'; g.fillRect(x,8,10,h-16);
    g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(x,8,2,h-16); }
  g.fillStyle='rgba(0,0,0,.4)'; for(let y=0;y<h;y+=32) g.fillRect(0,y,w,2);
  g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h-20,w,20); }); }
function ribbonTex(){ const r2=mulberry32(7703); return canvasTex(128,256,(g,w,h)=>{
  g.fillStyle='#7a5a44'; g.fillRect(0,0,w,h);
  for(let y=16;y<h-20;y+=32){
    g.fillStyle='rgba(255,255,255,.12)'; g.fillRect(0,y+22,w,3); // pelat lantai
    for(let x=10;x<w-10;x+=26){ const lit=r2()<0.4;
      g.fillStyle=lit?'#ffd98a':'#24303c'; g.fillRect(x,y,16,12); // jendela pita
      g.fillStyle='#3a2a1e'; g.fillRect(x+18,y,4,20); } } // pintu balkon
  g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h-20,w,20); }); }
const curtainTex0=curtainTex(), ribbonTex0=ribbonTex();
const curtainMat=new THREE.MeshStandardMaterial({ map:curtainTex0, roughness:.4, metalness:.5, emissive:0xffc98a, emissiveMap:curtainTex0, emissiveIntensity:0.06 });
const ribbonMat=new THREE.MeshStandardMaterial({ map:ribbonTex0, roughness:.85, emissive:0xffc98a, emissiveMap:ribbonTex0, emissiveIntensity:0.06 });
const extraBldMats=[curtainMat,ribbonMat]; // ikut menyala di malam hari (updateDayNight)

// Tahap 2: hash deterministik dari koordinat — variasi per gedung TANPA rng,
// supaya urutan rng bersama tidak bergeser (posisi plot seed 7 sudah terverifikasi).
const hash01=(x,z)=>{ const h=Math.sin(x*127.1+z*311.7)*43758.5453; return h-Math.floor(h); };

// P0-3: material papan (toko + billboard) & papan neon — emissive digerakkan per waktu di updateDayNight.
const shopSignMats=[], bbMats=[], neonMats=[];
function addNeonSign(text,bg,fg,x,y,z,ry,w=8,h=2){
  const tex=signTex(text,bg,fg);
  const mat=new THREE.MeshStandardMaterial({ map:tex, emissiveMap:tex, emissive:new THREE.Color(fg), emissiveIntensity:0, roughness:.6 });
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
  m.position.set(x,y,z); m.rotation.y=ry; scene.add(m); neonMats.push(mat); return m;
}

// ---------- materials / geometry cache ----------
const MAT = {
  road: new THREE.MeshStandardMaterial({ color:0x3a3f47, roughness:.95 }), // Fase 6 (F2): 0x23262e nyaris hitam
  sidewalk: new THREE.MeshStandardMaterial({ color:0x8a8578, roughness:.95 }),
  ground: new THREE.MeshStandardMaterial({ color:0x3f5a3a, roughness:1, vertexColors:true }), // Fase 6 (F8): vertex-color 3 tone
  water: new THREE.MeshStandardMaterial({ color:0x2a6f8a, roughness:.4, metalness:.4 }), // Fase 6 (F7): 0x1d4e63 terlalu gelap
  sand: new THREE.MeshStandardMaterial({ color:0xd8c49a, roughness:1 }), // pasir pantai (Fase 2)
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
const pyrGeo = new THREE.ConeGeometry(1,1,4); // Tahap 2: atap piramida + spire (8 tris)
function box(w,h,d,mat,x=0,y=0,z=0,parent=scene){ const m=new THREE.Mesh(boxGeo,mat);
  m.scale.set(w,h,d); m.position.set(x,y,z); parent.add(m); return m; }
// Tahap 1: InstancedMesh — 1 draw call per (geometri, material) untuk objek statis
// berulang. Matriks dihitung persis seperti transform mesh aslinya (posisi/rotasi/
// skala identik) sehingga tampilan tidak berubah; tris = geometri x jumlah instance.
function makeInstanced(geo,mat,list,opts={}){
  const im=new THREE.InstancedMesh(geo,mat,list.length);
  list.forEach((mtx,i)=>im.setMatrixAt(i,mtx));
  im.instanceMatrix.needsUpdate=true;
  im.castShadow=!!opts.cast; im.receiveShadow=!!opts.recv;
  im.frustumCulled=false; // menjangkau seluruh peta; bounding sphere instanced rawan salah
  scene.add(im); return im; }
function flatMatrix(len,wid,x,z,phi,y){
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),phi)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
  return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(len,wid,1)); }
function boxMatrix(w,h,d,x,y,z,q){
  return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),q||new THREE.Quaternion(),new THREE.Vector3(w,h,d)); }
// Langkah 0 (pendanaan performa): geometri pohon dipakai bersama semua pohon.
// Daun = bola satuan (radius via mesh.scale), 7x5 segmen; batang silinder 6-seg.
const treeTrunkGeo=new THREE.CylinderGeometry(0.25,0.35,2.2,6);
const treeLeafGeo=new THREE.SphereGeometry(1,7,5);
// P0-1: geometri palem dipakai bersama — didefinisikan di sini (sebelum pemakaian
// pertama) karena makePalm dipanggil dari blok street dressing yang letaknya
// sebelum definisi fungsi makePalm di bawah.
const palmTrunkGeo=new THREE.CylinderGeometry(0.16,0.28,4.6,6);
const palmLeafGeo=new THREE.ConeGeometry(0.95,2.4,7);
const _palmUp=new THREE.Vector3(0,1,0);
// Tahap 1: kolektor instance pohon/palem — di-flush sekali (flushTreesPalms)
// setelah pemakaian terakhir makeTree (loop props acak), supaya 1 mesh per
// (geometri, material). Urutan rng di makeTree dipertahankan persis.
const _treeTrunkM=[], _treeLeafM=[], _treeLeaf2M=[];
const _palmTrunkM=[], _palmLeafM=[], _palmLeaf2M=[];
function flushTreesPalms(){
  makeInstanced(treeTrunkGeo,MAT.trunk,_treeTrunkM);
  makeInstanced(treeLeafGeo,MAT.leaf,_treeLeafM,{cast:true});
  makeInstanced(treeLeafGeo,MAT.leaf2,_treeLeaf2M,{cast:true});
  makeInstanced(palmTrunkGeo,MAT.trunk,_palmTrunkM);
  makeInstanced(palmLeafGeo,MAT.leaf,_palmLeafM,{cast:true});
  makeInstanced(palmLeafGeo,MAT.leaf2,_palmLeaf2M,{cast:true});
}

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
// ROAD GRAPH (Fase 1 redesign, 2026-11-19): grid Manhattan diganti jaringan jalan organik.
// Node = titik [x,z] yang ditempatkan manual (deterministik, BUKAN rng). Edge = {a,b,w,type}.
// Type: 'avenue' w=11 (jalan utama), 'street' w=9.2, 'highway' w=12 (ring luar),
// 'alley' w=4 (gang sempit market). Type 'bridge' pensiun Fase 4: edge (18,19) dulu
// 'bridge' (w=9.2, sama dengan street) tapi tidak menyeberangi sungai — railing di
// atas tanah datar menyesatkan, jadi tipenya jadi 'street' dan railingnya hilang.
// Kelompok node:
//  0-10  avenue utama utara-selatan, lekukan S lembut, lewat dekat pusat kota (0,-50)
//  11-20 jalan komersial timur-barat (market z≈-10) sampai dermaga timur, lewat jembatan (18-19)
//  21-27 boulevard diagonal NW-SE; 28-33 boulevard diagonal NE-SW (pemecah grid)
//  34-40 loop perumahan barat-daya + cul-de-sac (-70,70) & (-30,84)
//  41-44 dua gang sempit di distrik market
//  45-48 jalan barat + konektor utara; 49-57 jalan dermaga/timur + jalan taman
//  58-66 ring highway (batas playable, sudut membulat) + interchange di node 0, 11, 10, 20
//  67-69 simpang persilangan diagonal x avenue/komersial
// Target misi yang dilayani: Bar (-30,-14) & Auto Fix (-52,-14) di komersial barat (node 14/13);
// showroom (48,26) di komersial timur (node 17); dermaga (78,-58) di jalan dermaga (node 52);
// safehouse (-70,70) di cul-de-sac perumahan (node 39). Sungai (Fase 2) mengalir di koridor
// x≈+60..+75 ke teluk timur; jembatan komersial (18-19) menyeberanginya.
const ROAD_NODES=[
  [12,-93],[4,-76],[-8,-58],[2,-40],[-6,-20],[6,0],[-4,20],[8,42],[0,64],[-8,86],[-2,94],
  [-94,0],[-70,-2],[-50,-11],[-30,-13],[-10,-6],[26,5],[48,22],[60,20],[78,17],[90,10],
  [-84,-84],[-50,-50],[-16,-16],[18,16],[50,46],[80,74],[88,92],
  [84,-84],[48,-48],[12,-14],[-24,20],[-58,54],[-88,84],
  [-78,44],[-88,62],[-76,78],[-56,84],[-40,72],[-70,70],[-30,84],
  [-26,4],[-26,-10],[20,16],[20,4],
  [-40,-56],[-72,-54],[-92,-70],[-32,-74],
  [28,-54],[56,-48],[82,-52],[76,-60],
  [52,-34],[56,4],[66,-16],[74,34],[32,54],
  [-62,-94],[62,-94],[90,-70],[94,-20],[94,20],[90,70],[62,94],[-62,94],[-92,66],
  [2.8,-5.3],[4.4,3.2],[-0.3,-2.4],
];
const ROAD_W={avenue:11,street:9.2,highway:12,alley:4,bridge:9.2};
const ROAD_EDGES=[
  [0,1,'avenue'],[1,2,'avenue'],[2,3,'avenue'],[3,4,'avenue'],[4,67,'avenue'],[67,5,'avenue'],
  [5,68,'avenue'],[68,6,'avenue'],[6,7,'avenue'],[7,8,'avenue'],[8,9,'avenue'],[9,10,'avenue'],
  [11,12,'avenue'],[12,13,'avenue'],[13,14,'avenue'],[14,15,'avenue'],[15,69,'avenue'],[69,5,'avenue'],
  [5,16,'avenue'],[16,17,'avenue'],[17,18,'avenue'],[18,19,'street'],[19,20,'avenue'],
  [21,22,'avenue'],[22,23,'avenue'],[23,68,'avenue'],[68,24,'avenue'],[24,25,'avenue'],
  [25,26,'avenue'],[26,27,'avenue'],
  [28,29,'avenue'],[29,30,'avenue'],[30,67,'avenue'],[67,69,'avenue'],[69,31,'avenue'],
  [31,32,'avenue'],[32,33,'avenue'],
  [32,34,'street'],[34,35,'street'],[35,36,'street'],[36,37,'street'],[37,38,'street'],
  [38,32,'street'],[36,39,'street'],[38,40,'street'],
  [41,42,'alley'],[43,44,'alley'],
  [2,45,'street'],[45,46,'street'],[46,22,'street'],[46,47,'street'],
  [58,48,'street'],[48,1,'street'],
  [2,49,'street'],[49,50,'street'],[50,51,'street'],[51,52,'street'],
  [17,54,'street'],[54,55,'street'],[55,51,'street'],[50,53,'street'],[53,55,'street'],
  [19,56,'street'],[56,25,'street'],
  [25,57,'street'],[57,7,'street'],
  [58,0,'highway'],[0,59,'highway'],[59,60,'highway'],[60,61,'highway'],[61,20,'highway'],
  [20,62,'highway'],[62,63,'highway'],[63,27,'highway'],[27,64,'highway'],[64,10,'highway'],
  [10,65,'highway'],[65,66,'highway'],[66,11,'highway'],[11,47,'highway'],[47,58,'highway'],
  [21,58,'street'],[59,28,'street'],[60,52,'street'],
].map(([a,b,type])=>({a,b,type,w:ROAD_W[type]}));
const ROAD_ADJ=ROAD_NODES.map(()=>[]);
ROAD_EDGES.forEach((e,i)=>{ ROAD_ADJ[e.a].push(i); ROAD_ADJ[e.b].push(i); });
function distToSeg(px,pz,ax,az,bx,bz){ const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz;
  let t=L2?((px-ax)*dx+(pz-az)*dz)/L2:0; t=clamp(t,0,1);
  const cx=ax+dx*t,cz=az+dz*t; return {d:Math.hypot(px-cx,pz-cz),t}; }
function nearestRoadDist(x,z){ let best={d:Infinity,edge:null};
  for(const e of ROAD_EDGES){ const A=ROAD_NODES[e.a],B=ROAD_NODES[e.b];
    const r=distToSeg(x,z,A[0],A[1],B[0],B[1]);
    if(r.d<best.d) best={d:r.d,edge:e}; } return best; }
const isRoad=(x,z)=>{ const r=nearestRoadDist(x,z); return r.d < r.edge.w/2+0.4; };
// ---------- terrain (Fase 2 redesign): heightmap lembut, deterministik ----------
// Tonjolan gaussian berpusat manual (BUKAN rng): bukit utara + pinggiran, maks ~2,5-4 m.
// [cx,cz,amp,sigma]: B1 bukit barat-laut (-98,-95); B2 bukit utara (0,-108);
// B3 bukit timur (105,0); B4 bukit tenggara (100,100); B5 bukit barat-daya (-90,95).
// Lembah taman: gaussian negatif di (0,42), -0,5 m, sigma 18.
const TERRAIN_BUMPS=[[-98,-95,3.0,16],[0,-108,4.0,22],[105,0,3.0,16],[100,100,2.8,16],[-90,95,2.5,15]];
const sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
// Titik yang wajib datar (tinggi ~0): 5 target misi, 12 parked spot, titik staging
// setupShot (?shot=play/?shot=fight/?shot=end), dan area underpass (-3,-49).
const FLAT_SPOTS=[
  [-30,-14],[78,-58],[-52,-14],[48,26],[-70,70], // target misi
  [8,50],[12,-14],[-2,34],[52,10],[-52,-14],[8,-54],[-8,74],[72,30],[-72,-54],[32,54],[-32,-74],[52,-34], // parked
  [3,-75],[1,-37],[10,-93],[50,-58],[58,-66],[61,-50],[57,-58],[63,-68],[59,-44],[72,-54], // staging shot
  [-3,-49], // underpass
];
function terrainHeight(x,z){
  let h=0;
  for(const [cx,cz,amp,sig] of TERRAIN_BUMPS){
    const dx=x-cx, dz=z-cz; h+=amp*Math.exp(-(dx*dx+dz*dz)/(2*sig*sig)); }
  { const dx=x, dz=z-42; h-=0.5*Math.exp(-(dx*dx+dz*dz)/(2*18*18)); } // lembah taman
  // Jalan tetap datar: tinggi ~0 dalam w/2+1 m dari edge, blend smoothstep ke penuh di w/2+4.
  const rd=nearestRoadDist(x,z);
  h*=sstep(rd.edge.w/2+1, rd.edge.w/2+4, rd.d);
  // Sungai (Fase 2): kanal x 57-79, z -100..-64, dasar -1,2 m; mulut ke teluk
  // x 79-100, z -74..-66, menyambung ke air teluk. Tepi kanal landai (fade 3 m).
  // Dasar TIDAK diratakan blend jalan: 0 tepat di atas jalan, penuh 0,5 m di luar
  // tepi jalan — jalan yang memotong kanal jadi jembatan/culvert. Kanal ini
  // dipotong 3 jalan (avenue diagonal (84,-84)-(48,-48), street (62,-94)-(84,-84),
  // highway (62,-94)-(90,-70)); edge (18,19) TIDAK memotong sungai (di z≈20) —
  // dulu 'bridge', jadi 'street' sejak Fase 4.
  const rm=riverMask(x,z);
  if(rm>0) h+=-1.2*rm*sstep(rd.edge.w/2, rd.edge.w/2+0.5, rd.d);
  // Titik datar: 0 dalam 3 m, blend ke penuh di 9 m (menang atas carve sungai).
  for(const [fx,fz] of FLAT_SPOTS){
    const d=Math.hypot(x-fx,z-fz); if(d<9) h*=sstep(3,9,d); }
  // Pantai timur (x 100-125, z -60..-20): tanah diratakan ke ~0,05 m.
  // Fase 6 (F12): blend 5 m DI LUAR rect pasir — dulu 3 m di dalam rect,
  // sehingga tepi selatan/barat pasir masih tertembus tonjolan B3 (~1,3 m).
  // Pengecualian: blend barat hanya 1 m (99-100) karena highway 12 m +
  // trotoar di x≈96-100 harus tetap di h≈0.
  h=lerp(h,0.05,beachMask(x,z));
  return h;
}
// Masker kanal sungai (0..1, tepi landai 3 m): kanal utama + mulut ke teluk.
function riverMask(x,z){
  const fx=sstep(57,60,x)*(1-sstep(76,79,x));
  const fz=sstep(-100,-97,z)*(1-sstep(-67,-64,z));
  const mx=sstep(79,82,x)*(1-sstep(97,100,x));
  const mz=sstep(-74,-71,z)*(1-sstep(-69,-66,z));
  return Math.max(fx*fz, mx*mz);
}
// Masker pantai timur (0..1): penuh di dalam rect pasir, blend di luar rect.
function beachMask(x,z){
  return sstep(99,100,x)*(1-sstep(125,130,x))*sstep(-65,-60,z)*(1-sstep(-20,-15,z));
}
// ---------- distrik organik (Fase 2): batas poligon bergerigi, bukan persegi ----------
// downtown: pusat kota di sekitar avenue utara (menara + plaza di (24,-64)).
// market: sabuk komersial tengah (ruko + 8 papan toko bernama).
// homes: pemukiman selatan (rumah rendah + halaman); safehouse (-70,70) di sini.
// docks: dermaga timur (kontainer + crane + gudang); dermaga (78,-58) di sini.
// periphery: pinggiran (rumah jarang + area terbuka); poligon besar, dicek TERAKHIR.
const DISTRICT_POLYS={
  downtown:[[-38,-88],[-12,-95],[14,-90],[30,-78],[38,-60],[28,-42],[36,-28],[10,-20],[-14,-30],[-34,-40],[-42,-58],[-36,-76]],
  market:[[-56,-24],[-24,-28],[6,-20],[34,-24],[52,-12],[46,6],[56,30],[20,32],[-6,24],[-36,26],[-56,12],[-50,-8]],
  homes:[[-95,30],[-60,28],[-30,30],[0,34],[24,38],[44,44],[58,58],[40,80],[10,95],[-30,95],[-70,95],[-92,80],[-96,52]],
  docks:[[58,-90],[80,-95],[100,-88],[104,-62],[98,-40],[104,-24],[82,-28],[62,-40],[56,-60],[54,-78]],
  periphery:[[-105,-105],[-40,-104],[20,-105],[80,-102],[105,-100],[104,-40],[105,30],[102,100],[40,104],[-30,105],[-90,102],[-104,40],[-105,-40]],
};
function pointInPoly(x,z,poly){ let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,zi]=poly[i], [xj,zj]=poly[j];
    if(((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside; }
  return inside; }
function districtAt(x,z){ for(const k of ['downtown','market','homes','docks','periphery'])
  if(pointInPoly(x,z,DISTRICT_POLYS[k])) return k; return 'market'; }

// ground, roads, water
{
  // Ground: grid 64x64 mengikuti terrainHeight (bukit/lembah), bukan bidang datar.
  // Jalan tetap di y=0,02 di atas tanah yang diratakan di dekat jalan (lihat terrainHeight).
  const groundGeo=new THREE.PlaneGeometry(WORLD*2+40,WORLD*2+40,64,64);
  groundGeo.rotateX(-Math.PI/2);
  { const pos=groundGeo.attributes.position;
    for(let i=0;i<pos.count;i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    groundGeo.computeVertexNormals();
    // Fase 6 (F8): variasi warna vertex 3 tone (hash deterministik per vertex,
    // pengali di sekitar 1,0) supaya ground tidak jadi karpet hijau datar.
    const col=new Float32Array(pos.count*3);
    const tones=[[1,1,1],[1.12,0.94,0.72],[0.86,1.06,0.88]]; // netral, coklat kering, hijau segar
    for(let i=0;i<pos.count;i++){ const t=tones[Math.floor(hash01(pos.getX(i),pos.getZ(i))*3)%3];
      col[i*3]=t[0]; col[i*3+1]=t[1]; col[i*3+2]=t[2]; }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(col,3)); }
  const g=new THREE.Mesh(groundGeo, MAT.ground);
  g.receiveShadow=true; scene.add(g);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(60,90), MAT.water);
  water.rotation.x=-Math.PI/2; water.position.set(128,-0.4,-60); scene.add(water);
  // Sungai (Fase 2): permukaan datar y=-0,3, pakai ulang material air teluk.
  // Kanal utama x 57-79, z -100..-64 + mulut x 79-100, z -74..-66; mulut
  // menyambung ke air teluk (tumpang tindih x 98-100). Dasar kanal -1,2 m.
  const riverMain=new THREE.Mesh(new THREE.PlaneGeometry(22,36), MAT.water);
  riverMain.rotation.x=-Math.PI/2; riverMain.position.set(68,-0.3,-82); scene.add(riverMain);
  const riverMouth=new THREE.Mesh(new THREE.PlaneGeometry(21,8), MAT.water);
  riverMouth.rotation.x=-Math.PI/2; riverMouth.position.set(89.5,-0.3,-70); scene.add(riverMouth);
  // Pantai timur (Fase 2): strip pasir x 100-125, z -60..-20 di atas tanah yang diratakan.
  const beach=new THREE.Mesh(new THREE.PlaneGeometry(25,40), MAT.sand);
  beach.rotation.x=-Math.PI/2; beach.position.set(112.5,0.08,-40); beach.receiveShadow=true; scene.add(beach);
  // roads: one flat plane per edge (rotated to follow the edge), centre dashes,
  // sidewalk strips offset to both sides, joint discs at every node so joins show no grass.
  const unitPlane=new THREE.PlaneGeometry(1,1);
  const discGeo=new THREE.CircleGeometry(1,14);
  const dashMat=new THREE.MeshBasicMaterial({ color:0xd8c86a });
  // Tahap 1: aspal/trotoar/dash/disc jadi InstancedMesh (dulu 1 mesh per segmen:
  // 84 aspal + 168 trotoar + ~258 dash + 70 disc = ~580 draw call -> 4).
  const _roadM=[], _dashM=[], _walkM=[], _discM=[];
  for(const e of ROAD_EDGES){
    const A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
    const dx=B[0]-A[0], dz=B[1]-A[1], len=Math.hypot(dx,dz);
    const mx=(A[0]+B[0])/2, mz=(A[1]+B[1])/2;
    const phi=Math.atan2(-dz,dx);
    const px=-dz/len, pz=dx/len; // unit perpendicular
    _roadM.push(flatMatrix(len,e.w,mx,mz,phi,0.02));
    const nDash=Math.max(1,Math.floor(len/8));
    for(let i=0;i<nDash;i++){ const t=(i+0.5)/nDash;
      // Langkah 0: dash = flat plane (2 tris) — box setinggi 0,02 m tak terlihat dari kamera.
      _dashM.push(flatMatrix(2.4,0.35,lerp(A[0],B[0],t),lerp(A[1],B[1],t),phi,0.04)); }
    for(const off of [-1,1])
      _walkM.push(flatMatrix(len,2.2,mx+px*off*(e.w/2+1.1),mz+pz*off*(e.w/2+1.1),phi,0.015));
    // (Fase 4: railing 'bridge' dicabut — satu-satunya edge bridge (18,19) jadi 'street'.)
  }
  for(let n=0;n<ROAD_NODES.length;n++){
    let r=0; for(const ei of ROAD_ADJ[n]) r=Math.max(r,ROAD_EDGES[ei].w/2+1.0);
    _discM.push(new THREE.Matrix4().compose(new THREE.Vector3(ROAD_NODES[n][0],0.03,ROAD_NODES[n][1]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),
      new THREE.Vector3(r,r,1)));
  }
  makeInstanced(unitPlane,MAT.road,_roadM,{recv:true});
  makeInstanced(unitPlane,dashMat,_dashM,{recv:true});
  makeInstanced(unitPlane,MAT.sidewalk,_walkM,{recv:true});
  makeInstanced(discGeo,MAT.road,_discM);
  // underpass: avenue segmen 2-3 lewat di bawah deck highway visual di (-3,-49).
  // Dinding + plafon di y≈4; jalan tetap y=0, deck hanya visual (TIDAK ada traffic di atasnya).
  // Fase 4: dinding DAPAT collider — dindingnya miring (rotasi atan2(10,18)) jadi tiap
  // dinding dipecah 6 segmen 2 m dengan AABB kecil (1,5×2,05); jangkauan tegak lurus
  // terjauh AABB 5,65 m dari as jalan > setengah lebar jalan 5,5 m, jadi jalan di
  // bawahnya tetap bebas dilalui pemain/mobil, tapi dinding tidak bisa ditembus.
  {
    const g=new THREE.Group();
    box(30,1,12,MAT.asphalt2,0,4.6,0,g);
    box(0.6,4.6,12,MAT.sidewalk,-6.8,2.3,0,g); box(0.6,4.6,12,MAT.sidewalk,6.8,2.3,0,g);
    box(30,0.5,1,MAT.sidewalk,0,4.2,-6,g); box(30,0.5,1,MAT.sidewalk,0,4.2,6,g);
    // Fase 6 (F3): strip fascia kontras + papan VELMORA di muka selatan deck
    // (lokal z=-6, menghadap kamera play). Strip 30x0,6x0,1 menempel di depan
    // fascia lama; papan 8x1 pas di muka pelat (y 4,1-5,1). Tanpa collider baru.
    box(30,0.6,0.1,MAT.container,0,4.6,-6.56,g);
    { const dTex=signTex('VELMORA','#1a0a2e','#ff4fd8');
      const dMat=new THREE.MeshStandardMaterial({ map:dTex, emissiveMap:dTex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
      shopSignMats.push(dMat);
      const dSign=new THREE.Mesh(new THREE.PlaneGeometry(8,1),dMat);
      dSign.position.set(0,4.6,-6.62); dSign.rotation.y=Math.PI; g.add(dSign); } // Fase 6 (F3): muka -z -> hadap selatan/kamera play
    g.position.set(-3,0,-49); g.rotation.y=Math.atan2(10,18); scene.add(g);
    const upYaw=Math.atan2(10,18), upDir=[Math.sin(upYaw),Math.cos(upYaw)], upPerp=[Math.cos(upYaw),-Math.sin(upYaw)];
    for(const s of [-1,1]) for(let k=0;k<6;k++){
      const along=-5+k*2;
      addCollider(-3+upPerp[0]*s*6.8+upDir[0]*along, -49+upPerp[1]*s*6.8+upDir[1]*along, 1.5, 2.05); }
  }
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
function makeBuilding(x,z,w,d,h,district,matIdx=-1){
  const gy=terrainHeight(x,z); // alas bangunan mengikuti kontur tanah
  // P0-2: matIdx>=0 memaksa satu material (mis. 6 = kaca teal) tanpa rng baru.
  let mat=matIdx>=0?buildingMats[matIdx]:buildingMats[Math.floor(rng()*buildingMats.length)];
  // Tahap 2: karakter per distrik via hash koordinat (tanpa rng): menara kantor
  // (h>=20) jadi curtain-wall kaca; apartemen homes/periphery jadi ribbon +
  // pintu balkon. matIdx>=0 (mis. menara kaca P0-2) tidak diubah.
  const hv=hash01(x,z);
  if(matIdx<0){
    if(h>=20&&hv<0.5) mat=curtainMat;
    else if((district==='homes'||district==='periphery')&&hv<0.35) mat=ribbonMat; }
  const m=new THREE.Mesh(boxGeo,mat); m.scale.set(w,h,d); m.position.set(x,gy+h/2,z);
  m.receiveShadow=true; scene.add(m);
  box(w+0.6,0.8,d+0.6,roofMat,x,gy+h+0.4,z);
  let hasShop=false; // Tahap 2: kanopi hanya untuk ruko market tanpa papan toko
  if(rng()<0.5) box(rand(1,2.4),rand(0.8,1.6),rand(1,2),roofMat,x+rand(-w/4,w/4),gy+h+1.2,z+rand(-d/4,d/4));
  if(rng()<0.3){ // rooftop water tower
    const tw=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,2.2,8), MAT.crate);
    tw.position.set(x-w/4,gy+h+1.9,z-d/4); scene.add(tw);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.3,1,8), roofMat);
    cone.position.set(x-w/4,gy+h+3.4,z-d/4); scene.add(cone); }
  if(rng()<0.35){ box(1.6,0.7,1.2,roofMat,x+w/4,gy+h+1.1,z+d/4); } // AC unit
  if(rng()<0.28 && h>14){ // antenna with blinking red tip
    const a=box(0.14,rand(5,9),0.14,MAT.lampPole,x+w/2-1.5,gy+h+4,z);
    const tipMat=new THREE.MeshStandardMaterial({ color:0xff2020, emissive:0xff0000, emissiveIntensity:2 });
    const tip=new THREE.Mesh(new THREE.SphereGeometry(0.22,6,5), tipMat);
    tip.position.set(x+w/2-1.5,gy+h+8,z); scene.add(tip); roofLights.push(tipMat); }
  if(rng()<0.25){ const a=box(0.3,rand(3,6),0.3,MAT.lampPole,x+w/2-1,gy+h+3,z); }
  if(district==='market'&&rng()<0.6&&shopCount<8){
    hasShop=true;
    const [txt,bg,fg]=shopSigns[shopCount%shopSigns.length]; shopCount++;
    // P0-3: papan toko emissive di malam hari (backlit) — material standar + emissiveMap = tekstur sama.
    const signTex0=signTex(txt,bg,fg);
    const signMat=new THREE.MeshStandardMaterial({ map:signTex0, emissiveMap:signTex0, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    shopSignMats.push(signMat);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w-1,9),2.2), signMat);
    sign.position.set(x,gy+3.4,z+d/2+0.06); scene.add(sign);
    // striped awning under the sign
    const awn=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w-1,9),1.1),
      new THREE.MeshStandardMaterial({ color:new THREE.Color(bg).lerp(new THREE.Color(0xffffff),0.25), roughness:.9, side:THREE.DoubleSide }));
    awn.position.set(x,gy+2.1,z+d/2+0.7); awn.rotation.x=-0.5; scene.add(awn);
    // P0-3: papan neon di atas papan toko pertama market (fasad yang sama, di luar koridor jalan).
    // Fase 6 (F1): teks neon diubah dari 'TACOS 24H' (dobel dengan papan toko di bawahnya).
    if(shopCount===1) addNeonSign('OPEN 24H','#2a0a12','#ff6b4d',x,gy+5.8,z+d/2+0.08,0,Math.min(w-1,9),1.5); }
  // ---- Tahap 2: variasi arsitektur (referensi: menara setback Maze Bank/FIB,
  // podium + crown; Art Deco Ocean Beach: parapet bertingkat, balkon, kanopi).
  // Semua di DALAM footprint (podium/setback/parapet/atap) atau DI ATAS KEPALA
  // (balkon y>=3,1 m, kanopi y=3,2 m, sirip y>=0,175h) — collider AABB TIDAK
  // berubah: tidak ada dinding tak terlihat, tidak ada yang menjebak pemain/mobil.
  // Tonjolan terjauh = balkon/kanopi 0,9–1,2 m di luar fasad, masih >=0,3 m dari
  // tepi jalan (plotFree menjamin >=1,5 m dari as jalan ke footprint).
  const t2=hash01(x+3.7,z-1.3); // hash kedua, tetap deterministik, tanpa rng
  const roofTop=gy+h+0.8; // atas pelat atap yang sudah ada
  if(h>=20){
    // Menara kantor: podium dasar gelap (di dalam footprint) + 2 undakan
    // setback di puncak (lantai setback bertekstur jendela + cap gelap) +
    // 3 sirip vertikal di fasad depan (kedalaman fasad, di atas kepala).
    box(w*0.92,2,d*0.92,roofMat,x,gy+1,z);
    box(w*0.72,h*0.16,d*0.72,mat,x,roofTop+h*0.08,z);
    box(w*0.45,h*0.12,d*0.45,roofMat,x,roofTop+h*0.16+h*0.06,z);
    for(const fx of [-w/4,0,w/4])
      box(0.3,h*0.55,0.18,roofMat,x+fx,gy+h*0.45,z+d/2+0.09);
  } else if(h>=12){
    // Mid-rise: 1 undakan atap + (50% hash) cap kedua — siluet atap bertingkat.
    box(w*0.75,1.8,d*0.75,mat,x,roofTop+0.9,z);
    if(t2<0.5) box(w*0.45,1.4,d*0.45,roofMat,x,roofTop+1.8+0.7,z);
  } else if((district==='homes'||district==='periphery')&&t2<0.5){
    // Rumah rendah: atap piramida (ala bungalow LA) di atas pelat atap.
    const pyr=new THREE.Mesh(pyrGeo,roofMat);
    pyr.scale.set(w*0.7,2.4,d*0.7); pyr.rotation.y=Math.PI/4;
    pyr.position.set(x,roofTop+1.2,z); scene.add(pyr);
  }
  if((district==='homes'||district==='periphery')&&h>=7){
    // Apartemen: 2 pelat balkon di fasad depan (y 45% & 70% tinggi, di atas kepala).
    for(const fy of [0.45,0.7]){
      box(w*0.55,0.22,0.9,roofMat,x,gy+h*fy,z+d/2+0.45);
      box(w*0.55,0.5,0.12,roofMat,x,gy+h*fy+0.35,z+d/2+0.86); } // bibir balkon
  }
  if(district==='market'&&!hasShop&&t2<0.6){
    // Ruko market tanpa papan toko: kanopi datar di atas pintu (y 3,2 m).
    box(w*0.7,0.15,1.2,roofMat,x,gy+3.2,z+d/2+0.6);
  }
  addCollider(x,z,w,d);
  return m;
}
{
  // plots: petak persegi axis-aligned yang ditempatkan manual per distrik (grid + jitter rng),
  // tiap plot dicek: titik tengah bukan jalan, plot tidak memotong segmen jalan,
  // tidak tumpang tindih plot lain. Downtown tetap tinggi (22-46), lainnya (7-16).
  // Fase 4: jitter posisi ±6 & ukuran lebih lebar; plot dekat jalan diagonal digeser
  // menjauhi jalan + diperkecil sebelum dicek plotFree (jumlah bangunan tidak bertambah).
  const placed=[]; // {minX,maxX,minZ,maxZ}
  const plotFree=(x,z,w,d)=>{
    if(Math.abs(x)>98||Math.abs(z)>98) return false;
    if(Math.hypot((x-0)/20,(z-42)/14)<1) return false; // taman (lembah, pengganti skip persegi lama)
    if(Math.hypot(x-24,z+64)<9) return false; // plaza downtown (24,-64)
    if(x>54&&z<-24) return false; // docks handled separately
    if(riverMask(x,z)>0.05) return false; // kanal sungai + mulut ke teluk
    const rd=nearestRoadDist(x,z);
    if(rd.d < rd.edge.w/2 + Math.max(w,d)/2 + 1.5) return false;
    for(const [cx,cz] of [[x-w/2,z-d/2],[x+w/2,z-d/2],[x-w/2,z+d/2],[x+w/2,z+d/2]]){
      if(riverMask(cx,cz)>0.05) return false;
      const r2=nearestRoadDist(cx,cz); if(r2.d < r2.edge.w/2+0.5) return false; }
    for(const p of placed)
      if(x-w/2 < p.maxX+1.5 && x+w/2 > p.minX-1.5 && z-d/2 < p.maxZ+1.5 && z+d/2 > p.minZ-1.5) return false;
    return true; };
  for(let gx=-93; gx<=93; gx+=17) for(let gz=-93; gz<=93; gz+=17){
    const cx=gx+rand(-6,6), cz=gz+rand(-6,6); // Fase 4: jitter posisi lebih lebar (±6, dulu ±4,5)
    const d=districtAt(cx,cz);
    const tall=d==='downtown';
    // Fase 4: jitter lebih lebar + plot diagonal yang diselamatkan membuat lebih banyak
    // plot lolos (16 -> 24 bangunan) — kepadatan dikembalikan dengan skip ~35% petak
    // supaya jumlah bangunan TIDAK bertambah dari Fase 3 (16).
    if(rng()<0.38) continue;
    if(d==='periphery'&&rng()<0.65) continue; // periphery: rumah jarang + area terbuka
    const n=tall?1:randi(1,2);
    for(let k=0;k<n;k++){
      let w=rand(tall?9:6,tall?16:12), dep=rand(tall?9:6,tall?16:12); // Fase 4: jitter ukuran lebih lebar
      let x=cx+(k===0?0:rand(-4,4)), z=cz+(k===0?0:rand(-4,4));
      // Fase 4: plot di dekat jalan diagonal dibentuk ulang — geser menjauhi jalan
      // + perkecil 15% supaya tidak menumpuk di tepi boulevard diagonal.
      // Bangunan tetap axis-aligned; plotFree di bawah tetap memverifikasi hasil akhirnya.
      { const rd=nearestRoadDist(x,z);
        const e=rd.edge, A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
        const dg=Math.abs(B[0]-A[0])>5&&Math.abs(B[1]-A[1])>5; // edge diagonal
        const need=e.w/2+Math.max(w,dep)/2+1.5;
        if(dg&&rd.d<need+2){
          const r=distToSeg(x,z,A[0],A[1],B[0],B[1]);
          const nx=A[0]+(B[0]-A[0])*r.t, nz=A[1]+(B[1]-A[1])*r.t;
          let ox=x-nx, oz=z-nz; const ol=Math.hypot(ox,oz)||1; ox/=ol; oz/=ol;
          x+=ox*(need+2-rd.d); z+=oz*(need+2-rd.d); w*=0.85; dep*=0.85; } }
      if(!plotFree(x,z,w,dep)) continue;
      placed.push({minX:x-w/2,maxX:x+w/2,minZ:z-dep/2,maxZ:z+dep/2});
      makeBuilding(x,z,w,dep,tall?rand(22,46):d==='periphery'?rand(7,12):rand(7,16),d);
    }
  }
  // plaza downtown: lingkaran trotoar di (24,-64), mengikuti kontur
  { const plaza=new THREE.Mesh(new THREE.CircleGeometry(6,20), MAT.sidewalk);
    plaza.rotation.x=-Math.PI/2; plaza.position.set(24,terrainHeight(24,-64)+0.03,-64);
    plaza.receiveShadow=true; scene.add(plaza); }
  // park: 26 pohon di lembah taman (posisi deterministik, y=terrainHeight),
  // menjauhi jalan avenue + jalan (57,7) yang memotong taman, dan kolam (-10,48).
  const parkTrees=[[-16,31],[-10,31],[12,31],[17,31],[-14,34],[16,34],
    [-17,37],[-11,37],[-4,37],[14,37],[-15,40],[19,40],[-16,43],[-9,43],
    [-18,46],[2,46],[-17,49],[-2,49],[6,49],[-18,52],[-8,52],[0,52],[8,52],
    [-14,53],[2,53],[10,53]];
  for(const [x,z] of parkTrees){
    if(isRoad(x,z)||pointInCollider(x,z,1)) continue; makeTree(x,z); }
  // kolam tetap; y mengikuti lembah (tanah di (-10,48) ≈ -0,4 m).
  box(10,0.3,6,new THREE.MeshStandardMaterial({color:0x2a6a8a,roughness:.3}),-10,terrainHeight(-10,48)+0.15,48);
  // docks: containers, cranes, warehouse
  // Tahap 4: kontainer dari sebaran acak (seed 7: hanya 1 tumpuk di seluruh yard)
  // jadi 2 klaster deterministik: pasangan-L di kantong barat (64,-34)/(64,-40)
  // + pasangan di samping crane tenggara (98,-88)/(98,-80), masing-masing 1 tumpuk.
  // Semua posisi lolos validator (roadDist + river + collider, t4-validate.mjs).
  // KOMPENSASI RNG: loop acak lama (14 iterasi) dihapus, tapi panggilan rng()-nya
  // HARUS tetap dikonsumsi persis sama — kalau tidak, semua rng downstream
  // (gedung, pohon, crate, traffic, ped, pickup) bergeser dan dunia seed 7
  // ikut berubah (terukur sebelum perbaikan: +434 tris statis, +3.462 play
  // infoTris — padahal tambahan geometri Tahap 4 hanya +16 statis).
  // Loop di bawah meniru urutan panggilan
  // loop lama (rand x/z, rng 0.5, lalu per kontainer: material, rotasi, 0.35,
  // material lapis 2) tanpa menempatkan apa-apa.
  for(let i=0;i<14;i++){ const x=rand(58,96), z=rand(-92,-30);
    if(rng()<0.5) continue;
    if(isRoad(x,z)) continue;
    if(riverMask(x,z)>0.05) continue;
    rng(); rng(); // dulu: material box + rotation.y
    if(rng()<0.35) rng(); } // dulu: material lapis 2 bila bertumpuk
  for(const [cx,cz,ry,mat,stack] of [
    [64,-34,0,MAT.container,false],[64,-40,Math.PI/2,MAT.container2,true],
    [98,-88,Math.PI/2,MAT.container2,false],[98,-80,Math.PI/2,MAT.container,true]]){
    const c=box(7,2.6,2.6,mat,cx,1.3,cz); c.rotation.y=ry;
    addCollider(cx,cz,ry===0?7:2.6,ry===0?2.6:7);
    if(stack){ const c2=box(7,2.6,2.6,mat===MAT.container?MAT.container2:MAT.container,cx,3.9,cz);
      c2.rotation.y=ry; } }
  makeBuilding(78,-58,18,12,9,'docks'); // warehouse
  // Tahap 2: gudang docks berkarakter — parapet bertingkat (Art Deco) di atap
  // + 2 sirip vertikal di fasad timur (menghadap pantai, y 3,5–8,5 m, di atas kepala).
  // Fase 6 (F5): sirip digeser ke z=-58±4,5 — di luar rentang papan neon
  // OCEAN DRIVE (z -62..-54) yang tadinya terpotong sirip; tetap di fasad 12 m.
  { const wgy=terrainHeight(78,-58);
    box(12,1.4,8,roofMat,78,wgy+9+0.8+0.7,-58);
    box(7,1.2,5,roofMat,78,wgy+9+0.8+1.4+0.6,-58);
    for(const fz of [-4.5,4.5]) box(0.18,5,0.3,roofMat,78+9+0.09,wgy+6,-58+fz); }
  // P0-3: papan neon OCEAN DRIVE di fasad timur gudang — menghadap pantai/teluk.
  addNeonSign('OCEAN DRIVE','#061a2e','#4de8ff',78+9+0.06,terrainHeight(78,-58)+5,-58,Math.PI/2,8,2);
  const craneMat=new THREE.MeshStandardMaterial({color:0xd8a02e,roughness:.6,metalness:.4});
  // crane digeser (88,-70) -> (92,-80): titik lama jatuh di mulut sungai (z -74..-66)
  box(1.2,26,1.2,craneMat,92,13,-80); box(22,1.4,1.4,craneMat,84,25,-80);
  box(3,3,3,craneMat,92,27,-80);
  // P0-2: siluet gedung downtown — 5 mid-rise + 1 gedung konstruksi + crane.
  // Semua posisi deterministik, sudah lolos plotFree (replikasi seed 7 di luar
  // game) + cek tambahan: clearance menara kembar, target misi/parked
  // (FLAT_SPOTS), dinding underpass, dan mesh plaza (24,-64) r6. Di sini tiap
  // posisi dicek ulang dengan plotFree yang sama + didaftarkan ke `placed`,
  // jadi bila ada yang gagal ia dilewati (bukan ditumpuk) — urutan sama
  // dengan urutan verifikasi: KACA, W1, W2, KONSTRUKSI, S, BARAT.
  // 1. Menara kaca (teal glass, buildingMats[6] — material kaca yang sudah
  //    ada, tanpa material baru) di celah timur downtown: terlihat dari
  //    jalan utama selatan, di antara menara kembar tanpa menutupinya
  //    (20 m vs 32/38 m, berdiri di celah antar-menara).
  if(plotFree(30,-76,8,8)){ placed.push({minX:26,maxX:34,minZ:-80,maxZ:-72});
    makeBuilding(30,-76,8,8,20,'downtown',6); }
  // 2-3. Dua mid-rise di kantong barat downtown (barat dinding underpass).
  if(plotFree(-27,-44,8,8)){ placed.push({minX:-31,maxX:-23,minZ:-48,maxZ:-40});
    makeBuilding(-27,-44,8,8,16,'downtown'); }
  if(plotFree(-16,-36,7,7)){ placed.push({minX:-19.5,maxX:-12.5,minZ:-39.5,maxZ:-32.5});
    makeBuilding(-16,-36,7,7,13,'downtown'); }
  // 4. Mid-rise di kantong selatan downtown (utara jalan market).
  if(plotFree(10,-28,7,7)){ placed.push({minX:6.5,maxX:13.5,minZ:-31.5,maxZ:-24.5});
    makeBuilding(10,-28,7,7,14,'downtown'); }
  // 5. Mid-rise di ujung barat downtown.
  if(plotFree(-38,-66,7,7)){ placed.push({minX:-41.5,maxX:-34.5,minZ:-69.5,maxZ:-62.5});
    makeBuilding(-38,-66,7,7,12,'downtown'); }
  // 6. Gedung dalam konstruksi di (-18,-47): shaft beton (MAT.sidewalk, tanpa
  //    tekstur jendela) + pelat lantai setengah (hanya separuh utara) + 2 tiang
  //    kolom yang menjulang — tanpa atap penuh. Collider sama seperti gedung.
  //    Crane di sampingnya: kolom di (-13.5,-47) — 1 m di timur dinding
  //    gedung, 2,4 m dari dinding underpass, 10,6 m dari as jalan utara;
  //    jib di 15,5 m menjorok ke barat di atas gedung + counter-jib ke timur.
  //    Tanpa collider (seperti crane docks): kolom tidak menghalangi jalan.
  if(plotFree(-18,-47,7,7)){ placed.push({minX:-21.5,maxX:-14.5,minZ:-50.5,maxZ:-43.5});
    const cgx=-18, cgz=-47, cgy=terrainHeight(cgx,cgz);
    box(7,10,7,MAT.sidewalk,cgx,cgy+5,cgz);
    box(7,0.5,3.5,roofMat,cgx,cgy+10.25,cgz-1.75); // pelat lantai atas (separuh utara)
    box(0.4,2,0.4,MAT.lampPole,cgx-2,cgy+11,cgz+2); // kolom menjulang (sisi selatan)
    box(0.4,2,0.4,MAT.lampPole,cgx+2,cgy+11,cgz+2);
    addCollider(cgx,cgz,7,7);
    const crx=-13.5, crz=-47, cry=terrainHeight(crx,crz);
    box(0.8,16,0.8,craneMat,crx,cry+8,crz); // kolom
    box(1.8,1.8,1.8,craneMat,crx,cry+15.4,crz); // kabin di puncak kolom
    box(9,0.7,0.7,craneMat,crx-4.5,cry+15.5,crz); // jib barat (di atas gedung)
    box(4,0.7,0.7,craneMat,crx+2,cry+15.5,crz); // counter-jib timur
    box(1.5,1.5,1.5,craneMat,crx+3.5,cry+14.5,crz); // counterweight
    box(0.08,3,0.08,MAT.lampPole,crx-4.5,cry+13.5,crz); // tali gantung
    box(1.2,1.2,1.2,MAT.container,crx-4.5,cry+11.5,crz); } // beban gantung
  // billboards
  const bb=[['VELMORA','WELCOME TO THE CITY THAT NEVER SLEEPS','#20243a','#ffd166',-60,-96],
    ['HARBOUR ROW','FISH · FREIGHT · FORTUNE','#12303a','#9fd8ff',60,-96],
    ['STREET LEGACY','OWN THE NIGHT','#2a1020','#ff6b9d',-96,10]];
  for(const [t,s,bg,fg,x,z] of bb){
    const bTex=canvasTex(512,128,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h);
      g.fillStyle=fg; g.font='bold 52px system-ui'; g.textAlign='center'; g.fillText(t,w/2,58);
      g.fillStyle='#fff'; g.font='22px system-ui'; g.fillText(s,w/2,100); });
    // P0-3: billboard emissive di malam hari (backlit) — material standar + emissiveMap = tekstur sama.
    const bbMat=new THREE.MeshStandardMaterial({ map:bTex, emissiveMap:bTex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    bbMats.push(bbMat);
    const b=new THREE.Mesh(new THREE.PlaneGeometry(16,4), bbMat);
    b.position.set(x,9,z); b.rotation.y = x<0?Math.PI/2 : x>0?-Math.PI/2 : 0; scene.add(b);
    box(0.8,9,0.8,MAT.lampPole,x,4.5,z+(z<0?1:0));
  }
}
// --- street dressing: crosswalks, avenue trees, benches, bins, bus stop, skyline ---
{
  const zebraMat=new THREE.MeshBasicMaterial({ color:0xe8e8e0 });
  // Tahap 1: zebra (40 stripe) jadi 1 InstancedMesh.
  const _zebraM=[];
  // crosswalks di persimpangan jalan baru: avenue x komersial, komersial x showroom,
  // komersial barat (Bar), dan simpang diagonal (12,-14)
  for(const [ix,iz] of [[6,0],[48,22],[-30,-13],[12,-14]]){
    for(let k=-2;k<=2;k++){ // stripes across the north-south road, then the east-west road
      _zebraM.push(boxMatrix(0.85,0.02,3.0,ix+k*1.8,0.04,iz));
      _zebraM.push(boxMatrix(3.0,0.02,0.85,ix,0.04,iz+k*1.8)); } }
  makeInstanced(boxGeo,zebraMat,_zebraM);
  // street trees di tepi avenue & jalan komersial (offset ~6-8 m dari as jalan)
  // Tahap 4: 3 pohon dipindah karena berdiri DI jalan (audit roadDist):
  // (-14,-58) 0,37 m -> (-16,-66) 8,5 m; (8,-8) 1,61 m -> (20,-12) 6,9 m;
  // (15,44) 1,34 m -> (26,40) 9,8 m. 0 tris (pindah saja).
  for(const [x,z] of [[11,-72],[-16,-66],[20,-12],[-11,20],[26,40],[9,-40],[-44,-19],[-20,-17],[36,20],[60,28]]) makeTree(x,z);
  // pohon pantai timur (di strip pasir x 100-125, z -60..-20)
  for(const [x,z] of [[108,-30],[115,-45],[110,-55],[118,-25]]) makeTree(x,z);
  // P0-1: palem + beach dressing — semua posisi deterministik, sudah dicek
  // jaraknya dari jalan terdekat (nearestRoadDist, clear >=1 m dari tepi jalan).
  // 10 palem pantai di strip pasir + 5 palem boulevard downtown/market.
  for(const [x,z] of [[102,-26],[106,-54],[114,-24],[118,-54],[121,-34],[103,-36],[119,-42],[108,-22],[120,-46],[122,-26]]) makePalm(x,z);
  for(const [x,z] of [[25,15],[-55,-45],[61,-39],[4,-63],[17,-9]]) makePalm(x,z);
  // Lifeguard tower ala South Beach di (112,-40): 4 tiang + kabin + atap miring
  // (~6 box). Collider kecil 2,4x2,2 — di tengah pasir, tidak menghalangi jalan;
  // tingginya ~4 m, jauh di bawah mercusuar (16 m) jadi tidak menutupinya.
  { const tgy=terrainHeight(112,-40);
    for(const [ox,oz] of [[-0.9,-0.9],[0.9,-0.9],[-0.9,0.9],[0.9,0.9]])
      box(0.25,2.6,0.25,MAT.crate,112+ox,tgy+1.3,-40+oz);
    box(2.4,1.2,2.0,MAT.sidewalk,112,tgy+3.2,-40);
    const roof=box(2.8,0.15,2.4,MAT.container,112,tgy+3.95,-40); roof.rotation.z=0.18;
    addCollider(112,-40,2.4,2.2); }
  // Payung (6x tiang + cone 8-seg warna-warni) + lounger (6x box tipis miring),
  // disebar di pasir di luar jalur pejalan kaki utama; tanpa collider (seperti
  // bangku/bak sampah) supaya tidak menjebak pemain.
  const umbConeGeo=new THREE.ConeGeometry(1.6,0.9,8); // dipakai bersama 6 payung
  // Tahap 1: kerucut payung (6, 2 material) jadi 2 InstancedMesh; tiang tetap mesh.
  const _umbM=[], _umb2M=[];
  for(let i=0;i<6;i++){
    const [ux,uz]=[[107,-28],[110,-48],[114,-32],[117,-53],[105,-40],[119,-28]][i];
    const ugy=terrainHeight(ux,uz), umat=i%2?MAT.container:MAT.container2;
    box(0.12,2.2,0.12,MAT.lampPole,ux,ugy+1.1,uz);
    // Asli: umat=i%2?MAT.container:MAT.container2 — genap -> container2, ganjil -> container.
    (i%2?_umbM:_umb2M).push(boxMatrix(1,1,1,ux,ugy+2.5,uz));
    const [lx2,lz2]=[[108.5,-28],[111.5,-48],[115.5,-32],[118.5,-53],[106.5,-40],[119,-29.5]][i];
    const lgy2=terrainHeight(lx2,lz2);
    const lg=box(0.7,0.18,1.9, i%2?MAT.container2:MAT.container, lx2, lgy2+0.35, lz2);
    lg.rotation.x=0.18; lg.rotation.y=i*0.7;
  }
  makeInstanced(umbConeGeo,MAT.container,_umbM,{cast:true});
  makeInstanced(umbConeGeo,MAT.container2,_umb2M,{cast:true});
  // Boardwalk kayu 25x3 m di tepi timur pasir menghadap teluk (1 plane, 2 tris).
  // Fase 6 (F11): tekstur papan kayu (canvas, 0 tris) + papan tepi barat
  // (0,15 m, 12 tris) supaya boardwalk terbaca dari jalan.
  { const bgy=terrainHeight(123,-40);
    const bwTex=canvasTex(128,256,(g,w,h)=>{ g.fillStyle='#8a6a34'; g.fillRect(0,0,w,h);
      for(let x=0;x<w;x+=16){ g.fillStyle=`rgba(0,0,0,${0.1+0.12*((x/16)%2)})`; g.fillRect(x,0,2,h); }
      g.fillStyle='rgba(0,0,0,.18)';
      for(let y=0;y<h;y+=32) g.fillRect(0,y,w,2); });
    const bwMat=new THREE.MeshStandardMaterial({ map:bwTex, roughness:1 });
    const bw=new THREE.Mesh(new THREE.PlaneGeometry(3,25), bwMat);
    bw.rotation.x=-Math.PI/2; bw.position.set(123,bgy+0.12,-40);
    bw.receiveShadow=true; scene.add(bw);
    box(0.15,0.15,25,MAT.crate,121.5,bgy+0.2,-40); }
  // park benches + flower beds
  const benchMat=new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1 });
  const bedMat=new THREE.MeshStandardMaterial({ color:0xb3507a, roughness:1 });
  for(const [x,z,ry] of [[-12,36,0],[12,36,0],[-22,50,Math.PI],[12,50,Math.PI],[44,28,Math.PI/2],[-40,-2,Math.PI/2]]){
    const b=new THREE.Group();
    const seat=box(2.2,0.14,0.6,benchMat,0,0.55,0,b); const back=box(2.2,0.6,0.12,benchMat,0,0.95,-0.28,b);
    box(0.12,0.55,0.5,MAT.lampPole,-0.9,0.28,0,b); box(0.12,0.55,0.5,MAT.lampPole,0.9,0.28,0,b);
    b.position.set(x,0,z); b.rotation.y=ry; scene.add(b); }
  for(const [x,z] of [[-8,44],[-14,38],[-6,36]]) box(2.4,0.5,1.2,bedMat,x,0.25,z);
  // trash bins + fire hydrants (tepi jalan baru)
  const binGeo=new THREE.CylinderGeometry(0.45,0.4,1,8);
  const binMat=new THREE.MeshStandardMaterial({ color:0x2e4a3a, roughness:.9 });
  // Tahap 4: 2 bin dipindah ke distrik yang belum punya bin (0 tris) —
  // (13,34) -> plaza downtown (16,-64); (66,26) -> ujung boardwalk pantai (122,-52).
  for(const [x,z] of [[9,-6],[16,-64],[-13,2],[40,26],[-42,-20],[122,-52]]){
    const bin=new THREE.Mesh(binGeo,binMat); bin.position.set(x,0.5,z); scene.add(bin); }
  const hydMat=new THREE.MeshStandardMaterial({ color:0xc23b2e, roughness:.6 });
  // Tahap 4: hydrant (7,-10) berdiri DI tengah avenue (roadDist 0,53 m) ->
  // dipindah ke docks (70,-44), roadDist 6,1 m — docks akhirnya punya hydrant. 0 tris.
  for(const [x,z] of [[70,-44],[10,30],[-12,0],[30,16]]){
    const hyd=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.32,0.9,8),hydMat);
    hyd.position.set(x,0.45,z); scene.add(hyd); }
  // bus stop shelter di sisi utara jalan komersial barat
  box(0.18,2.6,0.18,MAT.lampPole,-38,1.3,-5); box(0.18,2.6,0.18,MAT.lampPole,-34,1.3,-5);
  box(4.4,0.18,1.6,roofMat,-36,2.7,-5);
  box(3.6,0.14,0.55,benchMat,-36,0.55,-5);
  // distant skyline backdrop — Velmora beyond the playable district (no colliders, no shadows)
  const skyPos=[[-120,-60],[-90,-125],[-40,-128],[10,-125],[60,-128],[105,-110],[-128,20],[-128,70],[128,40],[128,80],[-60,128],[40,128]];
  for(const [x,z] of skyPos){
    const h=rand(30,68), w=rand(14,22);
    // Urutan rng dipertahankan persis seperti semula (h, w, material, depth)
    // supaya kedalaman + material tiap menara latar tidak berubah.
    const mi=Math.floor(rng()*buildingMats.length), sd=rand(14,22);
    const m=new THREE.Mesh(boxGeo, buildingMats[mi]);
    m.scale.set(w,h,sd); m.position.set(x,h/2,z); scene.add(m);
    // Tahap 2: skyline bukan lagi kotak polos — undakan atap di tiap menara
    // latar + spire di 2 menara tertinggi (tanpa rng baru, tanpa collider).
    const sb=new THREE.Mesh(boxGeo,m.material);
    sb.scale.set(w*0.6,h*0.12,sd*0.6); sb.position.set(x,h+h*0.06,z); scene.add(sb);
    if(h>60){ const sp=new THREE.Mesh(pyrGeo,roofMat);
      sp.scale.set(2.5,10,2.5); sp.rotation.y=Math.PI/4;
      sp.position.set(x,h+h*0.12+5,z); scene.add(sp); } }
  // freighter moored at the harbour (backdrop, east water)
  box(9,4.5,36,new THREE.MeshStandardMaterial({ color:0x1c2733, roughness:.7, metalness:.3 }),128,1.8,-60);
  box(6,3,6,new THREE.MeshStandardMaterial({ color:0xd8d8d8, roughness:.8 }),128,6,-72);
  box(7,2.6,2.6,MAT.container,126,6.2,-52); box(7,2.6,2.6,MAT.container2,130,6.2,-62);
}
// ---------- FASE 3 landmarks (redesign 2026-11-19): 6 landmark, 1 mesh khas + nama di minimap ----------
// Semua alas y=terrainHeight(posisi); semua di luar koridor jalan (nearestRoadDist > w/2+1),
// kecuali jembatan (di atas jalan penyeberangan). Collider tetap AABB 2D. Tanpa rng di sini
// (supaya urutan rng sesudahnya tidak bergeser), tanpa material/lampu/tekstur baru.
// Nama + posisi label minimap (lihat drawMinimap).
const LANDMARKS=[
  { name:'MENARA KEMBAR', x:28, z:-68 }, // titik tengah pasangan menara (16,-72) & (40,-64)
  { name:'JEMBATAN SUNGAI', x:71.5, z:-71.5 },
  { name:'MERCUSUAR', x:104, z:-44 },
  { name:'OBSERVATORIUM', x:0, z:-108 },
  { name:'STADION', x:-60, z:20 },
  { name:'DANAU TAMAN', x:-10, z:48 },
];
{
  // 1. Menara kembar pusat kota — mengapit plaza downtown (24,-64) dari barat-daya & timur.
  // (16,-72): jalan 12,6 m, gedung terdekat 3 m di timur; (40,-64): jalan 12,3 m,
  // gedung terdekat 1 m di utara & 2,1 m di barat (cek via collider minimap). Atap piramida + antena.
  const towers=[[16,-72,38,6],[40,-64,32,1]]; // [x,z,tinggi,indeks buildingMats]
  for(const [x,z,h,mi] of towers){
    const gy=terrainHeight(x,z);
    const shaft=new THREE.Mesh(boxGeo,buildingMats[mi]); shaft.scale.set(8,h,8);
    shaft.position.set(x,gy+h/2,z); shaft.receiveShadow=true; scene.add(shaft);
    box(9,1,9,roofMat,x,gy+h+0.5,z);
    // P0-2: crown/setback 3 undakan di puncak tiap menara (reuse boxGeo +
    // material menara yang sama); spire + antena naik ke atas undakan tertinggi.
    box(6.5,2,6.5,buildingMats[mi],x,gy+h+2,z);
    box(4.5,1.8,4.5,buildingMats[mi],x,gy+h+3.9,z);
    box(3,1.6,3,buildingMats[mi],x,gy+h+5.6,z);
    const spire=new THREE.Mesh(new THREE.ConeGeometry(2.4,6,4),roofMat);
    spire.position.set(x,gy+h+9.4,z); scene.add(spire);
    box(0.18,7,0.18,MAT.lampPole,x,gy+h+15.9,z); // antena di puncak spire
    addCollider(x,z,8,8);
  }
  // P0-3: papan neon VELMORA di fasad selatan menara 1 (16,-72) — menghadap plaza/kota.
  addNeonSign('VELMORA','#1a0a2e','#ff4fd8',16,terrainHeight(16,-72)+14,-72+4+0.06,0,7,1.8);
  // 2. Jembatan sungai — avenue diagonal (84,-84)-(48,-48) memotong kanal x 57-79, z -100..-64.
  // Deck mengikuti arah edge (tengah penyeberangan (71,5,-71,5), panjang 24 m bank-ke-bank),
  // y jalan 0,02, air -0,3: deck tipis (atas 0,04) supaya mobil tidak tersangkut.
  // 2 pilar di DALAM kanal, digeser ±4 m tegak lurus as jalan (bukan di tengah jalan).
  const bdx=-36, bdz=36, bYaw=Math.atan2(-bdz,bdx); // arah edge 28-29
  const bpx=-bdz/Math.hypot(bdx,bdz), bpz=bdx/Math.hypot(bdx,bdz); // tegak lurus satuan
  const deck=box(24,0.24,11,MAT.road,71.5,-0.08,-71.5); deck.rotation.y=bYaw;
  for(const off of [-1,1]){
    const r=box(24,1.0,0.3,MAT.lampPole,71.5+bpx*off*5.9,0.55,-71.5+bpz*off*5.9);
    r.rotation.y=bYaw; }
  for(const [px,pz] of [[68.7,-74.3],[74.3,-68.7]]){
    box(1.6,2.2,1.6,MAT.sidewalk,px,-1.1,pz); addCollider(px,pz,1.6,1.6); }
}
{
  // 3. Mercusuar + pier dermaga — mercusuar di pantai timur (104,-44), tanah 0,05 m,
  // 11,9 m dari highway, 29,5 m dari target dermaga (78,-58). Ruang lampu pakai MAT.lampGlow
  // (emissive saja, TANPA lampu dinamis baru). Pita merah = MAT.container.
  const lx=104, lz=-44, lgy=terrainHeight(lx,lz);
  box(4.4,1.2,4.4,MAT.sidewalk,lx,lgy+0.6,lz);
  // Fase 6 (F10): batang putih (material khusus, hanya dipakai di sini) +
  // pita 2→3 m dengan radius disesuaikan supaya tetap di luar batang.
  const lighthouseMat=new THREE.MeshStandardMaterial({ color:0xf2ecdc, roughness:.8 });
  const lt=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.2,12,8),lighthouseMat);
  lt.position.set(lx,lgy+1.2+6,lz); scene.add(lt);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(1.9,2.1,3,8),MAT.container);
  band.position.set(lx,lgy+7.2,lz); scene.add(band);
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,2.2,6),MAT.lampGlow);
  lamp.position.set(lx,lgy+14.3,lz); scene.add(lamp);
  const lcap=new THREE.Mesh(new THREE.ConeGeometry(1.6,1.6,6),roofMat);
  lcap.position.set(lx,lgy+16.2,lz); scene.add(lcap);
  addCollider(lx,lz,4.4,4.4);
  // Pier: papan kayu (MAT.crate) dari pantai x=99 ke teluk x=120 di z=-58 — ujung barat
  // 1,1 m di timur tepi highway (jalan 8,0 m), ujung timur 3,5 m sebelum freighter (123,5).
  // Jarak terdekat ke target dermaga 21,0 m (tidak memblokir). Collider di deck penuh.
  const pgy=terrainHeight(109.5,-58);
  box(21,0.3,4,MAT.crate,109.5,pgy+0.55,-58);
  for(const px of [103,110,117]) for(const off of [-1.5,1.5])
    box(0.5,1.4,0.5,MAT.trunk,px,pgy-0.1,-58+off);
  addCollider(109.5,-58,21,4);
  // 4. Observatorium di bukit — puncak bukit TERTINGGI B2 (0,-108), tanah 4,0 m,
  // 14,8 m dari highway. Kubah setengah bola (MAT.sand, pucat) + alas silinder + celah gelap.
  const ox=0, oz=-108, ogy=terrainHeight(ox,oz);
  const ob=new THREE.Mesh(new THREE.CylinderGeometry(4.5,5,3,8),MAT.sidewalk);
  ob.position.set(ox,ogy+1.5,oz); scene.add(ob);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(3.6,8,5,0,Math.PI*2,0,Math.PI/2),MAT.sand);
  dome.position.set(ox,ogy+3,oz); scene.add(dome);
  box(0.8,2.2,0.4,MAT.asphalt2,ox,ogy+4.6,oz+3.0); // celah teleskop menghadap kota (selatan)
  addCollider(ox,oz,9,9);
}
{
  // 5. Stadion kecil — lapangan oval di area datar (-60,20), tanah ~0, jalan terdekat 14,1 m,
  // target terdekat 24,4 m (safehouse). Tribun rendah 4 sisi (collider), lapangan tanpa collider.
  const sgy=terrainHeight(-60,20);
  const field=new THREE.Mesh(new THREE.CircleGeometry(1,24),MAT.leaf);
  field.rotation.x=-Math.PI/2; field.scale.set(14,1,9);
  field.position.set(-60,sgy+0.05,20); field.receiveShadow=true; scene.add(field);
  for(const [sx,sz,sw,sd] of [[-60,9,24,4],[-60,31,24,4],[-76,20,4,14],[-44,20,4,14]]){
    box(sw,3,sd,MAT.sidewalk,sx,sgy+1.5,sz); addCollider(sx,sz,sw,sd); }
  // 6. Taman kota + danau — kolam lama (-10,48) 10x6 diperbesar jadi danau oval 18x12
  // (CircleGeometry skala 9x6, MAT.water) di lembah taman, y di atas puncak kolam lama.
  // Bangku baru di tepi selatan (-10,56) & tenggara (-2,38); 4 pinus kerucut di sekeliling.
  // 26 pohon taman lama tetap (tidak disentuh). Bangku lama (-12,50) dipindah ke (-22,50).
  const lgy=terrainHeight(-10,48);
  const lake=new THREE.Mesh(new THREE.CircleGeometry(1,24),MAT.water);
  lake.rotation.x=-Math.PI/2; lake.scale.set(9,1,6);
  lake.position.set(-10,lgy+0.35,48); scene.add(lake);
  const bench=(x,z,ry)=>{ const g=new THREE.Group();
    box(2.2,0.14,0.6,MAT.crate,0,0.55,0,g); box(2.2,0.6,0.12,MAT.crate,0,0.95,-0.28,g);
    box(0.12,0.55,0.5,MAT.lampPole,-0.9,0.28,0,g); box(0.12,0.55,0.5,MAT.lampPole,0.9,0.28,0,g);
    g.position.set(x,terrainHeight(x,z),z); g.rotation.y=ry; scene.add(g); };
  bench(-10,56,Math.PI); bench(-2,38,-Math.PI/2);
  for(const [tx,tz] of [[-22,44],[-22,52],[-6,54],[-2,44]]){
    const ty=terrainHeight(tx,tz), tg=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.35,2.2,6),MAT.trunk);
    trunk.position.y=1.1; tg.add(trunk);
    const top=new THREE.Mesh(new THREE.ConeGeometry(1.9,3.4,7),MAT.leaf);
    top.position.y=3.6; top.castShadow=true; tg.add(top);
    tg.position.set(tx,ty,tz); scene.add(tg); }
}
function makeTree(x,z){
  // Tahap 1: tanpa mesh per pohon — kumpulkan matriks instance. rng dipakai
  // dengan urutan & jumlah yang sama seperti sebelumnya (material dulu, lalu skala).
  const gy=terrainHeight(x,z);
  _treeTrunkM.push(boxMatrix(1,1,1,x,gy+1.1,z));
  const leafMat=rng()<0.5?MAT.leaf:MAT.leaf2;
  const s=rand(1.4,2.1);
  (leafMat===MAT.leaf?_treeLeafM:_treeLeaf2M).push(
    new THREE.Matrix4().compose(new THREE.Vector3(x,gy+3.1,z),new THREE.Quaternion(),new THREE.Vector3(s,s,s)));
}
// P0-1: palem — geometri dipakai bersama (pelajaran Langkah 0: jangan bikin
// geometri baru per pohon). Batang silinder 6-seg (24 tris) + 6 daun cone 7-seg
// (14 tris/daun) = 108 tris/palem. Tanpa collider, sama seperti pohon biasa.
function makePalm(x,z){
  // Tahap 1: tanpa mesh per palem — kumpulkan matriks instance (transform lokal
  // daun/batang persis seperti sebelumnya; grup hanya translasi (x,gy,z)).
  const gy=terrainHeight(x,z);
  _palmTrunkM.push(new THREE.Matrix4().compose(new THREE.Vector3(x,gy+2.3,z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),0.15),new THREE.Vector3(1,1,1)));
  // puncak batang setelah miring 0,15 rad (pusat batang di y=2,3)
  const topX=Math.sin(0.15)*2.3, topY=2.3+Math.cos(0.15)*2.3;
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2;
    // Fase 6 (F4): pelepah lebih menunduk (droop -0,6), pusat lebih ke luar
    // (1,3 m), panjang selang-seling — supaya kanopi tidak menyatu jadi
    // massa cone seperti pinus.
    const dir=new THREE.Vector3(Math.cos(a)*0.85,-0.6,Math.sin(a)*0.85).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(_palmUp, dir);
    const lp=new THREE.Vector3(topX+dir.x*1.3, topY+dir.y*1.3, dir.z*1.3);
    // Asli: i%2?MAT.leaf:MAT.leaf2 — genap -> leaf2, ganjil -> leaf.
    (i%2?_palmLeafM:_palmLeaf2M).push(
      new THREE.Matrix4().compose(new THREE.Vector3(x+lp.x,gy+lp.y,z+lp.z),q,new THREE.Vector3(1,i%2?1.15:0.85,1)));
  }
}
// street lamps along road edges (satu sisi bergantian tiap ~26 m; gang dilewati)
// Langkah 0: satu geometri bola lampu (0.32, 6x4 segmen) dipakai bersama semua lampu.
// Tahap 1: tiang + lengan + bola jadi 3 InstancedMesh (dulu 87x3 = 261 draw call).
// Tahap 4: deck jalan layang/underpass berpusat (-3,-49), rotasi atan2(10,18)
// (sama dengan UP_YAW Tahap 3) — lampu di dalam footprint-nya menembus deck
// (tiang (-8.86,-45.75) & (9.36,-50.24), bohlam y 5,2 mencuat di atas deck).
// Dilewati di sini: -2 lampu (~-120 tris, 0 tris baru).
const lampBulbGeo=new THREE.SphereGeometry(0.32,6,4);
const _poleM=[], _armM=[], _bulbM=[];
const _t4UpC=Math.cos(Math.atan2(10,18)), _t4UpS=Math.sin(Math.atan2(10,18));
for(const e of ROAD_EDGES){
  if(e.type==='alley') continue;
  const A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
  const dx=B[0]-A[0], dz=B[1]-A[1], len=Math.hypot(dx,dz);
  const nx=dx/len, nz=dz/len, px=-nz, pz=nx; // unit perpendicular
  const n=Math.max(1,Math.floor(len/26));
  for(let i=0;i<n;i++){
    const t=(i+0.5)/n, side=(i%2===0)?1:-1;
    const x=A[0]+dx*t+px*side*(e.w/2+1.2), z=A[1]+dz*t+pz*side*(e.w/2+1.2);
    // Tahap 4: lewati lampu di dalam footprint deck underpass (koordinat lokal
    // terhadap pusat (-3,-49): |lx|<16 sepanjang deck, |lz|<7 selebar deck).
    const _upDx=x+3, _upDz=z+49;
    if(Math.abs(_upDx*_t4UpC-_upDz*_t4UpS)<16&&Math.abs(_upDx*_t4UpS+_upDz*_t4UpC)<7) continue;
    _poleM.push(boxMatrix(0.22,5.4,0.22,x,2.7,z));
    _armM.push(boxMatrix(1.6,0.18,0.18,x-px*side*0.7,5.3,z-pz*side*0.7,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(pz*side,-px*side))));
    _bulbM.push(boxMatrix(1,1,1,x-px*side*1.4,5.2,z-pz*side*1.4));
  }
}
makeInstanced(boxGeo,MAT.lampPole,_poleM);
makeInstanced(boxGeo,MAT.lampPole,_armM);
makeInstanced(lampBulbGeo,MAT.lampGlow,_bulbM);
for(let i=0;i<40;i++){ const x=rand(-95,95), z=rand(-95,95);
  if(isRoad(x,z)||pointInCollider(x,z,1.5)||riverMask(x,z)>0.05) continue;
  if(Math.hypot(x-24,z+64)<8){ // Tahap 4: jangan di plaza downtown (24,-64) —
    // seed 7 ada crate di tengah plaza. Konsumsi rng TETAP seperti kode lama
    // (rng 0.6; crate: 3x rand ukuran; pohon: rng material + rand skala —
    // makeTree tanpa menanam) agar stream tidak bergeser.
    if(rng()<0.6){ rand(0.8,1.4); rand(0.8,1.4); rand(0.8,1.4); }
    else { rng(); rand(1.4,2.1); }
    continue; }
  if(rng()<0.6){ box(rand(0.8,1.4),rand(0.8,1.4),rand(0.8,1.4),MAT.crate,x,0.6,z); addCollider(x,z,1.2,1.2); }
  else makeTree(x,z); }
flushTreesPalms(); // Tahap 1: buat InstancedMesh pohon/palem (pemakaian makeTree terakhir).

// ---------- TAHAP 3: road infrastructure (2026-11-20) ----------
// Referensi: GTA V Del Perro Freeway / Interstate 2 (gta.fandom.com/wiki/Interstate_2):
// 6-8 lajur, 4 overpass di Downtown, gantry rambu hijau, berbasis I-10/US 101
// Downtown LA; La Puerta Freeway / Interstate 5 + Miriam Turner Overpass.
// Implementasi prosedural orisinal — tanpa aset/teksur/peta Rockstar.
// Semua posisi terverifikasi numerik (shot-tools/t3-probe2.mjs, 2 jalan terdekat):
// di luar koridor jalan (nearestRoadDist > w/2) kecuali marka yang memang di atas
// aspal; collider hanya untuk tiang/pilar/pulau (0 tris). Tanpa rng — urutan rng
// bersama tidak bergeser. Anggaran: 264 tris (target ≤ ~300), +10 draw call.
// Sub-item: (1) jalan layang 90 | (2) underpass 46 | (3) trotoar 12 |
// (4) persimpangan 32 | (5) street furniture 62 | (6) marka 22.
{
  const UP_YAW=Math.atan2(10,18); // rotasi grup underpass (-3,-49)
  const qY=a=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),a);
  const t3PlaneGeo=new THREE.PlaneGeometry(1,1);
  const t3WhiteMat=new THREE.MeshBasicMaterial({ color:0xe8e8e0 });
  const t3CurbMat=new THREE.MeshStandardMaterial({ color:0x9a958a, roughness:.95, side:THREE.DoubleSide });
  const t3BenchMat=new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1 });
  // (1) Jalan layang — pilar-T tunggal di sudut timur-laut deck (satu-satunya titik
  // yang lolos dari jalan (2,49) + gedung kantong barat; sisi barat deck terhalang
  // gedung konstruksi (-18,-47) + mid-rise (-16,-36)). Guardrail di tepi atas deck.
  // Soffit balok melintang di bawah deck (plane, terlihat dari jalan di bawah).
  // Gantry rambu di avenue utara underpass (pendekatan selatan terhalang jalan
  // (2,49) yang memotong mulut terowongan) — tiang portal + balok + papan VELMORA.
  const _t3poleM=[], _t3concM=[];
  _t3concM.push(boxMatrix(0.8,4.1,0.8,11.61,2.05,-50.48)); // kolom pilar-T
  _t3concM.push(boxMatrix(1.0,0.5,2.5,11.10,3.9,-51.40,qY(-1.064))); // cap (sejajar tepi deck)
  addCollider(11.61,-50.48,0.9,0.9);
  for(const [gx,gz] of [[-0.16,-43.89],[-5.84,-54.11]]) // guardrail tepi deck (lokal z=±5,85)
    _t3concM.push(boxMatrix(30,0.5,0.15,gx,5.35,gz,qY(UP_YAW)));
  _t3poleM.push(boxMatrix(0.25,5.6,0.25,6.19,2.8,-32.93)); // tiang gantry timur
  _t3poleM.push(boxMatrix(0.25,5.6,0.25,-5.91,2.8,-37.77)); // tiang gantry barat
  _t3poleM.push(boxMatrix(13.4,0.5,0.4,0.14,5.6,-35.35,qY(-0.38))); // balok gantry
  addCollider(6.19,-32.93,0.4,0.4); addCollider(-5.91,-37.77,0.4,0.4);
  { // papan gantry VELMORA (hijau ala rambu freeway GTA) — menyala malam via shopSignMats
    const tex=signTex('VELMORA','#0a5c2e','#ffffff');
    const mat=new THREE.MeshStandardMaterial({ map:tex, emissiveMap:tex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    shopSignMats.push(mat);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(8,1.8),mat);
    m.position.set(0.14,4.4,-35.35); m.rotation.y=2.76; scene.add(m); }
  // (2) Underpass — portal: 3 tiang pilaster (mulut tenggara TIDAK dapat tiang:
  // jalan (2,49) memotong tepat di situ; diganti pilaster datar di muka dinding,
  // di dalam envelope collider dinding). Strip cahaya + garis tepi di dalam.
  for(const [px,pz] of [[-11.62,-51.25],[5.62,-46.75],[-6.66,-40.49]])
    _t3concM.push(boxMatrix(0.5,4.6,0.4,px,2.3,pz,qY(UP_YAW)));
  addCollider(-11.62,-51.25,0.8,0.8); addCollider(5.62,-46.75,0.8,0.8); addCollider(-6.66,-40.49,0.8,0.8);
  const _t3curbM=[], _t3stripM=[], _t3whiteM=[], _t3benchM=[];
  // pilaster datar mulut tenggara (di muka dinding, y 0..4,6)
  _t3curbM.push(new THREE.Matrix4().compose(new THREE.Vector3(-0.14,2.3,-57.54),qY(UP_YAW),new THREE.Vector3(0.9,4.6,1)));
  // strip cahaya emissive di muka dalam dinding (y 3,5, sejajar jalan)
  for(const [sx,sz] of [[2.64,-52.13],[-8.64,-45.87]])
    _t3stripM.push(new THREE.Matrix4().compose(new THREE.Vector3(sx,3.5,sz),qY(-1.064),new THREE.Vector3(10,0.15,1)));
  // garis tepi di dalam underpass (lokal x=±5, sepanjang 12 m)
  _t3whiteM.push(flatMatrix(12,0.15,1.37,-51.43,-1.064,0.05));
  _t3whiteM.push(flatMatrix(12,0.15,-7.37,-46.57,-1.064,0.05));
  // soffit 2 balok melintang di bawah deck (lokal z=±3, y 4,08)
  _t3curbM.push(flatMatrix(13.6,0.7,-1.55,-46.38,UP_YAW,4.08));
  _t3curbM.push(flatMatrix(13.6,0.7,-4.46,-51.62,UP_YAW,4.08));
  // (3) Trotoar — curb vertikal 5×0,18 di tepi trotoar, 2 ruas avenue + 1 komersial
  // + 3 di simpang (48,22). (Sudut simpang (6,0) TIDAK dapat curb: 2 diagonal +
  // gang memotong semua sudutnya — posisi digeser ke ruas lurus di dekatnya.)
  const vertPlane=(w,h,x,z,dx,dz)=>new THREE.Matrix4().compose(
    new THREE.Vector3(x,0.09,z),qY(Math.atan2(-dz,dx)),new THREE.Vector3(w,h,1));
  _t3curbM.push(vertPlane(5,0.18,5.16,14.08,-0.447,0.894)); // avenue (68,6) timur
  _t3curbM.push(vertPlane(5,0.18,-6.86,13.32,-0.447,0.894)); // avenue (68,6) barat
  _t3curbM.push(vertPlane(5,0.18,17.33,-2.88,0.97,0.24)); // komersial (5,16) selatan
  _t3curbM.push(vertPlane(5,0.18,41.45,23.94,0.79,0.61)); // simpang (48,22) barat-utara
  _t3curbM.push(vertPlane(5,0.18,52.85,26.81,0.986,-0.164)); // simpang (48,22) timur-utara
  _t3curbM.push(vertPlane(5,0.18,58.21,13.47,0.43,-0.91)); // simpang (48,22) diagonal-timur
  // (4) Persimpangan — stop line (hanya 2 yang lolos dari simpul diagonal (6,0):
  // utara/barat tertutup simpang susun node 67/68/69), pulau sudut di (48,22),
  // rambu STOP + BEACH → di satu tiang.
  _t3whiteM.push(flatMatrix(0.5,2.5,-1.32,-12.18,2.11,0.045)); // stop, avenue selatan
  _t3whiteM.push(flatMatrix(0.5,2.5,11.82,1.44,-0.243,0.045)); // stop, komersial timur
  _t3concM.push(boxMatrix(2.2,0.18,1.6,55.52,0.09,31.91)); // pulau lalu lintas sudut
  addCollider(55.52,31.91,2.4,1.8);
  _t3poleM.push(boxMatrix(0.14,2.6,0.14,44.13,1.3,10.69)); // tiang rambu
  addCollider(44.13,10.69,0.4,0.4);
  for(const [txt,bg,ry] of [['STOP','#a02020',-2.23],['BEACH →','#0a5c2e',0.91]]){
    const tex=signTex(txt,bg,'#ffffff');
    const mat=new THREE.MeshStandardMaterial({ map:tex, emissiveMap:tex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    shopSignMats.push(mat);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.1),mat);
    m.position.set(44.13,2.4,10.69); m.rotation.y=ry; scene.add(m); }
  // (5) Street furniture — halte bus ke-2 (sisi selatan komersial timur; sisi utara
  // terhalang palem (25,15) + pohon (36,20)), bangku plaza (24,-64).
  _t3poleM.push(boxMatrix(0.18,2.6,0.18,32.45,1.3,1.67));
  _t3poleM.push(boxMatrix(0.18,2.6,0.18,35.61,1.3,4.11));
  addCollider(32.45,1.67,0.4,0.4); addCollider(35.61,4.11,0.4,0.4);
  _t3curbM.push(flatMatrix(4.4,1.6,34.03,2.89,-0.66,2.7)); // atap halte (DoubleSide)
  { // bangku plaza (3 box, 36 tris) — menghadap plaza (24,-64)
    const bgy=terrainHeight(32,-62), bry=-1.82, bq=qY(bry);
    const put=(w,h,d,lx,ly,lz)=>_t3benchM.push(new THREE.Matrix4().compose(
      new THREE.Vector3(32+lx*Math.cos(bry)+lz*Math.sin(bry), bgy+ly, -62-lx*Math.sin(bry)+lz*Math.cos(bry)),
      bq, new THREE.Vector3(w,h,d)));
    put(2.2,0.14,0.6,0,0.55,0); put(2.2,0.6,0.12,0,0.95,-0.28); put(0.5,0.55,0.5,0,0.28,0); }
  makeInstanced(boxGeo,t3BenchMat,_t3benchM);
  // (6) Marka — garis tepi avenue selatan (edge 7-11, 2 sisi) + 1 panah belok.
  for(const ei of [7,8,9,10,11]){
    const e=ROAD_EDGES[ei], A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
    const dx=B[0]-A[0], dz=B[1]-A[1], len=Math.hypot(dx,dz);
    const mx=(A[0]+B[0])/2, mz=(A[1]+B[1])/2, phi=Math.atan2(-dz,dx);
    const px=-dz/len, pz=dx/len;
    for(const off of [-4.9,4.9])
      _t3whiteM.push(flatMatrix(len,0.18,mx+px*off,mz+pz*off,phi,0.045)); }
  { // panah lurus di avenue selatan (panah digambar menghadap +u canvas = searah jalan)
    const tex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#23262e'; g.fillRect(0,0,w,h);
      g.fillStyle='#e8e8e0';
      g.fillRect(18,56,62,16); // batang panah
      g.beginPath(); g.moveTo(112,64); g.lineTo(76,36); g.lineTo(76,92); g.closePath(); g.fill(); });
    const m=new THREE.Mesh(t3PlaneGeo,new THREE.MeshBasicMaterial({ map:tex }));
    m.applyMatrix4(flatMatrix(3,2,-4.41,-17.34,-1.03,0.045)); scene.add(m); }
  makeInstanced(t3PlaneGeo,t3WhiteMat,_t3whiteM);
  makeInstanced(t3PlaneGeo,t3CurbMat,_t3curbM);
  makeInstanced(t3PlaneGeo,MAT.lampGlow,_t3stripM);
  makeInstanced(boxGeo,MAT.lampPole,_t3poleM);
  makeInstanced(boxGeo,MAT.sidewalk,_t3concM);
}

// ---------- TAHAP 4: city life (2026-11-20) ----------
// (a) Papan nama distrik (P1-4): 5 plane reuse signTex + 5 tiang 1 InstancedMesh.
//     Posisi lolos validator (roadDist + river + collider + FLAT_SPOTS,
//     shot-tools/t4-validate.mjs). Material masuk shopSignMats -> menyala malam
//     seperti papan toko. (b) Lampu lalu lintas di simpang tersibuk (48,22):
//     tiang + kepala + 3 lampu plane (hijau menyala, merah/kuning redup).
// Anggaran terukur (statis): papan 5x2 + tiang 5x12 + lampu lalu lintas
// 12+12+3x2 = +100, kontainer +48, crate plaza -12, lampu deck -120,
// total +16 tris (40.758 -> 40.774) — dalam target Tahap 4 (<= ~150).
{
  const t4Signs=[
    ['DOWNTOWN','#20243a','#ffd166',-8,-32,Math.PI/2],
    ['MARKET','#0a5c2e','#ffffff',-38,10,Math.PI/2],
    ['HOMES','#123a2a','#a8f0c0',24,40,-2.19],
    ['DOCKS','#12303a','#9fd8ff',72,-14,-Math.PI/2],
    ['PERIPHERY','#26303a','#cfe8ff',-84,26,-Math.PI/2],
  ];
  const _t4postM=[];
  for(const [txt,bg,fg,x,z,ry] of t4Signs){
    const gy=terrainHeight(x,z);
    _t4postM.push(boxMatrix(0.22,3.0,0.22,x,gy+1.5,z));
    const tex=signTex(txt,bg,fg);
    const mat=new THREE.MeshStandardMaterial({ map:tex, emissiveMap:tex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    shopSignMats.push(mat);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),mat);
    m.position.set(x,gy+3.2,z); m.rotation.y=ry; scene.add(m);
    addCollider(x,z,0.5,0.5); } // tiang papan: jangan bisa ditembus mobil/pejalan kaki
  makeInstanced(boxGeo,MAT.lampPole,_t4postM);
  // lampu lalu lintas simpang (48,22): tiang di sudut timur (56,28) — di luar
  // koridor jalan (roadDist 7,2 m), jauh dari pulau T3 (55.52,31.91) & rambu.
  { const lx=56, lz=28, lgy=terrainHeight(lx,lz);
    box(0.22,4.6,0.22,MAT.lampPole,lx,lgy+2.3,lz);
    box(0.9,2.2,0.5,MAT.lampPole,lx,lgy+4.6,lz);
    const t4LightMats=[0xff2a1a,0xffb02e,0x37d67a].map(c=>new THREE.MeshBasicMaterial({ color:c, side:THREE.DoubleSide }));
    t4LightMats[0].color.multiplyScalar(0.45); t4LightMats[1].color.multiplyScalar(0.45); // merah/kuning redup, hijau menyala
    for(let k=0;k<3;k++){
      const lm=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.5),t4LightMats[k]);
      lm.position.set(lx-0.48,lgy+5.3-k*0.7,lz); lm.rotation.y=-Math.PI/2; scene.add(lm); }
    addCollider(lx,lz,0.5,0.5); }
}

// ---------- TAHAP 5: beach district (2026-11-20) ----------
// Referensi: GTA V Vespucci Beach Sidewalk (gta.fandom.com/wiki/Vespucci_Beach_Sidewalk):
// deretan kios/toko di sisi darat promenade (souvenir, es krim, surf shop),
// bangku menghadap laut di boardwalk, lifeguard hut tersebar, payung+lounger
// berbaris sejajar garis pantai, net voli antar palem. Implementasi prosedural
// orisinal — tanpa aset/teksur/peta Rockstar. Semua posisi lolos validator
// (/tmp/t5-validate.mjs — roadDist clear >=7 m, bebas collider lama).
// Anggaran (terukur per sub-item, sumTris): kios 3x16 + bangku 2x14 +
// payung 2x40 + handuk 3x2 + surfboard 2x12 + net 2 = +188 (40.774 -> 40.962).
// SKIP: bola pantai (icosahedron 20 / sphere 36 tris — di luar sisa budget,
// payoff visual kecil); tempat sampah (sudah ada bin di ujung boardwalk
// (122,-52)); palem tambahan (108 tris/palem — di luar budget).
{
  // (1) Deretan kios di sisi barat boardwalk, menghadap timur (laut/boardwalk).
  // Badan box + awning plane miring DoubleSide + papan nama reuse signTex
  // (masuk shopSignMats -> menyala malam seperti papan toko lain).
  // Grup lokal +z = timur (rotation.y = PI/2); footprint 2,0(x) x 2,6(z).
  const t5AwningMats=[new THREE.MeshStandardMaterial({ color:0xb3502e, roughness:.8, side:THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color:0x2e7a8a, roughness:.8, side:THREE.DoubleSide })];
  for(const [txt,bg,fg,x,z,bodyMat,aw] of [
    ['BEACH BAR','#7a3a1e','#ffe9a8',118.5,-33,MAT.crate,0],
    ['SURF SHOP','#12303a','#9fd8ff',118.5,-38,MAT.container2,1],
    ['ICE CREAM','#5a3a4a','#ffd166',117.8,-48.5,MAT.sidewalk,0],
  ]){
    const g=new THREE.Group();
    box(2.6,2.4,2.0,bodyMat,0,1.2,0,g);
    const awn=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.4),t5AwningMats[aw]);
    awn.position.set(0,1.85,1.45); awn.rotation.x=-0.5; g.add(awn);
    const tex=signTex(txt,bg,fg);
    const smat=new THREE.MeshStandardMaterial({ map:tex, emissiveMap:tex, emissive:0xffffff, emissiveIntensity:0, roughness:.7 });
    shopSignMats.push(smat);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.6),smat);
    sign.position.set(0,1.95,1.02); g.add(sign);
    // Fase 6 (F6): papan nama kedua di punggung barat kios (lokal z=-1,02) —
    // pemain mendekat dari barat/jalan dan hanya melihat punggung polos.
    const signB=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.6),smat);
    signB.position.set(0,1.95,-1.02); signB.rotation.y=Math.PI; g.add(signB);
    g.position.set(x,terrainHeight(x,z),z); g.rotation.y=Math.PI/2; scene.add(g);
    addCollider(x,z,2.0,2.6); } // kios di pasir WAJIB collider (menghalangi + bisa mundur)
  // (2) Bangku di boardwalk menghadap timur (laut) — pola bangku Tahap 3/4,
  // dipadatkan jadi blok beton: dudukan blok penuh ke tanah + sandaran plane
  // DoubleSide (tanpa kaki terpisah). Tanpa collider seperti bangku lain —
  // pejalan kaki tetap bisa lewat boardwalk.
  const t5BenchMat=new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1 });
  const t5BenchBackMat=new THREE.MeshStandardMaterial({ color:0x8a6a34, roughness:1, side:THREE.DoubleSide });
  for(const [bx,bz] of [[123.5,-35],[123.5,-45]]){
    const g=new THREE.Group();
    box(2.2,0.55,0.6,t5BenchMat,0,0.275,0,g);
    const back=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.7),t5BenchBackMat);
    back.position.set(0,0.9,-0.28); g.add(back);
    g.position.set(bx,terrainHeight(bx,bz),bz); g.rotation.y=Math.PI/2; scene.add(g); }
  // (3) Klaster payung + lounger tambahan, berbaris rapi sejajar garis pantai
  // (x konstan, z berjarak) — bukan acak. Kerucut 8-seg dipakai bersama 2 payung
  // baru (16 tris), tiang + lounger box seperti 6 payung lama. Tanpa collider.
  const t5UmbConeGeo=new THREE.ConeGeometry(1.6,0.9,8);
  for(const [ux,uz,umat,lx2,lz2,lmat] of [
    [107,-36,MAT.container,108.5,-36,MAT.container2],
    [108,-44,MAT.container2,109.5,-44,MAT.container],
  ]){
    const ugy=terrainHeight(ux,uz);
    box(0.12,2.2,0.12,MAT.lampPole,ux,ugy+1.1,uz);
    const cone=new THREE.Mesh(t5UmbConeGeo,umat);
    cone.position.set(ux,ugy+2.5,uz); cone.castShadow=true; scene.add(cone);
    const lgy2=terrainHeight(lx2,lz2);
    const lg=box(0.7,0.18,1.9,lmat,lx2,lgy2+0.35,lz2);
    lg.rotation.x=0.18; } // lounger sejajar garis pantai (sumbu panjang utara-selatan)
  // (4a) Handuk pantai — plane warna-warni tipis di pasir (2 tris/lembar),
  // tanpa collider. Posisi di celah kosong antar payung/lounger.
  for(const [tx,tz,tmat,ry] of [
    [110,-33,MAT.container,0.4],[105,-47.5,MAT.container2,-0.3],[112,-50,MAT.leaf,0.9],
  ]){
    const tw=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.9),tmat);
    tw.rotation.set(-Math.PI/2,0,ry); tw.position.set(tx,terrainHeight(tx,tz)+0.12,tz);
    tw.receiveShadow=true; scene.add(tw); }
  // (4b) Papan selancar bersandar di dinding barat kios BEACH BAR (x=117.5):
  // box tipis miring, puncak menyentuh dinding (rotation.z negatif -> puncak
  // condong +x/timur). Tanpa collider (menempel dinding kios yang sudah
  // ber-collider). Tanpa collider sendiri supaya tidak menjebak pemain.
  for(const [sx,sz,smat,rz] of [
    [117.15,-32.4,MAT.container,-0.28],[117.15,-33.6,MAT.container2,-0.22],
  ]){
    const sb=box(0.5,2.2,0.08,smat,sx,terrainHeight(sx,sz)+1.05,sz);
    sb.rotation.z=rz; }
  // (4c) Net voli pantai — direntang antar palem (106,-54) & (118,-54), tanpa
  // tiang baru (0 tris tiang). Plane 11,6x1,2 m + tekstur canvas grid transparan
  // (prosedural orisinal) + pita atas putih. Puncak net y=2,05: pas menyentuh
  // bawah kerucut payung (117,-53) tanpa menembusnya; dasar y=0,85.
  const t5NetTex=canvasTex(128,64,(g,w,h)=>{
    g.strokeStyle='rgba(255,255,255,.9)'; g.lineWidth=2;
    for(let x=0;x<=w;x+=8){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); }
    for(let y=0;y<=h;y+=8){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); }
    g.fillStyle='#ffffff'; g.fillRect(0,0,w,6); });
  const t5NetMat=new THREE.MeshBasicMaterial({ map:t5NetTex, transparent:true, side:THREE.DoubleSide });
  const t5Net=new THREE.Mesh(new THREE.PlaneGeometry(11.6,1.2),t5NetMat);
  t5Net.position.set(112.2,terrainHeight(112,-54)+1.45,-54); scene.add(t5Net);
}

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
    // Fase 6 (pendanaan tris): roda TIDAK melempar bayangan — hemat ~4.608
    // shadow tris/frame (24 mobil x 4 roda x 48 tris); bayangan body+kabin
    // tetap ada sehingga mobil tetap 'menapak'. Roda tetap digambar normal.
    w.rotation.z=Math.PI/2; w.position.set(x,0.38,z); g.add(w); wheels.push(w); }
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
    police:!!opts.police, traffic:!!opts.traffic, edge:opts.edge??-1, t:opts.t??0, dir:opts.dir||1,
    lane:opts.lane||0, cruise:rand(7,11), stuck:0, siren:opts.police };
  cars.push(c); return c;
}
// parked cars around the city (semua di tepi jalan baru; satu spot digeser:
// [-12,34] -> [-2,34] karena titik lama jatuh di dalam taman, jauh dari jalan baru)
const parkedSpots=[[8,50],[12,-14],[-2,34],[52,10],[-52,-14],[8,-54],[-8,74],[72,30],[-72,-54],[32,54],[-32,-74],[52,-34]];
for(const [x,z] of parkedSpots) spawnCar(x,z, (Math.abs(z)%40<20?0:Math.PI/2), pick(CAR_COLORS), {parked:true});
// traffic cars: spawn DI ATAS edge jalan (bukan grid), ikuti graf di updateTraffic
for(let i=0;i<8;i++){
  const roadEdges=ROAD_EDGES.map((e,idx)=>({e,idx})).filter(o=>o.e.type!=='alley');
  const {e,idx}=pick(roadEdges);
  const A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
  const t=rand(0.15,0.85), dir=rng()<0.5?1:-1;
  const x=lerp(A[0],B[0],t), z=lerp(A[1],B[1],t);
  const yaw=Math.atan2((B[0]-A[0])*dir,(B[1]-A[1])*dir);
  spawnCar(x,z,yaw,pick(CAR_COLORS),{traffic:true,edge:idx,t,dir});
}
// the mission-2 target sports car (red, at showroom)
const targetCar=spawnCar(48,26,Math.PI/2,0xff2020,{parked:true});
targetCar.isTarget=true;

// ---------- pedestrians ----------
// Tahap 4: pejalan kaki berbobot distrik (audit baseline: 5/14 di periphery yang
// kosong, 1 downtown, 3 market, 0 docks, 0 pantai) — market 5, downtown 3,
// homes 3, pantai 2, docks 1; jumlah tetap 14 (0 tris). Zona pantai/docks
// tetap lolos cek jalan/collider/sungai seperti sebelumnya.
const PED_ZONES=[
  ['market',5,-56,-24,56,30],['downtown',3,-35,-85,35,-25],['homes',3,-90,30,55,90],
  ['beach',2,102,-58,122,-22],['docks',1,60,-85,95,-30]];
const PED_ZONE_W=PED_ZONES.flatMap(z=>Array(z[1]).fill(z[0]));
function pedZonePick(){ return pick(PED_ZONE_W); }
function pedSpot(zone){
  const zn=PED_ZONES.find(z=>z[0]===zone)||PED_ZONES[0];
  let x,z,t=0;
  do{ x=rand(zn[2],zn[4]); z=rand(zn[3],zn[5]); t++; }
  while((isRoad(x,z)||pointInCollider(x,z,1)||riverMask(x,z)>0.05)&&t<20);
  return [x,z]; }
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
// Penugasan zona DETERMINISTIK tanpa rng tambahan: tiap ped memakai SATU
// sampel acak lama (rand(-95,95) x2 + cek jalan/collider/sungai, persis
// seperti kode lama — stream rng TIDAK bergeser), lalu dipetakan afin ke
// dalam rect zonanya, jadi posisi tetap acak (uniform di rect zona) dan
// jumlah per zona TEPAT 5 market / 3 downtown / 3 homes / 2 beach / 1 docks
// setiap seed (undian bebas 14x sempat menghasilkan 0 pantai + 0 docks di
// seed 7). Bila titik petanya jatuh di jalan/collider/sungai, digeser
// deterministik (+2 m, tanpa rng) sampai lolos — stream tetap utuh.
// pedZonePick() tetap dipakai untuk target jalan (70/30).
const PED_ZONE_ORDER=['market','downtown','homes','beach','market','docks','homes','market','downtown','market','homes','beach','market','downtown'];
for(let i=0;i<14;i++){ const zn=PED_ZONES.find(z=>z[0]===PED_ZONE_ORDER[i]);
  let ox,oz,t=0;
  do{ ox=rand(-95,95); oz=rand(-95,95); t++; }
  while((isRoad(ox,oz)||pointInCollider(ox,oz,1)||riverMask(ox,oz)>0.05)&&t<20);
  let x=zn[2]+(ox+95)/190*(zn[4]-zn[2]), z=zn[3]+(oz+95)/190*(zn[5]-zn[3]);
  // Bila titik petanya jatuh di jalan/collider/sungai, cari titik valid di
  // sekitarnya dengan SPIRAL deterministik (8 arah x radius 2..24 m, tanpa
  // rng — stream tetap utuh). Nudge satu arah terbukti gagal: nudge +x tak
  // keluar dari jalan timur-barat, nudge diagonal tak keluar dari boulevard
  // diagonal yang sejajar arahnya (1 ped sempat lahir di aspal).
  if(isRoad(x,z)||pointInCollider(x,z,1)||riverMask(x,z)>0.05){
    const _dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    let ok=false;
    for(let r=2;r<=24&&!ok;r+=2) for(const [dx,dz] of _dirs){
      const cx=x+dx*r, cz=z+dz*r;
      if(cx<zn[2]+1||cx>zn[4]-1||cz<zn[3]+1||cz>zn[5]-1) continue;
      if(!(isRoad(cx,cz)||pointInCollider(cx,cz,1)||riverMask(cx,cz)>0.05)){
        x=cx; z=cz; ok=true; break; } } }
  const p=spawnPed(x,z); p.zone=PED_ZONE_ORDER[i]; }

// ---------- pickups / cash / health ----------
const pickups=[];
function makePickup(x,z,kind){
  const g=new THREE.Group();
  if(kind==='cash'){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.12,0.45),
    new THREE.MeshStandardMaterial({color:0x3fae5a,emissive:0x1a5a2a,emissiveIntensity:.6}));
    m.rotation.y=0.6; g.add(m); }
  else { const a=box(0.7,0.22,0.22,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.4}),0,0,0,g);
    box(0.22,0.7,0.22,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.4}),0,0,0,g); }
  g.position.set(x,terrainHeight(x,z)+0.7,z); scene.add(g);
  pickups.push({ mesh:g, pos:g.position, kind, taken:false, bob:rand(0,6), baseY:terrainHeight(x,z) });
}
for(let i=0;i<8;i++){ let x,z; do{ x=rand(-90,90); z=rand(-90,90); }while(isRoad(x,z)||pointInCollider(x,z,1)||riverMask(x,z)>0.05);
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

// ---------- Fase 6 (F9): 3 mobil parkir di tepi jalan market/downtown ----------
// Ditempatkan SETELAH semua rng load-time (di bawah rivals) supaya urutan rng
// dunia seed 7 tidak bergeser; warna tetap (tanpa pick) supaya deterministik.
// Validasi: lateral ~5,25 m dari as jalan avenue (di luar lajur traffic ±w/4,
// celah 0,45-0,52 m); ≥10 m dari spot parkir lama & ≥16 m dari target misi;
// cek AABB scene: tanpa objek menembus (C: batang pohon 1 m di depan bumper).
// CATATAN: rencana awal 4 mobil — spot ke-4 (2.4,-64.1, downtown) DICABUT
// karena HUD staged max menyentuh 43.072 (>43.000); 3 mobil menahan ≤43.000.
for(const [x,z,yaw,color] of [
  [2.9,-28.1,-0.38,0xc23b2e],[33.8,17.6,0.91,0x2e6bc2],
  [6.6,28.5,0.50,0xd8a02e]])
  spawnCar(x,z,yaw,color,{parked:true});

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
    pk.bob+=dt; pk.mesh.position.y=pk.baseY+0.7+Math.sin(pk.bob*2)*0.15; pk.mesh.rotation.y+=dt;
    if(Math.hypot(player.pos.x-pk.pos.x, player.pos.z-pk.pos.z)<1.6){ pk.taken=true; pk.mesh.visible=false;
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
    // Fase 4: separasi antar-mobil traffic — mobil yang mengekor di edge yang sama
    // melambat/berhenti supaya tidak menumpuk (pola sama seperti melambat di
    // belakang mobil pemain di bawah). Hanya searah; lawan arah tetap lewat.
    const e0=ROAD_EDGES[c.edge];
    const len0=Math.hypot(ROAD_NODES[e0.b][0]-ROAD_NODES[e0.a][0],ROAD_NODES[e0.b][1]-ROAD_NODES[e0.a][1]);
    let slow=false, followSlow=false;
    if(player.inCar){ const d=c.pos.distanceTo(player.inCar.pos); if(d<9) slow=true; }
    for(const o of cars){ if(o===c||!o.traffic||o.edge!==c.edge||o.dir!==c.dir) continue;
      const gap=(o.t-c.t)*c.dir*len0; // >0 = o di depan c pada edge yang sama
      if(gap>0&&gap<8) slow=true; // terlalu dekat: berhenti (termasuk nyaris menumpuk)
      else if(gap>=8&&gap<16) followSlow=true; } // mendekat: setengah kecepatan
    const target=slow?0:followSlow?c.cruise*0.5:c.cruise;
    c.speed=lerp(c.speed,target,dt*1.5);
    // edge-following: maju sepanjang edge (t 0..1); di node pilih edge terhubung acak
    const e=ROAD_EDGES[c.edge];
    const A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
    const len=Math.hypot(B[0]-A[0],B[1]-A[1]);
    c.t+=c.dir*c.speed*dt/len;
    let node=-1;
    if(c.t>=1){ c.t=1; node=e.b; } else if(c.t<=0){ c.t=0; node=e.a; }
    if(node>=0){
      const opts=ROAD_ADJ[node].filter(i=>i!==c.edge);
      if(opts.length===0||rng()<0.08){ c.dir*=-1; } // ujung buntu, atau U-turn jarang
      else { const ni=pick(opts), ne=ROAD_EDGES[ni];
        c.edge=ni;
        if(ne.a===node){ c.t=0; c.dir=1; } else { c.t=1; c.dir=-1; } }
    }
    const e2=ROAD_EDGES[c.edge];
    const A2=ROAD_NODES[e2.a], B2=ROAD_NODES[e2.b];
    // Tahap 4 (P1-5): lajur kanan — offset lateral ±w/4 dari centerline sesuai
    // arah (kanan arah gerak = (-dz,dx)/len; dir=1 -> +w/4, dir=-1 -> -w/4).
    // Lawan arah kini berpapasan selebar w/2 (avenue 5,5 m), bukan 0.
    // Graf jalan, kecepatan, dan spawn TIDAK berubah — hanya posisi lateral.
    const _dx2=B2[0]-A2[0], _dz2=B2[1]-A2[1], _len2=Math.hypot(_dx2,_dz2)||1;
    const _lat=(-_dz2/_len2)*(e2.w/4)*c.dir, _latZ=(_dx2/_len2)*(e2.w/4)*c.dir;
    c.pos.x=lerp(A2[0],B2[0],c.t)+_lat; c.pos.z=lerp(A2[1],B2[1],c.t)+_latZ;
    c.yaw=Math.atan2((B2[0]-A2[0])*c.dir,(B2[1]-A2[1])*c.dir);
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
      if(d<1){ // new sidewalk target — Tahap 4: 70% tetap di zona asal
        // (pejalan kaki berkumpul di distriknya), 30% jalan ke distrik lain
        const zn=(p.zone&&rng()<0.7)?p.zone:pedZonePick();
        const [x,z]=pedSpot(zn); p.target.set(x,0,z); }
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
    sun.intensity=0.12; moon.intensity=0.75; hemi.intensity=0.55; amb.intensity=0.6; // Fase 6 (F2): 0.42/0.5 terlalu gelap
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
  for(const m of extraBldMats) m.emissiveIntensity=winGlow; // Tahap 2: curtain + ribbon
  // P0-3: papan toko + billboard menyala di malam hari; papan neon menyala lebih kuat.
  // Jendela 0,55 malam sudah ada sejak polish awal (a6c687e) — dipertahankan, sesuai target laporan ~0,5.
  const signGlow=S.night?1.2:dayF<0.35?0.8:0;
  for(const m of shopSignMats) m.emissiveIntensity=signGlow;
  for(const m of bbMats) m.emissiveIntensity=signGlow;
  const neonGlow=S.night?2:dayF<0.35?1.2:0;
  for(const m of neonMats) m.emissiveIntensity=neonGlow;
  // Tahap 1: semua bola lampu memakai SATU material (MAT.lampGlow) yang sama,
  // jadi intensitasnya cukup disetel sekali di material — dulu per mesh (lamps[]).
  MAT.lampGlow.emissiveIntensity=glow?1.8:0.15;
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
  for(const e of ROAD_EDGES){
    const A=ROAD_NODES[e.a], B=ROAD_NODES[e.b];
    const dx=B[0]-A[0], dz=B[1]-A[1], len=Math.hypot(dx,dz);
    const mx=(A[0]+B[0])/2, mz=(A[1]+B[1])/2;
    mm.save(); mm.translate((mx+WORLD+10)*sc,(mz+WORLD+10)*sc);
    mm.rotate(Math.atan2(-dx,dz)); mm.fillRect(-e.w*sc/2,-len*sc/2,e.w*sc,len*sc); mm.restore();
  }
  mm.fillStyle='#4a4438';
  for(const c of colliders){ mm.fillRect((c.minX+WORLD+10)*sc,(c.minZ+WORLD+10)*sc,
    (c.maxX-c.minX)*sc,(c.maxZ-c.minZ)*sc); }
  mm.fillStyle='#1d4e63'; mm.fillRect((118+WORLD+10)*sc,( -105+WORLD+10)*sc,60*sc,90*sc);
  // sungai (Fase 2): kanal utama x 57-79, z -100..-64 + mulut ke teluk x 79-100, z -74..-66
  mm.fillRect((57+WORLD+10)*sc,(-100+WORLD+10)*sc,22*sc,36*sc);
  mm.fillRect((79+WORLD+10)*sc,(-74+WORLD+10)*sc,21*sc,8*sc);
  const dot=(x,z,color,r=3)=>{ mm.fillStyle=color; mm.beginPath();
    mm.arc((x+WORLD+10)*sc,(z+WORLD+10)*sc,r,0,7); mm.fill(); };
  // Fase 3: nama landmark di minimap (teks kecil kontras + titik kuning)
  // Fase 4: label JEMBATAN SUNGAI digeser ke bawah (+10) — sebelumnya sebaris dengan
  // MENARA KEMBAR dan keduanya tumpang tindih (jarak pusat hanya ~36 px, lebar teks ~50 px).
  // Fase 6 (F13): MERCUSUAR digeser (-14,+12) — tadinya menumpuk JEMBATAN SUNGAI
  // dan terpotong tepi kanan canvas (pusat x≈181, teks ~32 px).
  const LAB_OFF={ 'MENARA KEMBAR':[0,-5], 'JEMBATAN SUNGAI':[0,10], 'MERCUSUAR':[-14,12],
    'OBSERVATORIUM':[0,10], 'STADION':[0,-5], 'DANAU TAMAN':[0,-5] };
  mm.font='bold 6px system-ui,sans-serif'; mm.textAlign='center';
  for(const L of LANDMARKS){
    const lx=(L.x+WORLD+10)*sc, lz=(L.z+WORLD+10)*sc;
    dot(L.x,L.z,'#ffd166',2.5);
    const off=LAB_OFF[L.name]||[0,-5];
    mm.fillStyle='#ffffff'; mm.fillText(L.name,lx+off[0],lz+off[1]); }
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
  toast(`💾 Save dimuat — ${S.mission>=1&&S.mission<=3?MISSIONS[S.mission].title:'STREET LEGEND'}`); });

// ---------- shot mode (deterministic captures for the dossier) ----------
function setupShot(){
  $('menu').style.display='none'; $('loading').style.display='none';
  S.mode='play'; S.time=16.8; // golden hour: bright, warm, readable
  if(SHOT==='start'){ S.mode='menu'; $('menu').style.display='flex';
    player.pos.set(10,0,40); player.mesh.position.copy(player.pos); }
  else if(SHOT==='play'){
    // staged action: speeding up the avenue with wanted 2, police in pursuit
    // (avenue baru: segmen (4,-76)-(-8,-58); staging dipindah dari x=10 ke x=3 —
    //  titik terdekat di avenue, karena x=10 lama sudah bukan jalan lagi;
    //  spawned clear of the parked car at (8,-54) so the staged car keeps rolling)
    const car=spawnCar(3,-75,0,0xc23b2e,{});
    player.pos.copy(car.pos); enterCar(car);
    player.inCar.speed=16; player.inCar.yaw=0;
    S.wanted=2; S.money=685; S.rep=25; S.health=82;
    spawnPolice(); spawnPolice();
    if(policeCars[0]){ policeCars[0].pos.set(1,0,-37); policeCars[0].yaw=Math.PI; policeCars[0].speed=18; }
    if(policeCars[1]){ policeCars[1].pos.set(10,0,-93); policeCars[1].yaw=0; policeCars[1].speed=20; }
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
// Tahap 1: debug performa (0 draw call / 0 tris) — dipakai shot-tools audit.
window.__dbgScene=scene; window.__dbgRenderer=renderer;

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


