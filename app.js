/* Night Sky VR — installable web app.
   Positions: Astronomy Engine (VSOP87/ELP-based, IAU rotation), HYG 3.8 stars with proper motion,
   MPC comet ephemerides, Stellarium textures and nebula images. */
(function(){
'use strict';
const D2R=Math.PI/180, R=100, AU_KM=149597870.7, C_KMS=299792.458;
const AE=window.Astronomy, SD=window.SKYDATA, I18N=window.I18N;
const $=id=>document.getElementById(id);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- settings ----------------
const DEF={lang:'en',voiceURI:'',rate:0.95,lat:20.2961,lon:85.8245,place:'Bhubaneswar',grs:'',paths:true,dso:true,narr:false,tilt:true,lines:true,names:true,ground:true,night:true,ipd:63};
let S=Object.assign({},DEF);try{Object.assign(S,JSON.parse(localStorage.getItem('nsvr')||'{}'));}catch(_){}
if(!S.v2){S.narr=false;S.night=true;S.v2=1;}if(!S.v3){S.lines=false;S.paths=false;S.v3=1;}if(S.ipd==null)S.ipd=63;if(S.night==null)S.night=true;
function save(){try{localStorage.setItem('nsvr',JSON.stringify(S));}catch(_){}}
const L=()=>I18N[S.lang]||I18N.en;
const T=(k,p)=>{let s=(L().t[k]!=null?L().t[k]:I18N.en.t[k])||'';if(p)for(const x in p)s=s.split('{'+x+'}').join(p[x]);return s;};
function fmtNum(n,dec){return Number(n).toLocaleString(S.lang==='en'?'en-US':'en-IN',{maximumFractionDigits:dec||0,minimumFractionDigits:dec||0});}
function sig2(n){if(n<10)return Math.round(n);const p=Math.pow(10,Math.floor(Math.log10(n))-1);return Math.round(n/p)*p;}
function bigWords(n){n=sig2(n);if(S.lang==='en'){return n>=1e9?(+(n/1e9).toPrecision(2))+' billion':n>=1e6?(+(n/1e6).toPrecision(2))+' million':fmtNum(n);}
  const cr={bn:'কোটি',hi:'करोड़',or:'କୋଟି'}[S.lang]||'crore',lk={bn:'লক্ষ',hi:'लाख',or:'ଲକ୍ଷ'}[S.lang]||'lakh';
  return n>=1e7?(+(n/1e7).toPrecision(3))+' '+cr:n>=1e5?(+(n/1e5).toPrecision(2))+' '+lk:fmtNum(n);}

// ---------------- time & place ----------------
let simAnchor=Date.now(),realAnchor=performance.now(),tSpeed=1,paused=false;
function simNow(){return paused?simAnchor:simAnchor+(performance.now()-realAnchor)*tSpeed;}
function setSim(ms){simAnchor=ms;realAnchor=performance.now();timeJumped=true;}
function setSpeed(x){simAnchor=simNow();realAnchor=performance.now();tSpeed=x;}
function tonight9(){const d=new Date();if(d.getHours()>=6&&d.getHours()<21||true){d.setHours(21,0,0,0);}return d.getTime();}
let OBS=new AE.Observer(S.lat,S.lon,0),timeJumped=true;
function setPlace(lat,lon,place){S.lat=lat;S.lon=lon;S.place=place;save();OBS=new AE.Observer(lat,lon,0);timeJumped=true;updateTitle();}

// ---------------- catalogue decode (with proper motion to date) ----------------
const raw=atob(SD.stars),NS=raw.length/12,bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
const dv=new DataView(bytes.buffer),yrs=(Date.now()-Date.UTC(2000,0,1,12))/(365.25*86400000);
const sMag=new Float32Array(NS),sV=new Float32Array(NS*3),pos=new Float32Array(NS*3),col=new Float32Array(NS*3),tw=new Float32Array(NS);
let rs=7;const rand=()=>{rs=(rs*16807)%2147483647;return(rs-1)/2147483646;};
function eqv(raDeg,dec,r){const a=raDeg*D2R,d=dec*D2R;return new THREE.Vector3(r*Math.cos(d)*Math.cos(a),r*Math.cos(d)*Math.sin(a),r*Math.sin(d));}
function bvRGB(bv){bv=Math.max(-0.4,Math.min(2,bv));const Tk=4600*(1/(0.92*bv+1.7)+1/(0.92*bv+0.62)),t=Tk/100;let r,g,b;
  if(t<=66){r=255;g=99.47*Math.log(t)-161.12;b=t<=19?0:138.52*Math.log(t-10)-305.04;}else{r=329.7*Math.pow(t-60,-0.1332);g=288.12*Math.pow(t-60,-0.0755);b=255;}
  const c=x=>Math.max(0,Math.min(255,x))/255;return new THREE.Color(c(r),c(g),c(b)).lerp(new THREE.Color(1,1,1),0.35);}
for(let i=0;i<NS;i++){const o=i*12;let ra=dv.getUint32(o,true)/4294967295*360,de=dv.getInt16(o+4,true)/32767*90;
  const m=dv.getInt8(o+6)/25+3,ci=dv.getInt8(o+7)/60,pa=dv.getInt16(o+8,true),pd=dv.getInt16(o+10,true);
  const cd=Math.cos(de*D2R);if(cd>1e-6)ra+=pa*yrs/3.6e6/cd;de+=pd*yrs/3.6e6;
  sMag[i]=m;const v=eqv(ra,de,1);sV.set([v.x,v.y,v.z],i*3);pos.set([v.x*R,v.y*R,v.z*R],i*3);const c=bvRGB(ci);col.set([c.r,c.g,c.b],i*3);tw[i]=rand();}
const INFO=SD.info,CONS=SD.cons;

// ---------------- renderer ----------------
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:false});
const PR=Math.min(devicePixelRatio,2);renderer.setPixelRatio(PR);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(70,1,0.01,1000);scene.add(camera);
const sky=new THREE.Group();sky.matrixAutoUpdate=false;scene.add(sky);
const invSky=new THREE.Matrix4();

const REFR=`vec3 refr(vec3 w){float L=length(w);float s=clamp(w.y/L,-1.,1.);float h=degrees(asin(s));if(h<-2.)return w;float hh=max(h,-1.);
  float r=1.02/tan(radians(hh+10.3/(hh+5.11)))/60.;float a=radians(h+r);vec2 hz=normalize(w.xz+1e-9);return vec3(hz.x*cos(a),sin(a),hz.y*cos(a))*L;}`;
const starMat=new THREE.ShaderMaterial({
  uniforms:{uPx:{value:PR},uGround:{value:1},uT:{value:0},uTw:{value:1},uLim:{value:6}},
  vertexShader:REFR+`attribute float mag;attribute vec3 color;attribute float tw;uniform float uPx,uGround,uT,uTw,uLim;varying vec3 vC;varying float vA;
  void main(){vec4 wp=modelMatrix*vec4(position,1.);wp.xyz=refr(wp.xyz);float alt=wp.y/length(wp.xyz);
   float ext=mix(1.,smoothstep(-0.005,0.14,alt)*0.85+0.15*step(0.,alt),uGround);ext*=mix(1.,step(0.,alt),uGround);
   float s=max(0.,uLim+0.5-mag);float fade=smoothstep(uLim+0.5,uLim-0.3,mag);
   float t=1.+uTw*tw*0.16*sin(uT*(3.+tw*5.)+tw*40.)*(1.2-clamp(alt,0.,1.));
   vC=color*clamp(0.16+0.2*s,0.16,1.7)*t;vA=ext*fade;gl_PointSize=min(14.,1.3+1.25*s+0.9*max(0.,1.-mag))*uPx;gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);a=a*a+0.9*smoothstep(.2,0.,d);gl_FragColor=vec4(vC*a*vA,1.);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
 g.setAttribute('mag',new THREE.BufferAttribute(sMag,1));g.setAttribute('tw',new THREE.BufferAttribute(tw,1));const p=new THREE.Points(g,starMat);p.frustumCulled=false;sky.add(p);}

// ---- deep catalogue: AT-HYG v3.2 (Tycho-2 + Gaia DR3), 2.5 million stars fainter than mag 8, in 10-degree declination strips ----
const DEEP=[...Array(18)].map((_,b)=>({b,state:0,pts:null,v:null,m:null,n:0}));let deepCount=0;
function loadDeep(d){d.state=1;fetch('data/deep/b'+String(d.b).padStart(2,'0')+'.bin').then(r=>{if(!r.ok)throw 0;return r.arrayBuffer();}).then(buf=>{
  const u=new Uint8Array(buf),n=u.length/7,dvv=new DataView(buf),P=new Float32Array(n*3),C=new Float32Array(n*3),M=new Float32Array(n),W=new Float32Array(n),Vv=new Float32Array(n*3),d0=-90+10*d.b;
  for(let i=0;i<n;i++){const o=i*7,ra=(u[o]|(u[o+1]<<8)|(u[o+2]<<16))/16777215*360,de=d0+dvv.getUint16(o+3,true)/65535*10,m=8+u[o+5]/40,ci=dvv.getInt8(o+6)/60;
    const a=ra*D2R,dd=de*D2R,cd=Math.cos(dd),x=cd*Math.cos(a),y=cd*Math.sin(a),z=Math.sin(dd);Vv[i*3]=x;Vv[i*3+1]=y;Vv[i*3+2]=z;P[i*3]=x*R;P[i*3+1]=y*R;P[i*3+2]=z*R;
    const c=bvRGB(ci);C[i*3]=c.r;C[i*3+1]=c.g;C[i*3+2]=c.b;M[i]=m;W[i]=0;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('color',new THREE.BufferAttribute(C,3));g.setAttribute('mag',new THREE.BufferAttribute(M,1));g.setAttribute('tw',new THREE.BufferAttribute(W,1));
  d.pts=new THREE.Points(g,starMat);d.pts.frustumCulled=false;sky.add(d.pts);d.v=Vv;d.m=M;d.n=n;d.state=2;deepCount+=n;}).catch(()=>{d.state=0;});}
function deepUpdate(cEq,fov){if(fov>16)return;const dec=Math.asin(Math.max(-1,Math.min(1,cEq.z)))/D2R,h=fov*0.8;
  for(const d of DEEP){const lo=-90+10*d.b,hi=lo+10;if(d.state===0&&hi>=dec-h&&lo<=dec+h)loadDeep(d);}}
// Milky Way: photographic all-sky panorama (Stellarium), equatorial J2000, u = 0.25 - RA/360
const mwMat=new THREE.ShaderMaterial({uniforms:{map:{value:null},uGround:{value:1},uK:{value:1}},side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 vE;varying float vAlt;void main(){vE=position;vec4 wp=modelMatrix*vec4(position,1.);vAlt=normalize(wp.xyz).y;gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform sampler2D map;uniform float uGround,uK;varying vec3 vE;varying float vAlt;
  void main(){vec3 d=normalize(vE);float ra=atan(d.y,d.x);float de=asin(clamp(d.z,-1.,1.));vec2 uv=vec2(fract(0.25-ra/6.2831853),de/3.1415927+0.5);
   vec3 c=texture2D(map,uv).rgb;float f=mix(1.,smoothstep(0.,0.18,vAlt),uGround);gl_FragColor=vec4(c*c*1.6*f*uK,1.);}`});
new THREE.TextureLoader().load('tex/milkyway.jpg',t=>{t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.wrapS=THREE.RepeatWrapping;mwMat.uniforms.map.value=t;});
sky.add(new THREE.Mesh(new THREE.SphereGeometry(R*1.05,96,48),mwMat));

// ---------------- labels ----------------
const labels=[];const FONT='"Barlow Semi Condensed","Noto Sans Bengali","Noto Sans Devanagari","Noto Sans Oriya",sans-serif';
function label(text,h,color,italic){const cv=document.createElement('canvas'),g=cv.getContext('2d'),fs=64,font=`${italic?'italic ':''}500 ${fs}px ${FONT}`;
  g.font=font;const w=Math.ceil(g.measureText(text).width)+24;cv.width=w;cv.height=fs*1.45;g.font=font;g.fillStyle=color;g.textBaseline='middle';g.fillText(text,12,cv.height/2);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,depthTest:false,opacity:.88}));
  sp.userData.base=[h*w/cv.height,h];sp.scale.set(h*w/cv.height,h,1);labels.push(sp);return sp;}
function dropLabel(sp){const i=labels.indexOf(sp);if(i>=0)labels.splice(i,1);if(sp.material.map)sp.material.map.dispose();sp.material.dispose();}
function clearGroup(g){g.children.slice().forEach(s=>{g.remove(s);if(s.isSprite)dropLabel(s);else{s.geometry&&s.geometry.dispose();}});}

const lineGroup=new THREE.Group(),consNames=new THREE.Group(),starNames=new THREE.Group(),zoomNames=new THREE.Group(),dsoGroup=new THREE.Group(),nebGroup=new THREE.Group();
[lineGroup,consNames,starNames,zoomNames,dsoGroup,nebGroup].forEach(g=>sky.add(g));
const consCen={};
{const segs=[];for(const k in SD.lines){const c=new THREE.Vector3();let n=0;
  SD.lines[k].forEach(seg=>{for(let i=0;i<seg.length;i++){const v=eqv(seg[i][0],seg[i][1],R*.995);c.add(v);n++;if(i>0){const u=eqv(seg[i-1][0],seg[i-1][1],R*.995);segs.push(u.x,u.y,u.z,v.x,v.y,v.z);}}});
  consCen[k]=c.divideScalar(n).normalize();}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(segs,3));
 lineGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x6d8cc7,transparent:true,opacity:.32,depthWrite:false})));}
const byName={};for(let i=0;i<INFO.length;i++)if(INFO[i][0])byName[INFO[i][0]]=i;
function conName(k){const l=L();if(l.con&&l.con[k])return l.con[k];if(S.lang==='hi'&&CONS[k]&&CONS[k][2])return CONS[k][2];return CONS[k]?CONS[k][0]:k;}
function starProper(n){const l=L();return (l.star&&l.star[n])||n;}
function mkStaticLabels(){clearGroup(consNames);clearGroup(starNames);
  for(const k in consCen){const sp=label(conName(k),3.4,'#8fa9d8',true);sp.position.copy(consCen[k]).multiplyScalar(R*.97);consNames.add(sp);}
  const add=i=>{const sp=label(starProper(INFO[i][0]),2.6,'#e8d6b8');sp.center.set(-0.08,1.1);sp.position.set(sV[i*3],sV[i*3+1],sV[i*3+2]).multiplyScalar(R*.97);starNames.add(sp);};
  for(let i=0;i<INFO.length&&sMag[i]<1.6;i++)if(INFO[i][0])add(i);if(byName.Polaris!=null)add(byName.Polaris);}

