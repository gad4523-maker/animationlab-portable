import * as T from '/pipeline/vendor/three/three.module.min.js';
import { createCinemaComposer } from '/pipeline/core/postprocess.js';
import { loadCelHumanoid } from '/pipeline/core/cel_humanoid.js';
import { buildStage, makeDrone, rng } from './stage.js';

const V = (...a) => new T.Vector3(...a);
const clamp = (value) => T.MathUtils.clamp(value,0,1);
const smooth = (a,b,x) => T.MathUtils.smoothstep(x,a,b);
const lerp = T.MathUtils.lerp;
const blend = (a,b,k) => a.map((x,i) => lerp(x,b[i],k));
const RAD = Math.PI / 180;
const INK = 0x102c39;

const poses = [
  // frame, pelvis xyz, yaw, spine X/Y/Z, chest X/Y/Z, head X/Y/Z, left hand, right hand,
  // left foot, right foot, left and right finger curl
  [0,   [.00,-.035,.00], -8,[2,0,-5],[0,0,0],[-9,18,-3],[-.30,1.02,-.09],[.33,1.05,-.21],[-.22,.137,-.09],[.23,.137,.21],[.32,.40]],
  [36,  [-.02,-.055,.02],-5,[6,-8,-4],[0,-8,0],[-2,18,0],[-.33,1.00,-.13],[.23,1.17,-.24],[-.22,.137,-.09],[.23,.137,.21],[.38,.45]],
  [72,  [-.02,-.045,.02], 4,[4,-8,-3],[0,-8,4],[4,11,3],[-.27,.98,-.09],[.22,1.36,-.29],[-.22,.137,-.09],[.23,.137,.21],[.45,.72]],
  [114, [-.08,-.09,.05], 11,[8,-6,-10],[3,-12,3],[-8,8,2],[-.37,.91,.02],[.27,1.28,-.26],[-.22,.137,-.09],[.23,.137,.21],[.54,.87]],
  [132, [-.10,-.13,.07], 17,[12,5,-12],[3,14,2],[-10,-14,1],[-.39,.90,.11],[.27,1.27,.01],[-.22,.137,-.09],[.23,.137,.21],[.66,.86]],
  [150, [.09,-.185,.04], -14,[10,16,15],[7,12,0],[-12,-14,-5],[-.26,.87,.25],[.45,.97,.07],[-.25,.144,-.28],[.23,.137,.21],[.76,.94]],
  [160, [.12,-.195,-.12], -26,[18,23,12],[8,8,-3],[-16,-15,0],[-.24,.80,.12],[.42,.81,-.21],[-.29,.137,-.51],[.26,.137,.23],[.81,.91]],
  [167, [-.04,-.155,-.33], 5,[15,-14,-19],[7,-27,-6],[-16,18,6],[-.36,.86,-.02],[.17,1.06,-.83],[-.29,.137,-.51],[.26,.137,.23],[.75,.21]],
  [174, [-.07,-.145,-.36], 10,[14,-20,-22],[7,-28,-4],[-14,20,7],[-.40,.84,-.04],[.18,1.05,-.85],[-.29,.137,-.51],[.26,.137,.23],[.75,.10]],
  [188, [.04,-.21,-.25], -6,[15,0,-11],[7,-16,-5],[-3,17,9],[-.36,.80,-.06],[.34,1.03,-.63],[-.29,.137,-.51],[.26,.137,.23],[.56,.46]],
  [218, [-.02,-.11,-.21], 9,[5,-15,-7],[2,-5,-2],[-6,11,1],[-.30,.91,-.12],[.32,1.14,-.48],[-.29,.137,-.51],[.26,.137,.23],[.42,.56]],
  [250, [-.02,-.068,-.16],7,[4,-4,-6],[2,-4,0],[-6,24,-4],[-.29,.97,-.19],[.33,1.01,-.43],[-.29,.137,-.51],[.26,.137,.23],[.34,.47]],
  [299, [.01,-.053,-.16], 1,[2,0,-4],[0,-4,0],[-1,16,-3],[-.27,.99,-.20],[.31,1.00,-.44],[-.29,.137,-.51],[.26,.137,.23],[.32,.40]],
];

