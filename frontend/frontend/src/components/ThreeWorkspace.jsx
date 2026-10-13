/**
 * ProxiSpeak — ORIGINAL GEOMETRIC 3D OFFICE, no background screenshot / picture overlay.
 * A real-time architectural model built from Three.js meshes and procedural textures.
 * An imperative Three.js renderer is used here so
 * React owns the UI while WebGL owns one stable canvas and animation lifecycle.
 * Geometric positions come from the same 1200 x 720 coordinate system as our
 * tested movement / collision engine. This is a local simulation, not a call.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WORLD, FURNITURE, MY_PLAYER } from '../lib/world.js';

const UNIT = .012;
const WX = x => (x - WORLD.width / 2) * UNIT;
const WZ = y => (y - WORLD.height / 2) * UNIT;
const floor = -.12;
const T = {
  dark: 0x07121d, navy: 0x122337, titanium: 0x354758, brass: 0xd5a77f,
  turquoise: 0x55e5d3, lavender: 0xba91ff, ember: 0xffb575,
  cream: 0xe6d8c6, wood: 0x7c5e51, leaf: 0x26735b
};
function mat(color, opts={}) {return new THREE.MeshStandardMaterial({color,roughness:.62,metalness:.14,...opts});}
function group(parent, x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function cube(parent, x,y,z,w,h,d, color,opts={}) {
  const geo=new THREE.BoxGeometry(w,h,d);
  const {castShadow=true,...surfaceOptions}=opts;
  const m=new THREE.Mesh(geo,mat(color,surfaceOptions));m.position.set(x,y,z);
  m.castShadow=castShadow;m.receiveShadow=true; parent.add(m);return m;
}
function orb(parent,x,y,z,rad,color, opts={}) {
  const m=new THREE.Mesh(new THREE.SphereGeometry(rad,14,11),mat(color,opts));
  m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
}
function cyl(parent,x,y,z,rTop,rBottom,h,color,opts={},segments=16) {
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),mat(color,opts));
  m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
}
function surface(parent,x,y,z,w,d,color,opts={}) {return cube(parent,x,y,z,w,.022,d,color,{castShadow:false,...opts});}
function line(parent,a,b,r,color,emissive=false){
  const dir=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a));
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,dir.length(),8),mat(color, emissive?{emissive:color,emissiveIntensity:2,roughness:.3}:{metalness:.65,roughness:.31}));
  mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());parent.add(mesh);return mesh;
}
function point(parent,x,y,z,color,intensity=1.3,distance=5){const l=new THREE.PointLight(color,intensity,distance,2);l.position.set(x,y,z);parent.add(l);return l;}
/** Individually shaded parquet planks, joints and pores. Procedural = no remote image dependency. */
function floorTexture(){
  const c=document.createElement('canvas');c.width=1536;c.height=1536;
  const ctx=c.getContext('2d');ctx.fillStyle='#5a514a';ctx.fillRect(0,0,c.width,c.height);
  let seed=238109;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const h=40, w=240;
  for(let row=0; row<39;row++) for(let col=-2;col<9;col++){
    const x=col*w+(row%2?w/2:0),y=row*h,n=Math.floor(rnd()*33),r=86+n,g=75+n,b=68+n;
    ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(x+1,y+1,w-2,h-2);
    ctx.fillStyle='rgba(255,235,200,.095)';ctx.fillRect(x+2,y+2,w-4,1);
    for(let i=0;i<7;i++) {const yy=y+4+rnd()*(h-8);ctx.beginPath();ctx.strokeStyle=`rgba(${rnd()>.5?'255,213,175':'30,24,21'},${.012+rnd()*.07})`;
      ctx.lineWidth=.8+rnd()*1.4;ctx.moveTo(x+8,yy);ctx.bezierCurveTo(x+w*.34, yy+2-rnd()*4,x+w*.67,yy-2+rnd()*4,x+w-8,yy);ctx.stroke();}
  }
  const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;tex.repeat.set(1.18,.86);return tex;
}
function displayTexture(tint='#54e9dd'){
  const c=document.createElement('canvas');c.width=512;c.height=320;const ctx=c.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,512,320);grad.addColorStop(0,'#081a2b');grad.addColorStop(1,'#133b49');ctx.fillStyle=grad;ctx.fillRect(0,0,512,320);
  ctx.strokeStyle=tint;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(25,245);
  for(let x=25;x<494;x+=13){ctx.lineTo(x,176+Math.sin(x*.024)*42+Math.cos(x*.046)*21)}ctx.stroke();
  ctx.fillStyle='#b5cfd3';ctx.font='bold 22px Arial';ctx.fillText('PROXISPEAK  /  LIVE SPACE',26,38);
  ctx.fillStyle=tint;ctx.fillRect(27,58,225,6);ctx.fillStyle='#436f77';ctx.fillRect(27,74,375,3);
  for(let i=0;i<6;i++){ctx.fillStyle=i%2?tint:'#9b89ca';ctx.globalAlpha=.25+i*.08;ctx.fillRect(33+i*76,270-(i%3)*24,47,34+(i%3)*24)}ctx.globalAlpha=1;
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function glowStrip(parent,x1,z1,x2,z2,color){return line(parent,[x1,.02,z1],[x2,.02,z2],.018,color,true)}
function neonFrame(parent,x,z,w,d,color){
  glowStrip(parent,x-w/2,z-d/2,x+w/2,z-d/2,color);
  glowStrip(parent,x+w/2,z-d/2,x+w/2,z+d/2,color);
  glowStrip(parent,x+w/2,z+d/2,x-w/2,z+d/2,color);
  glowStrip(parent,x-w/2,z+d/2,x-w/2,z-d/2,color);
}
function glassWall(parent,x1,z1,x2,z2,color,roofRefs){
  const dx=x2-x1,dz=z2-z1, len=Math.hypot(dx,dz), ang=Math.atan2(-dz,dx);
  const root=group(parent,(x1+x2)/2,0,(z1+z2)/2);root.rotation.y=ang;
  // Low-opacity physical glass: remains transparent so avatars behind partitions stay visible.
  const glass=new THREE.Mesh(new THREE.BoxGeometry(len,1.98,.052),new THREE.MeshPhysicalMaterial({
    color,metalness:.0,roughness:.09,transmission:.74,thickness:.055,
    transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false,
    clearcoat:1,clearcoatRoughness:.05
  }));
  glass.position.y=1.0;root.add(glass);
  cube(root,0,.04,0,len,.095,.085,0x64788a,{metalness:.7});
  cube(root,0,2.02,0,len,.085,.085,0x657d90,{metalness:.72});
  for(let i=0;i<=Math.max(1,Math.ceil(len/2.4));i++){
    const q=-len/2+len*i/Math.max(1,Math.ceil(len/2.4));
    cube(root,q,1.05,0,.07,2.08,.075,0x637c8a,{metalness:.78});
  }
  line(root,[-len/2,2.08,0],[len/2,2.08,0],.018,color,true);
  if(roofRefs)roofRefs.push(root);
}
function roof(parent,x,z,w,d,color,refs){
  const g=group(parent,x,2.36,z);
  // Cutaway architectural skylight: roof beams remain visible, glass can toggle.
  for(let i=0;i<4;i++){
    const bx=-w/2+i*w/3;
    cube(g,bx,0,0,.065,.08,d,0x788294,{metalness:.72});
  }
  for(let j=0;j<3;j++)cube(g,0,0,-d/2+j*d/2,w,.08,.065,0x5d687a,{metalness:.7});
  const panel=cube(g,0,.012,0,w-.18,.018,d-.18,color,{transparent:true,opacity:.045,metalness:.35,roughness:.10,depthWrite:false,castShadow:false});
  refs.push(panel);return panel;
}
function rug(parent,x,z,w,d,color){
  // Colored light footprint instead of an opaque painted rectangle.
  // The parquet remains visible, as in the cinematic reference.
  surface(parent,x,-.086,z,w,d,color,{roughness:.92,metalness:0,
    transparent:true,opacity:.16,depthWrite:false});
  const outer=group(parent);neonFrame(outer,x,z,w+.03,d+.03,color);
}
function plant(parent,x,z,s=1,variant=0){
  const g=group(parent,x,-.05,z);g.scale.setScalar(s);
  cyl(g,0,.23,0,.16,.13,.34,variant%2?0x9e7765:0xb1aaa0,{roughness:.83},12);
  cyl(g,0,.42,0,.09,.10,.15,0x554c48);
  for(let i=0;i<10;i++){
    const a=(i*2.39996+variant),height=.56+(i%4)*.12;
    const length=.34+(i%3)*.06;
    line(g,[0,.42,0],[Math.cos(a)*length,height,Math.sin(a)*length],.015,0x33674c);
    const leaf=orb(g,Math.cos(a)*length,height,Math.sin(a)*length,.17,i%3===0?0x2e9776:i%3===1?0x237453:0x4c9b6d,{roughness:.95});
    leaf.scale.set(.74,1.22,.42);leaf.rotation.z=-Math.cos(a)*.7;leaf.rotation.x=Math.sin(a)*.6;
  }
  return g;
}
function chair(parent,x,z,angle=0,color=0x8f96a9){
  const g=group(parent,x,0,z);g.rotation.y=angle;
  cyl(g,0,.22,0,.04,.08,.33,0x55616e,{metalness:.72});
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;line(g,[0,.055,0],[Math.cos(a)*.2,.055,Math.sin(a)*.2],.023,0x586978)}
  cube(g,0,.40,0,.52,.15,.45,color,{roughness:.88});
  cube(g,0,.69,-.26,.54,.59,.12,color,{roughness:.81});
  for(const s of [-1,1])cube(g,s*.3,.49,0,.055,.08,.35,0x657689);
  return g;
}
function desk(parent,x,z,ang=0, variant=0){
  const g=group(parent,x,0,z);g.rotation.y=ang;
  const width=1.76;
  cube(g,0,.68,0,width,.10,.92,variant?0x745d57:0x9e8170,{roughness:.48,metalness:.16});
  for(const s of [-1,1]){
    cube(g,s*.78,.36,.0,.08,.65,.79,0x26384a,{metalness:.5});
    cube(g,s*.75,.72,-.38,.08,.045,.11,0xd5b594);
  }
  // twin illuminated monitors and keyboard, plus a ceramic cup.
  for(const s of [-1,1]){
    cube(g,s*.42,1.04,-.26,.68,.46,.045,0x0b1a29,{metalness:.45});
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.6,.38),new THREE.MeshBasicMaterial({map:displayTexture(variant?'#bd91fe':'#55deda')}));
    screen.position.set(s*.42,1.04,-.223);g.add(screen);
    line(g,[s*.42,.81,-.25],[s*.42,.72,-.25],.028,0x81909a);
    cube(g,s*.42,.745,.1,.58,.02,.19,0x303c4c,{metalness:.28});
  }
  cyl(g,.75,.775,.28,.075,.065,.15,0xe2c8ac);
  chair(g,0,.99,Math.PI,variant?0x90739d:0x8291a0);
  return g;
}
function table(parent,x,z,r=1.0,color=0xc6857f){
  const g=group(parent,x,0,z);
  cyl(g,0,.61,0,r,r,.10,color,{metalness:.24,roughness:.46},32);
  cyl(g,0,.31,0,.16,.20,.55,0x3c4d60,{metalness:.65},16);
  for(let i=0;i<5;i++){
    const a=i*2*Math.PI/5;
    chair(g,Math.sin(a)*(r+.46),Math.cos(a)*(r+.46),a+Math.PI, i%2?0xbe989d:0x8f789e);
    if(i<4){
      const m=cube(g,Math.sin(a)*r*.57,.695,Math.cos(a)*r*.57,.22,.024,.30,i%2?0x292f45:0xe1cfc0);
      m.rotation.y=a;
    }
  }
  return g;
}
function sofa(parent,x,z,w=2.7,ang=0,color=0x9dabae){
  const g=group(parent,x,0,z);g.rotation.y=ang;
  cube(g,0,.32,0,w,.4,.9,color,{roughness:.95});
  cube(g,0,.62,-.38,w,.68,.19,color,{roughness:.96});
  for(const s of [-1,1])cube(g,s*(w/2-.12),.49,0,.22,.55,.95,color,{roughness:.95});
  for(let i=0;i<3;i++)cube(g,(i-1)*w*.285,.54,.1,w*.27,.10,.56,i===1?0xbfc3bd:0xadb8ba,{roughness:1});
  for(const s of [-1,1])cube(g,s*(w/2-.25),.58,.2,.24,.12,.28,s===1?0xceae9e:0x728b98);
  return g;
}
function lamp(parent,x,z,color=0xffcfab){
  const g=group(parent,x,0,z);
  line(g,[0,2.37,0],[0,1.61,0],.018,0x526471);
  cyl(g,0,1.58,0,.29,.21,.19,0x293341,{metalness:.8});
  orb(g,0,1.46,0,.13,color,{emissive:color,emissiveIntensity:2});
  point(g,0,1.44,0,color,1.25,3.6);
}
function artwork(parent,x,y,z,w=1.2,color=0xd89aff,rotation=0){
  const g=group(parent,x,y,z);g.rotation.y=rotation;
  cube(g,0,0,0,w,.87,.06,0x202d3a,{metalness:.35});
  cube(g,0,0,.041,w-.14,.71,.016,color,{emissive:color,emissiveIntensity:.18,roughness:.9});
  for(let i=0;i<5;i++){
    const a=i*1.2,xx=Math.cos(a)*.24,yy=Math.sin(a)*.22;
    orb(g,xx,yy,.056,.10,i%2?0xffd6b8:0x744d9f,{roughness:.8});
  }
  return g;
}
function shelving(parent,x,z,ang=0){
  const g=group(parent,x,0,z);g.rotation.y=ang;
  cube(g,0,1,0,1.35,1.9,.34,0x334557,{metalness:.31});
  for(let i=0;i<4;i++){
    cube(g,0,.31+i*.43,.02,1.30,.055,.37,0x856c5b);
    for(let j=0;j<5;j++){
      const c=[0x8e8fb6,0xc48f79,0x466b73,0xa99b82,0xa56c91][(i+j)%5];
      cube(g,-.49+j*.235,.52+i*.43,.08,.14,.32,.21,c,{roughness:.78});
    }
  }
}
function neonSign(parent,x,y,z,text,color){
  const canvas=document.createElement('canvas');canvas.width=760;canvas.height=160;
  const c=canvas.getContext('2d');c.fillStyle='rgba(3,10,20,.92)';c.roundRect(4,5,752,150,18);c.fill();
  c.fillStyle='#ffffff';c.textAlign='center';c.font='800 65px Arial, sans-serif';c.shadowColor=`#${new THREE.Color(color).getHexString()}`;c.shadowBlur=23;c.fillText(text,380,107);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.55),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  m.position.set(x,y,z);parent.add(m);return m;
}
function makeAvatar(parent,person,self=false){
  const color=new THREE.Color(person.color||'#74a5eb');
  const g=group(parent,WX(person.x),0,WZ(person.y));
  g.userData={id:person.id,person};
  const halo=new THREE.Mesh(new THREE.CircleGeometry(.35,48),new THREE.MeshBasicMaterial({color:self?0x55e8cb:color,opacity:.19,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.028;g.add(halo);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.37,.404,64),new THREE.MeshBasicMaterial({color:self?0x67ffe4:color,transparent:true,opacity:.87,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.038;g.add(ring);
  const body=group(g,0,0,0);g.userData.body=body;
  for(const s of [-1,1]){
    cube(body,s*.115,.28,0,.16,.42,.19,0x34435b);
    cube(body,s*.12,.065,.055,.20,.11,.3,0x26313e);
    cube(body,s*.29,.63,0,.13,.45,.19,color,{roughness:.87});
  }
  cyl(body,0,.67,0,.28,.25,.64,color,{roughness:.8},18);
  // Clothing details read well at oblique isometric distance.
  cube(body,0,.82,.236,.12,.32,.025,self?0x163950:0xd8dae5,{roughness:.8});
  for(const side of [-1,1]){
    const lapel=cube(body,side*.092,.81,.232,.092,.23,.023,self?0x5aebe0:0xa1afbd,{roughness:.95});
    lapel.rotation.z=side*.22;
  }
  orb(body,0,1.14,0,.246,0xc89271,{roughness:.88});
  // Dark hair cap plus face details (front faces camera in default isometric view).
  const hair=orb(body,0,1.28,-.046,.234,0x2b2632,{roughness:1});hair.scale.y=.67;
  for(const s of [-1,1])orb(body,s*.093,1.16,.22,.021,0x17222f,{roughness:.75});
  cube(body,0,1.068,.235,.10,.015,.012,0x8b5246,{roughness:.9});
  const badge=group(body,0,.71,.25);cube(badge,0,0,0,.18,.10,.015,self?0x66e6d5:0xe0c8a2,{emissive:self?0x1ebba8:0x000000,emissiveIntensity:.2});
  const head=group(g,0,1.73,0);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=512;labelCanvas.height=124;
  const ctx=labelCanvas.getContext('2d');ctx.fillStyle='rgba(6,18,30,.90)';ctx.beginPath();ctx.roundRect(4,8,504,110,25);ctx.fill();
  ctx.strokeStyle=self?'#55e9d3':'#63798b';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#f9fcff';ctx.font='700 42px Arial';ctx.textAlign='center';ctx.fillText(self?'BHARATH  ·  YOU':(person.name==='Jinithasri'?'JINITHASRI  ·  LEAD':person.name.toUpperCase()),256,80);
  const tex=new THREE.CanvasTexture(labelCanvas);tex.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false}));
  sprite.scale.set(self?2.15:1.95,.47,1);head.add(sprite);g.userData.head=head;
  return g;
}
function proximity(parent,radius){
  const g=group(parent);g.position.y=.051;
  const base=new THREE.Mesh(new THREE.CircleGeometry(1,96),new THREE.MeshBasicMaterial({color:0x3af4cc,opacity:.07,transparent:true,side:THREE.DoubleSide,depthWrite:false,depthTest:true}));
  base.rotation.x=-Math.PI/2;g.add(base);
  const rings=[];
  for(const n of [.4,.68,1]){
    const ring=new THREE.Mesh(new THREE.RingGeometry(n-.005,n+.005,128),new THREE.MeshBasicMaterial({color:0x5bffe0,opacity:n===1?.84:.39,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.01+rings.length*.003;g.add(ring);rings.push(ring);
  }
  return {root:g,base,rings,setRadius(value){g.scale.setScalar(value*UNIT)},update(x,z,time,audio){g.position.x=x;g.position.z=z;g.scale.setScalar(radius.current*UNIT);rings[2].material.opacity=.58+.24*Math.sin(time*2.8);base.material.color.setHex(audio?0x6bfcdf:0x5f8da5)}};
}
/** Small scale architectural details. All scene elements are genuine 3D meshes. */
function pillar(parent,x,z,color=0x4f626b){
  const g=group(parent,x,0,z);
  cube(g,0,1.2,0,.17,2.4,.17,color,{metalness:.68,roughness:.35});
  cube(g,0,.08,0,.30,.16,.30,0x263c4a,{metalness:.35});
  cube(g,0,2.32,0,.32,.13,.32,0x667580,{metalness:.72});
}
function floorLamp(parent,x,z){
  const g=group(parent,x,0,z);
  cyl(g,0,.08,0,.24,.24,.075,0x3c434a,{metalness:.84});
  line(g,[0,.08,0],[0,1.64,0],.038,0xb7a490);
  cyl(g,0,1.75,0,.29,.35,.35,0xf5e2c8,{emissive:0x886a4b,emissiveIntensity:.38,roughness:.82},24);
  point(g,0,1.72,0,0xffd3a6,.45,2.6);
}
function pictureFrame(parent,x,y,z,w,direction=0){
  const g=group(parent,x,y,z);g.rotation.y=direction;
  cube(g,0,0,0,w,.77,.05,0xa98c71,{metalness:.25,roughness:.42});
  cube(g,0,0,.034,w-.10,.67,.015,0x1c2639,{roughness:.8});
  for(let i=0;i<6;i++){
    const a=i*1.2;
    const sq=cube(g,Math.sin(a)*w*.29,Math.cos(a)*.21,.048,.14,.12,.009,
      [0xd3a996,0x8d86a8,0x76aaad][i%3]);sq.rotation.z=a*.28;
  }
}
function roundPouf(parent,x,z,color=0x8a9c9f){
  const g=group(parent,x,0,z);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.32,.38,.31,24),mat(color,{roughness:.97}));
  m.position.y=.2;m.castShadow=true;g.add(m);
  cyl(g,0,.05,0,.3,.32,.04,0x574f4d,{roughness:.79},24);
}
function pendant(parent,x,z,glowColor=0xffccab,drop=1.43){
  const g=group(parent,x,0,z);
  line(g,[0,2.70,0],[0,drop+.07,0],.01,0x4b5866);
  cyl(g,0,drop,0,.31,.40,.16,0x333b46,{metalness:.86,roughness:.25},24);
  cyl(g,0,drop-.10,0,.25,.25,.025,glowColor,{emissive:glowColor,emissiveIntensity:1.2},24);
  point(g,0,drop-.28,0,glowColor,.8,3.2);
}
function wallScreen(parent,x,y,z,w=1.4,turn=0){
  const g=group(parent,x,y,z);g.rotation.y=turn;
  cube(g,0,0,0,w,.8,.07,0x101b2a,{metalness:.46});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w-.10,.7),new THREE.MeshBasicMaterial({map:displayTexture('#61dbdf')}));
  mesh.position.z=.041;g.add(mesh);
}
function stickyBoard(parent,x,y,z,w=1.7,turn=0){
  const g=group(parent,x,y,z);g.rotation.y=turn;
  cube(g,0,0,0,w,.96,.09,0xd9d2c2,{metalness:0,roughness:.88});
  const palette=[0xf3bcca,0xffdaa4,0xa6d6cc,0xcfc3ff];
  for(let i=0;i<12;i++){
    const x=-w*.4+(i%4)*w*.265,y=.29-Math.floor(i/4)*.31;
    const m=cube(g,x,y,.053,.23,.22,.008,palette[i%palette.length],{roughness:.96});
    m.rotation.z=(i%3-1)*.08;
  }
}
function stair(parent,x,z){
  const g=group(parent,x,0,z);g.rotation.y=Math.PI/2;
  for(let i=0;i<5;i++)cube(g,i*.26,.09+i*.13,0,.34,.19+i*.26,.91,0x756c66,{roughness:.75});
  for(let s of [-1,1])line(g,[-.18,.28,s*.48],[1.32,1.33,s*.48],.022,0x9aafb4);
}
function showpiece(parent,x,z){
  const g=group(parent,x,0,z);
  cyl(g,0,.71,0,.24,.22,.1,0x7e5e54,{roughness:.47},24);
  line(g,[0,.72,0],[0,1.09,0],.046,0xc0aa8a);
  orb(g,0,1.18,0,.19,0xd0af8a,{metalness:.65,roughness:.23});
}
function coffeeBar(parent,x,z){
  const g=group(parent,x,0,z);
  cube(g,0,.54,0,2.0,1.08,.58,0x454146,{roughness:.61});
  cube(g,0,1.10,0,2.14,.10,.67,0x947564,{roughness:.49});
  for(const px of [-.77,-.20,.35,.82])cyl(g,px,1.17,-.08,.052,.049,.14,0xd9c8bd,{},12);
  cube(g,-.54,1.28,-.12,.48,.3,.29,0x243743,{metalness:.8});
  for(let i=0;i<3;i++)cube(g,-.62+i*.62,.45,.30,.32,.47,.026,0x8a8479,{roughness:.67});
}
function framedNeon(parent,x,y,z,w=2.4,color=0x64ecd9){
  // Architectural feature glow rather than an image cutout.
  cube(parent,x,y,z,w,.035,.10,color,{emissive:color,emissiveIntensity:2,metalness:.2});
}