// deep-sky outlines
const DSODIST={M1:6500,M4:7200,M6:1600,M7:980,M8:4100,M13:22000,M22:10600,M27:1360,M31:2.5e6,M33:2.7e6,M35:2800,M41:2300,M42:1350,M44:580,M45:440,M57:2300,M81:1.2e7,M87:5.3e7,M104:3.1e7,
 'C 41':150,'NGC 5139':17000,'NGC 104':15000,'PGC 17223':160000,'NGC 292':200000,'NGC 869':7500,'NGC 884':7500,'NGC 3372':8500};
const DSO=SD.dsos.map(d=>{const dims=String(d[5]).split('x').map(Number);return{id:d[0],alt:d[1],type:d[3],mag:d[4],dim:dims[0]||0,v:eqv(((d[6]%360)+360)%360,d[7],1)};});
{const ringMat=new THREE.LineBasicMaterial({color:0x9fc2a0,transparent:true,opacity:.5,depthWrite:false});
 DSO.forEach(o=>{const r=Math.max(o.dim/2,2)/60*D2R;const a=Math.abs(o.v.z)>0.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
  const u=new THREE.Vector3().crossVectors(o.v,a).normalize(),w=new THREE.Vector3().crossVectors(o.v,u).normalize(),pts=[];
  for(let k=0;k<=48;k++){const t=k/48*2*Math.PI;pts.push(o.v.clone().multiplyScalar(Math.cos(r)).addScaledVector(u,Math.sin(r)*Math.cos(t)).addScaledVector(w,Math.sin(r)*Math.sin(t)).multiplyScalar(R*.99));}
  const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),ringMat);ln.userData.ring=true;dsoGroup.add(ln);
  const sp=label(o.id+(o.alt?' · '+o.alt:''),2.2,'#a9d4ab');sp.center.set(-0.05,-0.2);sp.position.copy(pts[6]);dsoGroup.add(sp);});}

// nebula/galaxy photographs (Stellarium default set), loaded on demand
const NEB_BASE='https://raw.githubusercontent.com/Stellarium/stellarium/master/nebulae/default/';
const NEB=SD.neb.map(n=>{const c=new THREE.Vector3();const q=n[1].map(p=>{const v=eqv(p[0],p[1],1);c.add(v);return v;});c.normalize();
  let rad=0;q.forEach(v=>rad=Math.max(rad,Math.acos(Math.min(1,v.dot(c)))));return{url:n[0],q,tc:n[2],credit:n[3],c,rad,mesh:null,state:0};});
let nebLoading=0;const texLoader=new THREE.TextureLoader();texLoader.setCrossOrigin('anonymous');
function nebUpdate(cEq,fov){if(!S.dso)return;const lim=Math.cos(Math.min(90,fov*0.9)*D2R);
  for(const n of NEB){const d=n.c.dot(cEq);if(n.mesh)n.mesh.material.opacity=fov<30?Math.min(0.9,(30-fov)/12):0;
    if(n.state||fov>30||nebLoading>=4||Math.acos(Math.min(1,d))>Math.min(89,fov*0.75)*D2R+n.rad)continue;
    n.state=1;nebLoading++;texLoader.load(NEB_BASE+n.url,t=>{nebLoading--;n.state=2;const g=new THREE.BufferGeometry();const P=[],U=[];
      [0,1,2,0,2,3].forEach(k=>{const v=n.q[k].clone().multiplyScalar(R*.985);P.push(v.x,v.y,v.z);U.push(n.tc[k][0],n.tc[k][1]);});
      g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
      n.mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));nebGroup.add(n.mesh);},
      undefined,()=>{nebLoading--;n.state=3;});}}

// ---------------- Solar System ----------------
const solar=new THREE.Group();sky.add(solar);const solarNames=new THREE.Group();sky.add(solarNames);
function bodyGeo(){const g=new THREE.BufferGeometry(),P=[],N=[],U=[],I=[],nl=96,nb=48;
  for(let j=0;j<=nb;j++){const b=-90+180*j/nb;for(let i=0;i<=nl;i++){const l=-180+360*i/nl;const cb=Math.cos(b*D2R);const x=cb*Math.cos(l*D2R),y=cb*Math.sin(l*D2R),z=Math.sin(b*D2R);
    P.push(x,y,z);N.push(x,y,z);U.push(i/nl,j/nb);}}
  for(let j=0;j<nb;j++)for(let i=0;i<nl;i++){const a=j*(nl+1)+i,b=a+nl+1;I.push(a,a+1,b,a+1,b+1,b);}
  g.setIndex(I);g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));return g;}
const BGEO=bodyGeo();
const BODY_FS=`uniform sampler2D map,ringTex;uniform vec3 uSun,uView,uShO,uShD;uniform float uMode,uAmb,uBright,uContrast,uRing,uRin,uRout,uFlat,uRu,uRp,uEcl;uniform vec4 uMoons[4];
varying vec3 vN;varying vec2 vUv;
void main(){vec3 n=normalize(vN);vec3 tex=texture2D(map,vUv).rgb;float lum=dot(tex,vec3(.299,.587,.114));tex=mix(vec3(lum),tex,1.)*1.;tex=mix(vec3(lum),tex,uContrast);
 float mu0=dot(n,uSun),mu=max(dot(n,uView),0.);float I;
 if(uMode<0.5){I=max(mu0,0.)*(0.72+0.28*pow(mu,0.35));}
 else if(uMode<1.5){I=mu0>0.?2.*mu0/(mu0+mu+1e-4)*0.62:0.;}
 else {I=1.;}
 vec3 p=vec3(n.xy,n.z*(1.-uFlat));
 if(uRing>0.5&&mu0>0.&&abs(uSun.z)>1e-4){float t=-p.z/uSun.z;if(t>0.){float rr=length(p.xy+t*uSun.xy);if(rr>uRin&&rr<uRout){float a=texture2D(ringTex,vec2((rr-uRin)/(uRout-uRin),.5)).a;I*=1.-a*0.85;}}}
 for(int k=0;k<4;k++){vec4 m=uMoons[k];if(m.w<=0.)continue;vec3 w=m.xyz-p;float t=dot(w,uSun);if(t>0.){float d=length(w-t*uSun);float pen=0.0049*t+0.02*m.w;I*=mix(0.03,1.,smoothstep(m.w-pen,m.w+pen,d));}}
 vec3 c=tex*I;
 if(uEcl>0.){vec3 w=p-uShO;float t=dot(w,uShD);if(t>0.){float d=length(w-t*uShD);float pf=smoothstep(uRu,uRp,d);float uf=smoothstep(uRu*0.92,uRu*1.04,d);
   c=mix(tex*max(mu0,0.)*vec3(0.18,0.06,0.03)*0.6,c,uf)*mix(0.35,1.,pf)+ (1.-uf)*vec3(0.);}}
 c+=tex*uAmb*(1.-step(0.,mu0))*0.;c+=tex*uAmb;
 gl_FragColor=vec4(c*uBright,1.);}`;
const BODY_VS=`varying vec3 vN;varying vec2 vUv;void main(){vN=normal;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function bodyMat(texUrl,mode,o){const u={map:{value:null},ringTex:{value:null},uSun:{value:new THREE.Vector3(1,0,0)},uView:{value:new THREE.Vector3(1,0,0)},uShO:{value:new THREE.Vector3()},uShD:{value:new THREE.Vector3(1,0,0)},
  uMode:{value:mode},uAmb:{value:o.amb||0},uBright:{value:1},uContrast:{value:o.contrast==null?1:o.contrast},uRing:{value:0},uRin:{value:1},uRout:{value:2},uFlat:{value:o.f||0},uRu:{value:0},uRp:{value:0},uEcl:{value:0},
  uMoons:{value:[0,1,2,3].map(()=>new THREE.Vector4(0,0,0,0))}};
  const m=new THREE.ShaderMaterial({uniforms:u,vertexShader:BODY_VS,fragmentShader:BODY_FS});
  if(texUrl)new THREE.TextureLoader().load(texUrl,t=>{t.anisotropy=4;u.map.value=t;});else{const c=document.createElement('canvas');c.width=c.height=2;const g=c.getContext('2d');g.fillStyle=o.color||'#fff';g.fillRect(0,0,2,2);u.map.value=new THREE.CanvasTexture(c);}
  return m;}
// IAU-style pole and prime meridian; for Galilean moons from Stellarium (WGCCRE) parameters
const PL=[
 {k:'Mercury',km:2440.53,f:0.00093,tex:'tex/mercury.png',mode:1,col:'#b9aea2',ae:true},
 {k:'Venus',km:6051.8,f:0,tex:'tex/venus.png',mode:0,col:'#f3e7c4',ae:true,contrast:0.35},
 {k:'Mars',km:3396.19,f:0.005886,tex:'tex/mars.png',mode:0,col:'#d47a4a',ae:true},
 {k:'Jupiter',km:71492,f:0.064874,tex:'tex/jupiter.png',mode:0,col:'#e3cfab',grs:true},
 {k:'Saturn',km:60268,f:0.0979624,tex:'tex/saturn.png',mode:0,col:'#e7d6a2',ae:true,ring:[74510,140390]},
 {k:'Uranus',km:25559,f:0.0229273,tex:'tex/uranus.png',mode:0,col:'#a9dfe5',ae:true},
 {k:'Neptune',km:24764,f:0.0170812,tex:'tex/neptune.png',mode:0,col:'#5f82e2',ae:true},
 {k:'Moon',km:1737.4,f:0,tex:'tex/moon.jpg',mode:1,col:'#d2cdc5',ae:true,amb:0.006},
 {k:'Sun',km:696000,f:0,mode:2,col:'#fff1d0',sun:true}];
const GAL=[
 {k:'Io',km:1821.49,tex:'tex/io.png',pr:[268.05,-0.009,64.50,0.003],w:[200.39,203.4889538],key:'io'},
 {k:'Europa',km:1560.8,tex:'tex/europa.png',pr:[268.08,-0.009,64.51,0.003],w:[36.022,101.3747235],key:'europa'},
 {k:'Ganymede',km:2631.2,tex:'tex/ganymede.png',pr:[268.20,-0.009,64.57,0.003],w:[44.064,50.3176081],key:'ganymede'},
 {k:'Callisto',km:2410.3,tex:'tex/callisto.png',pr:[268.72,-0.009,64.83,0.003],w:[259.51,21.5710715],key:'callisto'}];
const sunMat=new THREE.ShaderMaterial({vertexShader:BODY_VS,fragmentShader:`varying vec3 vN;uniform vec3 uView;void main(){float mu=max(dot(normalize(vN),uView),0.);
  float ld=1.-0.6*(1.-mu)-0.0*(1.-mu*mu);gl_FragColor=vec4(vec3(1.,.96,.86)*ld*1.2,1.);}`,uniforms:{uView:{value:new THREE.Vector3(1,0,0)}}});
[...PL,...GAL].forEach(p=>{p.mat=p.sun?sunMat:bodyMat(p.tex,p.mode==null?1:p.mode,p);p.mesh=new THREE.Mesh(BGEO,p.mat);p.mesh.visible=false;p.mesh.matrixAutoUpdate=true;solar.add(p.mesh);});
// Saturn rings
const SAT=PL[4];{const [rin,rout]=SAT.ring.map(x=>x/SAT.km);const g=new THREE.RingGeometry(rin,rout,192,1);
  const rt=new THREE.TextureLoader().load('tex/saturn_rings_radial.png');SAT.mat.uniforms.ringTex.value=rt;SAT.mat.uniforms.uRing.value=1;SAT.mat.uniforms.uRin.value=rin;SAT.mat.uniforms.uRout.value=rout;
  SAT.ringMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{ringTex:{value:rt},uSun:{value:new THREE.Vector3()},uView:{value:new THREE.Vector3()},uRin:{value:rin},uRout:{value:rout},uFlat:{value:SAT.f}},
   vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform sampler2D ringTex;uniform vec3 uSun,uView;uniform float uRin,uRout,uFlat;varying vec3 vP;
   void main(){float r=length(vP.xy);vec4 t=texture2D(ringTex,vec2((r-uRin)/(uRout-uRin),.5));float lit=uSun.z*uView.z>0.?1.:0.28;
    vec3 q=vec3(vP.xy,0.);vec3 d=normalize(vec3(uSun.xy,uSun.z/(1.-uFlat)));float b=dot(q,d),c=dot(q,q)-1.,h=b*b-c;if(h>0.&&-b-sqrt(h)>0.)lit*=0.06;
    gl_FragColor=vec4(t.rgb*1.25*lit*max(abs(uSun.z),0.08)/max(abs(uSun.z),0.08),t.a);}`});
  SAT.ringMesh=new THREE.Mesh(g,SAT.ringMat);SAT.mesh.add(SAT.ringMesh);}
// glow points for wide views
const NPT=PL.length-2+GAL.length;const gPos=new Float32Array(NPT*3),gCol=new Float32Array(NPT*3),gMag=new Float32Array(NPT).fill(99),gTw=new Float32Array(NPT);
const gGeo=new THREE.BufferGeometry();gGeo.setAttribute('position',new THREE.BufferAttribute(gPos,3));gGeo.setAttribute('color',new THREE.BufferAttribute(gCol,3));gGeo.setAttribute('mag',new THREE.BufferAttribute(gMag,1));gGeo.setAttribute('tw',new THREE.BufferAttribute(gTw,1));
const gPts=new THREE.Points(gGeo,starMat);gPts.frustumCulled=false;solar.add(gPts);
const sunGlow=(()=>{const cv=document.createElement('canvas');cv.width=cv.height=256;const g=cv.getContext('2d');const gr=g.createRadialGradient(128,128,0,128,128,128);
  gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(.1,'rgba(255,220,150,.55)');gr.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));solar.add(s);return s;})();
// comets
const CM=window.COMETS,comets=[];
const comaTex=(()=>{const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(190,255,220,.9)');gr.addColorStop(.3,'rgba(150,230,200,.35)');gr.addColorStop(1,'rgba(120,200,180,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(cv);})();
if(CM)CM.names.forEach((n,i)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:comaTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  s.userData.base=[1.6,1.6];labels.push(s);s.visible=false;solar.add(s);comets.push({n,rows:CM.rows[i],spr:s,v:new THREE.Vector3(),ok:false});});
const SHOWERS=window.SHOWERS;const showerGroup=new THREE.Group();sky.add(showerGroup);SHOWERS.forEach(s=>{s.v=eqv(s.ra,s.de,1);});
function inWindow(s,d){const v=(d.getMonth()+1)*100+d.getDate(),A=s.a[0]*100+s.a[1],B=s.b[0]*100+s.b[1];return A<=B?(v>=A&&v<=B):(v>=A||v<=B);}
// paths
const pathGroup=new THREE.Group();sky.add(pathGroup);let pathAt=-1e18;

