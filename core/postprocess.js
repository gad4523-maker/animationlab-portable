// Single-pass HDR WebGL2 Cinema Post-Processing Shader:
// Linear HDR HalfFloat target -> Bokeh DOF -> 18-tap 3-ring soft-knee Bloom ->
// Pre-tonemap color grade -> ACES Filmic Tone Mapping -> Vignette + micro-grain -> sRGB.
import * as THREE from '../vendor/three/three.module.min.js';

export function createCinemaComposer(renderer, width, height, { near = 0.05, far = 250, effects = 2 } = {}) {
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const hdr = renderer.extensions.has("EXT_color_buffer_float");
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 0,
  });
  if (effects === 2) target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);

  const screenScene = new THREE.Scene();
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const material = new THREE.ShaderMaterial({
    defines: { EFFECTS: effects },
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tDiffuse: { value: target.texture },
      tDepth: { value: target.depthTexture },
      uRes: { value: new THREE.Vector2(width, height) },
      uNear: { value: near },
      uFar: { value: far },
      uFocus: { value: 5.5 },
      uAperture: { value: 0.0 },
      uBloom: { value: 0.65 },
      uAb: { value: 0.0 },
      uStress: { value: 0.0 },
      uTime: { value: 0.0 },
      uGrain: { value: 0.001 },
      uVignette: { value: 0.28 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 uRes;
      uniform float uNear, uFar, uFocus, uAperture, uBloom, uAb, uStress, uTime, uGrain, uVignette;
      varying vec2 vUv;

      float linearDepth(vec2 uv) {
        float z = texture2D(tDepth, uv).r;
        return (uNear * uFar) / max(0.0001, (uFar - z * (uFar - uNear)));
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 softThreshold(vec3 c, float thresh, float knee) {
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - thresh + knee, 0.0, 2.0 * knee);
        rq = (rq * rq) / max(0.0001, 4.0 * knee);
        float weight = max(rq, br - thresh) / max(br, 0.0001);
        return c * max(0.0, weight);
      }

      vec3 acesFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 pix = 1.0 / uRes;
        vec2 dir = uv - 0.5;

        float abAmt = uAb * dot(dir, dir) * 0.025;
        vec3 col;
        if (abAmt > 0.0002) {
          col.r = texture2D(tDiffuse, clamp(uv + dir * abAmt, 0.0, 1.0)).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, clamp(uv - dir * abAmt, 0.0, 1.0)).b;
        } else {
          col = texture2D(tDiffuse, uv).rgb;
        }

        // Foreground-safe bokeh DOF
#if EFFECTS == 2
        float zRaw = texture2D(tDepth, uv).r;
        float dist = linearDepth(uv);
        float coc = uAperture * smoothstep(0.35, 3.4, abs(dist - uFocus));
        if (coc > 0.15) {
          vec3 acc = col * 2.0;
          float wSum = 2.0;
          for (int k = 0; k < 8; k++) {
            float ang = float(k) * 0.785398;
            vec2 suv = clamp(uv + vec2(cos(ang), sin(ang)) * pix * coc, 0.0, 1.0);
            float sz = texture2D(tDepth, suv).r;
            if (sz >= zRaw - 0.001) {
              acc += texture2D(tDiffuse, suv).rgb;
              wSum += 1.0;
            }
          }
          col = acc / wSum;
        }

#endif
#if EFFECTS >= 1
        // Smooth 3-ring 18-tap soft-knee HDR bloom (rotated rings prevent octagonal artifacts)
        if (uBloom > 0.01) {
          vec3 bloom = vec3(0.0);
          for (int j = 0; j < 6; j++) {
            float a1 = float(j) * 1.047198;
            float a2 = a1 + 0.349066;
            float a3 = a1 + 0.698132;
            vec2 o1 = vec2(cos(a1), sin(a1)) * pix * 3.5;
            vec2 o2 = vec2(cos(a2), sin(a2)) * pix * 9.5;
            vec2 o3 = vec2(cos(a3), sin(a3)) * pix * 19.0;
            bloom += softThreshold(texture2D(tDiffuse, clamp(uv + o1, 0.0, 1.0)).rgb, 0.80, 0.35) * 0.045;
#if EFFECTS == 2
            bloom += softThreshold(texture2D(tDiffuse, clamp(uv + o2, 0.0, 1.0)).rgb, 0.85, 0.35) * 0.032;
            bloom += softThreshold(texture2D(tDiffuse, clamp(uv + o3, 0.0, 1.0)).rgb, 0.90, 0.40) * 0.020;
#endif
          }
          col += bloom * uBloom;
        }

#endif
        // Apply linear-space saturation & warm/cool grade BEFORE ACES Filmic roll-off
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, 1.10);
        col = col * vec3(1.015, 0.995, 1.010) + vec3(0.001, 0.002, 0.006) * (1.0 - min(1.0, lum * 2.0));
        col = mix(col, col * vec3(1.10, 0.94, 0.95), uStress * 0.40);

        // Soft ACES Filmic tone mapping
        col = acesFilm(col * 1.05);

        // Subtle vignette & low-bitrate micro-grain
        float vig = dot(dir * vec2(1.16, 0.98), dir * vec2(1.16, 0.98));
        col *= 1.0 - vig * uVignette;
        float n = (hash12(uv * uRes + uTime * 37.0) - 0.5) * uGrain;
        col = clamp(col + n, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  return {
    target,
    material,
    render(scene, camera, params = {}) {
      if (params.focus !== undefined) material.uniforms.uFocus.value = params.focus;
      if (params.aperture !== undefined) material.uniforms.uAperture.value = params.aperture;
      if (params.bloom !== undefined) material.uniforms.uBloom.value = params.bloom;
      if (params.ab !== undefined) material.uniforms.uAb.value = params.ab;
      if (params.stress !== undefined) material.uniforms.uStress.value = params.stress;
      if (params.time !== undefined) material.uniforms.uTime.value = params.time;
      if (params.grain !== undefined) material.uniforms.uGrain.value = params.grain;
      if (params.vignette !== undefined) material.uniforms.uVignette.value = params.vignette;

      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(screenScene, orthoCam);
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    },
    dispose() {
      target.dispose();
      material.dispose();
    },
  };
}
