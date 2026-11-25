import * as THREE from '/pipeline/vendor/three/three.module.min.js';

const v = (x,y,z) => new THREE.Vector3(x,y,z);
const box = new THREE.BoxGeometry();
const basic = (hex, energy = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(energy) });

export function rng(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function mesh(parent, geometry, material, pos, scale) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...pos);
  if (scale) object.scale.set(...scale);
  parent.add(object);
  return object;
}
function beam(parent, from, to, thickness, depth, material) {
  const ray = to.clone().sub(from);
  const center = from.clone().lerp(to,.5);
  const b = mesh(parent, box, material, center.toArray(), [thickness, ray.length(), depth]);
  b.quaternion.setFromUnitVectors(v(0,1,0), ray.normalize());
  return b;
}

export function buildStage(scene) {
  const rand = rng(317);
  const solids = new THREE.Group();
  scene.add(solids);
  const steel = new THREE.MeshStandardMaterial({color:0x2c4d58, roughness:.68, metalness:.42});
  const column = new THREE.MeshStandardMaterial({color:0x426170, roughness:.85, metalness:.29});
  const rubber = new THREE.MeshStandardMaterial({color:0x101d25, roughness:.94});
  const trim = new THREE.MeshStandardMaterial({color:0x745d49, roughness:.76, metalness:.35});
  const cold = basic(0xa6f4e6, 2.1);
  const warm = basic(0xff9445, 2.4);
  const pale = basic(0x426f78);
  const conduit = new THREE.CylinderGeometry(.017,.017,1,6);
  const rivet = new THREE.CylinderGeometry(.016,.016,.021,6);
  const slab = new THREE.MeshStandardMaterial({color:0x36505a, roughness:.86, metalness:.20});
  const floor = mesh(solids, new THREE.PlaneGeometry(20,52), slab, [0,-.003,7]);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  slab.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 worldFloor;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nworldFloor=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 worldFloor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'
      + 'vec2 p=worldFloor.xz; vec2 tile=abs(fract(p*vec2(1.45,.85)+.5)-.5);'
      + 'vec2 aa=fwidth(tile); vec2 borders=smoothstep(vec2(.481)-aa,vec2(.492)+aa,tile);'
      + 'float n=sin(p.x*27.+sin(p.y*33.))*sin(p.y*41.+cos(p.x*35.));'
      + 'float wet=sin(p.x*13.+p.y*1.6+sin(p.y*2.7))*sin(p.y*7.3);'
      + 'float plates=fract(sin(dot(floor(p*vec2(1.45,.85)+.5),vec2(43.13,19.1)))*417.3);'
      + 'diffuseColor.rgb*=.92+.10*n+.22*plates+.16*smoothstep(.2,.7,wet)-.58*max(borders.x,borders.y);'
      + 'float guide=smoothstep(.018,.004,abs(abs(p.x)-1.73));'
      + 'diffuseColor.rgb=mix(diffuseColor.rgb, vec3(.33,.13,.025),guide*.56*step(.32,fract(p.y*.50)));');
  };

  mesh(solids, box, rubber,[0,4.25,6],[6.8,.32,40]);
  for (const side of [-1,1]) {
    mesh(solids, box, steel,[side*3.09,1.7,6],[.20,3.45,40]);
    mesh(solids, box, trim,[side*2.87,.14,6],[.37,.28,40]);
    mesh(solids, box, column,[side*2.96,1.21,6],[.12,.052,40]);
    for (const y of [.30,.39,2.7,2.82]) {
      const pipe = mesh(solids, conduit, y > 2 ? trim : steel, [side*2.87,y,6],[1,40,1]);
      pipe.rotation.x = Math.PI/2;
    }
    for (let z=-9;z<22;z+=1.18) {
      const panel = mesh(solids,box,column,[side*2.965,.82,z],[.09,.72,.96]);
      panel.receiveShadow = true;
      mesh(solids,box,rubber,[side*2.91,.81,z],[.031,.47,.68]);
      for (let i=0;i<4;i++) mesh(solids,box,steel,[side*2.88,.64+i*.105,z],[.025,.026,.67]);
      mesh(solids,box,pale,[side*2.9,1.62,z+.36],[.043,.027,.18]);
    }
  }
  for (let i=-5;i<11;i++) {
    const z=i*2.05;
    for (const side of [-1,1]) {
      beam(solids,v(side*2.78,.08,z),v(side*2.76,2.48,z),.17,.27,column);
      beam(solids,v(side*2.76,2.48,z),v(side*1.59,3.55,z),.14,.25,steel);
      beam(solids,v(side*1.6,3.55,z),v(0,3.65,z),.13,.25,column);
      beam(solids,v(side*2.68,2.47,z-.16),v(side*1.56,3.48,z-.16),.031,.036,cold);
      mesh(solids,box,rubber,[side*2.74,1.64,z-.16],[.27,.41,.08]);
      mesh(solids,box,i%4===0?warm:cold,[side*2.70,1.66,z-.21],[.067,.17,.032]);
      for (const offset of [-.095,.095]) {
        const bolt = mesh(solids,rivet, trim,[side*2.67,.54,z+offset]);
        bolt.rotation.z = Math.PI/2;
      }
    }
  }

  // Dim stenciled signage, floor hardware and small obstructions used as depth cues.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 768; signCanvas.height = 192;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#19303a'; ctx.fillRect(0,0,768,192);
  ctx.strokeStyle = '#679d9e'; ctx.lineWidth = 4; ctx.strokeRect(8,8,752,176);
  ctx.fillStyle = '#9ac0ba'; ctx.font = 'bold 65px monospace'; ctx.fillText('09 / RELAY',49,100);
  ctx.font = '23px monospace'; ctx.fillText('TRANSIT SERVICE LEVEL',53,145);
  for (let i=0; i<12; i++) ctx.fillRect(617+i*8,54,3+(i%3),86);
  const label = new THREE.CanvasTexture(signCanvas); label.colorSpace = THREE.SRGBColorSpace;
  const sign = mesh(solids, new THREE.PlaneGeometry(1.52,.38),
    new THREE.MeshBasicMaterial({map:label, color:0xddeeea}),[0,2.99,5.98]);
  sign.rotation.y = Math.PI;
  for (let i=0;i<66;i++) {
    const x=(rand()*.77+1.94)*(rand()>.5?1:-1);
    const z=rand()*22-7; const s=.025+rand()*.11;
    const item=mesh(solids,box,rand()<.5?rubber:steel,[x,s*.22,z],[s*1.7,s*.55,s]);
    item.rotation.set(rand()*.25, rand()*6.28,rand()*.15);
  }
  // Soft-edged light patches with fine broken streaks on the wet floor.
  const poolMaterial = new THREE.ShaderMaterial({
    uniforms:{ tint:{value:new THREE.Color(0x459eac)}, strength:{value:.38} },
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;uniform vec3 tint;uniform float strength;void main(){vec2 p=abs(st-.5)*2.;float g=exp(-5.5*p.x*p.x-4.5*p.y*p.y)*max(0.,1.-max(p.x,p.y));float ridge=.88+.12*sin(st.y*137.+cos(st.x*53.));gl_FragColor=vec4(tint,g*ridge*strength);}'
  });
  for (let i=-2; i<6; i++) {
    const p=mesh(scene,new THREE.PlaneGeometry(1.27,3.2),poolMaterial,[.1,.002,i*2.45]);
    p.rotation.x=-Math.PI/2;
  }
  const flashPool = mesh(scene,new THREE.PlaneGeometry(2.5,4.6),poolMaterial.clone(),[.08,.003,-1.3]);
  flashPool.material.uniforms.tint.value.set(0xff783c);
  flashPool.rotation.x=-Math.PI/2;
  return {flashPool};
}