const solarLbl={};
function solarLabel(key,text,colr,v){let s=solarLbl[key];if(!s||s.userData.txt!==text){if(s){solarNames.remove(s);dropLabel(s);}s=label(text,2.6,colr);s.userData.txt=text;s.center.set(-0.12,0.5);solarNames.add(s);solarLbl[key]=s;}
  s.position.copy(v).multiplyScalar(R*.9);return s;}
const zAx=new THREE.Vector3(0,0,1),tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),qI=new THREE.Quaternion(),mB=new THREE.Matrix4();
function V(a){return new THREE.Vector3(a.x,a.y,a.z);}
function poleW(p,t){// returns {pole,W} at time t (TT days since J2000 via AE.AstroTime)
  if(p.ae){const ax=AE.RotationAxis(p.k,t);return{pole:V(ax.north).normalize(),W:ax.spin};}
  const d=t.tt,Tc=d/36525;let ra,de,W;
  if(p.k==='Jupiter'){ra=268.056595-0.006499*Tc;de=64.495303+0.002413*Tc;W=43.3+870.270*d;}
  else{ra=p.pr[0]+p.pr[1]*Tc;de=p.pr[2]+p.pr[3]*Tc;W=p.w[0]+p.w[1]*d;}
  return{pole:eqv(ra,de,1),W};}
function bodyBasis(pole,W){const Q=new THREE.Vector3().crossVectors(zAx,pole).normalize();const P0=Q.clone().applyAxisAngle(pole,W*D2R);const E=new THREE.Vector3().crossVectors(pole,P0);return[P0,E];}
function grsLongitude(ms){if(S.grs!==''&&!isNaN(+S.grs))return +S.grs;const months=(ms-Date.UTC(2026,5,1))/(30.4375*86400000);return ((91.0+1.75*months)%360+360)%360;}
const GRS_TEX_LON=-51.0; // longitude of the Red Spot on the Stellarium Jupiter map (map coordinates)
let sunAlt=-90,dayK=0,twK=0,simDate=new Date();
function refrEq(vEq){// apply refraction to a unit eq vector, return eq vector
  tmpA.copy(vEq).applyMatrix4(sky.matrix);const h=Math.asin(Math.max(-1,Math.min(1,tmpA.y)))/D2R;if(h<-2)return vEq.clone();const hh=Math.max(h,-1);
  const r=1.02/Math.tan((hh+10.3/(hh+5.11))*D2R)/60;const a=(h+r)*D2R,hz=Math.hypot(tmpA.x,tmpA.z)||1;tmpA.set(tmpA.x/hz*Math.cos(a),Math.sin(a),tmpA.z/hz*Math.cos(a));return tmpA.applyMatrix4(invSky).normalize().clone();}
function placeBody(p,geoAU,Rb,t,extraW){// geoAU: THREE.Vector3 observer->body astrometric (AU)
  const dist=geoAU.length(),dir=refrEq(geoAU.clone().normalize());p.v=dir;p.dist=dist;p.ang=Math.asin(Math.min(1,p.km/(dist*AU_KM)));
  const s=Rb*Math.tan(p.ang);p.mesh.position.copy(dir).multiplyScalar(Rb);p.mesh.scale.set(s,s,s*(1-(p.f||0)));p.mesh.visible=true;
  if(p.sun)return;const lt=dist*499.004784/86400;const pw=poleW(p,t.AddDays(-lt));const[P0,E]=bodyBasis(pw.pole,pw.W+(extraW||0));p.pole=pw.pole;
  mB.makeBasis(P0,E,pw.pole);p.mesh.quaternion.setFromRotationMatrix(mB);qI.copy(p.mesh.quaternion).invert();
  const sView=geoAU.clone().negate().normalize();p.mat.uniforms.uView.value.copy(sView).applyQuaternion(qI);
  // central meridian (west longitude for display) and sub-observer
  const lamE=Math.atan2(sView.dot(E),sView.dot(P0))/D2R;p.cm=((-lamE-(extraW||0))%360+360)%360;}
function updateSolar(){if(!AE)return;const ms=simNow();simDate=new Date(ms);const t=AE.MakeTime(simDate);
  const sunG=V(AE.GeoVector('Sun',t,true));
  PL.forEach((p,i)=>{let e;try{e=AE.Equator(p.k,t,OBS,false,false);}catch(_){return;}const geo=V(e.vec);
    const Rb=R*(p.sun?0.985:p.k==='Moon'?0.86:0.9+0.06*Math.min(1,Math.log10(1+geo.length())/1.6));
    let extra=0;if(p.grs){extra=-grsLongitude(ms)-GRS_TEX_LON;}
    placeBody(p,geo,Rb,t,extra);
    if(p.sun){p.mag=-26.7;sunGlow.position.copy(p.mesh.position);sunGlow.scale.setScalar(Rb*Math.tan(p.ang)*12);sunMat.uniforms.uView.value.set(0,0,1);p.mesh.quaternion.setFromUnitVectors(zAx,p.v.clone().negate());return;}
    const g=V(AE.GeoVector(p.k,t,true));p.helio=sunG.clone().sub(g);const sDir=p.helio.clone().normalize();qI.copy(p.mesh.quaternion).invert();p.mat.uniforms.uSun.value.copy(sDir).applyQuaternion(qI);
    try{const il=AE.Illumination(p.k,t);p.mag=il.mag;p.frac=il.phase_fraction;p.tilt=il.ring_tilt;}catch(_){}
    if(p.ring)SAT.ringMat.uniforms.uSun.value.copy(p.mat.uniforms.uSun.value),SAT.ringMat.uniforms.uView.value.copy(p.mat.uniforms.uView.value);
    if(i<7){gPos.set([p.v.x*R*.95,p.v.y*R*.95,p.v.z*R*.95],i*3);const c=new THREE.Color(p.col);gCol.set([c.r,c.g,c.b],i*3);gMag[i]=p.mag;}
    solarLabel(p.k,L().label[p.k]||L().planet[p.k],'#ffd9a0',p.v);
    // lunar eclipse: Earth's shadow on the Moon
    if(p.k==='Moon'){const mg=V(AE.GeoVector('Moon',t,true)).multiplyScalar(AU_KM),sh=sunG.clone().normalize().negate();const tt=mg.dot(sh);const ru=1.02*(6378-tt*(696000-6378)/(sunG.length()*AU_KM)),rp=1.02*(6378+tt*(696000+6378)/(sunG.length()*AU_KM));
      const O=mg.clone().negate().divideScalar(p.km).applyQuaternion(qI),Dd=sh.clone().applyQuaternion(qI);const u=p.mat.uniforms;u.uShO.value.copy(O);u.uShD.value.copy(Dd);u.uRu.value=ru/p.km;u.uRp.value=rp/p.km;u.uEcl.value=tt>0?1:0;}});
  // Galilean moons in true 3D around Jupiter
  try{const J=PL[3];const jv=V(AE.Equator('Jupiter',t,OBS,false,false).vec);const lt=jv.length()*499.004784/86400;const jm=AE.JupiterMoons(t.AddDays(-lt));const k=(J.mesh.position.length())/jv.length();
    const qJ=J.mesh.quaternion.clone().invert(),sJ=J.mat.uniforms.uSun.value;
    GAL.forEach((g,i)=>{const mv=jm[g.key];const rel=new THREE.Vector3(mv.x,mv.y,mv.z);const geo=jv.clone().add(rel);
      const dist=geo.length();g.v=geo.clone().normalize();g.dist=dist;g.ang=Math.asin(g.km/(dist*AU_KM));const s=k*g.km/AU_KM;
      g.mesh.position.copy(geo).multiplyScalar(k);g.mesh.scale.setScalar(s);g.mesh.visible=true;
      const pw=poleW(g,t.AddDays(-lt));const[P0,E]=bodyBasis(pw.pole,pw.W);mB.makeBasis(P0,E,pw.pole);g.mesh.quaternion.setFromRotationMatrix(mB);qI.copy(g.mesh.quaternion).invert();
      g.mat.uniforms.uSun.value.copy(J.helio.clone().normalize()).applyQuaternion(qI);g.mat.uniforms.uView.value.copy(geo.clone().negate().normalize()).applyQuaternion(qI);
      // moon position in Jupiter body frame (Jupiter radii) for shadows; eclipse of the moon by Jupiter
      const mJ=rel.clone().multiplyScalar(AU_KM/J.km).applyQuaternion(qJ);J.mat.uniforms.uMoons.value[i].set(mJ.x,mJ.y,mJ.z,g.km/J.km);
      const tt=mJ.dot(sJ);const perp=mJ.clone().sub(sJ.clone().multiplyScalar(tt)).length();g.ecl=tt<0&&perp<1.0;g.mat.uniforms.uBright.value=tt<0?THREE.MathUtils.smoothstep(perp,0.97,1.06):1;
      g.shadowOn=false;if(tt>0){const perp2=perp;g.shadowOn=perp2<1;}
      const behind=Math.acos(Math.min(1,g.v.dot(J.v)))<J.ang&&dist>J.dist;g.hidden=behind;
      gPos.set([g.v.x*R*.95,g.v.y*R*.95,g.v.z*R*.95],(7+i)*3);gCol.set([1,.97,.9],(7+i)*3);gMag[7+i]=behind||g.ecl?99:5.3;
      const lb=solarLabel('g'+i,L().planet[g.k],'#d8e4f0',g.v);lb.userData.gal=true;});}catch(e){console.warn(e);}
  gGeo.attributes.position.needsUpdate=true;gGeo.attributes.color.needsUpdate=true;gGeo.attributes.mag.needsUpdate=true;
  // comets
  if(CM){const f=(ms-Date.parse(CM.t0))/(CM.step*86400000);comets.forEach(c=>{const n=c.rows.length;if(f<0||f>n-1){c.ok=false;c.spr.visible=false;return;}c.ok=true;
    const i=Math.min(n-2,Math.floor(f)),u=f-i,P=k=>c.rows[Math.max(0,Math.min(n-1,k))];const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);const un=a=>((a-p1[0]+540)%360)-180+p1[0];
    const cr=(a,b,cc,d)=>0.5*((2*b)+(-a+cc)*u+(2*a-5*b+4*cc-d)*u*u+(-a+3*b-3*cc+d)*u*u*u);const ra=cr(un(p0[0]),p1[0],un(p2[0]),un(p3[0])),de=cr(p0[1],p1[1],p2[1],p3[1]);
    c.delta=p1[2]+(p2[2]-p1[2])*u;c.r=p1[3]+(p2[3]-p1[3])*u;c.m=p1[4]+(p2[4]-p1[4])*u;c.v.copy(refrEq(eqv(((ra%360)+360)%360,de,1)));c.spr.position.copy(c.v).multiplyScalar(R*.96);
    const lb=solarLabel('c'+c.n,c.n.replace(/ \(.*\)/,'').replace(/^(\d+P)\/.*/,'$1')+' ☄','#b8f0d4',c.v);lb.userData.comet=true;});}
  SHOWERS.forEach(s=>{s.on=inWindow(s,simDate);});
  const su=PL[8];if(su.v){tmpA.copy(su.v).applyMatrix4(sky.matrix);sunAlt=Math.asin(tmpA.y)/D2R;}
  twK=Math.max(0,Math.min(1,(sunAlt+18)/18));dayK=Math.max(0,Math.min(1,(sunAlt+4)/10));
  if(Math.abs(ms-pathAt)>3*86400000)buildPaths(ms);}
function buildPaths(ms){pathAt=ms;clearGroup(pathGroup);const fmt=d=>d.toLocaleDateString(S.lang==='en'?'en-GB':S.lang+'-IN',{day:'numeric',month:'short'});
  PL.slice(0,8).forEach(p=>{const moon=p.k==='Moon';const span=moon?[-3,3]:[-60,120],step=moon?0.25:2;const pts=[];
    for(let d=span[0];d<=span[1]+1e-9;d+=step){const t=AE.MakeTime(new Date(ms+d*86400000));let e;try{e=AE.Equator(p.k,t,OBS,false,false);}catch(_){continue;}const v=V(e.vec).normalize().multiplyScalar(R*.93);pts.push(v);
      const tick=moon?(Math.abs(d%1)<1e-6):(Math.abs(d%30)<1e-6);if(tick&&d!==0){const sp=label(fmt(new Date(ms+d*86400000)),1.6,p.col);sp.position.copy(v);sp.center.set(-0.1,0.5);pathGroup.add(sp);}}
    const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:p.col,transparent:true,opacity:.45,depthWrite:false}));pathGroup.add(ln);});}

// ---------------- ground ----------------
const groundGroup=new THREE.Group();scene.add(groundGroup);
groundGroup.add(new THREE.Mesh(new THREE.SphereGeometry(150,64,16,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshBasicMaterial({color:0x07080b,side:THREE.BackSide})));
{const cv=document.createElement('canvas');cv.width=2048;cv.height=128;const g=cv.getContext('2d');g.fillStyle='#07080b';g.beginPath();g.moveTo(0,128);
 let y=110;for(let x=0;x<=2048;x+=8){y+=(rand()-.5)*10;y=Math.max(70,Math.min(124,y));if(rand()<.02)g.lineTo(x,y-30-rand()*25);g.lineTo(x,y);}g.lineTo(2048,128);g.fill();
 const t=new THREE.CanvasTexture(cv);t.wrapS=THREE.RepeatWrapping;const cyl=new THREE.Mesh(new THREE.CylinderGeometry(140,140,9,128,1,true),new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.BackSide,depthWrite:false}));cyl.position.y=2.5;groundGroup.add(cyl);}