function motion(frame) {
  const f = Math.min(frame >= 174 && frame <= 178 ? 174 : frame,299);
  const j = Math.max(1, poses.findIndex((p) => p[0] >= f));
  const a = poses[j-1], b = poses[j];
  // Preserve the fastest span on ones. The hold and lead-in pose on twos.
  const sample = f >= 151 && f <= 190 ? f : Math.floor(f/2)*2;
  const x = clamp((sample-a[0])/(b[0]-a[0]));
  const k = x*x*(3-2*x);
  const result = a.map((p,i) => Array.isArray(p) ? blend(p,b[i],k) : lerp(p,b[i],k));
  const [,pelvis,yaw,spine,chest,head,left,right,fl,fr,grip] = result;
  const breathe = Math.sin(frame*.095)*.004*(1-smooth(125,152,frame)+smooth(218,270,frame));
  pelvis[1] += breathe;
  fl[1] += .077*Math.sin(Math.PI*smooth(135,160,frame));
  const strike = smooth(153,172,frame)*(1-smooth(174,207,frame));
  const wind = Math.sin(frame*.105)*.018+strike*.08;
  const blink = Math.max(0, 1-Math.abs(frame-99)/3, 1-Math.abs(frame-239)/4)*.94;
  return {
    position: V(0,0,0), yaw:yaw*RAD, pelvis,
    turns:{ spine:spine.map(p=>p*RAD), chest:chest.map(p=>p*RAD), head:head.map(p=>p*RAD) },
    limbs:{
      handL:{target:V(...left),pole:V(-.66,1,.22),twist:-.16},
      handR:{target:V(...right),pole:V(.62,1.0,.20),twist:lerp(-.03,.37,strike)},
      footL:{target:V(...fl),pole:V(-.34,.40,-.76),twist:.22},
      footR:{target:V(...fr),pole:V(.43,.42,-.54),twist:-.40},
    },
    grip:{left:grip[0],right:grip[1]},
    hair:[wind,Math.sin(frame*.145)*.028+strike*.13,-wind*.6],
    face:{blink,angry:smooth(69,115,frame)*(1-smooth(211,248,frame))*.82,a:strike*.18},
  };
}

function sparks(scene, count, seed, color, radius) {
  const random = rng(seed);
  const data = Array.from({length:count}, () => [random(),random(),random(),random(),random(),random()]);
  const geom = new T.BufferGeometry();
  const points = new Float32Array(count*3), sizes = new Float32Array(count), alpha = new Float32Array(count);
  geom.setAttribute('position', new T.BufferAttribute(points,3).setUsage(T.DynamicDrawUsage));
  geom.setAttribute('radius', new T.BufferAttribute(sizes,1).setUsage(T.DynamicDrawUsage));
  geom.setAttribute('opacity', new T.BufferAttribute(alpha,1).setUsage(T.DynamicDrawUsage));
  const obj = new T.Points(geom,new T.ShaderMaterial({
    uniforms:{color:{value:new T.Color(color).multiplyScalar(2.1)},r:{value:radius}},
    transparent:true, blending:T.AdditiveBlending, depthWrite:false,
    vertexShader:'attribute float radius;attribute float opacity;uniform float r;varying float a;void main(){vec4 vp=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(radius*r/max(.1,-vp.z),1.,30.);a=opacity;gl_Position=projectionMatrix*vp;}',
    fragmentShader:'varying float a;uniform vec3 color;void main(){vec2 p=(gl_PointCoord-.5)*2.;float g=dot(p,p);if(g>1.)discard;gl_FragColor=vec4(color,a*(1.-g)*(1.-g));}'
  }));
  obj.frustumCulled=false;
  scene.add(obj);
  return (sample) => {
    data.forEach((entry,i) => {
      const [x,y,z,r,a]=sample(...entry,i);
      points.set([x,y,z],i*3);
      sizes[i]=r;
      alpha[i]=a;
    });
    for (const attr of Object.values(geom.attributes)) attr.needsUpdate=true;
  };
}