// Architectural objects are original meshes. None of the inspiration photograph's pixels
// appear in the render. Keeping prop meshes modular makes collision art direction easy.
function terrazzoTexture(){
  const c=document.createElement('canvas');c.width=c.height=512;
  const p=c.getContext('2d');p.fillStyle='#63615d';p.fillRect(0,0,512,512);
  let seed=1701;const rnd=()=>{seed=(seed*48271)%2147483647;return seed/2147483647};
  const chips=['#b0a395','#4a6667','#c6b9a5','#393a3c','#857d74'];
  for(let i=0;i<4200;i++){
    const x=rnd()*512,y=rnd()*512,r=.5+rnd()*2.4;
    p.fillStyle=chips[Math.floor(rnd()*chips.length)];p.globalAlpha=.16+rnd()*.5;
    p.beginPath();p.ellipse(x,y,r,r*(.4+rnd()),rnd()*Math.PI,0,Math.PI*2);p.fill();
  }
  p.globalAlpha=1;
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,1.1);return map;
}
function ceilingStrip(parent,x,y,z,length,color=0x80e0df,angle=0){
  const root=group(parent,x,y,z);root.rotation.y=angle;
  cube(root,0,0,0,length,.10,.15,0x182a35,{metalness:.7,roughness:.27});
  cube(root,0,-.061,0,length-.09,.018,.075,color,{emissive:color,emissiveIntensity:2.6,castShadow:false});
  return root;
}
function wallPanel(parent,x,y,z,width,rotation=0,color=0x3f6270){
  const g=group(parent,x,y,z);g.rotation.y=rotation;
  cube(g,0,0,0,width,1.4,.13,0x192c38,{metalness:.12,roughness:.65});
  for(let i=0;i<12;i++){
    const px=(i/11-.5)*(width-.12);
    cube(g,px,0,.08,.02,1.35,.015,i%3===0?color:0x344554,{metalness:.42,roughness:.45});
  }
  cube(g,0,-.71,.07,width,.035,.09,color,{emissive:color,emissiveIntensity:1.1});
}
function laptop(parent,x,y,z,rot=0){
  const g=group(parent,x,y,z);g.rotation.y=rot;
  cube(g,0,.012,0,.32,.02,.23,0x424e5d,{metalness:.85,roughness:.21});
  const lid=cube(g,0,.20,-.11,.32,.36,.024,0x233040,{metalness:.75,roughness:.20});
  lid.rotation.x=-.1;
  cube(g,0,.20,-.091,.28,.31,.008,0x123b4b,{emissive:0x41bcbc,emissiveIntensity:.16});
}
function decorativeBench(parent,x,z,w=1.6,rotation=0){
  const g=group(parent,x,0,z);g.rotation.y=rotation;
  cube(g,0,.24,0,w,.22,.58,0x9eaaa8,{roughness:1});
  for(const side of [-1,1])cube(g,side*(w/2-.15),.15,0,.13,.29,.53,0x434f59,{metalness:.35});
  for(let i=0;i<3;i++)cube(g,(-1+i)*w*.26,.37,.03,w*.22,.045,.51,[0xb0b9b4,0x9ca6a5,0xa6b0a8][i],{roughness:1});
}
function mediaWall(parent,x,z,rot=0){
  const g=group(parent,x,0,z);g.rotation.y=rot;
  wallPanel(g,0,1.55,0,2.34,0,0x67b6ad);
  wallScreen(g,0,1.45,.11,1.8,0);
  cube(g,0,.59,.23,2.35,.17,.37,0x827365,{roughness:.6});
  for(let i=0;i<4;i++)cube(g,-.83+i*.54,.43,.25,.42,.12,.27,0x1b2f3d,{metalness:.35});
}
function leafCluster(parent,x,z,variant=0){
  // Vertical, asymmetrical vegetation gives depth around glass room corners.
  const root=group(parent,x,0,z);
  cyl(root,0,.30,0,.24,.20,.55,0x8d8175,{roughness:.94},18);
  const tones=[0x277b5b,0x3a9967,0x1f604d,0x5d997b];
  for(let i=0;i<20;i++){
    const a=i*2.4+variant,r=.10+(i%4)*.09,y=.57+(i%7)*.16;
    line(root,[0,.54,0],[Math.cos(a)*r,y,Math.sin(a)*r],.012,0x345743);
    const leaf=orb(root,Math.cos(a)*r,y,Math.sin(a)*r,.15,tones[i%4],{roughness:1});
    leaf.scale.set(.50,1.24,.60);leaf.rotation.z=-Math.cos(a)*.55;
  }
}