groundGroup.add(new THREE.Mesh(new THREE.SphereGeometry(145,64,32),new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 vP;void main(){float a=vP.y<0.?0.:exp(-vP.y*9.);gl_FragColor=vec4(vec3(.05,.07,.12)*a,1.);}`})));
const cardinal=new THREE.Group();groundGroup.add(cardinal);
function mkCardinal(){clearGroup(cardinal);const N={en:['N','E','S','W'],bn:['উ','পূ','দ','প'],hi:['उ','पू','द','प'],or:['ଉ','ପୂ','ଦ','ପ']}[S.lang];[[0,-1],[1,0],[0,1],[-1,0]].forEach(([x,z],i)=>{const sp=label(N[i],3.4,'#ff6a5c');sp.position.set(x*95,4,z*95);cardinal.add(sp);});}

// own 360 photo
const photoMat=new THREE.MeshBasicMaterial({color:0xffffff});const photoGeo=new THREE.SphereGeometry(400,96,64);photoGeo.scale(-1,1,1);
const photo=new THREE.Mesh(photoGeo,photoMat);photo.visible=false;scene.add(photo);

// ---------------- exact sky orientation (precession, nutation, sidereal time, latitude) ----------------
function orientSky(){const t=AE.MakeTime(new Date(simNow()));const Rm=AE.Rotation_EQJ_HOR(t,OBS);
  const c=[[1,0,0],[0,1,0],[0,0,1]].map(b=>{const v=AE.RotateVector(Rm,new AE.Vector(b[0],b[1],b[2],t));return new THREE.Vector3(-v.y,v.z,-v.x);});
  sky.matrix.makeBasis(c[0],c[1],c[2]);sky.matrixWorldNeedsUpdate=true;invSky.copy(sky.matrix).invert();}

// ---------------- UI wiring ----------------
const toast=$('toast');let toastT;function say(m,ms){toast.textContent=m;toast.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>toast.hidden=true,ms||5000);}
const cap=$('caption');
function updateTitle(){$('place').textContent=`${S.place} · ${Math.abs(S.lat).toFixed(2)}°${S.lat>=0?'N':'S'} ${Math.abs(S.lon).toFixed(2)}°${S.lon>=0?'E':'W'}`;}
function updateReadout(){const d=new Date(simNow());const live=!paused&&tSpeed===1&&Math.abs(simNow()-Date.now())<60000;
  $('clock').innerHTML=`<b>${d.toLocaleString(S.lang==='en'?'en-GB':S.lang+'-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b>${live?' <span class="live">LIVE</span>':(tSpeed!==1&&!paused?' ×'+tSpeed:'')} · ${camera.fov<1?(camera.fov*60).toFixed(0)+'′':camera.fov.toFixed(camera.fov<10?1:0)+'°'}`;}
function applyLang(){const u=L().ui;document.documentElement.lang=S.lang;document.querySelectorAll('[data-i]').forEach(el=>{const k=el.getAttribute('data-i');if(u[k])el.textContent=u[k];});
  $('sayWords').textContent=L().cmdWords.join(' · ');viewLabel();langLabel();$('freezeBtn').textContent=frozen?L().ui.unfreeze:L().ui.freeze;if(frozen){pickItems=viewItems();showPick();}mkStaticLabels();mkCardinal();for(const k in solarLbl){solarNames.remove(solarLbl[k]);dropLabel(solarLbl[k]);delete solarLbl[k];}
  pathAt=-1e18;updateSolar();fillVoices();if(listening)startRec();}
function toggle(id,key,fn){const b=$(id);b.setAttribute('aria-pressed',!!S[key]);b.onclick=()=>{S[key]=!S[key];save();b.setAttribute('aria-pressed',S[key]);fn&&fn(S[key]);};}
let linesUntil=0;const showLines=()=>performance.now()<linesUntil||(synth&&synth.speaking&&linesUntil>0);toggle('namesBtn','names');toggle('groundBtn','ground',on=>{starMat.uniforms.uGround.value=on?1:0;mwMat.uniforms.uGround.value=on?1:0;});
toggle('narrBtn','narr',on=>{if(!on){synth&&synth.cancel();cap.hidden=true;setCapSprite(null);}else lastSaid=null;});
toggle('tiltBtn','tilt');
const LANGS=['en','bn','hi','or'],langBtn=$('langBtn');function langLabel(){langBtn.textContent='🌐 '+I18N[S.lang].name;}
langBtn.onclick=()=>{S.lang=LANGS[(LANGS.indexOf(S.lang)+1)%LANGS.length];S.voiceURI='';save();$('langSel').value=S.lang;applyLang();};
const viewBtn=$('viewBtn');function viewLabel(){viewBtn.textContent=S.night?L().ui.nightV:L().ui.actualV;viewBtn.setAttribute('aria-pressed',S.night);}
viewBtn.onclick=()=>{S.night=!S.night;save();viewLabel();};
$('nowBtn').onclick=()=>{paused=false;tSpeed=1;setSim(Date.now());syncTimeUI();};
$('tonightBtn').onclick=()=>{setSim(tonight9());syncTimeUI();};
$('photoIn').onchange=e=>{const f=e.target.files[0];if(!f)return;new THREE.TextureLoader().load(URL.createObjectURL(f),t=>{photoMat.map&&photoMat.map.dispose();photoMat.map=t;photoMat.needsUpdate=true;photo.visible=true;sky.visible=false;groundGroup.visible=false;$('skyBtn').hidden=false;});};
$('skyBtn').onclick=()=>{photo.visible=false;sky.visible=true;$('skyBtn').hidden=true;};
// settings sheet
const sheet=$('sheet');$('setBtn').onclick=()=>{syncTimeUI();sheet.hidden=false;};$('closeSet').onclick=()=>{sheet.hidden=true;};
$('langSel').value=S.lang;$('langSel').onchange=e=>{S.lang=e.target.value;S.voiceURI='';save();applyLang();};
$('rate').value=S.rate;$('rate').oninput=e=>{S.rate=+e.target.value;save();};
$('voiceSel').onchange=e=>{S.voiceURI=e.target.value;save();};
$('testVoice').onclick=()=>speak({bn:'নমস্কার। আজ রাতের আকাশ দেখতে প্রস্তুত?',hi:'नमस्ते। आज रात का आसमान देखने के लिए तैयार?',or:'ନମସ୍କାର। ଆଜି ରାତିର ଆକାଶ ଦେଖିବାକୁ ପ୍ରସ୍ତୁତ?',en:'Hello. Ready to explore tonight’s sky?'}[S.lang],true);
$('gpsBtn').onclick=()=>{if(!navigator.geolocation){say('GPS is not available on this device.');return;}navigator.geolocation.getCurrentPosition(p=>{setPlace(+p.coords.latitude.toFixed(4),+p.coords.longitude.toFixed(4),'GPS');$('latIn').value=S.lat;$('lonIn').value=S.lon;say('Location updated.',2500);},e=>say('Could not get your location: '+e.message,6000),{enableHighAccuracy:true,timeout:15000});};
$('latIn').value=S.lat;$('lonIn').value=S.lon;
const setLL=()=>{const a=+$('latIn').value,b=+$('lonIn').value;if(isFinite(a)&&isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180)setPlace(a,b,'Custom');};$('latIn').onchange=setLL;$('lonIn').onchange=setLL;
$('bbsr').onclick=()=>{setPlace(20.2961,85.8245,'Bhubaneswar');$('latIn').value=S.lat;$('lonIn').value=S.lon;};
function pad(n){return String(n).padStart(2,'0');}
function syncTimeUI(){const d=new Date(simNow());$('dtIn').value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;$('speedSel').value=String(tSpeed);$('pauseBtn').textContent=paused?L().ui.run:L().ui.pause;}
$('dtIn').onchange=e=>{const v=new Date(e.target.value);if(!isNaN(v))setSim(v.getTime());};
$('speedSel').onchange=e=>{setSpeed(+e.target.value);};
$('pauseBtn').onclick=()=>{if(paused){paused=false;realAnchor=performance.now();}else{simAnchor=simNow();paused=true;}syncTimeUI();};
$('grsIn').value=S.grs;$('grsIn').onchange=e=>{S.grs=e.target.value.trim();save();timeJumped=true;};
$('ipd').value=S.ipd;$('ipdOut').textContent=S.ipd+' mm';$('ipd').oninput=e=>{S.ipd=+e.target.value;$('ipdOut').textContent=S.ipd+' mm';save();};
// ---- download everything for offline use ----
const CORE_FILES=['index.html','app.js','i18n.js','lib/three.min.js','lib/astronomy.browser.min.js','data/skydata.js','data/comets.js','tex/milkyway.jpg','tex/moon.jpg','tex/mercury.png','tex/venus.png','tex/mars.png','tex/jupiter.png','tex/saturn.png','tex/uranus.png','tex/neptune.png','tex/io.png','tex/europa.png','tex/ganymede.png','tex/callisto.png','tex/saturn_rings_radial.png',...[...Array(18)].map((_,b)=>'data/deep/b'+String(b).padStart(2,'0')+'.bin')];
let dlRun=false;const dlBtn=$('dlBtn'),dlState=$('dlState');
async function dlCount(){if(!window.caches)return;try{const c=await caches.open('nsvr-img');const k=await c.keys();const n=new Set(k.map(r=>r.url));const have=NEB.filter(x=>n.has(NEB_BASE+x.url)).length;dlState.textContent=have+' / '+NEB.length;if(have===NEB.length)dlState.textContent=L().ui.dlDone;return have;}catch(_){}}
dlBtn.onclick=async()=>{if(!window.caches){say('Offline storage is not available here.');return;}
  if(dlRun){dlRun=false;return;}dlRun=true;dlBtn.textContent=L().ui.dlStop;try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist();}catch(_){}
  try{const core=await caches.open('nsvr-v7');await Promise.all(CORE_FILES.map(u=>core.match(u).then(m=>m||core.add(u)).catch(()=>null)));}catch(_){}
  const c=await caches.open('nsvr-img');const have=new Set((await c.keys()).map(r=>r.url));const todo=NEB.map(x=>NEB_BASE+x.url).filter(u=>!have.has(u));let done=NEB.length-todo.length,fail=0,i=0;
  async function worker(){while(dlRun&&i<todo.length){const u=todo[i++];try{const r=await fetch(u,{mode:'cors'});if(r.ok){await c.put(u,r);done++;}else fail++;}catch(_){fail++;}dlState.textContent=done+' / '+NEB.length;}}
  await Promise.all([worker(),worker(),worker(),worker()]);dlRun=false;dlBtn.textContent=L().ui.dlAll;dlState.textContent=fail?L().ui.dlFail:(done===NEB.length?L().ui.dlDone:done+' / '+NEB.length);};
$('setBtn').addEventListener('click',dlCount);
$('dsoChk').checked=S.dso;$('dsoChk').onchange=e=>{S.dso=e.target.checked;save();nebGroup.visible=S.dso;};
function geoAuto(){try{navigator.permissions&&navigator.permissions.query({name:'geolocation'}).then(r=>{if(r.state==='granted')$('gpsBtn').click();}).catch(()=>{});}catch(_){}}

// ---------------- look: drag, pinch, motion ----------------
let az=135*D2R,pitch=35*D2R,yawOff=0;const ptrs=new Map();let pinch0=0;
const FOV0=70,FOVMIN=0.005;let fovGoal=FOV0,tween=null,warp=0;
function setFov(f){tween=null;fovGoal=Math.max(FOVMIN,Math.min(95,f));}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);}});
canvas.addEventListener('pointermove',e=>{const pr=ptrs.get(e.pointerId);if(!pr)return;const k=camera.fov/70*0.005;
  if(ptrs.size===1&&frozen&&frozenEq){const w=frozenEq.clone().applyMatrix4(sky.matrix);let a2=Math.atan2(w.x,-w.z)-(e.clientX-pr.x)*k,p2=Math.max(-1.5,Math.min(1.5,Math.asin(w.y)+(e.clientY-pr.y)*k));frozenEq.set(Math.sin(a2)*Math.cos(p2),Math.sin(p2),-Math.cos(a2)*Math.cos(p2)).applyMatrix4(invSky).normalize();flyAnim=null;}
  else if(ptrs.size===1){if(motionOn&&devQ)yawOff+=(e.clientX-pr.x)*k;else{az-=(e.clientX-pr.x)*k;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-pr.y)*k));}}
  pr.x=e.clientX;pr.y=e.clientY;if(ptrs.size===2){const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0)setFov(fovGoal*pinch0/d);pinch0=d;}});
const end=e=>{ptrs.delete(e.pointerId);pinch0=0;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
canvas.addEventListener('wheel',e=>{e.preventDefault();setFov(fovGoal*Math.exp(e.deltaY*.001));},{passive:false});
let motionOn=false,devQ=null,absolute=false;
const zee=new THREE.Vector3(0,0,1),eul=new THREE.Euler(),q1=new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5)),q0=new THREE.Quaternion();
function onOrient(e){if(e.alpha==null)return;absolute=absolute||e.absolute===true||e.type==='deviceorientationabsolute';
  const o=((screen.orientation&&screen.orientation.angle)||window.orientation||0)*D2R;eul.set(e.beta*D2R,e.alpha*D2R,-e.gamma*D2R,'YXZ');
  devQ=(devQ||new THREE.Quaternion()).setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee,-o));}
const evName=('ondeviceorientationabsolute' in window)?'deviceorientationabsolute':'deviceorientation';const mBtn=$('motionBtn');
async function startMotion(){try{if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted')throw 0;}}catch(e){say('Motion access was refused.');return false;}
  motionOn=true;mBtn.setAttribute('aria-pressed','true');addEventListener(evName,onOrient);
  setTimeout(()=>{if(motionOn&&!devQ)say('No motion sensor data. Use drag instead.',6000);else if(motionOn&&!absolute)say('Point the phone north and tap "Face north + align".');},1500);return true;}
mBtn.onclick=()=>{if(motionOn){motionOn=false;removeEventListener(evName,onOrient);devQ=null;mBtn.setAttribute('aria-pressed','false');}else startMotion();};
$('alignBtn').onclick=()=>{const f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);const a=Math.atan2(f.x,-f.z);if(motionOn&&devQ)yawOff+=a;else az-=a;say('✓',1200);};

// headset view / full screen
let stereo=false,wake=null;
async function goFull(){try{const el=document.documentElement,fn=el.requestFullscreen||el.webkitRequestFullscreen;if(fn){await fn.call(el);return true;}}catch(e){}return false;}
$('fsBtn').onclick=()=>{goFull();};
async function setStereo(on){stereo=on;$('turn').hidden=true;document.body.classList.toggle('stereo',on);$('exitVR').hidden=!on;
  if(on){await goFull();try{await screen.orientation.lock('landscape');}catch(e){}try{wake=await navigator.wakeLock.request('screen');}catch(e){}if(!motionOn)startMotion();}
  else{try{document.fullscreenElement&&document.exitFullscreen();}catch(e){}try{wake&&wake.release();}catch(e){}}resize();}
$('vrBtn').onclick=()=>setStereo(true);$('exitVR').onclick=()=>setStereo(false);
let lastTap=0;canvas.addEventListener('pointerup',()=>{if(!stereo)return;const t=performance.now();if(t-lastTap<350)setStereo(false);lastTap=t;});

// ---------------- speech output (most natural available voice, sentence by sentence) ----------------
const synth=window.speechSynthesis;let voices=[],speakingUntil=0;
function bestVoice(){const code=L().code,pre=code.slice(0,2);let vs=voices.filter(v=>v.lang&&v.lang.replace('_','-').toLowerCase().startsWith(pre));
  if(S.voiceURI){const v=voices.find(v=>v.voiceURI===S.voiceURI);if(v)return v;}
  const score=v=>(/natural|neural|enhanced|premium|wavenet/i.test(v.name)?4:0)+(/google/i.test(v.name)?2:0)+(v.lang.replace('_','-')===code?2:0)+(v.localService===false?1:0);
  vs.sort((a,b)=>score(b)-score(a));return vs[0]||null;}
