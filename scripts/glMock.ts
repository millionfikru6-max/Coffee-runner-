/**
 * Headless WebGL2 + DOM stub.
 *
 * Enough of the API for three.js to build a full WebGLRenderer, compile the
 * custom sky/particle shaders and walk a real render pass. It doesn't
 * rasterise anything, but it does exercise every code path in Scene3D —
 * which is where scene-graph, pooling and uniform bugs actually live.
 */

const GL_CONSTS: Record<string, number> = {};
let constVal = 0x8000;
function konst(name: string) {
  if (!(name in GL_CONSTS)) GL_CONSTS[name] = constVal++;
  return GL_CONSTS[name];
}

function makeGL(): Record<string, unknown> {
  const gl: Record<string, unknown> = {};
  // three.js reads dozens of GL enums; hand back a stable unique number each.
  const enumNames = [
    'DEPTH_TEST','LESS','LEQUAL','BACK','FRONT','CULL_FACE','BLEND','TRIANGLES','LINES','POINTS',
    'FLOAT','UNSIGNED_BYTE','UNSIGNED_SHORT','UNSIGNED_INT','RGBA','RGB','TEXTURE_2D','TEXTURE0',
    'ARRAY_BUFFER','ELEMENT_ARRAY_BUFFER','STATIC_DRAW','DYNAMIC_DRAW','COMPILE_STATUS','LINK_STATUS',
    'VERTEX_SHADER','FRAGMENT_SHADER','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','STENCIL_BUFFER_BIT',
    'FRAMEBUFFER','RENDERBUFFER','DEPTH_COMPONENT16','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER',
    'TEXTURE_WRAP_S','TEXTURE_WRAP_T','LINEAR','NEAREST','CLAMP_TO_EDGE','REPEAT','ONE','ZERO',
    'SRC_ALPHA','ONE_MINUS_SRC_ALPHA','FUNC_ADD','MAX_TEXTURE_IMAGE_UNITS','MAX_VERTEX_TEXTURE_IMAGE_UNITS',
    'MAX_TEXTURE_SIZE','MAX_CUBE_MAP_TEXTURE_SIZE','MAX_VERTEX_ATTRIBS','MAX_VERTEX_UNIFORM_VECTORS',
    'MAX_VARYING_VECTORS','MAX_FRAGMENT_UNIFORM_VECTORS','MAX_SAMPLES','VERSION','SHADING_LANGUAGE_VERSION',
    'VENDOR','RENDERER','HIGH_FLOAT','MEDIUM_FLOAT','LOW_FLOAT','FRAGMENT_SHADER_DERIVATIVE_HINT',
    'DEPTH_STENCIL','UNSIGNED_INT_24_8','TEXTURE_CUBE_MAP','SCISSOR_TEST','RGBA8','DEPTH24_STENCIL8',
    'COLOR_ATTACHMENT0','DEPTH_STENCIL_ATTACHMENT','DEPTH_ATTACHMENT','NONE','BOOL','INT','FLOAT_VEC2',
    'FLOAT_VEC3','FLOAT_VEC4','FLOAT_MAT3','FLOAT_MAT4','SAMPLER_2D','SAMPLER_CUBE','ACTIVE_UNIFORMS',
    'ACTIVE_ATTRIBUTES','TEXTURE_COMPARE_MODE','TEXTURE_COMPARE_FUNC','COMPARE_REF_TO_TEXTURE',
    'UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','UNPACK_ALIGNMENT','PACK_ALIGNMENT',
    'UNPACK_COLORSPACE_CONVERSION_WEBGL','BROWSER_DEFAULT_WEBGL','MAX_ARRAY_TEXTURE_LAYERS',
    'MAX_3D_TEXTURE_SIZE','TEXTURE_2D_ARRAY','TEXTURE_3D','RED','RG','RGB8','R8','RG8','HALF_FLOAT',
    'MAX_COLOR_ATTACHMENTS','MAX_DRAW_BUFFERS','TRIANGLE_STRIP','TRIANGLE_FAN','LINE_STRIP','LINE_LOOP',
    'CW','CCW','FRONT_AND_BACK','NEVER','EQUAL','GREATER','NOTEQUAL','GEQUAL','ALWAYS','KEEP','REPLACE',
    'INCR','DECR','INVERT','INCR_WRAP','DECR_WRAP','STENCIL_TEST','POLYGON_OFFSET_FILL','DITHER',
    'SAMPLE_ALPHA_TO_COVERAGE','LINEAR_MIPMAP_LINEAR','LINEAR_MIPMAP_NEAREST','NEAREST_MIPMAP_LINEAR',
    'NEAREST_MIPMAP_NEAREST','MIRRORED_REPEAT','SRC_COLOR','ONE_MINUS_SRC_COLOR','DST_COLOR',
    'ONE_MINUS_DST_COLOR','DST_ALPHA','ONE_MINUS_DST_ALPHA','FUNC_SUBTRACT','FUNC_REVERSE_SUBTRACT',
    'MIN','MAX','SRGB8_ALPHA8','SRGB8','TEXTURE_MAX_ANISOTROPY_EXT','MAX_TEXTURE_MAX_ANISOTROPY_EXT',
  ];
  for (const n of enumNames) gl[n] = konst(n);

  const obj = () => ({});
  Object.assign(gl, {
    getExtension: (name: string) => {
      if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
      if (name === 'EXT_texture_filter_anisotropic') return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1, TEXTURE_MAX_ANISOTROPY_EXT: 2 };
      return null;
    },
    getParameter: (p: number) => {
      if (p === gl.VERSION || p === gl.SHADING_LANGUAGE_VERSION) return 'WebGL 2.0 (mock)';
      if (p === gl.VENDOR || p === gl.RENDERER) return 'mock';
      if (p === gl.MAX_TEXTURE_SIZE || p === gl.MAX_CUBE_MAP_TEXTURE_SIZE) return 8192;
      if (p === gl.MAX_SAMPLES) return 4;
      return 32;
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getContextAttributes: () => ({ alpha: false, depth: true, stencil: false, antialias: true }),
    getSupportedExtensions: () => [],
    createBuffer: obj, createFramebuffer: obj, createRenderbuffer: obj, createTexture: obj,
    createProgram: obj, createShader: obj, createVertexArray: obj,
    getProgramParameter: () => 1,
    getShaderParameter: () => 1,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getActiveUniform: () => ({ name: 'u', type: gl.FLOAT, size: 1 }),
    getActiveAttrib: () => ({ name: 'a', type: gl.FLOAT_VEC3, size: 1 }),
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    getUniformBlockIndex: () => 0,
    getError: () => 0,
    isContextLost: () => false,
  });

  // Everything else is a harmless no-op.
  const noop = () => {};
  for (const fn of [
    'activeTexture','attachShader','bindAttribLocation','bindBuffer','bindFramebuffer','bindRenderbuffer',
    'bindTexture','bindVertexArray','blendEquation','blendEquationSeparate','blendFunc','blendFuncSeparate',
    'bufferData','bufferSubData','clear','clearColor','clearDepth','clearStencil','colorMask','compileShader',
    'copyTexImage2D','cullFace','deleteBuffer','deleteFramebuffer','deleteProgram','deleteRenderbuffer',
    'deleteShader','deleteTexture','deleteVertexArray','depthFunc','depthMask','depthRange','detachShader',
    'disable','disableVertexAttribArray','drawArrays','drawArraysInstanced','drawBuffers','drawElements',
    'drawElementsInstanced','enable','enableVertexAttribArray','finish','flush','framebufferRenderbuffer',
    'framebufferTexture2D','frontFace','generateMipmap','hint','lineWidth','linkProgram','pixelStorei',
    'polygonOffset','readPixels','renderbufferStorage','renderbufferStorageMultisample','sampleCoverage',
    'scissor','shaderSource','stencilFunc','stencilMask','stencilOp','texImage2D','texImage3D','texParameterf',
    'texParameteri','texStorage2D','texStorage3D','texSubImage2D','texSubImage3D','uniform1f','uniform1fv',
    'uniform1i','uniform1iv','uniform2f','uniform2fv','uniform2i','uniform2iv','uniform3f','uniform3fv',
    'uniform3i','uniform3iv','uniform4f','uniform4fv','uniform4i','uniform4iv','uniformBlockBinding',
    'uniformMatrix2fv','uniformMatrix3fv','uniformMatrix4fv','useProgram','validateProgram','vertexAttrib1f',
    'vertexAttrib2fv','vertexAttrib3fv','vertexAttrib4fv','vertexAttribDivisor','vertexAttribPointer',
    'vertexAttribIPointer','viewport','blitFramebuffer','invalidateFramebuffer','bindBufferBase',
    'clearBufferfv','clearBufferiv','clearBufferfi','texSubImage2D',
  ]) {
    gl[fn] = noop;
  }
  return gl;
}