/** Detailed original architectural features based on the user's mood-board, not the mood-board image itself. */
function marbleTexture(){
  const c=document.createElement('canvas'); c.width=c.height=512;
  const ctx=c.getContext('2d');ctx.fillStyle='#d7cbc1';ctx.fillRect(0,0,512,512);
  let seed=91873;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  for(let i=0;i<520;i++){
    const x=rnd()*530-10,y=rnd()*520;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.bezierCurveTo(x+40*rnd(),y+15*rnd(),x+50*rnd(),y-7+rnd()*20,x+90*rnd(),y+12*rnd());
    ctx.strokeStyle=i%3===0?'rgba(108,83,81,.20)':'rgba(255,255,255,.16)';ctx.lineWidth=.4+rnd()*1.6;ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function upholsteredBench(parent,x,z,w=2.2,turn=0,color=0xabb8b7){
  const g=group(parent,x,0,z);g.rotation.y=turn;
  // Refined sofa, upholstered seating with seams, five removable cushions and brass feet.
  for(const v of [-1,1]){
    cube(g,v*(w/2-.14),.16,-.30,.055,.31,.070,0xa98e6e,{metalness:.75,roughness:.28});
    cube(g,v*(w/2-.14),.16,.32,.055,.31,.070,0xa98e6e,{metalness:.75,roughness:.28});
  }
  const cushion=mat(color,{roughness:.97,metalness:0});
  for(let i=0;i<5;i++){
    const seat=new THREE.Mesh(new THREE.BoxGeometry(w/5-.022,.31,.79),cushion);
    seat.position.set((i-2)*w/5,.46,0);seat.castShadow=true;seat.receiveShadow=true;g.add(seat);
    cube(g,(i-2)*w/5,.74,-.32,w/5-.018,.36,.20,color,{roughness:.96,metalness:0});
  }
  for(const v of [-1,1]){
    cube(g,v*(w/2-.06),.60,0,.17,.54,.95,color,{roughness:.95,metalness:0});
    cube(g,v*(w/2-.28),.76,-.14,.34,.16,.33,v>0?0xd7b7a1:0x6c8094,{roughness:1});
  }
  return g;
}
function architecturalSconce(parent,x,z,color=0xd1a2fa){
  const g=group(parent,x,0,z);
  cube(g,0,1.25,0,.07,.60,.09,0x7a687c,{metalness:.68,roughness:.27});
  cube(g,0,1.25,.047,.032,.52,.022,color,{emissive:color,emissiveIntensity:2.5,roughness:.15});
  point(g,0,1.27,.14,color,.53,2.4);
}
function bookshelfWall(parent,x,z,angle=0){
  const g=group(parent,x,0,z);g.rotation.y=angle;
  cube(g,0,1.12,0,3.10,2.20,.24,0x223040,{roughness:.55});
  for(let k=0;k<4;k++){
    cube(g,0,.30+k*.52,.20,2.90,.055,.41,0x6d5c54,{roughness:.52});
    for(let j=0;j<9;j++){
      if((k*5+j)%7===0)continue;
      const palette=[0x8b789f,0xa58d70,0x426d79,0xc18b80,0x9c9e9a];
      const b=cube(g,-1.29+j*.32,.46+k*.52,.23,.21,.25,.16,palette[(k*3+j)%5],{roughness:.76});b.rotation.z=((k+j)%3-1)*.05;
    }
  }
}
function tiledRug(parent,x,z,w,d,color){
  const root=group(parent,x,-.105,z);
  surface(root,0,0,0,w,d,color,{roughness:1,metalness:0});
  for(let i=0;i<8;i++){
    const u=-w/2+.12+i*(w-.24)/7;
    line(root,[u,.012,-d/2+.10],[u,.012,d/2-.10],.008,0x998e89);
  }
  return root;
}
function indoorTree(parent,x,z,s=1){
  const t=group(parent,x,-.12,z);t.scale.setScalar(s);
  cyl(t,0,.23,0,.23,.19,.47,0xb2a392,{roughness:.9},18);
  cyl(t,0,.77,0,.044,.057,.73,0x4b5a45,{roughness:1},9);
  for(let i=0;i<7;i++){
    const a=(i+1)*2.399,r=.25+(i%3)*.12,h=1.1+(i%4)*.11;
    line(t,[0,.83,0],[Math.cos(a)*r,h,Math.sin(a)*r],.014,0x3e6549);
    for(let j=0;j<5;j++){
      const q=a+j*.55;const v=.17+j*.04;
      const leaf=orb(t,Math.cos(q)*r+Math.sin(q)*v*.2,h+(j-2)*.07,Math.sin(q)*r+Math.cos(q)*v*.2,.16,[0x317d59,0x459869,0x246747,0x42805a][(j+i)%4],{roughness:1});
      leaf.scale.set(.54,1.15,.56);leaf.rotation.z=-Math.cos(q)*.57;
    }
  }
}
function openGlassDoor(parent,x,z,rot,color){
  const g=group(parent,x,0,z);g.rotation.y=rot;
  const door=cube(g,0,1,0,.84,1.97,.043,0x8ac0ca,{transparent:true,opacity:.15,depthWrite:false,metalness:.55,roughness:.1,castShadow:false});
  cube(g,-.44,1,0,.055,2.05,.09,0x657989,{metalness:.83});
  cube(g,.44,1,0,.055,2.05,.09,0x657989,{metalness:.83});
  cube(g,0,2.04,0,.96,.06,.095,0x5f7181,{metalness:.76});
  cube(g,.29,1.02,.075,.025,.25,.02,0xd0b496,{metalness:.94});
  const accent=cube(g,0,.05,.045,.9,.018,.03,color,{emissive:color,emissiveIntensity:2});
  door.userData.decorative=true;accent.userData.decorative=true;
}
function lampBar(parent,x,z,width,color){
  const g=group(parent,x,2.14,z);
  cube(g,0,0,0,width,.045,.14,0x17212e,{metalness:.66});
  cube(g,0,-.037,0,width-.06,.015,.048,color,{emissive:color,emissiveIntensity:2.4});
  return g;
}

function createContactShadow(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');const g=ctx.createRadialGradient(64,64,4,64,64,64);
  g.addColorStop(0,'rgba(0,0,0,.80)');g.addColorStop(.48,'rgba(0,0,0,.38)');g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function createLightPool(color){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  const v=new THREE.Color(color);const hue='#'+v.getHexString();
  const g=ctx.createRadialGradient(64,64,0,64,64,63);
  g.addColorStop(0,'#ffffff');g.addColorStop(.22,hue);g.addColorStop(.70,hue);g.addColorStop(1,'#000000');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
function carpetLining(parent,x,z,w,d,color){
  // Real thin brushed-metal path edging in the open social atrium.
  const root=group(parent);const c=new THREE.Color(color).multiplyScalar(.58);
  const g=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x-w/2,-.028,z-d/2),new THREE.Vector3(x+w/2,-.028,z-d/2),
    new THREE.Vector3(x+w/2,-.028,z+d/2),new THREE.Vector3(x-w/2,-.028,z+d/2),
  ]);
  const edge=new THREE.LineLoop(g,new THREE.LineBasicMaterial({color:c,transparent:true,opacity:.34}));
  root.add(edge);
}

function createOffice(scene, roofRefs) {
  const office=group(scene);
  const slab=cube(office,0,-.42,0,15.5,.50,9.95,0x0b1b29,{roughness:.83,metalness:.2});slab.receiveShadow=true;
  const base=new THREE.Mesh(new THREE.PlaneGeometry(14.4,8.64),new THREE.MeshStandardMaterial({map:floorTexture(),roughness:.73,metalness:.19}));
  base.rotation.x=-Math.PI/2;base.position.y=floor;base.receiveShadow=true;office.add(base);
  const floorHit=base;
  neonFrame(office,0,0,14.4,8.64,0x447c91);
  // Ground-level material changes and inlaid decorative paths, independent of background images.
  const terrazzo=new THREE.Mesh(new THREE.PlaneGeometry(3.15,1.72),new THREE.MeshStandardMaterial({map:terrazzoTexture(),roughness:.92,metalness:.02}));
  terrazzo.rotation.x=-Math.PI/2;terrazzo.position.set(-1.4,-.111,.48);terrazzo.receiveShadow=true;office.add(terrazzo);
  ceilingStrip(office,-3.6,2.3,-3.45,4.9,0x66dfd4);
  ceilingStrip(office,4.3,2.3,-3.48,2.9,0xc48bff);
  ceilingStrip(office,4.3,2.3,3.74,3.0,0xf3b881);

  // Low raised three-zoned rooms leave the central social atrium visible.
  rug(office,-3.46,-2.18,7.10,3.75,0x233f48);
  rug(office,4.34,-2.18,4.15,3.75,0x45324c);
  rug(office,4.34,2.3,4.15,3.28,0x4a3c37);
  rug(office,-2.0,2.50,5.8,2.85,0x2b3d42);
  neonFrame(office,-3.46,-2.18,7.05,3.68,0xc58cff);
  neonFrame(office,4.34,-2.18,4.11,3.69,0xff94cb);
  neonFrame(office,4.34,2.30,4.11,3.2,T.ember);
  // Cutaway glazing around far/back walls. Front stays open for visibility.
  glassWall(office,-7.04,-4.16,-.17,-4.16,0xb28cff);
  glassWall(office,-7.04,-4.16,-7.04,-.18,0xb28cff);
  glassWall(office,-.16,-4.16,-.16,-2.7,0xb28cff);
  glassWall(office,2.17,-4.16,6.52,-4.16,0xff96cc);
  glassWall(office,6.52,-4.16,6.52,-.25,T.lavender);
  glassWall(office,2.17,-4.16,2.17,-2.90,T.lavender);
  glassWall(office,2.17,.62,6.52,.62,T.ember);
  glassWall(office,6.52,.62,6.52,4.08,T.ember);
  glassWall(office,2.17,4.08,6.52,4.08,T.ember);
  roof(office,-3.54,-2.28,6.91,3.88,0x5a9eac,roofRefs);
  roof(office,4.32,-2.28,4.33,3.89,0x9460bf,roofRefs);
  roof(office,4.34,2.35,4.33,3.42,0x916e50,roofRefs);
  // Studio: an array of dual-screen workstations and decor.
  desk(office,-5.32,-2.18,0,0);
  desk(office,-2.85,-2.18,0,1);
  cube(office,-4.2,.04,-.26,5.5,.13,.07,0x455969,{metalness:.57});
  chair(office,-4.4,-.64,2.5,0x9ca8b5);
  lamp(office,-4.35,-2.00,0xffd2b7);lamp(office,-2.5,-2.0,0x97daff);
  shelving(office,-6.57,-3.27,Math.PI/2);
  plant(office,-6.45,-3.55,.9);plant(office,-.60,-3.60,.82,3);
  artwork(office,-4.35,1.34,-4.10,1.45,0x4b99ba,0);
  // Studio room: editorial architecture, two collaborative desk islands and feature wall.
  mediaWall(office,-4.65,-3.90,0);
  coffeeBar(office,-5.45,.44);
  decorativeBench(office,-1.10,.79,1.33,Math.PI/5);
  leafCluster(office,-5.92,-.36,2);
  pendant(office,-3.36,-1.75,0xa6dffd,1.69);
  pendant(office,-5.43,-1.72,0x8cfad6,1.69);
  // Ideation lab: round table, mobile board, pendant lamp.
  table(office,4.26,-2.25,.75,0xc88488);
  lamp(office,4.27,-2.19,0xffb1d4);
  artwork(office,4.26,1.40,-4.07,1.4,0xb989ff,0);
  plant(office,6.1,-3.63,1.0,2);plant(office,2.65,-3.61,.76,4);
  wallPanel(office,6.38,1.36,-2.25,2.1,Math.PI/2,0xc38ab4);
  stickyBoard(office,6.26,1.35,-2.4,1.5,-Math.PI/2);
  pendant(office,4.30,-2.10,0xffbbe2,1.73);
  laptop(office,4.12,.79,-2.15,Math.PI*.25);
  // Lounge: comfortable sofa, coffee table, plants, rug.
  sofa(office,4.37,3.22,2.50,Math.PI,0xc0b7a8);
  cyl(office,4.33,.45,2.05,.45,.49,.12,0xc99d7f,{roughness:.52},24);
  cyl(office,4.33,.23,2.05,.10,.12,.36,0x293947);
  orb(office,4.33,.54,2.05,.15,0x3b996d,{roughness:1});
  lamp(office,4.45,2.40,0xffc391);
  shelving(office,6.19,1.40,Math.PI/2);plant(office,2.59,3.54,1.07);plant(office,6.1,3.67,.9);
  mediaWall(office,6.20,1.62,Math.PI/2);
  floorLamp(office,5.78,3.56);
  leafCluster(office,2.56,1.10,3);
  // Central collaboration atrium: curved communal seating and planter.
  sofa(office,-3.92,1.35,2.05,-Math.PI/7,0xaab8ba);
  sofa(office,-.07,1.08,2.12,Math.PI/6,0x889da8);
  cyl(office,-1.93,.23,2.46,.90,.94,.48,0x56645d,{roughness:.92},32);
  cyl(office,-1.93,.52,2.46,.80,.87,.14,0x9e8a78,{roughness:.84},32);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;plant(office,-1.93+Math.cos(a)*.5,2.46+Math.sin(a)*.48,.61,i)}
  cyl(office,-1.83,.30,.96,.45,.38,.09,0x9f8c7b,{roughness:.64},24);
  plant(office,-6.59,3.56,.88,2);plant(office,.9,3.81,.80,3);
  // Signage hovers above rooms; they're geometry, not static screenshot pixels.
  neonSign(office,-4.48,2.90,-3.75,'STUDIO',0xb28cff);
  neonSign(office,4.24,2.90,-3.70,'IDEATION LAB',0xff96cc);
  neonSign(office,4.35,2.94,.89,'FOCUS LOUNGE',T.ember);
  // Architecture passes: beams, roofline, door frames, and a fully dressed interior.
  for(const [xx,zz] of [[-7.06,-4.15],[-.16,-4.15],[2.17,-4.15],[6.52,-4.15],[6.52,.62],[6.52,4.08]]) pillar(office,xx,zz);
  framedNeon(office,-4.2,2.34,-4.19,3.5,T.lavender);
  framedNeon(office,4.23,2.37,-4.20,2.65,0xff9ab9);
  framedNeon(office,4.30,2.35,4.07,2.65,T.ember);
  wallScreen(office,-3.9,1.45,-4.09,1.68,0);
  stickyBoard(office,4.30,1.50,-4.03,1.68,0);
  pictureFrame(office,4.1,1.35,4.01,1.17,Math.PI);
  pictureFrame(office,5.52,1.34,4.01,1.1,Math.PI);
  pendant(office,-4.42,-2.0,0xb9d9ff,1.35);
  pendant(office,-2.92,-2.0,0xc5a0fd,1.35);
  pendant(office,4.25,-2.19,0xffb5be,1.54);
  pendant(office,4.45,2.30,0xffd6aa,1.51);
  floorLamp(office,6.07,3.25);floorLamp(office,-6.41,2.95);
  roundPouf(office,-5.07,1.35,0x758fa1);
  roundPouf(office,-.73,2.13,0x849ca2);
  roundPouf(office,5.46,1.55,0xd1ad92);
  showpiece(office,-.46,3.6);
  coffeeBar(office,-5.9,3.12);
  stair(office,-.25,-3.11);
  // Brushed-steel cutaway roof beams extend above the glass room enclosures.
  for(let x of [-7.0,-3.55,-.15,2.16,4.33,6.50])
    line(office,[x,2.46,-4.17],[x,2.46,-.16],.024,0x86919a);
  point(office,-4.0,2.5,-1.9,0xba79ff,3.1,6.6);
  point(office,4.3,2.4,-2.1,0xff8ac8,3.2,6.2);
  point(office,4.3,2.35,2.3,0xffb476,2.5,5.4);
  point(office,-1.7,2.6,2.0,0x6cdbd4,1.5,5.8);
  // Bespoke architectural dressing: lounge fabrics, glazed entries, ambient lighting,
  // interior planting, library wall and decorative finishes. Each object has actual depth.
  indoorTree(office,-6.87,-.55,1.0);
  indoorTree(office,2.23,-3.98,.75);
  indoorTree(office,6.18,-.03,.85);
  indoorTree(office,6.17,3.89,.72);
  upholsteredBench(office,-2.55,1.76,1.67,-.22,0xaebbbf);
  upholsteredBench(office,.47,1.66,1.70,.28,0x889fab);
  tiledRug(office,-1.8,1.43,2.9,1.6,0x4c686e);
  const meetingMarble=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.028,32),new THREE.MeshStandardMaterial({map:marbleTexture(),roughness:.38,metalness:.12}));
  meetingMarble.position.set(4.26,.68,-2.25);meetingMarble.receiveShadow=true;office.add(meetingMarble);
  for(const x of [-6.65,-.52])architecturalSconce(office,x,-3.54,0xbd86ed);
  architecturalSconce(office,6.40,-3.45,0xff9bd0);
  architecturalSconce(office,6.39,3.18,0xffca99);
  openGlassDoor(office,-.16,-1.65,Math.PI/2,0xb78bff);
  openGlassDoor(office,2.17,-1.36,Math.PI/2,0xf09bdf);
  openGlassDoor(office,2.17,2.18,Math.PI/2,0xf9ad7e);
  lampBar(office,-4.22,-3.82,3.6,0xaf77ff);
  lampBar(office,4.25,-3.77,2.75,0xff91ce);
  lampBar(office,4.21,3.75,2.65,0xffcc93);
  bookshelfWall(office,-5.45,3.87,0);
  // Small human-scale sculptures and tactile architectural details complete the office.
  showpiece(office,5.88,-.04);
  roundPouf(office,-3.02,2.73,0xb8c4c1);
  roundPouf(office,3.21,1.34,0xba9e93);
  // FINAL ART DIRECTION: grounded environmental details and cinematic light pooling.
  // All pieces are genuine independent world-space meshes (no screenshot texture).
  const softShadowMap=createContactShadow();
  for(const [x,z,w,h,opacity] of [
    [-5.3,-2.2,2.2,1.5,.48],[-2.82,-2.2,2.2,1.5,.48],
    [4.25,-2.2,2.9,2.75,.34],[4.35,3.02,3.5,2.1,.40],
    [-3.9,1.40,2.7,1.8,.45],[-.1,1.40,2.5,1.7,.40],
    [-1.88,2.43,2.5,2.3,.29],[-5.47,3.22,2.5,1.3,.37]]){
    const patch=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({
      map:softShadowMap,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
    }));patch.rotation.x=-Math.PI/2;patch.position.set(x,-.07,z);office.add(patch);
  }
  // Floor-level luminous pools: evokes practical lighting from the architectural photograph.
  for(const [x,z,size,color,strength] of [
    [-4.55,-2.15,3.5,0xac65ff,.18],[4.25,-2.1,3.4,0xff6fae,.18],
    [4.31,2.52,3.45,0xffb568,.20],[-1.7,1.92,3.2,0x49dfd4,.11]]){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({
      map:createLightPool(color),transparent:true,opacity:strength,depthWrite:false,blending:THREE.AdditiveBlending
    }));m.rotation.x=-Math.PI/2;m.position.set(x,-.065,z);office.add(m);
  }
  // Furniture-scale details: floor lamps, plant clusters, glass meeting room trim and handrail.
  for(const [x,z,tone] of [[-6.78,-3.89,0xbd8cff],[-.42,-3.92,0x946cff],[2.35,-3.93,0xff92c4],
    [6.34,-3.83,0xff92c4],[6.30,3.88,0xffc77c]]){
    cube(office,x,1.03,z,.038,1.64,.038,tone,{emissive:tone,emissiveIntensity:1.15});
  }
  for(const [x,z] of [[-5.80,-.32],[-.62,-.54],[2.57,-.42],[6.16,.76],[-6.11,3.70]]){
    indoorTree(office,x,z,.67);
  }
  // Floor signage is mesh-based, not borrowed photographic lettering.
  carpetLining(office,-1.7,.68,3.2,2.7,0x5facae);
  return {office,floorHit};
}