function fillVoices(){if(!synth)return;voices=synth.getVoices();const sel=$('voiceSel');sel.innerHTML='';const pre=L().code.slice(0,2);const b=bestVoice();
  voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith(pre)).forEach(v=>{const o=document.createElement('option');o.value=v.voiceURI;o.textContent=v.name+' ('+v.lang+')';if(b&&v.voiceURI===b.voiceURI)o.selected=true;sel.appendChild(o);});
  $('noVoice').hidden=!!sel.options.length;}
if(synth){fillVoices();synth.onvoiceschanged=fillVoices;}
let unlocked=false;addEventListener('pointerdown',()=>{if(unlocked||!synth)return;unlocked=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;synth.speak(u);}catch(_){}},{capture:true});
function speak(text,force){if((!S.narr&&!force)||!synth||!text)return;synth.cancel();const v=bestVoice();
  const parts=text.match(/[^.!?।]+[.!?।]?/g)||[text];parts.forEach((s,i)=>{const u=new SpeechSynthesisUtterance(s.trim());if(v)u.voice=v;u.lang=v?v.lang:L().code;u.rate=S.rate;u.pitch=1;
    if(i===parts.length-1)u.onend=()=>{speakingUntil=performance.now()+700;};synth.speak(u);});}
function show(text,name){if(!S.narr&&!showForce)return;cap.textContent=text;cap.hidden=false;setCapSprite(name);}
let capSprite=null;function setCapSprite(text){if(capSprite){camera.remove(capSprite);dropLabel(capSprite);capSprite=null;}if(!text)return;
  capSprite=label(text,0.09,'#ffd9cf');capSprite.material.depthTest=false;capSprite.renderOrder=10;capSprite.center.set(0.5,1.6);capSprite.position.set(0,0,-1);camera.add(capSprite);}
const ret=new THREE.Mesh(new THREE.RingGeometry(0.008,0.011,32),new THREE.MeshBasicMaterial({color:0xff6a5c,transparent:true,opacity:.7,depthTest:false}));ret.position.set(0,0,-1);ret.renderOrder=10;camera.add(ret);

// ---------------- descriptions ----------------
function spLy(n){return n<100?Math.round(n):n<1000?Math.round(n/10)*10:Math.round(n/100)*100;}
function starName(i){const f=INFO[i];const gen=CONS[f[3]]?CONS[f[3]][1]:f[3];const bay=f[1]?f[1]+' '+gen:(f[2]?f[2]+' '+gen:'');
  if(f[0])return starProper(f[0])+(bay&&S.lang==='en'?', '+bay+',':'');return bay?bay+',':T('x',{})||L().unnamed.replace('{c}',conName(f[3]));}
function starKind(sp){const Lg=L();sp=(sp||'').trim();const c=Lg.col[sp[0]];const m=sp.match(/(?:\d|\.|^[A-Z])\s*(Iab|Ia|Ib|III|II|IV|V)(?![a-z])/);let k='';if(m){k=Lg.cls[/^I(a|ab|b)$/.test(m[1])?'I':m[1]];}
  if(!c)return Lg.aStar;if(m&&m[1]==='V'&&sp[0]==='G')return Lg.sunlike;return Lg.kind(c,k);}
function starDesc(i,short){const f=INFO[i];let t=starName(i)+' '+starKind(f[4]);
  t+=f[5]>0&&f[5]<4000?T('starDist',{n:fmtNum(spLy(f[5]))}):T('starFar');if(!short&&f[6]>=2&&f[5]>0&&f[5]<4000)t+=T('lum',{n:bigWords(f[6])});return t+T('mag',{m:sMag[i].toFixed(1)});}
function dsoDesc(o){let t=o.id+(o.alt?', '+o.alt:'')+', '+(L().type[o.type]||'');if(o.dim){t+=o.dim>=60?T('acrossDeg',{n:(o.dim/60).toFixed(1)}):T('across',{n:Math.round(o.dim)});const mr=Math.round(o.dim/31*2)/2;if(mr>=1.5)t+=mr===2?T('twice'):T('moonW',{n:mr});}
  if(DSODIST[o.id])t+=T('away',{d:bigWords(DSODIST[o.id])+({en:' light years',bn:' আলোকবর্ষ',hi:' प्रकाश वर्ष',or:' ଆଲୋକବର୍ଷ'}[S.lang])});if(o.mag&&o.mag<50)t+=T('mag',{m:(+o.mag).toFixed(1)});return t;}
function fmtKm(au){const km=au*AU_KM;return T('km',{n:bigWords(km)});}
function lightTime(au){const s=au*AU_KM/C_KMS;return s<60?T('sec',{n:s.toFixed(1)}):s<3600?T('min',{n:Math.round(s/60)}):T('hr',{n:(s/3600).toFixed(1)});}
function phaseIdx(a){return a<10||a>350?0:a<80?1:a<100?2:a<170?3:a<190?4:a<260?5:a<280?6:7;}
function bodyText(p){const Lg=L();if(p.sun)return T('sun',{d:fmtKm(p.dist),l:lightTime(p.dist)});
  if(p.k==='Moon'){const ph=AE.MoonPhase(AE.MakeTime(simDate));return T('moon',{ph:Lg.phase[phaseIdx(ph)],p:Math.round(p.frac*100),d:fmtKm(p.dist),l:lightTime(p.dist)});}
  let t=T('body',{n:Lg.planet[p.k],f:Lg.fact[p.k],d:fmtKm(p.dist),l:lightTime(p.dist),m:(p.mag||0).toFixed(1)});
  if(p.k==='Venus'||p.k==='Mercury')t+=T('phase',{p:Math.round(p.frac*100)});if(p.k==='Saturn'&&p.tilt!=null)t+=T('rings',{t:Math.abs(p.tilt).toFixed(1)});
  if(p.k==='Jupiter'){const L2=grsLongitude(simNow());let dl=((L2-p.cm)%360+360)%360;if(dl>180)dl-=360;if(Math.abs(dl)<80)t+=T('grsVis');const h=(((L2-p.cm)%360+360)%360)/(870.27/24);t+=T('grsNext',{h:h.toFixed(1)});}
  if(p.k==='Mars'||p.k==='Jupiter')t+=T('cm',{c:Math.round(p.cm)});return t;}
function galText(g){let t=T('gal',{n:L().planet[g.k],f:L().fact[g.k]});if(g.ecl)t+=T('galEcl');else if(g.shadowOn)t+=T('galSh');return t;}
function cometText(c){const F=(window.COMETFACT[S.lang]||window.COMETFACT.en)[c.n]||'';return T('comet',{n:c.n,f:F,d:fmtKm(c.delta),r:c.r.toFixed(2),m:Math.round(c.m)});}
function showerText(s){const l=S.lang;return T('shower',{n:s.n[l],pk:s.pk[l],z:s.zhr[l],par:s.par[l]});}
function consDesc(k){const C=window.CURATED[S.lang]||window.CURATED.en;if(C[k])return C[k];const nm=conName(k);for(let i=0;i<INFO.length;i++)if(INFO[i][3]===k)return nm+'. '+T('brightest',{d:starDesc(i,true)});return nm+'.';}
const GM=[[-0.0548755604,-0.8734370902,-0.4838350155],[0.4941094279,-0.4448296300,0.7469822445],[-0.8676661490,-0.1980763734,0.4559837762]];

// ---------------- what is in view ----------------
const fwd=new THREE.Vector3(),ceq=new THREE.Vector3(),tv=new THREE.Vector3();
function centreEq(){camera.getWorldDirection(fwd);return ceq.copy(fwd).applyMatrix4(invSky).normalize();}
function solarInView(c,rad){const out=[];PL.forEach(p=>{if(!p.v)return;const a=Math.acos(Math.min(1,c.dot(p.v)));if(a<rad+p.ang)out.push({a,kind:'body',p});});
  GAL.forEach(g=>{if(!g.v||g.hidden)return;const a=Math.acos(Math.min(1,c.dot(g.v)));if(a<rad)out.push({a,kind:'gal',g});});
  comets.forEach(cm=>{if(!cm.ok)return;const a=Math.acos(Math.min(1,c.dot(cm.v)));if(a<rad)out.push({a,kind:'comet',cm});});
  SHOWERS.forEach(s=>{if(!s.on)return;const a=Math.acos(Math.min(1,c.dot(s.v)));if(a<Math.max(rad,4*D2R))out.push({a,kind:'shower',s});});return out.sort((x,y)=>x.a-y.a);}
const itemText=o=>o.kind==='body'?bodyText(o.p):o.kind==='gal'?galText(o.g):o.kind==='comet'?cometText(o.cm):showerText(o.s);
const itemName=o=>o.kind==='body'?(L().label[o.p.k]||L().planet[o.p.k]):o.kind==='gal'?L().planet[o.g.k]:o.kind==='comet'?o.cm.n:o.s.n[S.lang];
function fieldReport(){const c=centreEq(),rad=camera.fov/2*D2R,cr=Math.cos(rad),lim=starMat.uniforms.uLim.value;let count=0;const cc={},br=[];
  for(let i=0;i<NS;i++){const d=c.x*sV[i*3]+c.y*sV[i*3+1]+c.z*sV[i*3+2];if(d<cr)continue;if(sMag[i]<=lim)count++;if(i<INFO.length){cc[INFO[i][3]]=(cc[INFO[i][3]]||0)+1;if(br.length<3)br.push(i);}}
  for(const d of DEEP){if(d.state!==2)continue;const v=d.v,m=d.m;for(let i=0;i<d.n;i++){if(m[i]>lim)continue;if(c.x*v[i*3]+c.y*v[i*3+1]+c.z*v[i*3+2]>=cr)count++;}}
  let con=null,cm=0;for(const k in cc)if(cc[k]>cm){cm=cc[k];con=k;}
  const ds=DSO.filter(o=>Math.acos(Math.min(1,c.dot(o.v)))<rad+o.dim/120*D2R).sort((a,b)=>c.dot(b.v)-c.dot(a.v)).slice(0,2);const sol=solarInView(c,rad).slice(0,3);
  let t=T('fov',{f:camera.fov<10?camera.fov.toFixed(camera.fov<1?2:1):Math.round(camera.fov)})+(con?T('inCon',{c:conName(con)}):(S.lang==='en'?'. ':'। '));
  if(sol.length)t+=sol.map(itemText).join(' ')+' ';
  t+=count?T('count',{n:fmtNum(count),m:lim.toFixed(1)}):T('none');
  if(br.length){t+=T(sol.length?'brightestStar':'brightest',{d:starDesc(br[0])});if(br.length>1)t+=T('also',{d:br.slice(1).map(i=>starDesc(i,true)).join(T('and'))});}
  if(ds.length){t+=T('deep',{d:ds.map(dsoDesc).join(T('and'))});const n=NEB.find(n=>n.state===2&&n.c.dot(ds[0].v)>Math.cos(0.5*D2R));if(n&&n.credit)t+=T('img',{c:n.credit});}
  return{t,name:(sol.length&&itemName(sol[0]))||(br.length&&INFO[br[0]][0]&&starProper(INFO[br[0]][0]))||(con?conName(con):'')};}
const CURSTARS=['Sirius','Canopus','Arcturus','Vega','Capella','Rigel','Procyon','Betelgeuse','Altair','Aldebaran','Antares','Spica','Deneb','Regulus','Polaris'];
const targets=[];CURSTARS.forEach(n=>{if(byName[n]==null)return;const i=byName[n];targets.push({k:n,v:new THREE.Vector3(sV[i*3],sV[i*3+1],sV[i*3+2]),thr:6,w:1,text:()=>(window.CURATED[S.lang]||window.CURATED.en)[n],name:()=>starProper(n)});});
for(const k in consCen)targets.push({k,v:consCen[k],thr:12,w:(window.CURATED.en[k]?1.4:1.1),text:()=>consDesc(k),name:()=>conName(k)});
{const p=DSO.find(o=>o.id==='M45');if(p)targets.push({k:'M45',v:p.v,thr:5,w:1.3,text:()=>(window.CURATED[S.lang]||window.CURATED.en).M45,name:()=>'M45'});}
function wideTarget(){camera.getWorldDirection(fwd);if(photo.visible)return null;const gOn=S.ground;if(gOn&&fwd.y<-0.03)return null;const c=centreEq();
  const so=solarInView(c,4.5*D2R).filter(o=>(o.kind==='body'||o.kind==='shower')&&(!gOn||tv.copy(o.kind==='body'?o.p.v:o.s.v).applyMatrix4(sky.matrix).y>0));
  if(so.length){const o=so[0];return{k:'sol:'+itemName(o),text:()=>itemText(o),name:()=>itemName(o)};}
  let best=null,bs=1;for(const t of targets){tv.copy(t.v).applyMatrix4(sky.matrix).normalize();if(gOn&&tv.y<0)continue;const ang=Math.acos(Math.min(1,fwd.dot(tv)))/D2R,sc=ang/t.thr/t.w;if(ang<t.thr&&sc<bs){bs=sc;best=t;}}
  if(best)return best;const g=[0,1,2].map(i=>GM[i][0]*c.x+GM[i][1]*c.y+GM[i][2]*c.z);const b=Math.asin(g[2])/D2R,l=Math.atan2(g[1],g[0])/D2R;
  if(Math.abs(b)<9&&Math.abs(l)<20)return{k:'__MWC',text:()=>T('mwc'),name:()=>'⊙'};if(Math.abs(b)<9)return{k:'__MW',text:()=>T('mw'),name:()=>'Milky Way'};return null;}
let cand=null,candT=0,lastSaid=null,pendingReport=false,holdReport=false,repT=0;const lastRep=new THREE.Vector3();
function narrate(dt){const zoomed=fovGoal<FOV0-1,settled=Math.abs(camera.fov-fovGoal)<0.05*fovGoal;
  if(zoomed){if(!settled)return;const c=centreEq();const moved=Math.acos(Math.min(1,c.dot(lastRep)))/D2R>camera.fov*0.3;if(moved)repT+=dt;else repT=0;
    if(holdReport&&!(synth&&synth.speaking))holdReport=false;
    if(S.narr&&((pendingReport&&!holdReport)||(moved&&repT>2&&!pendingReport))){pendingReport=false;repT=0;lastRep.copy(c);const r=fieldReport();speak(r.t);show(r.t,r.name);lastSaid='__zoom';}return;}
  const t=wideTarget(),k=t?t.k:null;if(k!==cand){cand=k;candT=0;}else candT+=dt;
  if(S.narr&&cand&&candT>0.9&&cand!==lastSaid){lastSaid=cand;const text=t.text();speak(text);show(text,t.name());}
  if(!cand&&candT>1.5&&lastSaid){lastSaid=null;cap.hidden=true;setCapSprite(null);}}