function ribbon(scene, tint) {
  const geo = new T.BufferGeometry();
  const attr = new T.BufferAttribute(new Float32Array(30*18),3).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const mat = new T.MeshBasicMaterial({
    color:new T.Color(tint).multiplyScalar(2.6), side:T.DoubleSide, transparent:true,
    depthWrite:false, blending:T.AdditiveBlending,
  });
  const arc = new T.Mesh(geo,mat);
  arc.frustumCulled=false;
  scene.add(arc);
  return (fn, opacity) => {
    arc.visible=opacity>.004;
    if (!arc.visible) return;
    mat.opacity=opacity;
    let j=0;
    for(let i=0;i<30;i++) {
      const a=fn(i/30), b=fn((i+1)/30);
      for(const p of [a[0],a[1],b[0],a[1],b[1],b[0]]) {
        attr.array.set(p.toArray(),j); j+=3;
      }
    }
    attr.needsUpdate=true;
  };
}

function roundShadow(scene) {
  const m = new T.ShaderMaterial({
    transparent:true, depthWrite:false,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;void main(){vec2 p=(st-.5)*2.;float a=max(0.,1.-dot(p,p));gl_FragColor=vec4(.002,.006,.012,a*a*.8);}'
  });
  const o=new T.Mesh(new T.PlaneGeometry(1,1.35),m);
  o.rotation.x=-Math.PI/2;
  o.position.y=.009;
  scene.add(o);
  return o;
}

function cameraAt(camera, cut, f) {
  const moves = [
    [[.95,1.47,-3.55],[1.13,1.27,-3.78],[.08,1.46,-.76],[.08,1.28,-.50],43,41,0,70],
    [[.35,1.53,-1.16],[.23,1.47,-.94],[.00,1.49,-.01],[.01,1.46,-.02],40,38,70,132],
    [[1.36,1.00,-3.51],[1.64,.79,-3.35],[.10,1.16,-.49],[.15,1.07,-.62],45,49,132,222],
    [[-.64,1.34,-2.73],[-.52,1.16,-2.80],[.01,1.12,-.35],[.02,1.13,-.40],46,42,222,300],
  ];
  const [a,b,c,d,from,to,st,end]=moves[cut];
  const k=smooth(st,end,f);
  camera.position.set(...blend(a,b,k));
  const kick=f>=174 ? Math.exp(-(f-174)*.16) : 0;
  camera.position.x+=kick*.056*Math.cos((f-174)*1.7);
  camera.position.y+=kick*.034*Math.sin((f-174)*1.1);
  camera.lookAt(V(...blend(c,d,k)));
  camera.rotateZ((cut===2?-.035:.008)+kick*.026);
  camera.fov=lerp(from,to,k);
  camera.updateProjectionMatrix();
}

function finish(ctx, width, height, frame) {
  ctx.clearRect(0,0,width,height);
  if (frame === 174) {
    ctx.globalCompositeOperation='screen';
    ctx.fillStyle='rgba(102,188,197,0.24)';
    ctx.fillRect(0,0,width,height);
    ctx.globalCompositeOperation='source-over';
  }
  if (frame>=166 && frame<=173) {
    const rand=rng(848);
    const a=1-Math.abs(frame-170)/6;
    ctx.strokeStyle='rgba(190,247,237,'+(.35*a)+')';
    for(let i=0;i<58;i++){
      const ang=rand()*Math.PI*2, d=.48+rand()*.5;
      const x=width*.51+Math.cos(ang)*height*d;
      const y=height*.49+Math.sin(ang)*height*d;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.lineTo(x-Math.cos(ang)*(25+rand()*160)*height/1920,y-Math.sin(ang)*120*height/1920);
      ctx.lineWidth=height/1920*(1+rand()*4); ctx.stroke();
    }
  }
}

