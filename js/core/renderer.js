// Renderizador WebGL2: dos programas (quads texturizados y mallas 3D con color
// por vértice), luz de estudio compartida y hasta 8 luces puntuales dinámicas.
import { perspective, lookAt, mul, norm, sub, cross, v3 } from './math3d.js';

export const MAX_LIGHTS = 8;

// --- trozo común de iluminación -------------------------------------------
const LIGHT_CHUNK = `
const vec3 KEY = vec3(.40, .84, .48);
const vec3 FILL = vec3(-.62, .28, -.45);
uniform vec3 uLightP[${MAX_LIGHTS}];
uniform vec3 uLightC[${MAX_LIGHTS}];
uniform int uLightN;

vec3 lamps(vec3 p, vec3 n){
  vec3 s = vec3(0.0);
  for(int i = 0; i < ${MAX_LIGHTS}; i++){
    if(i >= uLightN) break;
    vec3 d = uLightP[i] - p;
    float q = dot(d, d);
    float att = 1.0 / (1.0 + q * 30.0);
    float lam = max(dot(n, normalize(d)), 0.0) * .75 + .25;
    s += uLightC[i] * lam * att;
  }
  return s;
}

vec3 studio(vec3 base, vec3 n, vec3 p, vec3 eye, float gloss){
  vec3 v = normalize(eye - p);
  vec3 l = normalize(KEY);
  float key = max(dot(n, l), 0.0);
  float fill = max(dot(n, normalize(FILL)), 0.0);
  float h = clamp(p.y * 1.7 + .18, 0.0, 1.0);
  vec3 amb = mix(vec3(.40,.34,.28), vec3(.66,.65,.64), h);
  vec3 c = base * (amb + vec3(1.0,.95,.86)*key*.62 + vec3(.46,.52,.60)*fill*.20 + lamps(p, n));
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 18.0 + gloss * 60.0) * (.06 + gloss * .5);
  c += spec * (.35 + .65 * key);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c *= mix(1.0, .84, fres * .75);
  return c;
}`;

const VS_QUAD = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv;
uniform mat4 uVP;
out vec3 vN; out vec2 vUv; out vec3 vP;
void main(){ vN=aNor; vUv=aUv; vP=aPos; gl_Position=uVP*vec4(aPos,1.0); }`;

const FS_QUAD = `#version 300 es
precision mediump float;
in vec3 vN; in vec2 vUv; in vec3 vP;
uniform sampler2D uTex;
uniform vec2 uUvScale;
uniform vec3 uTint, uEye;
uniform float uShade, uHi, uUnlit, uAlpha, uGloss;
out vec4 outColor;
${LIGHT_CHUNK}
void main(){
  vec4 t = texture(uTex, vUv*uUvScale);
  if(uUnlit > .5){ outColor = vec4(t.rgb, t.a*uAlpha); return; }
  vec3 c = studio(t.rgb * uTint, normalize(vN), vP, uEye, uGloss) * uShade;
  c = mix(c, vec3(1.0,.88,.68), uHi*.3);
  outColor = vec4(c, t.a*uAlpha);
}`;

const VS_MESH = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aCol; in float aMix; in float aEmi;
uniform mat4 uVP, uModel; uniform mat3 uNor;
out vec3 vN; out vec3 vP; out vec3 vC; out float vMix; out float vEmi;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vP = wp.xyz; vN = uNor * aNor; vC = aCol; vMix = aMix; vEmi = aEmi;
  gl_Position = uVP * wp;
}`;