function tellMore(){showForce=true;linesUntil=performance.now()+8000;
  if(fovGoal<FOV0-1){const r=fieldReport();speak(r.t,true);show(r.t,r.name);showForce=false;return;}
  const c=centreEq(),rad=camera.fov/2*D2R,cr=Math.cos(rad),gOn=S.ground;const up=v=>!gOn||tv.copy(v).applyMatrix4(sky.matrix).y>0;
  const t=wideTarget();let x=t?t.text()+' ':'';const nm=t?t.name():'';
  const sol=solarInView(c,rad).filter(o=>(o.kind==='body'||o.kind==='shower')&&up(o.kind==='body'?o.p.v:o.s.v)&&(!t||('sol:'+itemName(o))!==t.k)).map(itemName);
  const st=[];for(let i=0;i<INFO.length&&st.length<4;i++){if(!INFO[i][0]||sMag[i]>2.5)continue;tv.set(sV[i*3],sV[i*3+1],sV[i*3+2]);if(tv.dot(c)<cr||!up(tv))continue;const n=starProper(INFO[i][0]);if(t&&t.k===INFO[i][0])continue;st.push(n);}
  const cs=[];for(const k in consCen){if(consCen[k].dot(c)>Math.cos(rad*0.7)&&up(consCen[k])&&(!t||t.k!==k))cs.push(conName(k));if(cs.length>=4)break;}
  const all=[...sol,...st,...cs];if(all.length)x+=T('also',{d:all.join(', ')});
  if(!x){const r=fieldReport();x=r.t;}speak(x,true);show(x,nm||'…');showForce=false;}
let showForce=false;

// ---------------- zoom as travel ----------------
function startTween(to,dur){tween={from:camera.fov,to,t:0,dur};fovGoal=to;}
function moveTarget(){const c=centreEq(),rad=camera.fov/2*D2R,lim=starMat.uniforms.uLim.value;
  const so=solarInView(c,rad*0.6).filter(o=>o.kind==='body'||o.kind==='gal'||o.kind==='comet');
  if(so.length){const o=so[0];if(o.kind==='body')return{name:L().planet[o.p.k],km:o.p.dist*AU_KM};if(o.kind==='gal')return{name:L().planet[o.g.k],km:o.g.dist*AU_KM};return{name:o.cm.n.replace(/ \(.*\)/,''),km:o.cm.delta*AU_KM};}
  let best=null,ba=1e9;DSO.forEach(o=>{const a=Math.acos(Math.min(1,c.dot(o.v)));if(!DSODIST[o.id]||a>Math.max(rad*0.5,o.dim/120*D2R))return;if(a<ba){ba=a;best={name:o.alt||o.id,ly:DSODIST[o.id]};}});if(best)return best;
  for(let i=0;i<INFO.length;i++){if(sMag[i]>lim)break;const d=c.x*sV[i*3]+c.y*sV[i*3+1]+c.z*sV[i*3+2];if(d<Math.cos(rad*0.5))continue;if(INFO[i][5]>0)return{name:starName(i).replace(/,$/,''),ly:INFO[i][5]};}return null;}
function speedPhrase(Tg,from,to,dur){const frac=Math.abs(from-to)/FOV0;if(Tg.km){const v=Tg.km*frac/dur,c=v/C_KMS;return{c,txt:c>=1?T('xc',{n:bigWords(c)}):T('kms',{n:bigWords(v)})+(c>=0.05?', '+T('pc',{p:Math.round(c*100)}):'')};}
  const c=Tg.ly*frac*31557600/dur;return{c,txt:T('xc',{n:bigWords(c)})};}
function announceMove(to,dur){const from=fovGoal,inward=to<from,Tg=moveTarget();let txt,hud;
  if(Tg){const s=speedPhrase(Tg,from,to,dur);txt=T(inward?'move':'moveAway',{n:Tg.name,s:s.txt});hud=(inward?'→ ':'← ')+Tg.name+' · '+(s.c>=1?bigWords(s.c)+' c':Math.round(s.c*100)+'% c');}
  else{txt=T(inward?'moveNone':'backNone');hud=inward?'→':'←';}speak(txt);show(txt,hud);holdReport=!!S.narr;}