/** Stable animation: camera, props and avatars updated in place; never remount WebGL. */
export default function ThreeWorkspace({positionRef,participants=[],radius=170,showTrail=true,showRadius=true,audioPreview=true,orbit=false,roofVisible=false,onFloorClick,onSelectMember,selectedId,quality="high",focusRoom="all"}){
  const host=useRef(null),state=useRef({}),[error,setError]=useState('');
  state.current={positionRef,participants,radius,showTrail,showRadius,audioPreview,orbit,roofVisible,onFloorClick,onSelectMember,selectedId,quality,focusRoom};
  useEffect(()=>{
    const node=host.current;if(!node)return;
    let renderer;
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'default',failIfMajorPerformanceCaveat:false});
    }catch(e){setError('WebGL could not initialize. Please enable Graphics acceleration in your browser.');return;}
    try {
    const scene=new THREE.Scene();scene.background=new THREE.Color('#060f1a');
    scene.fog=new THREE.FogExp2(0x071827,.008);
    const light=new THREE.HemisphereLight(0xdaefff,0x523c2d,1.52);scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff,.32));
    const sun=new THREE.DirectionalLight(0xffe3cc,2.12);sun.position.set(-6,15,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-13;sun.shadow.camera.right=13;sun.shadow.camera.top=13;sun.shadow.camera.bottom=-13;
    sun.shadow.bias=-.0005;sun.shadow.normalBias=.023;scene.add(sun);
    const back=new THREE.DirectionalLight(0x628cdd,.9);back.position.set(8,10,-8);scene.add(back);
    const roofRefs=[];
    const {floorHit}=createOffice(scene,roofRefs);
    // DOM room plates track camera perspective: sharp legible HTML labels on real 3D geometry.
    const roomPlates=[
      {el:node.querySelector('[data-room-tag="studio"]'),pos:new THREE.Vector3(-4.43,2.92,-2.72)},
      {el:node.querySelector('[data-room-tag="ideation"]'),pos:new THREE.Vector3(4.32,2.94,-2.80)},
      {el:node.querySelector('[data-room-tag="lounge"]'),pos:new THREE.Vector3(4.32,2.90,2.25)},
    ];
    const outerFloor = new THREE.Mesh(new THREE.PlaneGeometry(65,65), new THREE.MeshStandardMaterial({color:0x06131d,roughness:1,metalness:0}));
    outerFloor.rotation.x=-Math.PI/2;outerFloor.position.y=-.71;outerFloor.receiveShadow=true;scene.add(outerFloor);
    const haloLight = new THREE.PointLight(0x7284d7,1.3,21,2);haloLight.position.set(-8,8,-9);scene.add(haloLight);
    const players=new Map();
    const my=makeAvatar(scene,MY_PLAYER,true);
    const radiusRef={current:170};const aura=proximity(scene,radiusRef);
    // Real 3D recent walking trail on the floor. No image/screenshot overlay.
    const trailGeometry=new THREE.BufferGeometry();
    const trailBuffer=new Float32Array(88*3);
    const trailAttribute=new THREE.BufferAttribute(trailBuffer,3);
    trailAttribute.setUsage(THREE.DynamicDrawUsage);
    trailGeometry.setAttribute('position',trailAttribute);
    trailGeometry.setDrawRange(0,0);
    const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0x64f2d9,transparent:true,opacity:.68,depthWrite:false}));
    trail.frustumCulled=false;
    scene.add(trail);
    const trailHistory=[];
    let lastTrailX=Number.NaN,lastTrailZ=Number.NaN;

    const camera=new THREE.OrthographicCamera(-10,10,8,-8,.1,100);
    let yaw=.72, tilt=.99,zoom=1.04,targetZoom=1.04,dragStart=null, raf=0,disposed=false,appliedQuality='high';
    let currentRoom='all';
    const focalPoints={
      all: new THREE.Vector3(0,.23,0),
      studio:new THREE.Vector3(-4.3,.35,-2.15),
      ideation:new THREE.Vector3(4.2,.32,-2.14),
      lounge:new THREE.Vector3(4.3,.32,2.25),
    };
    const focusLook=focalPoints.all.clone();
    camera.position.set(14,18,18);
    renderer.setClearColor(0x081421,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.47;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    node.appendChild(renderer.domElement);
    const resize=()=>{
      const width=Math.max(10,node.clientWidth),height=Math.max(10,node.clientHeight);
      renderer.setSize(width,height,false);
      const ratio=width/height,viewHeight=(ratio<1.25?17.4:14.4)/zoom;
      camera.left=-viewHeight*ratio/2;camera.right=viewHeight*ratio/2;
      camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();
    };
    const observer=new ResizeObserver(resize);observer.observe(node);resize();
    const raycaster=new THREE.Raycaster();const mouse=new THREE.Vector2();
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-floor);
    const floorIntersection=new THREE.Vector3();
    const down=e=>{dragStart={x:e.clientX,y:e.clientY,yaw,tilt,moved:false}; renderer.domElement.setPointerCapture?.(e.pointerId)};
    const move=e=>{if(!dragStart)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
      if(Math.hypot(dx,dy)>6){dragStart.moved=true;yaw=dragStart.yaw-dx*.007;tilt=THREE.MathUtils.clamp(dragStart.tilt+dy*.004,.42,1.22)}
    };
    const up=e=>{
      if(!dragStart)return;const moved=dragStart.moved;dragStart=null;
      if(moved)return;
      const rect=renderer.domElement.getBoundingClientRect();
      mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
      raycaster.setFromCamera(mouse,camera);
      const avatars = [my,...players.values()];
      const avatarsHits=raycaster.intersectObjects(avatars,true);
      if(avatarsHits.length){
        let target=avatarsHits[0].object;
        while(target && !target.userData?.person)target=target.parent;
        if(target?.userData?.person){state.current.onSelectMember?.(target.userData.person.id);return;}
      }
      if(raycaster.ray.intersectPlane(plane,floorIntersection)){
        const x=THREE.MathUtils.clamp(floorIntersection.x/UNIT+WORLD.width/2,24,WORLD.width-24);
        const y=THREE.MathUtils.clamp(floorIntersection.z/UNIT+WORLD.height/2,24,WORLD.height-24);
        state.current.onFloorClick?.({x,y});
      }
    };
    const wheel=e=>{e.preventDefault();targetZoom=THREE.MathUtils.clamp(targetZoom*(e.deltaY>0?.93:1.075),.68,1.92);};
    const onZoom=e=>{targetZoom=THREE.MathUtils.clamp(targetZoom*(e.detail>0?1.18:.86),.68,1.92);};
    document.addEventListener('proxi:zoom',onZoom);
    const onContextLost=e=>{ e.preventDefault(); disposed=true;cancelAnimationFrame(raf);setError('WebGL graphics context lost. Interactive floorplan fallback is active.'); };
    renderer.domElement.addEventListener('webglcontextlost',onContextLost);
    renderer.domElement.addEventListener('pointerdown',down);
    renderer.domElement.addEventListener('pointermove',move);
    renderer.domElement.addEventListener('pointerup',up);
    const cancel=()=>{dragStart=null;};
    renderer.domElement.addEventListener('pointercancel',cancel);
    renderer.domElement.addEventListener('wheel',wheel,{passive:false});
    const clock=new THREE.Clock();
    function frame(){if(disposed)return;raf=requestAnimationFrame(frame);
      const t=clock.getElapsedTime(),p=state.current;
      if (p.focusRoom!==currentRoom){
        currentRoom=p.focusRoom;
        targetZoom=currentRoom==='all'?1.04:1.53;
      }
      const nextZoom=THREE.MathUtils.lerp(zoom,targetZoom,.105);
      if(Math.abs(zoom-nextZoom)>.00004){zoom=nextZoom;resize();}
      focusLook.lerp(focalPoints[p.focusRoom]||focalPoints.all,.085);
      if (p.quality!==appliedQuality){
        appliedQuality=p.quality;
        renderer.setPixelRatio(appliedQuality==='high'?Math.min(window.devicePixelRatio||1,1.65):1);
        renderer.shadowMap.enabled=appliedQuality==='high';
        resize();
      }
      for(const person of p.participants){
        if(!players.has(person.id))players.set(person.id,makeAvatar(scene,person));
        const a=players.get(person.id);
        a.position.lerp(new THREE.Vector3(WX(person.x),0,WZ(person.y)),.085);
        a.userData.body.position.y=.018*Math.sin(t*2.7+person.x);
        a.userData.head.scale.setScalar(p.selectedId===person.id?1.13:1);
        const dx=p.positionRef.current.x-person.x, dy=p.positionRef.current.y-person.y;
        const near=Math.hypot(dx,dy)<=p.radius;
        const marker=a.children.find(c=>c.isMesh && c.geometry?.type==='RingGeometry');
        if(marker){marker.material.opacity=near?.95:.52;marker.material.color.setHex(near?0x53eacf:new THREE.Color(person.color||'#74a5eb').getHex());}
        a.userData.body.rotation.y=Math.sin(t*.7+person.x)*.11;
      }
      for(const [id,g] of players)if(!p.participants.some(person=>person.id===id)){
        scene.remove(g);disposeHierarchy(g);players.delete(id);
      }
      const current=p.positionRef.current;
      my.position.lerp(new THREE.Vector3(WX(current.x),0,WZ(current.y)),.23);
      if(Math.hypot(my.position.x-lastTrailX,my.position.z-lastTrailZ)>.082 || !Number.isFinite(lastTrailX)){
        trailHistory.push([my.position.x,.065,my.position.z]);
        if(trailHistory.length>88)trailHistory.shift();
        for(let i=0;i<trailHistory.length;i++){
          trailBuffer[3*i]=trailHistory[i][0];trailBuffer[3*i+1]=trailHistory[i][1];trailBuffer[3*i+2]=trailHistory[i][2];
        }
        trailGeometry.setDrawRange(0,trailHistory.length);
        trailAttribute.needsUpdate=true;
        lastTrailX=my.position.x;lastTrailZ=my.position.z;
      }
      trail.visible=p.showTrail;
      my.userData.body.position.y=.024*Math.sin(t*8.5);
      aura.root.position.x=my.position.x;aura.root.position.z=my.position.z;
      radiusRef.current=p.radius;
      aura.root.scale.setScalar(p.radius*UNIT);
      aura.root.visible=p.showRadius;
      aura.rings[2].material.opacity=.58+.20*Math.sin(t*2.7);
      aura.base.material.color.setHex(p.audioPreview?0x3af4cc:0x7390a4);
      roofRefs.forEach(g=>g.visible=p.roofVisible);
      if(p.orbit && !dragStart)yaw+=.0008;
      const r=19.8,c=Math.cos(tilt);
      camera.position.set(focusLook.x+r*Math.sin(yaw)*c,focusLook.y+r*Math.sin(tilt),focusLook.z+r*Math.cos(yaw)*c);
      camera.lookAt(focusLook);
      camera.updateMatrixWorld();
      const box=renderer.domElement.getBoundingClientRect();
      for(const {el,pos} of roomPlates){
        if(!el)continue;const projected=pos.clone().project(camera);
        const inView=projected.z<1&&projected.z>-1;
        el.style.display=inView?'flex':'none';
        if(inView){el.style.left=`${(projected.x*.5+.5)*box.width}px`;
          el.style.top=`${(-projected.y*.5+.5)*box.height}px`;
        }
      }
      try { renderer.render(scene,camera); } catch(err) {
        console.error('ProxiSpeak WebGL render failed:',err);
        disposed=true; cancelAnimationFrame(raf);
        setError('WebGL rendering failed. Interactive isometric fallback enabled.');
      }
    }
    frame();
    return ()=>{
      disposed=true;cancelAnimationFrame(raf);observer.disconnect();
      document.removeEventListener('proxi:zoom',onZoom);
      renderer.domElement.removeEventListener('webglcontextlost',onContextLost);
      renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);
      renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('wheel',wheel);
      disposeHierarchy(scene);renderer.dispose();renderer.domElement.remove();
    };
    } catch(err) {
      console.error('ProxiSpeak 3D setup failed:',err);
      renderer?.dispose?.(); renderer?.domElement?.remove?.();
      setError('3D setup could not complete. Using the interactive isometric fallback.');
      return;
    }
  },[]);
  return <div className="three-stage" ref={host} aria-label="Interactive 3D isometric office. WASD or arrow keys move the avatar. Click the floor to walk; drag the 3D office to rotate the camera; scroll to zoom.">
    <div className="cinematic-room-tag studio-tag" data-room-tag="studio"><i/> <span><strong>Studio</strong><small>COLLABORATE</small></span></div>
    <div className="cinematic-room-tag ideation-tag" data-room-tag="ideation"><i/> <span><strong>Ideation Lab</strong><small>CREATE & EXPLORE</small></span></div>
    <div className="cinematic-room-tag lounge-tag" data-room-tag="lounge"><i/> <span><strong>Focus Lounge</strong><small>RECHARGE</small></span></div>
    {error&&<><FallbackWorkspace {...{positionRef,participants,radius,showRadius,roofVisible,onFloorClick}}/><div className="fallback-warning" role="status">⚠ 3D WebGL unavailable · Interactive isometric fallback · Enable browser graphics acceleration for full 3D.</div></>}
  </div>;
}
function disposeHierarchy(root){
  root.traverse(object=>{
    if(object.geometry?.dispose)object.geometry.dispose();
    if(object.material){const mats=Array.isArray(object.material)?object.material:[object.material];for(const m of mats){m.map?.dispose?.();m.dispose?.()}}
  });
}