const FS_MESH = `#version 300 es
precision mediump float;
in vec3 vN; in vec3 vP; in vec3 vC; in float vMix; in float vEmi;
uniform vec3 uColor, uEye, uEmissive;
uniform float uAlpha, uHi, uGloss;
out vec4 outColor;
${LIGHT_CHUNK}
void main(){
  vec3 base = mix(vC, uColor, vMix);
  vec3 c = studio(base, normalize(vN), vP, uEye, uGloss);
  c = mix(c, uEmissive, vEmi * .92);          // bombillas y llamas: color propio
  c = mix(c, vec3(1.0,.88,.68), uHi*.28);
  outColor = vec4(c, uAlpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(gl, vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const U = {};
  for (const n of names) U[n] = gl.getUniformLocation(p, n);
  for (let i = 0; i < MAX_LIGHTS; i++) {
    U['uLightP' + i] = gl.getUniformLocation(p, `uLightP[${i}]`);
    U['uLightC' + i] = gl.getUniformLocation(p, `uLightC[${i}]`);
  }
  U.uLightN = gl.getUniformLocation(p, 'uLightN');
  return { p, U };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 no disponible');

  const quadP = program(gl, VS_QUAD, FS_QUAD,
    ['uVP', 'uTex', 'uUvScale', 'uTint', 'uEye', 'uShade', 'uHi', 'uUnlit', 'uAlpha', 'uGloss']);
  const meshP = program(gl, VS_MESH, FS_MESH,
    ['uVP', 'uModel', 'uNor', 'uColor', 'uEye', 'uEmissive', 'uAlpha', 'uHi', 'uGloss']);

  gl.useProgram(quadP.p);
  gl.uniform1i(quadP.U.uTex, 0);

  // --- geometría de quads (caras de la caja) ---
  const MAX = 64 * 6 * 8;
  const data = new Float32Array(MAX);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  [['aPos', 3, 0], ['aNor', 3, 12], ['aUv', 2, 24]].forEach(([name, size, off]) => {
    const loc = gl.getAttribLocation(quadP.p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, off);
  });
  gl.bindVertexArray(null);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  let lights = [];
  let camNow = null;

  /** Sube una malla empaquetada a la GPU (se cachea dentro del propio objeto). */
  function upload(m) {
    if (m._vao) return m._vao;
    const vaoM = gl.createVertexArray();
    gl.bindVertexArray(vaoM);
    const put = (arr, name, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(meshP.p, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    m._buf = [put(m.pos, 'aPos', 3), put(m.nor, 'aNor', 3), put(m.col, 'aCol', 3),
      put(m.mix, 'aMix', 1), put(m.emi, 'aEmi', 1)];
    gl.bindVertexArray(null);
    m._vao = vaoM;
    return vaoM;
  }

  function dispose(m) {
    if (!m._vao) return;
    gl.deleteVertexArray(m._vao);
    m._buf.forEach(b => gl.deleteBuffer(b));
    m._vao = null; m._buf = null;
  }

  function texture(src, { repeat = false, mips = true } = {}) {
    const tex = gl.createTexture();
    const o = {
      tex,
      update(cv, fast = false) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (fast || !mips) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        } else {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        }
        return o;
      },
      dispose() { gl.deleteTexture(tex); },
    };
    return o.update(src);
  }

  function resize(dprCap = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  }

  function camera({ eye, target, fov = 0.72, aspect }) {
    const view = lookAt(eye, target);
    const proj = perspective(fov, aspect, 0.05, 100);
    const fwd = norm(sub(target, eye));
    const right = norm(cross(fwd, v3(0, 1, 0)));
    const up = cross(right, fwd);
    const th = Math.tan(fov / 2);
    const vp = mul(proj, view);
    return {
      vp, eye, fwd, right, up,
      project(p) {
        const w = vp[3] * p.x + vp[7] * p.y + vp[11] * p.z + vp[15];
        if (w <= 1e-4) return null;
        const x = (vp[0] * p.x + vp[4] * p.y + vp[8] * p.z + vp[12]) / w;
        const y = (vp[1] * p.x + vp[5] * p.y + vp[9] * p.z + vp[13]) / w;
        return { x: (x * .5 + .5) * canvas.clientWidth, y: (.5 - y * .5) * canvas.clientHeight };
      },
      ray(nx, ny) {
        return norm(v3(
          fwd.x + right.x * nx * aspect * th + up.x * ny * th,
          fwd.y + right.y * nx * aspect * th + up.y * ny * th,
          fwd.z + right.z * nx * aspect * th + up.z * ny * th,
        ));
      },
    };
  }

  function applyLights(prog) {
    gl.uniform1i(prog.U.uLightN, Math.min(lights.length, MAX_LIGHTS));
    for (let i = 0; i < Math.min(lights.length, MAX_LIGHTS); i++) {
      const l = lights[i];
      gl.uniform3f(prog.U['uLightP' + i], l.p.x, l.p.y, l.p.z);
      gl.uniform3f(prog.U['uLightC' + i], l.c[0], l.c[1], l.c[2]);
    }
  }

  /** Empieza el fotograma: limpia y fija cámara + luces. */
  function begin(cam, lightList = []) {
    camNow = cam;
    lights = lightList;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Dibuja las caras planas de la caja. */
  function quads(faces) {
    gl.useProgram(quadP.p);
    gl.uniformMatrix4fv(quadP.U.uVP, false, camNow.vp);
    gl.uniform3f(quadP.U.uEye, camNow.eye.x, camNow.eye.y, camNow.eye.z);
    applyLights(quadP);

    let n = 0;
    const corners = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    for (const f of faces) {
      const { o, u, v, n: nr } = f;
      for (const [a, b] of corners) {
        data[n++] = o.x + u.x * a + v.x * b;
        data[n++] = o.y + u.y * a + v.y * b;
        data[n++] = o.z + u.z * a + v.z * b;
        data[n++] = nr.x; data[n++] = nr.y; data[n++] = nr.z;
        data[n++] = a; data[n++] = 1 - b;
      }
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n);

    faces.forEach((f, i) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.tex.tex);
      gl.uniform2f(quadP.U.uUvScale, f.uvScale ? f.uvScale[0] : 1, f.uvScale ? f.uvScale[1] : 1);
      const t = f.tint || [1, 1, 1];
      gl.uniform3f(quadP.U.uTint, t[0], t[1], t[2]);
      gl.uniform1f(quadP.U.uShade, f.shade ?? 1);
      gl.uniform1f(quadP.U.uHi, f.hi || 0);
      gl.uniform1f(quadP.U.uUnlit, f.unlit ? 1 : 0);
      gl.uniform1f(quadP.U.uAlpha, f.alpha ?? 1);
      gl.uniform1f(quadP.U.uGloss, f.gloss ?? 0);
      gl.depthMask(!f.noDepth);
      gl.drawArrays(gl.TRIANGLES, i * 6, 6);
    });
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  /** Dibuja objetos 3D: [{mesh, model, nor, color, emissive, alpha, hi, gloss}] */
  function meshes(items) {
    if (!items.length) return;
    gl.useProgram(meshP.p);
    gl.uniformMatrix4fv(meshP.U.uVP, false, camNow.vp);
    gl.uniform3f(meshP.U.uEye, camNow.eye.x, camNow.eye.y, camNow.eye.z);
    applyLights(meshP);

    for (const it of items) {
      const m = it.mesh;
      if (!m || !m.count) continue;
      gl.bindVertexArray(upload(m));
      gl.uniformMatrix4fv(meshP.U.uModel, false, it.model);
      gl.uniformMatrix3fv(meshP.U.uNor, false, it.nor);
      gl.uniform3f(meshP.U.uColor, it.color[0], it.color[1], it.color[2]);
      const e = it.emissive || [0, 0, 0];
      gl.uniform3f(meshP.U.uEmissive, e[0], e[1], e[2]);
      gl.uniform1f(meshP.U.uAlpha, it.alpha ?? 1);
      gl.uniform1f(meshP.U.uHi, it.hi || 0);
      gl.uniform1f(meshP.U.uGloss, it.gloss ?? .12);
      gl.depthMask(it.alpha === undefined || it.alpha >= 1);
      if (it.xray) gl.disable(gl.DEPTH_TEST);      // la vista previa se ve tras las paredes
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
      if (it.xray) gl.enable(gl.DEPTH_TEST);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  return { gl, texture, resize, camera, begin, quads, meshes, dispose };
}