function zoomIn(){pendingReport=false;const to=Math.max(FOVMIN,fovGoal/3);if(to>=fovGoal-1e-6){say(T('closest'),2000);return;}announceMove(to,2.6);startTween(to,2.6);pendingReport=!!S.narr;}
function zoomOut(){const to=Math.min(FOV0,fovGoal*3);if(to<=fovGoal+1e-6){say(T('fullAlready'),2000);return;}announceMove(to,2.6);startTween(to,2.6);pendingReport=!!S.narr&&to<FOV0-1;}
function zoomReset(){if(fovGoal>=FOV0-1e-3)return;speak(T('home'));show(T('home'),'←');startTween(FOV0,2.2);pendingReport=false;}
$('zinBtn').onclick=zoomIn;$('zoutBtn').onclick=zoomOut;
const NW=260,wPos=new Float32Array(NW*6),wR=new Float32Array(NW),wA=new Float32Array(NW);for(let i=0;i<NW;i++){wA[i]=Math.random()*Math.PI*2;wR[i]=0.03+Math.random()*1.4;}
const wGeo=new THREE.BufferGeometry();wGeo.setAttribute('position',new THREE.BufferAttribute(wPos,3));
const wMat=new THREE.LineBasicMaterial({color:0xcfe0ff,transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
const warpLines=new THREE.LineSegments(wGeo,wMat);warpLines.frustumCulled=false;warpLines.renderOrder=9;warpLines.visible=false;camera.add(warpLines);
function updateWarp(dt){const a=Math.abs(warp);warpLines.visible=a>0.02&&!reduceMotion;if(!warpLines.visible)return;wMat.opacity=Math.min(0.6,a*0.7);const sc=Math.tan(camera.fov/2*D2R),sp=Math.sign(warp)*(0.6+2.4*a);
  for(let i=0;i<NW;i++){wR[i]*=Math.exp(sp*dt);if(wR[i]>1.6)wR[i]=0.03+Math.random()*0.15;if(wR[i]<0.03)wR[i]=1.2+Math.random()*0.4;const r=wR[i]*sc*1.2,x=Math.cos(wA[i]),y=Math.sin(wA[i]),l=1.06+0.22*a;wPos.set([x*r,y*r,-1,x*r*l,y*r*l,-1],i*6);}
  wGeo.attributes.position.needsUpdate=true;}

// ---------------- voice commands ----------------
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const vcBtn=$('voiceCmdBtn'),micState=$('micState');let rec=null,listening=false,lastCmdAt=0,lastCmd='';
const EN=I18N.en.cmd;
function heard(text,final){const alts=text.split('|').map(s=>s.toLowerCase().replace(/[.,!?।"]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);if(!alts.length)return false;
  const busy=(synth&&synth.speaking)||performance.now()<speakingUntil,C=L().cmd;
  if(!busy&&pickByVoice(alts)){micState.textContent='✓ '+alts[0];return true;}
  const order=[['unfreeze',()=>setFreeze(false),false],['freeze',()=>setFreeze(true),false],['stop',()=>{synth&&synth.cancel();linesUntil=0;cap.hidden=true;setCapSprite(null);},true],['tell',tellMore,false],['closer',zoomIn,false],['back',zoomOut,false],['home',zoomReset,false]];
  for(const [k,fn,safe] of order){if(busy&&!safe)continue;if(alts.some(a=>C[k].test(a)||EN[k].test(a))){const now=performance.now();if(k===lastCmd&&now-lastCmdAt<2500)return true;lastCmd=k;lastCmdAt=now;
      if(k!=='stop')synth&&synth.cancel();fn();micState.textContent='✓ '+alts[0];if(stereo&&k!=='tell')setCapSprite('✓');return true;}}
  if(final){const fz=fuzzyHeard(alts,busy);if(fz)return true;}
  if(final)micState.textContent=T('heard',{w:alts[0]});return false;}
function fuzzyHeard(alts,busy){
  // commands: only for short phrases (up to 4 words), so ordinary talk does not trigger them
  const fc=fuzzyBest(alts,cmdCands(),4);
  // names: only while the view is frozen (same as exact names)
  const fn=frozen&&!busy?fuzzyBest(alts,nameCands(),0):null;
  let b=fc&&(!fn||fc.sc>=fn.sc)?fc:fn;if(!b)return false;
  if(busy&&!(b.c.kind==='cmd'&&b.c.target==='stop'))return false;
  if(b.amb){const nm=x=>x.c.kind==='cmd'?x.c.raw:(x.c.target.make()||{}).name;micState.textContent='? '+nm(b)+' / '+nm(b.amb);say(T('didYouMean',{a:nm(b),b:nm(b.amb)}),4000);return true;}
  if(b.c.kind==='cmd'){const k=b.c.target;const fns={unfreeze:()=>{if(frozen)setFreeze(false);},freeze:()=>{if(!frozen)setFreeze(true);},stop:()=>{synth&&synth.cancel();linesUntil=0;cap.hidden=true;setCapSprite(null);},tell:tellMore,closer:zoomIn,back:zoomOut,home:zoomReset};
    const now=performance.now();if(k===lastCmd&&now-lastCmdAt<2500)return true;lastCmd=k;lastCmdAt=now;if(k!=='stop')synth&&synth.cancel();fns[k]();micState.textContent='≈ '+b.heard+' → '+k+' ('+Math.round(Math.min(1,b.sc)*100)+'%)';return true;}
  const it=b.c.target.make();if(!it)return false;const now=performance.now();if(it.name===lastGoto&&now-lastGotoAt<3000)return true;lastGoto=it.name;lastGotoAt=now;
  const alt=tv.copy(it.v).applyMatrix4(sky.matrix).y;if(alt<0){it.pre=riseText(it);groundTemp(true);}synth&&synth.cancel();flyToItem(it);
  micState.textContent='≈ '+b.heard+' → '+it.name+' ('+Math.round(Math.min(1,b.sc)*100)+'%)';return true;}
let restartT=null;
function startRec(){if(!SR){say('Speech recognition is not available in this browser.',7000);return;}try{if(rec){rec.onend=null;rec.abort();}}catch(_){}
  rec=new SR();rec.lang=L().code;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=5;const bp=biasPhrases();if(bp){try{rec.phrases=bp;}catch(_){noPhrases=true;}}rec.onstart=()=>micState.textContent=L().ui.listening;
  let doneIdx=-1;rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){if(i<=doneIdx)continue;const r=e.results[i];if(heard([...r].map(a=>a.transcript).join(' | '),r.isFinal))doneIdx=i;}};
  rec.onerror=e=>{const m={'not-allowed':'Microphone blocked: allow the microphone for this app, then tap Voice commands again.','service-not-allowed':'Speech service blocked on this phone.','audio-capture':'No microphone found.','network':'Voice commands need an internet connection.','language-not-supported':'This language is not supported for voice commands on this phone.'}[e.error];
    if(e.error==='phrases-not-supported'){noPhrases=true;return;}if(m){listening=false;vcBtn.setAttribute('aria-pressed','false');micState.textContent=L().ui.off;say(m,8000);}};
  rec.onend=()=>{if(!listening){micState.textContent=L().ui.off;return;}clearTimeout(restartT);restartT=setTimeout(()=>{try{listening&&startRec();}catch(_){}},300);};
  try{rec.start();if(!listening)say(L().cmdWords.join(' · '),4000);listening=true;vcBtn.setAttribute('aria-pressed','true');}catch(e){say('Voice commands could not start.');}}
vcBtn.onclick=()=>{if(listening){listening=false;try{rec.abort();}catch(e){}vcBtn.setAttribute('aria-pressed','false');micState.textContent=L().ui.off;}else startRec();};
let tiltArmed=true,tiltT=0;const rvec=new THREE.Vector3();
function headTilt(dt){if(frozen||!S.tilt||!motionOn||!devQ)return;rvec.set(1,0,0).applyQuaternion(camera.quaternion);const roll=rvec.y;if(!tiltArmed){if(Math.abs(roll)<0.2)tiltArmed=true;return;}
  if(Math.abs(roll)>0.42){tiltT+=dt;if(tiltT>0.6){tiltArmed=false;tiltT=0;roll<0?zoomIn():zoomOut();}}else tiltT=0;}

// ---------------- zoom-dependent star names ----------------
let zoomLabelAt=null;
function refreshZoomNames(){clearGroup(zoomNames);if(fovGoal>=FOV0-1)return;const c=centreEq(),cr=Math.cos(camera.fov*0.6*D2R);let n=0;
  for(let i=0;i<INFO.length&&n<14;i++){const d=c.x*sV[i*3]+c.y*sV[i*3+1]+c.z*sV[i*3+2];if(d<cr)continue;const f=INFO[i];const txt=f[0]?starProper(f[0]):(f[1]?f[1]+' '+f[3]:(f[2]?f[2]+' '+f[3]:''));if(!txt)continue;
    const sp=label(txt,2.6,'#e8d6b8');sp.center.set(-0.08,1.1);sp.position.set(sV[i*3],sV[i*3+1],sV[i*3+2]).multiplyScalar(R*.97);zoomNames.add(sp);n++;}zoomLabelAt=c.clone();}

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=stereo?(w/2)/h:w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

// ---------------- freeze the view, list what is in it, fly to a chosen object ----------------
let frozen=false,frozenEq=null,pickItems=[],flyAnim=null;const pickBox=$('pick'),pickGroup=new THREE.Group();sky.add(pickGroup);
const NUMW={en:['one','two','three','four','five','six','seven','eight','nine'],bn:['এক','দুই','তিন','চার','পাঁচ','ছয়','সাত','আট','নয়'],hi:['एक','दो','तीन','चार','पांच','छह','सात','आठ','नौ'],or:['ଏକ','ଦୁଇ','ତିନି','ଚାରି','ପାଞ୍ଚ','ଛଅ','ସାତ','ଆଠ','ନଅ']};
const DIG={bn:'০১২৩৪৫৬৭৮৯',hi:'०१२३४५६७८९',or:'୦୧୨୩୪୫୬୭୮୯'};
function viewItems(){const c=centreEq(),rad=camera.fov/2*D2R,cr=Math.cos(rad*1.05),gOn=S.ground,out=[];const up=v=>!gOn||tv.copy(v).applyMatrix4(sky.matrix).y>-0.01;
  PL.forEach(p=>{if(!p.v||!up(p.v))return;if(c.dot(p.v)<Math.cos(rad+p.ang))return;out.push({name:L().label[p.k]||L().planet[p.k],v:p.v.clone(),fov:Math.max(p.ang*2/D2R*(p.k==='Saturn'?6:4),0.006),info:()=>bodyText(p),pri:0});});
  if(camera.fov<5)GAL.forEach(g=>{if(!g.v||g.hidden||c.dot(g.v)<cr)return;out.push({name:L().planet[g.k],v:g.v.clone(),fov:0.03,info:()=>galText(g),pri:1});});
  comets.forEach(cm=>{if(cm.ok&&c.dot(cm.v)>=cr)out.push({name:cm.n.replace(/ \(.*\)/,''),v:cm.v.clone(),fov:0.5,info:()=>cometText(cm),pri:2});});
  DSO.filter(o=>c.dot(o.v)>=cr&&up(o.v)).sort((a,b)=>(+a.mag||99)-(+b.mag||99)).slice(0,4).forEach(o=>out.push({name:o.id+(o.alt?' '+o.alt:''),v:o.v.clone(),fov:Math.min(30,Math.max(o.dim/60*1.8,0.25)),info:()=>dsoDesc(o),pri:3}));
  let ns=0;for(let i=0;i<INFO.length&&ns<4;i++){if(!INFO[i][0]||sMag[i]>3.5)continue;tv.set(sV[i*3],sV[i*3+1],sV[i*3+2]);if(c.dot(tv)<cr||!up(tv))continue;const v=tv.clone(),ii=i;out.push({name:starProper(INFO[i][0]),v,fov:1,info:()=>starDesc(ii),pri:4});ns++;}
  if(camera.fov>20){let nc=0;for(const k in consCen){if(c.dot(consCen[k])<Math.cos(rad*0.8)||!up(consCen[k]))continue;out.push({name:conName(k),v:consCen[k].clone(),fov:35,info:()=>consDesc(k),pri:5});if(++nc>=3)break;}}
  return out.sort((a,b)=>a.pri-b.pri).slice(0,9);}
function showPick(){pickBox.innerHTML='';clearGroup(pickGroup);
  pickItems.forEach((it,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'  '+it.name;b.onclick=()=>flyTo(i);pickBox.appendChild(b);
    const sp=label((i+1)+' '+it.name,2.6,'#ffcf8a');sp.center.set(-0.15,-0.3);sp.position.copy(it.v).multiplyScalar(R*.95);pickGroup.add(sp);});
  pickBox.hidden=!pickItems.length;}
function setFreeze(on,quiet){frozen=on;$('freezeBtn').setAttribute('aria-pressed',on);$('freezeBtn').textContent=on?L().ui.unfreeze:L().ui.freeze;
  if(on){camera.getWorldDirection(fwd);frozenEq=fwd.clone().applyMatrix4(invSky).normalize();pickItems=viewItems();showPick();
    const list=pickItems.map((it,i)=>(i+1)+' '+it.name).join(', ');const txt=pickItems.length?T('pickList',{d:list}):T('pickNone');if(!quiet){showForce=true;show(txt,'❄');showForce=false;speak(txt,true);}}
  else{pickItems=[];showPick();flyAnim=null;groundTemp(false);camera.getWorldDirection(fwd);az=Math.atan2(fwd.x,-fwd.z);pitch=Math.asin(fwd.y);qTrack.identity();trackEq=null;
    if(motionOn&&devQ){const d=new THREE.Vector3(0,0,-1).applyQuaternion(qT.copy(qYaw.setFromAxisAngle(Y,yawOff)).multiply(devQ));yawOff+=Math.atan2(d.x,-d.z)-Math.atan2(fwd.x,-fwd.z);}
    cap.hidden=true;setCapSprite(null);}}
function flyTo(i){flyToItem(pickItems[i]);}
function flyToItem(it){if(!it)return;if(!frozen)setFreeze(true,true);const from=frozenEq.clone(),to=it.v.clone().normalize();
  const f0=camera.fov,f1=Math.max(FOVMIN,Math.min(FOV0,it.fov));flyAnim={from,to,t:0,dur:2.8,it};
  // speed announcement uses the same arithmetic as the zoom
  const Tg=moveTarget2(it);if(Tg){const s=speedPhrase(Tg,f0,f1,2.8);const txt=T(f1<f0?'move':'moveAway',{n:it.name,s:s.txt});speak(txt,true);showForce=true;show(txt,'→ '+it.name);showForce=false;}else{showForce=true;show('→ '+it.name,'→ '+it.name);showForce=false;}
  tween={from:f0,to:f1,t:0,dur:2.8};fovGoal=f1;pendingReport=false;}
function moveTarget2(it){const o=solarInView(it.v,0.2*D2R).find(o=>o.kind==='body'||o.kind==='gal'||o.kind==='comet');if(o){if(o.kind==='body')return{km:o.p.dist*AU_KM};if(o.kind==='gal')return{km:o.g.dist*AU_KM};return{km:o.cm.delta*AU_KM};}
  const d=DSO.find(x=>x.v.dot(it.v)>0.99999&&DSODIST[x.id]);if(d)return{ly:DSODIST[d.id]};for(let i=0;i<INFO.length;i++){if(INFO[i][5]>0&&sV[i*3]*it.v.x+sV[i*3+1]*it.v.y+sV[i*3+2]*it.v.z>0.9999999)return{ly:INFO[i][5]};}return null;}
function flyStep(dt){if(!flyAnim)return;flyAnim.t+=dt;const u=Math.min(1,flyAnim.t/flyAnim.dur),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
  const ang=Math.acos(Math.min(1,flyAnim.from.dot(flyAnim.to)));if(ang<1e-9)frozenEq.copy(flyAnim.to);else{const s=Math.sin(ang);frozenEq.copy(flyAnim.from).multiplyScalar(Math.sin((1-e)*ang)/s).addScaledVector(flyAnim.to,Math.sin(e*ang)/s).normalize();}
  if(u>=1){const it=flyAnim.it;flyAnim=null;const txt=(it.pre||'')+it.info();setTimeout(()=>{speak(txt,true);showForce=true;show(txt,it.name);showForce=false;linesUntil=performance.now()+8000;},300);pickItems=viewItems();showPick();}}
$('freezeBtn').onclick=()=>setFreeze(!frozen);
// ---- whole-sky name search (works while frozen) ----
let groundHidden=false;
function groundTemp(off){if(off&&S.ground){S.ground=false;groundHidden=true;}else if(!off&&groundHidden){S.ground=true;groundHidden=false;}else return;
  starMat.uniforms.uGround.value=S.ground?1:0;mwMat.uniforms.uGround.value=S.ground?1:0;$('groundBtn').setAttribute('aria-pressed',S.ground);}
const LOCD='০১২৩৪৫৬৭৮৯०१२३४५६७८९୦୧୨୩୪୫୬୭୮୯';
function nrm(x){return String(x).toLowerCase().replace(/[০-৯०-९୦-୯]/g,c=>String(LOCD.indexOf(c)%10)).replace(/[´’'`\-\/(),.:;!?।"]/g,' ').replace(/\s+/g,' ').trim();}
let NAMEIDX=null;
const ALIAS={Saturn:['satan','saturn planet'],Jupiter:['jupyter'],Moon:['the moon','chand','chanda','চাঁদ','চন্দ্র','चाँद','चांद','चंद्रमा','ଜହ୍ନ','ଚନ୍ଦ୍ର'],Sun:['surya','সূর্য','सूरज','सूर्य','�ସୂର୍ଯ୍ୟ'],
  Mars:['mangal','মঙ্গল','मंगल','ମଙ୍ଗଳ'],Venus:['shukra','শুক্র','शुक्र','ଶୁକ୍ର'],Mercury:['budh','বুধ','बुध','ବୁଧ'],Polaris:['pole star','north star','dhruva tara','dhruv tara'],Sirius:['dog star']};
function buildNameIdx(){const E=[],LS=Object.keys(I18N);
  const add=(keys,make,min)=>{const ks=new Set();keys.forEach(k=>{if(!k)return;const parts=[k,...String(k).split(/[()]/)];parts.forEach(q=>{q=nrm(q);if(q.length>=(min||3)&&!/^\d+$/.test(q))ks.add(q);});});if(ks.size)E.push({keys:[...ks],make});};
  PL.forEach(p=>add(LS.flatMap(l=>[I18N[l].planet&&I18N[l].planet[p.k],I18N[l].label&&I18N[l].label[p.k]]).concat([p.k],ALIAS[p.k]||[]),()=>p.v&&{name:L().label[p.k]||L().planet[p.k],v:p.v.clone(),fov:Math.max(p.ang*2/D2R*(p.k==='Saturn'?6:4),0.006),info:()=>bodyText(p),body:p.k}));
  GAL.forEach(g=>add(LS.map(l=>I18N[l].planet&&I18N[l].planet[g.k]).concat([g.k]),()=>g.v&&{name:L().planet[g.k],v:g.v.clone(),fov:0.03,info:()=>galText(g),body:'Jupiter'}));
  comets.forEach(cm=>{const base=cm.n.includes('(')?cm.n.replace(/.*\((.*)\).*/,'$1'):cm.n.replace(/^[^\/]*\//,'').replace(/ \d+$/,'');
    add([base,'comet '+base,cm.n.replace(/\//,' ')],()=>cm.ok&&{name:cm.n.replace(/ \(.*\)/,''),v:cm.v.clone(),fov:0.5,info:()=>cometText(cm)},3);});
  DSO.forEach(o=>{const id=nrm(o.id),ks=[o.id,id.replace(/ /g,''),o.alt];const m=/^m(\d+)$/.exec(id);if(m)ks.push('messier '+m[1]);if(o.alt==='Andromeda')ks.push('Andromeda galaxy');if(o.alt==='Pleiades')ks.push('কৃত্তিকা','कृत्तिका','କୃତ୍ତିକା','seven sisters');
    add(ks,()=>({name:o.id+(o.alt?' '+o.alt:''),v:o.v.clone(),fov:Math.min(30,Math.max(o.dim/60*1.8,0.25)),info:()=>dsoDesc(o)}),2);});
  for(let i=0;i<INFO.length;i++){const n=INFO[i][0];if(!n||n.length<4||/^\d/.test(n))continue;const ii=i;
    add([n].concat(LS.map(l=>I18N[l].star&&I18N[l].star[n]),ALIAS[n]||[]),()=>({name:starProper(n),v:new THREE.Vector3(sV[ii*3],sV[ii*3+1],sV[ii*3+2]).normalize(),fov:1,info:()=>starDesc(ii)}),4);}
  const CAL={UMa:['great bear','big dipper','saptarishi'],UMi:['little bear','little dipper'],Cru:['southern cross'],Sco:['scorpion'],Leo:['lion'],Tau:['bull'],Gem:['twins'],Cnc:['crab'],Lib:['scales'],Sgr:['archer','teapot'],Cap:['capricorn','sea goat'],Aqr:['water bearer'],Psc:['fishes'],Ari:['ram'],Cyg:['swan','northern cross'],Lyr:['lyre'],Aql:['eagle'],Ori:['hunter'],CMa:['great dog'],CMi:['little dog'],Peg:['winged horse']};
  for(const k in CONS){if(!consCen[k])continue;const en=CONS[k][0];
    add([en,en+' constellation','constellation '+en,CONS[k][2]].concat(CAL[k]||[]).concat(LS.map(l=>I18N[l].con&&I18N[l].con[k])),()=>({name:conName(k),v:consCen[k].clone(),fov:35,info:()=>consDesc(k)}),4);}
  return E;}
function findName(alts){if(!NAMEIDX)NAMEIDX=buildNameIdx();let best=null,bl=0;
  for(const raw of alts){const a=nrm(raw),pad=' '+a+' ';
    const mm=/(?:^|\s)(?:m|em|এম|एम|ଏମ|messier|মেসিয়ার|मेसियर|ମେସିୟର)\s?(\d{1,3})(?=\s|$)/.exec(a);const a2=mm?pad+' m'+mm[1]+' ':pad;
    for(const e of NAMEIDX)for(const k of e.keys){if(k.length<=bl)continue;const lat=/^[a-z0-9 ]+$/.test(k);if(lat?a2.includes(' '+k+' '):a.includes(k)){best=e;bl=k.length;}}}
  return best;}
function riseText(it){const t=AE.MakeTime(simDate);let body=it.body;
  if(!body){const v=it.v;let ra=Math.atan2(v.y,v.x)/D2R;if(ra<0)ra+=360;AE.DefineStar('Star1',ra/15,Math.asin(Math.max(-1,Math.min(1,v.z)))/D2R,1000);body='Star1';}
  let r=null;try{r=AE.SearchRiseSet(body,OBS,+1,t,2);}catch(_){}
  if(!r)return T('belowNever',{n:it.name})+' ';
  const w=r.date.toLocaleString(L().code,{weekday:'long',hour:'numeric',minute:'2-digit'});return T('below',{n:it.name,w})+' ';}
let lastGoto='',lastGotoAt=0;
function pickByVoice(alts){if(!frozen)return false;
  const e=findName(alts);if(e){const it=e.make();if(it){const now=performance.now();if(it.name===lastGoto&&now-lastGotoAt<3000)return true;lastGoto=it.name;lastGotoAt=now;
      const alt=tv.copy(it.v).applyMatrix4(sky.matrix).y;if(alt<0){it.pre=riseText(it);groundTemp(true);}synth&&synth.cancel();flyToItem(it);return true;}}
  if(!pickItems.length)return false;const nw=NUMW[S.lang]||[],ne=NUMW.en,dg=DIG[S.lang]||'';
  for(const a of alts){for(let i=0;i<pickItems.length;i++){const n=String(i+1);if(new RegExp('(^|\\s)('+n+'|'+ne[i]+(nw[i]?'|'+nw[i]:'')+(dg?'|'+dg[i+1]:'')+')(\\s|$)').test(a)){flyTo(i);return true;}}}
  return false;}

// ---------------- fuzzy voice matching: exact words first, then close variations ----------------
// Devanagari (Hindi), Bengali and Odia share one Unicode layout, so one table turns all three into rough Latin sounds.
const INDV={0x05:'a',0x06:'a',0x07:'i',0x08:'i',0x09:'u',0x0A:'u',0x0B:'ri',0x0F:'e',0x10:'ai',0x13:'o',0x14:'au'};
const INDM={0x3E:'a',0x3F:'i',0x40:'i',0x41:'u',0x42:'u',0x43:'ri',0x47:'e',0x48:'ai',0x4B:'o',0x4C:'au'};
const INDC={0x15:'k',0x16:'kh',0x17:'g',0x18:'gh',0x19:'ng',0x1A:'ch',0x1B:'chh',0x1C:'j',0x1D:'jh',0x1E:'ny',0x1F:'t',0x20:'th',0x21:'d',0x22:'dh',0x23:'n',0x24:'t',0x25:'th',0x26:'d',0x27:'dh',0x28:'n',
 0x2A:'p',0x2B:'ph',0x2C:'b',0x2D:'bh',0x2E:'m',0x2F:'y',0x30:'r',0x32:'l',0x33:'l',0x35:'v',0x36:'sh',0x37:'sh',0x38:'s',0x39:'h',0x4E:'t',0x58:'k',0x59:'kh',0x5A:'g',0x5B:'z',0x5C:'r',0x5D:'rh',0x5E:'f',0x5F:'y',0x71:'w'};
const NUKTA={d:'r',dh:'rh',j:'z',ph:'f',k:'k',kh:'kh',g:'g',y:'y'};
function translit(s){let o='',pend=false,last='';
  for(const ch of s){const c=ch.codePointAt(0);const base=c>=0x900&&c<0x980?0x900:c>=0x980&&c<0xA00?0x980:c>=0xB00&&c<0xB80?0xB00:0;
    if(!base){if(pend){o+='a';pend=false;}o+=ch;last='';continue;}const f=c-base;
    if(INDC[f]){if(pend)o+='a';o+=INDC[f];last=INDC[f];pend=true;continue;}
    if(INDM[f]){o+=INDM[f];pend=false;continue;}
    if(f===0x4D){pend=false;continue;}                       // virama: no vowel
    if(f===0x3C){if(NUKTA[last]){o=o.slice(0,o.length-last.length)+NUKTA[last];last=NUKTA[last];}continue;} // nukta
    if(pend){o+='a';pend=false;}
    if(INDV[f])o+=INDV[f];else if(f>=1&&f<=2)o+='n';else if(f===3)o+='h';else if(f>=0x66&&f<=0x6F)o+=String(f-0x66);}
  return o;}   // a final inherent "a" is dropped, as in speech (শনি → shani, ধ্রুব → dhruv)
// sound key: similar sounds merged, vowels reduced to a / i / u, doubled letters collapsed
function pkey(w){w=translit(String(w).normalize('NFC').toLowerCase()).replace(/[^a-z0-9]/g,'');
  w=w.replace(/ph/g,'f').replace(/ck/g,'k').replace(/q/g,'k').replace(/x/g,'ks').replace(/g(?=[eiy])/g,'j').replace(/c(?=[eiy])/g,'s').replace(/sch/g,'sk').replace(/ch/g,'C').replace(/c/g,'k').replace(/sh/g,'s')
   .replace(/([bCdfgjklmnprstvz])h/g,'$1').replace(/z/g,'j').replace(/w/g,'v').replace(/v/g,'b').replace(/[eiy]/g,'i').replace(/[ou]/g,'u').replace(/(.)\1+/g,'$1');
  return w;}
const skel=k=>k.length?k[0]+k.slice(1).replace(/[aiu]/g,''):'';
function dl(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=[];for(let i=0;i<=m;i++){d[i]=[i];}for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;let v=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,d[i-2][j-2]+1);d[i][j]=v;}return d[m][n];}
// how close a heard piece is to a known word (0..1); short words must match exactly
function closeness(hk,hs,ck,cs,strict){if(hk===ck)return 1;const L=Math.max(hk.length,ck.length);if(L<=4||Math.abs(hk.length-ck.length)>3)return 0;
  const sim=1-dl(hk,ck)/L;let s=sim>=(strict?0.85:L<=5?0.75:0.74)?sim:0;
  if(!strict&&cs.length>=3&&sim>=0.5){const ss=hs===cs?1:1-dl(hs,cs)/Math.max(hs.length,cs.length);if(ss>=0.8)s=Math.max(s,0.72+0.2*ss*sim);}
  return s;}
function mkCand(phrase,target,kind){const ws=nrm(phrase).split(' ').filter(Boolean);const k=ws.map(pkey).join('');return {raw:nrm(phrase),n:ws.length,k,s:skel(k),target,kind};}
// command phrases in all four languages (plus a few spoken variants)
const CMDP={closer:['closer','closure','go closer','come closer','nearer','forward','zoom in','magnify'],back:['back','go back','backward','farther','further','zoom out'],home:['home','reset','full sky','whole sky'],
  tell:['explain','describe','description','tell me','details','information','what is this'],stop:['stop','quiet','silence','enough','থামাও','থামো তো','रुकिये','रुक जाओ'],freeze:['freeze','freeze view','lock view'],unfreeze:['unfreeze','release','unlock','resume']};
let CMDC=null,NAMEC=null;
function cmdCands(){if(CMDC)return CMDC;CMDC=[];for(const k in CMDP)CMDP[k].forEach(p=>CMDC.push(mkCand(p,k,'cmd')));
  ['bn','hi','or'].forEach(l=>{const C=I18N[l].cmd;for(const k in C)String(C[k].source).replace(/\\b[^|)]*/g,'').replace(/[()]/g,'').split('|').map(x=>x.trim()).filter(x=>x&&!/[a-z]/.test(x)).forEach(p=>CMDC.push(mkCand(p,k,'cmd')));});
  return CMDC;}
function nameCands(){if(NAMEC)return NAMEC;if(!NAMEIDX)NAMEIDX=buildNameIdx();NAMEC=[];NAMEIDX.forEach(e=>e.keys.forEach(k=>{if(!/^(m|ngc|ic) ?\d/.test(k))NAMEC.push(mkCand(k,e,'name'));}));return NAMEC;}
// best match over all recogniser alternatives and all word windows
function fuzzyBest(alts,cands,maxWords){let best=null,second=null;
  alts.forEach((a,ai)=>{const ws=nrm(a).split(' ').filter(Boolean);if(!ws.length||(maxWords&&ws.length>maxWords))return;const wk=ws.map(pkey),wsk=wk.map(skel);const rank=1-ai*0.03;
    for(const c of cands){for(let len=Math.max(1,c.n-1);len<=c.n+1;len++)for(let i=0;i+len<=ws.length;i++){const hk=wk.slice(i,i+len).join('');const hs=skel(hk);
      let sc=closeness(hk,hs,c.k,c.s,c.kind==='cmd');if(!sc)continue;if(ws.slice(i,i+len).join(' ')===c.raw)sc+=0.02;sc*=rank;
      if(!best||sc>best.sc){if(best&&best.c.target!==c.target)second=best;best={sc,c,heard:ws.slice(i,i+len).join(' ')};}else if(best.c.target!==c.target&&(!second||sc>second.sc))second={sc,c};}}});
  if(!best)return null;best.amb=second&&second.sc>best.sc-0.04&&best.sc<0.97?second:null;return best;}
let noPhrases=false;
function biasPhrases(){if(noPhrases||!window.SpeechRecognitionPhrase)return null;const set=new Set();const l=L();
  Object.values(CMDP).flat().forEach(p=>set.add(p));(l.cmdWords||[]).forEach(p=>set.add(p));
  PL.concat(GAL).forEach(p=>{set.add(p.k);if(l.planet&&l.planet[p.k])set.add(l.planet[p.k]);});
  for(const k in consCen){set.add(CONS[k][0]);if(l.con&&l.con[k])set.add(l.con[k]);}
  if(l.star)Object.values(l.star).forEach(n=>set.add(n.split(' (')[0]));
  try{return [...set].slice(0,300).map(p=>new SpeechRecognitionPhrase(p,3));}catch(_){noPhrases=true;return null;}}

setTimeout(()=>{try{cmdCands();nameCands();}catch(_){}},4000);   // build the word lists in advance
function gotoName(name){if(!name)return false;const e=findName([name]);const it=e&&e.make();if(!it)return false;if(!frozen)setFreeze(true,true);
 const alt=tv.copy(it.v).applyMatrix4(sky.matrix).y;if(alt<0){it.pre=riseText(it);groundTemp(true);}synth&&synth.cancel();flyToItem(it);return true;}

// ---------------- main loop ----------------
starMat.uniforms.uTw.value=reduceMotion?0:1;
const qYaw=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),clock=new THREE.Clock(),qT=new THREE.Quaternion();
const NIGHT=new THREE.Color(0x020308),TWI=new THREE.Color(0x1b2a4a),DAY=new THREE.Color(0x5d8fd0),bg=new THREE.Color();
const qTrack=new THREE.Quaternion(),qD=new THREE.Quaternion(),tA=new THREE.Vector3(),trackW=new THREE.Vector3(0,0,-1);let trackEq=null;
let lastOrient=0,lastSolar=-1e9,lastRead=0,lastNeb=0;
function frame(){const dt=Math.min(clock.getDelta(),0.1),now=performance.now();starMat.uniforms.uT.value=clock.elapsedTime;
  const fast=tSpeed>1&&!paused;
  if(timeJumped||now-lastOrient>(fast?40:250)){orientSky();lastOrient=now;}
  if(timeJumped||now-lastSolar>(fast?80:2000)){updateSolar();lastSolar=now;timeJumped=false;}
  if(tween){tween.t+=dt;const u=Math.min(1,tween.t/tween.dur),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;camera.fov=tween.from*Math.pow(tween.to/tween.from,e);camera.updateProjectionMatrix();warp=(tween.to<tween.from?1:-1)*Math.sin(Math.PI*u);if(u>=1){tween=null;warp=0;}}
  else if(Math.abs(camera.fov-fovGoal)>1e-4){camera.fov+=(fovGoal-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();}
  const f=camera.fov;const tk=S.night?0:twK,dk=S.night?0:dayK;const lim0=f>=10?6+2*Math.max(0,Math.min(1,(FOV0-f)/(FOV0-10))):Math.min(13.5,8+2.86*Math.log10(10/f));starMat.uniforms.uLim.value=lim0-(tk*tk)*3.5-dk*5;mwMat.uniforms.uK.value=Math.max(0.35,Math.min(1,f/40))*(1-tk);
  bg.copy(NIGHT).lerp(TWI,tk*(1-dk)).lerp(DAY,dk);renderer.setClearColor(bg);
  const k=Math.tan(f/2*D2R)/Math.tan(35*D2R);ret.scale.setScalar(k);for(const s of labels){if(s===capSprite)continue;s.scale.set(s.userData.base[0]*k,s.userData.base[1]*k,1);}
  const zoomed=fovGoal<FOV0-1;const LN=showLines();if(!LN&&linesUntil&&performance.now()>linesUntil&&!(synth&&synth.speaking))linesUntil=0;lineGroup.visible=LN;consNames.visible=S.names&&f>30;starNames.visible=S.names;zoomNames.visible=S.names&&zoomed;dsoGroup.visible=f<45;dsoGroup.children.forEach(o=>{if(o.userData.ring)o.visible=LN;});
  dsoGroup.children.forEach(o=>{if(o.isSprite)o.visible=S.names;});groundGroup.visible=S.ground&&!photo.visible;pathGroup.visible=LN&&f>2;
  const pxPerRad=innerHeight/(f*D2R);PL.forEach((p,i)=>{if(i<7&&p.v)gMag[i]=(2*p.ang*pxPerRad>5)?99:p.mag;});gGeo.attributes.mag.needsUpdate=true;
  for(const key in solarLbl){const s=solarLbl[key];s.visible=S.names&&(s.userData.gal?f<3:s.userData.comet?f<40:true);}
  comets.forEach(c=>{c.spr.visible=c.ok&&f<40;});
  if(frozen&&frozenEq){flyStep(dt);tA.copy(frozenEq).applyMatrix4(sky.matrix);camera.up.set(0,1,0);camera.lookAt(tA);}
  else{
  if(zoomed&&f<20&&trackEq){tA.copy(trackEq).applyMatrix4(sky.matrix).normalize();qD.setFromUnitVectors(trackW,tA);qTrack.premultiply(qD);}else qTrack.identity();
  if(motionOn&&devQ){qYaw.setFromAxisAngle(Y,yawOff);qT.copy(qYaw).multiply(devQ).premultiply(qTrack);camera.quaternion.slerp(qT,f<30?Math.min(1,0.06+f/60):1);}
  else camera.quaternion.setFromEuler(new THREE.Euler(pitch,-az,0,'YXZ')).premultiply(qTrack);
  camera.getWorldDirection(trackW);trackEq=trackW.clone().applyMatrix4(invSky).normalize();}
  if(zoomed&&Math.abs(f-fovGoal)<0.05*fovGoal){const c=centreEq();if(!zoomLabelAt||Math.acos(Math.min(1,c.dot(zoomLabelAt)))/D2R>f*0.25)refreshZoomNames();}else if(!zoomed&&zoomNames.children.length){refreshZoomNames();zoomLabelAt=null;}
  if(now-lastNeb>500){const ce=centreEq();nebUpdate(ce,f);deepUpdate(ce,f);lastNeb=now;}
  updateWarp(dt);headTilt(dt);narrate(dt);if(capSprite)capSprite.visible=stereo;
  if(now-lastRead>500){updateReadout();lastRead=now;}
  const w=innerWidth,h=innerHeight;
  if(stereo){const hw=w/2,sep=S.ipd*(160/25.4),sh=Math.max(-0.9,Math.min(0.9,(hw-sep)/hw));const base=camera.projectionMatrix.elements[8];$('turn').hidden=w>h;
    renderer.setScissorTest(true);camera.projectionMatrix.elements[8]=base-sh;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();renderer.setScissor(0,0,hw,h);renderer.setViewport(0,0,hw,h);renderer.render(scene,camera);
    camera.projectionMatrix.elements[8]=base+sh;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();renderer.setScissor(hw,0,hw,h);renderer.setViewport(hw,0,hw,h);renderer.render(scene,camera);
    camera.projectionMatrix.elements[8]=base;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();renderer.setScissorTest(false);}
  else{renderer.setViewport(0,0,w,h);renderer.render(scene,camera);}}
renderer.setAnimationLoop(frame);
// start
orientSky();updateTitle();applyLang();geoAuto();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__sky={pkey:w=>pkey(w),fuzzy:a=>{const f=fuzzyBest([a],cmdCands(),4),n=fuzzyBest([a],nameCands(),0);const d=x=>x&&{t:x.c.kind==='cmd'?x.c.target:(x.c.target.make()||{}).name,sc:+x.sc.toFixed(2),heard:x.heard,amb:x.amb&&(x.amb.c.kind==='cmd'?x.amb.c.target:(x.amb.c.target.make()||{}).name)};return {cmd:d(f),name:d(n)};},findName:a=>{const e=findName([a]);const it=e&&e.make();return it&&it.name;},isFrozen:()=>frozen,groundOn:()=>S.ground,pause:()=>{simAnchor=simNow();paused=true;},zoomIn,zoomOut,zoomReset,fieldReport,heard:(t)=>heard(t,true),PL,GAL,setSim,
  aimEq:(raDeg,dec)=>{qTrack.identity();trackEq=null;const w=eqv(raDeg,dec,1).applyMatrix4(sky.matrix).normalize();az=Math.atan2(w.x,-w.z);pitch=Math.asin(w.y);},
  aimBody:k=>{qTrack.identity();trackEq=null;const p=[...PL,...GAL].find(x=>x.k===k);if(!p||!p.v)return;const w=p.v.clone().applyMatrix4(sky.matrix).normalize();az=Math.atan2(w.x,-w.z);pitch=Math.asin(w.y);},
  setFovNow:f=>{fovGoal=f;camera.fov=f;camera.updateProjectionMatrix();},setLang:l=>{S.lang=l;applyLang();},altOf:v=>{const w=v.clone().applyMatrix4(sky.matrix);return Math.asin(w.y)/D2R;}};
})();