/** Accessible, interactive Canvas fallback if a browser's graphics driver blocks WebGL.
 * The WebGL version above remains the primary 3D implementation. */
function FallbackWorkspace({positionRef,participants=[],radius=170,showRadius=true,roofVisible=true,onFloorClick}){
  const canvas=useRef(null),live=useRef({});live.current={positionRef,participants,radius,showRadius,roofVisible,onFloorClick};
  useEffect(()=>{
    const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
    let raf=0,disposed=false,az=.55,mag=1,down=null;
    const render=()=>{
      if(disposed)return;raf=requestAnimationFrame(render);
      const w=el.clientWidth,h=el.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
      if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr)}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const bg=ctx.createRadialGradient(w*.5,h*.4,20,w*.5,h*.5,w*.7);bg.addColorStop(0,'#233b49');bg.addColorStop(1,'#081321');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      const scale=Math.min(w/19,h/12.2)*mag;
      function P(x,y,z){return [w*.5+(x*Math.cos(az)-z*Math.sin(az))*scale,h*.52+(x*Math.sin(az)+z*Math.cos(az))*.67*scale-y*.87*scale]}
      function path(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()}
      function quad(points,color,stroke='#7792a929'){path(points);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke()}}
      function box(x,z,y,sx,sz,sy,top='#657787',left='#3c5160',right='#293b49'){
        const a=P(x-sx/2,y,z-sz/2),b=P(x+sx/2,y,z-sz/2),c=P(x+sx/2,y,z+sz/2),d=P(x-sx/2,y,z+sz/2);
        const a0=P(x-sx/2,y-sy,z-sz/2),b0=P(x+sx/2,y-sy,z-sz/2),c0=P(x+sx/2,y-sy,z+sz/2),d0=P(x-sx/2,y-sy,z+sz/2);
        quad([d,c,c0,d0],left);quad([b,c,c0,b0],right);quad([a,b,c,d],top);
      }
      // Distinct original scene geometry, not a screenshot image.
      box(0,0,-.1,14.7,8.9,.3,'#314a56','#122c39','#0d2331');
      for(let x=-7;x<=7;x+=.43){const a=P(x,-.075,-4.25),b=P(x,-.075,4.25);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle='#c5d6d50a';ctx.stroke()}
      for(const r of [{x:-3.4,z:-2.12,w:7,d:3.75,c:'#315960'},{x:4.35,z:-2.12,w:4.2,d:3.8,c:'#5a3c6b'},{x:4.35,z:2.35,w:4.2,d:3.3,c:'#65503e'},{x:-2,z:2.40,w:5.9,d:2.8,c:'#34494d'}])box(r.x,r.z,-.043,r.w,r.d,.013,r.c);
      const objects=[];const add=(x,z,draw)=>objects.push({depth:x*Math.sin(az)+z*Math.cos(az),draw});
      for(const [x,z] of [[-5.32,-2.18],[-2.85,-2.18]])add(x,z,()=>{
        box(x,z,.70,1.76,.94,.66,'#947768','#344657','#253f4e');
        for(const s of [-1,1])box(x+s*.43,z-.22,1.23,.62,.05,.42,'#17394c','#091927','#0d2030');
        box(x,z+1,.52,.51,.46,.44,'#a0a9b9','#475268','#384459');
      });
      add(4.32,-2.19,()=>{box(4.32,-2.19,.68,1.75,1.2,.58,'#d39e9d','#6e566a','#694559');for(let i=0;i<4;i++){const a=i*Math.PI/2;box(4.32+Math.sin(a)*1.1,-2.19+Math.cos(a)*.85,.53,.47,.45,.49,'#a4839c','#634d75','#4e3c63')}});
      for(const [x,z,ww] of [[4.37,3.15,2.6],[-3.9,1.35,2.1],[-.07,1.08,2.2]])add(x,z,()=>{box(x,z,.55,ww,.85,.43,'#b5b9bd','#737d8f','#57647a');box(x,z-.35,.85,ww,.17,.61,'#bac8ca','#8c9ba6','#67788b')});
      add(-1.92,2.47,()=>{box(-1.92,2.47,.49,1.68,1.65,.43,'#877568','#536c5a','#3c5b53');for(let i=0;i<6;i++){const a=i*Math.PI/3,x=-1.92+Math.cos(a)*.48,z=2.47+Math.sin(a)*.47;box(x,z,.82,.25,.20,.32,'#4f9b6c','#1c6547','#24674c')}});
      for(const [x,z] of [[4.32,2.05],[-1.85,.96]])add(x,z,()=>box(x,z,.55,.8,.65,.5,'#bf987d','#745c53','#544a4b'));
      for(const [x,z] of [[-6.6,-3.6],[-.6,-3.6],[2.7,-3.6],[6.1,-3.6],[2.7,3.7],[6.1,3.7],[-6.5,3.5],[.8,3.5]])add(x,z,()=>{box(x,z,.26,.27,.27,.32,'#b2a598','#6e7066','#6e5f53');for(let i=0;i<5;i++){const a=i*Math.PI*.4;box(x+Math.sin(a)*.18,z+Math.cos(a)*.13,.70,.16,.24,.32,'#379874','#25644a','#245b4a')}});
      const pa=live.current.positionRef.current;
      const people=[...live.current.participants.map(p=>({...p,self:false})),{...pa,name:'Bharath',color:'#5debd5',self:true}];
      for(const p of people)add(WX(p.x),WZ(p.y),()=>{
        const x=WX(p.x),z=WZ(p.y),[sx,sy]=P(x,.07,z);
        if(p.self&&live.current.showRadius){
          ctx.save();ctx.translate(sx,sy);ctx.rotate(Math.atan2(Math.sin(az),Math.cos(az))*.2);ctx.scale(1,.67);
          const rr=live.current.radius*UNIT*scale;const gr=ctx.createRadialGradient(0,0,0,0,0,rr);gr.addColorStop(0,'#63ffe52e');gr.addColorStop(1,'#63ffe506');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,rr,0,Math.PI*2);ctx.fill();for(const n of [.4,.7,1]){ctx.strokeStyle=n===1?'#6cffe6b5':'#7cffdd4a';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,rr*n,0,Math.PI*2);ctx.stroke()}ctx.restore();
        }
        box(x,z,.55,.42,.27,.43,p.self?'#48dccb':p.color||'#779dcb','#34465e','#293e55');
        const [hx,hy]=P(x,1.09,z);ctx.fillStyle='#d6a487';ctx.beginPath();ctx.arc(hx,hy,.17*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#282a35';ctx.beginPath();ctx.arc(hx,hy-.09*scale,.16*scale,Math.PI,Math.PI*2);ctx.fill();
        ctx.font=`700 ${Math.max(10,Math.min(13,scale*.22))}px Arial`;const label=p.self?'BHARATH · YOU':p.name.toUpperCase();const tw=ctx.measureText(label).width+17;
        ctx.fillStyle='#081726f2';ctx.beginPath();ctx.roundRect(hx-tw/2,hy-.61*scale,tw,23,6);ctx.fill();ctx.strokeStyle=p.self?'#66e8d4':'#647c91';ctx.stroke();ctx.fillStyle='#f2fdff';ctx.textAlign='center';ctx.fillText(label,hx,hy-.61*scale+15);
      });
      objects.sort((a,b)=>a.depth-b.depth);objects.forEach(o=>o.draw());
      // Glass walls and translucent roof plates in an open cutaway.
      const walls=[[-7,-4.16,-.16,-4.16,'#72dfd7'],[-7,-4.16,-7,-.18,'#72dfd7'],[2.17,-4.16,6.5,-4.16,'#c18ef8'],[6.5,-4.16,6.5,-.20,'#c18ef8'],[2.17,.62,6.5,.62,'#ffb17c'],[6.5,.62,6.5,4.1,'#ffb17c']];
      for(const [x1,z1,x2,z2,c] of walls){const a=P(x1,0,z1),b=P(x2,0,z2),c1=P(x2,2.06,z2),d=P(x1,2.06,z1);quad([a,b,c1,d],c+'19',c+'80');ctx.strokeStyle=c+'aa';ctx.beginPath();ctx.moveTo(...d);ctx.lineTo(...c1);ctx.stroke()}
      if(live.current.roofVisible)for(const [x,z,ww,dd,c] of [[-3.5,-2.25,6.9,3.85,'#7be7d2'],[4.3,-2.25,4.25,3.85,'#c398f4'],[4.3,2.34,4.25,3.36,'#ffbe8e']]){
        const p=[P(x-ww/2,2.38,z-dd/2),P(x+ww/2,2.38,z-dd/2),P(x+ww/2,2.38,z+dd/2),P(x-ww/2,2.38,z+dd/2)];quad(p,c+'12',c+'66');
      }
      for(const [x,z,name,c] of [[-4.7,-3.3,'STUDIO','#58e5d2'],[4.35,-3.2,'IDEATION LAB','#cca2ff'],[4.45,1.0,'FOCUS LOUNGE','#ffc08c']]){
        const [lx,ly]=P(x,2.69,z);ctx.textAlign='center';ctx.font='800 11px Arial';const sw=ctx.measureText(name).width+22;ctx.fillStyle='#071c2be6';ctx.beginPath();ctx.roundRect(lx-sw/2,ly-11,sw,25,6);ctx.fill();ctx.strokeStyle=c;ctx.stroke();ctx.fillStyle='#f5f9ff';ctx.fillText(name,lx,ly+5);
      }
    };
    const onDown=e=>{down={x:e.clientX,y:e.clientY,az,moved:false};el.setPointerCapture?.(e.pointerId)};
    const onMove=e=>{if(!down)return;const d=e.clientX-down.x;if(Math.abs(d)>6){down.moved=true;az=down.az-d*.006}};
    const onUp=e=>{if(!down)return;const moved=down.moved;down=null;if(moved)return;
      const b=el.getBoundingClientRect(),w=el.clientWidth,h=el.clientHeight,scale=Math.min(w/19,h/12.2)*mag;
      const px=(e.clientX-b.left-w*.5)/scale,py=(e.clientY-b.top-h*.52)/(.67*scale);
      const wx=px*Math.cos(az)+py*Math.sin(az),wz=-px*Math.sin(az)+py*Math.cos(az);
      live.current.onFloorClick?.({x:Math.max(24,Math.min(1176,wx/UNIT+600)),y:Math.max(24,Math.min(696,wz/UNIT+360))});
    };
    const wheel=e=>{e.preventDefault();mag=Math.max(.75,Math.min(1.45,mag*(e.deltaY>0?.92:1.08)))};
    el.addEventListener('pointerdown',onDown);el.addEventListener('pointermove',onMove);el.addEventListener('pointerup',onUp);el.addEventListener('wheel',wheel,{passive:false});render();
    return()=>{disposed=true;cancelAnimationFrame(raf);el.removeEventListener('pointerdown',onDown);el.removeEventListener('pointermove',onMove);el.removeEventListener('pointerup',onUp);el.removeEventListener('wheel',wheel)};
  },[]);
  return <canvas className="fallback-canvas" ref={canvas} aria-label="Interactive isometric office fallback. Use WASD or arrows to move. Click on an open floor position."/>;
}