export function installGLMock() {
  const g = globalThis as Record<string, any>;

  class MockCanvas {
    width = 420;
    height = 860;
    style: Record<string, string> = {};
    clientWidth = 420;
    clientHeight = 860;
    private ctx2d: any = null;
    getContext(type: string) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return makeGL();
      if (type === '2d') {
        if (!this.ctx2d) {
          const noop = () => {};
          this.ctx2d = new Proxy(
            {
              canvas: this,
              measureText: () => ({ width: 10 }),
              createLinearGradient: () => ({ addColorStop: noop }),
              createRadialGradient: () => ({ addColorStop: noop }),
              getImageData: () => ({ data: new Uint8ClampedArray(4) }),
            } as Record<string, unknown>,
            { get: (t, k) => (k in t ? (t as any)[k] : noop) },
          );
        }
        return this.ctx2d;
      }
      return null;
    }
    addEventListener() {}
    removeEventListener() {}
    getBoundingClientRect() {
      return { width: this.width, height: this.height, top: 0, left: 0, right: this.width, bottom: this.height };
    }
    setAttribute() {}
    toDataURL() { return 'data:,'; }
  }

  g.HTMLCanvasElement = MockCanvas;
  g.WebGL2RenderingContext = function () {};
  g.self = g.self ?? g;
  g.window = g.window ?? g;
  // navigator is a getter-only global in modern Node — define, don't assign.
  if (!('hardwareConcurrency' in (g.navigator ?? {}))) {
    try {
      Object.defineProperty(g, 'navigator', {
        value: { userAgent: 'node', hardwareConcurrency: 8 },
        configurable: true,
        writable: true,
      });
    } catch {
      /* navigator already usable */
    }
  }
  g.document = g.document ?? {
    createElementNS: () => new MockCanvas(),
    createElement: (t: string) => (t === 'canvas' ? new MockCanvas() : { style: {}, setAttribute() {}, appendChild() {} }),
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
  };
  if (!g.document.createElement) g.document.createElement = (t: string) => new MockCanvas();
  g.requestAnimationFrame = g.requestAnimationFrame ?? ((cb: any) => setTimeout(() => cb(performance.now()), 16));
  g.cancelAnimationFrame = g.cancelAnimationFrame ?? clearTimeout;
  g.devicePixelRatio = 2;
  g.innerWidth = 420;
  g.innerHeight = 860;

  return new MockCanvas() as unknown as HTMLCanvasElement;
}