export async function initShot({ profile,glCanvas,hudCanvas,width,height,params}) {
  const renderer=new T.WebGLRenderer({canvas:glCanvas,antialias:true,powerPreference:'high-performance'});
  renderer.setSize(width,height,false);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  const scene=new T.Scene();
  scene.background=new T.Color(INK);
  scene.fog=new T.FogExp2(0x183c49,.079);
  const camera=new T.PerspectiveCamera(44,width/height,.05,64);
  const post=createCinemaComposer(renderer,width,height, { effects: profile?.effects ?? 2,near:camera.near,far:camera.far});
  const {flashPool}=buildStage(scene);
  const drone=makeDrone(scene);
  const actor=await loadCelHumanoid(new URL('./assets/Darkness_Shibu.vrm',import.meta.url),{
    ink:0,
    palette(name,c) {
      if (/HAIR/.test(name)) return c.multiply(new T.Color(0xc19ba8)).multiplyScalar(.96);
      if (/Tops/.test(name)) return c.multiply(new T.Color(0xb5d8ca)).multiplyScalar(.95);
      if (/SKIN/.test(name)) return c.multiply(new T.Color(0xffe5d4)).multiplyScalar(.86);
      return c;
    },
  });
  scene.add(actor.root);
  actor.root.traverse((object) => { if (object.isSkinnedMesh && !object.material.transparent) object.castShadow=true; });
  scene.add(new T.HemisphereLight(0xb5d3d2,0x564d6d,.85));
  const key=new T.DirectionalLight(0xffeadc,1.45);
  key.position.set(.15,3.8,-2.5); scene.add(key);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-2,right:2,top:2,bottom:-2,near:.5,far:9});
  key.shadow.mapSize.set(1024,1024);
  key.shadow.bias=-.00015; key.shadow.normalBias=.019;
  const rim=new T.DirectionalLight(0x83cbdc,.91);
  rim.position.set(-3,2,2); scene.add(rim);
  const alert=new T.PointLight(0xff7a36,9,5.6,2);
  scene.add(alert);
  const charge=new T.PointLight(0x75fff0,0,3.1,2);
  scene.add(charge);
  const footShadows=[roundShadow(scene),roundShadow(scene)];
  footShadows.forEach((shadow)=>shadow.scale.set(.36,.27,1));
  const density = profile?.particles ?? 1;
  const dust=sparks(scene,Math.ceil(450*density),1770,0x93c7c4,4*height/1920);
  const hot=sparks(scene,Math.ceil(115*density),866,0xffa850,12*height/1920);
  const ion=sparks(scene,Math.ceil(125*density),380,0x56fff3,11*height/1920);
  const comet=ribbon(scene,0x76ffff);
  const streak=ribbon(scene,0xd3fff4);
  const pulse=ribbon(scene,0x72f3f3);
  const hud=hudCanvas.getContext('2d');

  return {renderFrame(_index,t) {
    const f=Math.round(params.offset+t*30);
    const time=f/30;
    actor.pose(motion(f));
    cameraAt(camera,params.cut,f);
    const hand=actor.bones.rightHand.getWorldPosition(V());
    hand.add(V(-.005,.013,-.038));
    const build=smooth(106,160,f)*(1-smooth(175,182,f));
    const energy=build*(.82+.18*Math.sin(f*.63));
    const fall=smooth(174,214,f);
    const hit=Math.max(0,(f-174)/30);
    const flash=f>=174?Math.exp(-hit*7.2):0;
    const origin=V(.37,1.44,-1.48);
    const hoverY=.06*Math.sin(time*3)*(1-fall)+.42*(1-smooth(111,150,f));
    drone.root.position.set(origin.x-.33*fall,origin.y+hoverY-1.23*fall,origin.z+.33*fall);
    drone.root.lookAt(V(.00,1.18,-.27));
    drone.root.rotateZ(Math.sin(time*4)*.10*(1-fall)+fall*1.94);
    drone.root.rotateX(fall*.88);
    drone.root.scale.setScalar(lerp(.73,.66,fall));
    drone.petals.forEach((petal,i)=>petal.rotation.y=.2+Math.sin(time*4+i)*.15 + .55*smooth(122,160,f)+fall*.42);
    drone.lens.scale.setScalar((.8+.2*Math.sin(f*.18))*(1-.95*fall));
    drone.iris.scale.setScalar(1+.14*Math.sin(time*6));
    alert.position.copy(drone.root.position).add(V(.015,-.06,.22));
    alert.intensity=(3.6+2.8*smooth(115,159,f))*(1-fall)+flash*7;
    charge.position.copy(hand);
    charge.intensity=energy*.64+flash*1.19;
    flashPool.material.uniforms.strength.value=.14+.14*build+flash*.72;
    [actor.bones.leftFoot,actor.bones.rightFoot].forEach((foot,i)=>{
      const p=foot.getWorldPosition(V());
      footShadows[i].position.set(p.x,.010,p.z-.066);
    });
    dust((a,b,c,d,e)=>[(a-.5)*5.5+.17*Math.sin(time*.7+d*40),.14+((b+time*.024)%1)*3.6,(c-.30)*20+.14*Math.cos(time*.91+d*20),.35+d*.95,.13+e*.40]);
    hot((a,b,c,d,e)=> {
      const tau=Math.max(0,hit-a*.11); const r=tau*(.42+b*3.1);
      const center=f<174?drone.root.position:origin;
      const angle=c*6.283; const fade=1-smooth(.13,.98,tau);
      const alive=f>=174 && hit>=a*.11 ? fade : f<174 ? build*.33 : 0;
      return [center.x+Math.cos(angle)*(r+(f<174?.28*d:0)),
        Math.max(.04,center.y+(.4+e*2.7)*tau-(2.8+b)*tau*tau+.04*d),
        center.z+Math.sin(angle)*r+.4*tau,.22+e*.96,alive*(.24+d*.76)];
    });
    ion((a,b,c,d,e)=> {
      const spin=a*6.283+time*(2+c*7);
      const spread=.035+build*.15*b+hit*.72*d;
      const active=energy*.72+flash*.56;
      return [hand.x+Math.cos(spin)*spread,hand.y+Math.sin(spin)*spread,
        hand.z+(c-.5)*spread*1.8-hit*d,.25+e*.70,active*(.3+b*.57)];
    });
    const smear=smooth(162,167,f)*(1-smooth(172,175,f));
    comet((s) => {
      const a=lerp(-1.40,1.38,s);
      const wave=V(hand.x+.46*Math.sin(a),hand.y+.13*Math.cos(a)-.26,hand.z+.21*(1-s));
      return [wave,wave.clone().add(V(0,.069*Math.sin(Math.PI*s),-.008))];
    },smear*.58);
    streak((s) => {
      const c=hand.clone().lerp(origin,s);
      c.y+=.05*Math.sin(s*20+f*.6)*Math.sin(s*Math.PI);
      return [c.clone().add(V(0,-.015*flash,0)),c.add(V(0,.022*flash,0))];
    },flash*(1-smooth(177,181,f)));
    pulse((s) => {
      const tau=Math.min(hit,.9);
      const angle=s*6.283185, r=.05+tau*3.4;
      const p=V(origin.x+Math.cos(angle)*r,.024,origin.z+Math.sin(angle)*r);
      return [p,p.clone().add(V(.025*Math.cos(angle),.004,.025*Math.sin(angle)))];
    },flash*.58);
    const focus=camera.position.distanceTo(actor.bones.head.getWorldPosition(V()));
    post.render(scene,camera,{time,focus,aperture:params.cut===1?2.5:.58,bloom:1.03+flash*.62,grain:.003,
      vignette:.40,stress:flash*.48,ab:flash*.24});
    finish(hud,width,height,f);
  }};
}
