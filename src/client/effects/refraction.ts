import type { SkinEffect } from '../../core/effects.js'
import type { Quality } from '../../shared/preferences.js'
import type { createFrameScheduler } from './frame-scheduler.js'

type Refraction = Extract<SkinEffect, { id: 'glass.refraction' }>['params']
type GL = WebGLRenderingContext
const SIZE = 128
const QUALITY = {
  low: { scale: 0.4, pixels: 262_144 },
  balanced: { scale: 0.65, pixels: 524_288 },
  high: { scale: 0.85, pixels: 1_048_576 },
}

const vertex = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_position * 0.5 + 0.5;
}`

const fragment = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_surface;
uniform float u_phase;
uniform float u_distortion;
uniform float u_dispersion;
uniform vec3 u_accent;
void main() {
  vec2 p = v_uv;
  float a = sin(11.0*p.x + 7.0*p.y + 1.9*sin(6.0*p.y - u_phase) + u_phase);
  float b = cos(7.0*p.x - 10.0*p.y + 1.8*cos(5.0*p.x + u_phase) - u_phase);
  vec2 flow = vec2(a,b);
  vec2 uv = p * vec2(0.92,0.72) + flow * u_distortion * 0.075;
  vec2 split = flow * u_dispersion * 0.032;
  vec3 material = vec3(texture2D(u_surface, uv+split).r,
    texture2D(u_surface, uv).g, texture2D(u_surface, uv-split).b);
  float focus = pow(1.0 - abs(a+b) * 0.5, 6.0) * 0.2;
  float edge = smoothstep(0.0, 0.3, p.x) * smoothstep(0.0, 0.32, p.y);
  vec3 tint = mix(vec3(0.10,0.22,0.39), u_accent, 0.28);
  vec3 light = material * tint * 0.68 + focus * tint;
  gl_FragColor = vec4(light, 0.26 + edge * 0.30);
}`

let surface: Uint8Array | undefined
function backgroundTexture() {
  if (surface) return surface
  surface = new Uint8Array(SIZE * SIZE * 4)
  const tau = Math.PI * 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE * tau, v = y / SIZE * tau
      const index = (y * SIZE + x) * 4
      surface[index] = 124 + 85 * Math.sin(2 * u + v + 1.5 * Math.sin(2 * v))
      surface[index + 1] = 126 + 89 * Math.sin(u + 2 * v + 1.2 * Math.cos(2 * u))
      surface[index + 2] = 156 + 69 * Math.cos(u + v + Math.sin(2 * v - u))
      surface[index + 3] = 255
    }
  }
  return surface
}

function compile(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('WebGL shader unavailable')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  throw new Error('WebGL shader compilation failed')
}

function setup(gl: GL, params: Refraction, accent: string) {
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  let vs: WebGLShader | undefined
  let fs: WebGLShader | undefined
  function release() {
    gl.deleteProgram(program)
    gl.deleteBuffer(buffer)
    gl.deleteTexture(texture)
  }
  try {
    if (!program || !buffer || !texture) throw new Error('WebGL allocation failed')
    vs = compile(gl, gl.VERTEX_SHADER, vertex)
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL link failed')
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const attribute = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(attribute)
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, backgroundTexture())
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const phase = uniform('u_phase')
    gl.uniform1i(uniform('u_surface'), 0)
    gl.uniform1f(uniform('u_distortion'), params.distortion)
    gl.uniform1f(uniform('u_dispersion'), params.dispersion)
    const rgb = accent.length <= 5 ? accent.slice(1, 4).replace(/./g, '$&$&') : accent.slice(1, 7)
    const color = Number.parseInt(rgb, 16)
    gl.uniform3f(uniform('u_accent'), ((color >>> 16) & 255) / 255, ((color >>> 8) & 255) / 255, (color & 255) / 255)
    if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL setup failed')
    return {
      draw(time: number) {
        gl.uniform1f(phase, time)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      },
      release,
    }
  } catch (error) {
    release()
    throw error
  } finally {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
  }
}

export function mountRefraction(scene: HTMLElement, scheduler: ReturnType<typeof createFrameScheduler>,
  params: Refraction, accent: string, initialQuality: Quality, onRendering: (active: boolean) => void) {
  const canvas = scene.ownerDocument.createElement('canvas')
  canvas.setAttribute('data-dsh-skin-effect-layer', 'refraction')
  canvas.hidden = true
  let gl: GL | null
  try {
    gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, antialias: false, depth: false, powerPreference: 'low-power',
    })
  } catch { return }
  if (!gl) return
  const context = gl
  let quality = initialQuality
  let resources: ReturnType<typeof setup> | undefined
  let releaseFrame: (() => void) | undefined
  let phase = 0
  let disposed = false
  let observer: ResizeObserver | undefined

  function draw(delta: number) {
    if (!resources || context.isContextLost() || canvas.width === 0 || canvas.height === 0) return
    phase = (phase + delta * params.flowSpeed * 2 * Math.PI) % (2 * Math.PI)
    resources.draw(phase)
  }

  function resize() {
    if (!resources || context.isContextLost()) return
    const width = scene.clientWidth
    const height = scene.clientHeight
    if (width === 0 || height === 0) return
    const manual = QUALITY[params.quality]
    const window = QUALITY[quality]
    const scale = Math.min(params.refractionScale, manual.scale, window.scale,
      Math.sqrt(Math.min(manual.pixels, window.pixels) / (width * height)))
    const w = Math.max(1, Math.floor(width * scale))
    const h = Math.max(1, Math.floor(height * scale))
    if (canvas.width === w && canvas.height === h && !canvas.hidden) return
    canvas.width = w
    canvas.height = h
    context.viewport(0, 0, w, h)
    draw(0)
  }

  function stop() {
    releaseFrame?.()
    releaseFrame = undefined
    canvas.hidden = true
    canvas.width = canvas.height = 0
    onRendering(false)
  }

  function lose(event: Event) {
    event.preventDefault()
    resources = undefined
    stop()
  }

  function start() {
    resources = setup(context, params, accent)
    resize()
    if (context.getError() !== context.NO_ERROR) throw new Error('WebGL draw failed')
    canvas.hidden = false
    onRendering(true)
    releaseFrame = scheduler.add(draw)
  }

  function restore() {
    if (disposed) return
    try { start() } catch {
      resources?.release()
      resources = undefined
      stop()
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    canvas.removeEventListener('webglcontextlost', lose)
    canvas.removeEventListener('webglcontextrestored', restore)
    observer?.disconnect()
    stop()
    resources?.release()
    resources = undefined
    if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
  }

  try {
    observer = new scene.ownerDocument.defaultView!.ResizeObserver(resize)
    canvas.addEventListener('webglcontextlost', lose)
    canvas.addEventListener('webglcontextrestored', restore)
    scene.prepend(canvas)
    observer.observe(scene)
    start()
  } catch {
    dispose()
    return
  }

  return {
    configure(next: Quality) {
      if (next === quality) return
      quality = next
      resize()
    },
    dispose,
  }
}