export function makeDrone(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const shell=new THREE.MeshStandardMaterial({color:0x604a42, metalness:.63, roughness:.39, flatShading:true});
  const dark=new THREE.MeshStandardMaterial({color:0x152632, metalness:.4, roughness:.49});
  const heat=basic(0xff703a,3.3);
  const eye=basic(0xffae5d,4.0);
  mesh(root,new THREE.IcosahedronGeometry(.225,0),shell,[0,0,0],[1.45,.61,.84]);
  mesh(root,new THREE.CylinderGeometry(.102,.102,.10,8),dark,[0,0,.181]).rotation.x=Math.PI/2;
  const lens=mesh(root,new THREE.CircleGeometry(.057,18),eye,[0,0,.238]);
  lens.material.side=THREE.DoubleSide;
  const iris=mesh(root,new THREE.TorusGeometry(.087,.006,5,24),heat,[0,0,.236]);
  const rear = mesh(root,new THREE.CylinderGeometry(.14,.18,.05,8),dark,[0,0,-.155]);
  rear.rotation.x=Math.PI/2;
  mesh(root,new THREE.TorusGeometry(.104,.009,5,24),heat,[0,0,-.184]);
  mesh(root,new THREE.TorusGeometry(.061,.004,4,24),eye,[0,0,-.187]);
  for(const side of [-1,1]) {
    mesh(root,box,dark,[side*.132,0,-.105],[.07,.095,.053]).rotation.z=side*.4;
    mesh(root,box,heat,[side*.138,.023,-.132],[.055,.011,.009]).rotation.z=side*.4;
  }
  const petals=[];
  for(let i=0;i<3;i++){
    const r=new THREE.Group(); r.rotation.z=i*2*Math.PI/3; root.add(r);
    const hinge=new THREE.Group(); hinge.position.x=.19; r.add(hinge);
    mesh(hinge, new THREE.OctahedronGeometry(.19),shell,[.165,0,0],[1.15,.36,.64]).rotation.y=.33;
    mesh(hinge,box,dark,[.18,0,.08],[.24,.059,.046]);
    mesh(hinge,box,heat,[.24,0,.108],[.16,.012,.008]);
    petals.push(hinge);
  }
  return {root, lens, iris, petals};
}
