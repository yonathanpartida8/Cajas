// Renderizador WebGL2 compacto: dibuja quads texturizados con luz simple.
import { perspective, lookAt, mul, norm, sub, cross, v3 } from './math3d.js';

const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv;
uniform mat4 uVP;
out vec3 vN; out vec2 vUv; out vec3 vP;
void main(){ vN=aNor; vUv=aUv; vP=aPos; gl_Position=uVP*vec4(aPos,1.0); }`;

const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec2 vUv; in vec3 vP;
uniform sampler2D uTex;
uniform vec2 uUvScale;
uniform vec3 uTint;
uniform float uShade, uHi, uUnlit, uAlpha;
out vec4 outColor;
void main(){
  vec4 t = texture(uTex, vUv*uUvScale);
  if(uUnlit > .5){ outColor = vec4(t.rgb, t.a*uAlpha); return; }
  vec3 n = normalize(vN);
  float key = max(dot(n, normalize(vec3(.42,.86,.5))), 0.0);
  float fill = max(dot(n, normalize(vec3(-.6,.25,-.4))), 0.0);
  float l = .46 + .52*key + .16*fill;
  vec3 c = t.rgb * uTint * l * uShade;
  c = mix(c, vec3(1.0,.87,.66), uHi*.28);
  outColor = vec4(c, t.a*uAlpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 no disponible');

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const U = {};
  for (const n of ['uVP', 'uTex', 'uUvScale', 'uTint', 'uShade', 'uHi', 'uUnlit', 'uAlpha'])
    U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uTex, 0);

  const MAX = 64 * 6 * 8; // 64 quads
  const data = new Float32Array(MAX);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const stride = 32;
  [['aPos', 3, 0], ['aNor', 3, 12], ['aUv', 2, 24]].forEach(([name, size, off]) => {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
  });

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  /** Crea/actualiza una textura desde un canvas. */
  function texture(src, { repeat = false, mips = true } = {}) {
    const tex = gl.createTexture();
    const o = {
      tex,
      update(canvas, fast = false) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
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

  /** Cámara: devuelve {vp, eye, ray(x,y)} con x,y en NDC (-1..1). */
  function camera({ eye, target, fov = 0.72, aspect }) {
    const view = lookAt(eye, target);
    const proj = perspective(fov, aspect, 0.05, 100);
    const fwd = norm(sub(target, eye));
    const right = norm(cross(fwd, v3(0, 1, 0)));
    const up = cross(right, fwd);
    const th = Math.tan(fov / 2);
    return {
      vp: mul(proj, view), eye, fwd, right, up,
      ray(nx, ny) {
        return norm(v3(
          fwd.x + right.x * nx * aspect * th + up.x * ny * th,
          fwd.y + right.y * nx * aspect * th + up.y * ny * th,
          fwd.z + right.z * nx * aspect * th + up.z * ny * th,
        ));
      },
    };
  }

  /** faces: [{o,u,v,n,tex,uvScale,shade,tint,hi,unlit,alpha,blend}] ya ordenadas. */
  function render(faces, cam) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, cam.vp);

    let n = 0;
    for (const f of faces) {
      const { o, u, v, n: nr } = f;
      const p = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      for (const [a, b] of p) {
        data[n++] = o.x + u.x * a + v.x * b;
        data[n++] = o.y + u.y * a + v.y * b;
        data[n++] = o.z + u.z * a + v.z * b;
        data[n++] = nr.x; data[n++] = nr.y; data[n++] = nr.z;
        data[n++] = a; data[n++] = 1 - b; // v invertida: (0,0) arriba-izquierda del canvas
      }
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n);

    faces.forEach((f, i) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.tex.tex);
      gl.uniform2f(U.uUvScale, f.uvScale ? f.uvScale[0] : 1, f.uvScale ? f.uvScale[1] : 1);
      const t = f.tint || [1, 1, 1];
      gl.uniform3f(U.uTint, t[0], t[1], t[2]);
      gl.uniform1f(U.uShade, f.shade ?? 1);
      gl.uniform1f(U.uHi, f.hi || 0);
      gl.uniform1f(U.uUnlit, f.unlit ? 1 : 0);
      gl.uniform1f(U.uAlpha, f.alpha ?? 1);
      gl.depthMask(!f.noDepth);
      gl.drawArrays(gl.TRIANGLES, i * 6, 6);
    });
    gl.depthMask(true);
  }

  return { gl, texture, resize, camera, render };
}
