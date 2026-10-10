"use client"

// Earth sphere adapted from the supplied 21st.dev shader component
// ("Waves"). Zero dependencies: one WebGL canvas that fills its
// parent. Drop it behind your content with
// <div className="relative"><ShaderBackground className="absolute inset-0" />…


import { useEffect, useRef } from "react"

const VERT = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
uniform vec4 u_scene;
uniform vec4 u_space;
uniform vec4 u_cursor;
uniform sampler2D u_earth;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_scene.xy) / min(u_scene.x, u_scene.y);
  float radius = length(p) * 2.04;
  if (radius >= 1.0) discard;
  vec3 normal = vec3(p * 2.04, sqrt(1.0 - radius * radius));
  float yaw = u_scene.z * 0.07 + u_space.z * u_cursor.x * 0.2;
  float pitch = u_space.w * u_cursor.x * 0.12;
  vec3 rotated = vec3(normal.x * cos(yaw) + normal.z * sin(yaw), normal.y, normal.z * cos(yaw) - normal.x * sin(yaw));
  rotated = vec3(rotated.x, rotated.y * cos(pitch) - rotated.z * sin(pitch), rotated.y * sin(pitch) + rotated.z * cos(pitch));
  vec2 uv = vec2(fract(atan(rotated.z, rotated.x) / 6.283185 + 0.37), 0.5 - asin(clamp(rotated.y, -1.0, 1.0)) / 3.141593);
  vec3 surface = texture2D(u_earth, uv).rgb;
  float light = 0.32 + 0.85 * max(dot(normal, normalize(vec3(-0.5, 0.7, 1.0))), 0.0);
  float atmosphere = pow(1.0 - normal.z, 3.2);
  vec3 color = surface * light + vec3(0.14, 0.39, 0.50) * atmosphere * 0.6;
  gl_FragColor = vec4(color, 1.0 - smoothstep(0.985, 1.0, radius));
}
`
const UNIFORMS = {
  colors: [[0.06274509803921569,0.06274509803921569,0.06274509803921569],[0.9607843137254902,0.9607843137254902,0.9607843137254902],[0.6901960784313725,0.6901960784313725,0.6901960784313725],[0.22745098039215686,0.22745098039215686,0.22745098039215686],[0.22745098039215686,0.22745098039215686,0.22745098039215686],[0.22745098039215686,0.22745098039215686,0.22745098039215686],[0.22745098039215686,0.22745098039215686,0.22745098039215686],[0.22745098039215686,0.22745098039215686,0.22745098039215686]] as [number, number, number][],
  colorCount: 4,
  scale: 2.500,
  intensity: 0.600,
  paramA: 0.500,
  warp: 0.396,
  detail: 2.336,
  contrast: 0.807,
  brightness: 0.000,
  saturation: 1.000,
  hue: 0.0000,
  vignette: 0.000,
  blur: 0.0000,
  grain: 0.000,
  seed: 635.0,
  rotate: 0.0000,
  offsetX: 0.000,
  offsetY: 0.000,
  drift: 0.000,
  cursorEnabled: true,
  cursorEffect: 2.0,
  cursorStrength: 0.650,
  cursorRadius: 0.460,
  oklab: 0.0,
  timeScale: 0.35,
}

const pendingContextReleases = new WeakMap<HTMLCanvasElement, number>()

export function ShaderBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pendingRelease = pendingContextReleases.get(canvas)
    if (pendingRelease !== undefined) window.clearTimeout(pendingRelease)
    pendingContextReleases.delete(canvas)
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s)
        return null
      }
      return s
    }
    const program = gl.createProgram()!
    const vertexShader = compile(gl.VERTEX_SHADER, VERT)
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      gl.deleteProgram(program)
      return
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    const loc = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uni = {
      colors: gl.getUniformLocation(program, "u_colors"),
      scene: gl.getUniformLocation(program, "u_scene"),
      shape: gl.getUniformLocation(program, "u_shape"),
      surface: gl.getUniformLocation(program, "u_surface"),
      finish: gl.getUniformLocation(program, "u_finish"),
      transform: gl.getUniformLocation(program, "u_transform"),
      space: gl.getUniformLocation(program, "u_space"),
      cursor: gl.getUniformLocation(program, "u_cursor"),
    }
    gl.uniform3fv(uni.colors, new Float32Array([
      [0.208, 0.098, 0.012], [0.573, 0.369, 0.024], [0.82, 0.49, 0.16], [0.929, 0.89, 0.514],
      [0.208, 0.098, 0.012], [0.208, 0.098, 0.012], [0.208, 0.098, 0.012], [0.208, 0.098, 0.012],
    ].flat()))
    gl.uniform4f(
      uni.shape,
      UNIFORMS.scale,
      UNIFORMS.intensity,
      UNIFORMS.paramA,
      UNIFORMS.warp,
    )
    gl.uniform4f(
      uni.surface,
      UNIFORMS.detail,
      UNIFORMS.contrast,
      UNIFORMS.brightness,
      UNIFORMS.saturation,
    )
    gl.uniform4f(
      uni.finish,
      UNIFORMS.hue,
      UNIFORMS.vignette,
      UNIFORMS.blur,
      UNIFORMS.grain,
    )
    gl.uniform4f(
      uni.transform,
      UNIFORMS.seed,
      UNIFORMS.rotate,
      UNIFORMS.drift,
      UNIFORMS.oklab,
    )
    gl.uniform4f(
      uni.cursor,
      0,
      UNIFORMS.cursorEffect,
      UNIFORMS.cursorStrength,
      UNIFORMS.cursorRadius,
    )

    let targetX = 0
    let targetY = 0
    let targetPresence = 0
    let mouseX = 0
    let mouseY = 0
    let cursorPresence = 0
    let pointerKnown = false
    let pointerClientX = 0
    let pointerClientY = 0
    let bounds = canvas.getBoundingClientRect()
    let raf = 0
    let lastNow: number | null = null
    let visible = document.visibilityState === "visible"
    let inView = true
    let disposed = false
    const earthTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, earthTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 68, 73, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(gl.getUniformLocation(program, "u_earth"), 0)
    const earthImage = new Image()
    earthImage.onload = () => {
      if (disposed) return
      gl.bindTexture(gl.TEXTURE_2D, earthTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, earthImage)
      requestRender()
    }
    earthImage.src = "/earth/surface.jpg"
    const start = performance.now()
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const scene = canvas.closest<HTMLElement>("section")

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr))
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr))
      const pixelScale = Math.min(
        1,
        Math.sqrt(450_000 / Math.max(1, rawWidth * rawHeight)),
      )
      const width = Math.max(1, Math.round(rawWidth * pixelScale))
      const height = Math.max(1, Math.round(rawHeight * pixelScale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    function requestRender() {
      if (!disposed && visible && inView && !scene?.inert && raf === 0) {
        raf = requestAnimationFrame(render)
      }
    }

    const updatePointerTarget = () => {
      if (!pointerKnown) return
      if (bounds.width === 0 || bounds.height === 0) return
      const inside =
        pointerClientX >= bounds.left &&
        pointerClientX <= bounds.right &&
        pointerClientY >= bounds.top &&
        pointerClientY <= bounds.bottom
      if (!inside) {
        targetPresence = 0
        requestRender()
        return
      }
      const nextX = ((pointerClientX - bounds.left) / bounds.width) * 2 - 1
      const nextY = -(((pointerClientY - bounds.top) / bounds.height) * 2 - 1)
      if (targetPresence === 0 && cursorPresence < 0.01) {
        mouseX = nextX
        mouseY = nextY
      }
      targetX = nextX
      targetY = nextY
      targetPresence = 1
      requestRender()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (motion.matches || event.pointerType !== "mouse") return
      pointerKnown = true
      pointerClientX = event.clientX
      pointerClientY = event.clientY
      bounds = canvas.getBoundingClientRect()
      updatePointerTarget()
    }
    const onPointerLeave = () => {
      pointerKnown = false
      targetPresence = 0
      requestRender()
    }
    const updateLayout = () => {
      bounds = canvas.getBoundingClientRect()
      resizeCanvas()
      updatePointerTarget()
      requestRender()
    }
    window.addEventListener("resize", updateLayout)
    if (UNIFORMS.cursorEnabled) {
      window.addEventListener("pointermove", onPointerMove, { passive: true })
      window.addEventListener("pointercancel", onPointerLeave)
      window.addEventListener("scroll", updateLayout, true)
      window.addEventListener("blur", onPointerLeave)
      document.documentElement.addEventListener("pointerleave", onPointerLeave)
    }

    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(canvas)
    const sceneObserver = new MutationObserver(() => {
      if (scene?.inert) { cancelAnimationFrame(raf); raf = 0; lastNow = null; targetPresence = 0 }
      else requestRender()
    })
    if (scene) sceneObserver.observe(scene, { attributes: true, attributeFilter: ["inert"] })
    motion.addEventListener("change", requestRender)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true
      if (inView) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
        lastNow = null
      }
    })
    intersectionObserver.observe(canvas)
    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible"
      if (visible) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
        lastNow = null
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    function render(now: number) {
      raf = 0
      if (!canvas || !gl || disposed || !visible || !inView || scene?.inert) return
      if (!motion.matches && lastNow !== null && now - lastNow < 32) { requestRender(); return }
      const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1)
      lastNow = now
      const follow = 1 - Math.exp(-12 * dt)
      mouseX += (targetX - mouseX) * follow
      mouseY += (targetY - mouseY) * follow
      cursorPresence += (targetPresence - cursorPresence) * follow
      resizeCanvas()
      const width = canvas.width
      const height = canvas.height
      gl.uniform4f(
        uni.scene,
        width,
        height,
        motion.matches ? 0 : ((now - start) / 1000) * UNIFORMS.timeScale,
        UNIFORMS.colorCount,
      )
      gl.uniform4f(
        uni.space,
        UNIFORMS.offsetX,
        UNIFORMS.offsetY,
        mouseX,
        mouseY,
      )
      gl.uniform4f(
        uni.cursor,
        UNIFORMS.cursorEnabled ? cursorPresence : 0,
        UNIFORMS.cursorEffect,
        UNIFORMS.cursorStrength,
        UNIFORMS.cursorRadius,
      )
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const pointerSettling =
        Math.abs(targetX - mouseX) > 0.001 ||
        Math.abs(targetY - mouseY) > 0.001 ||
        Math.abs(targetPresence - cursorPresence) > 0.001
      if (!motion.matches && (Math.abs(UNIFORMS.timeScale) > 0.0001 || pointerSettling)) requestRender()
      else lastNow = null
    }
    requestRender()
    return () => {
      disposed = true
      earthImage.onload = null
      gl.deleteTexture(earthTexture)
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      sceneObserver.disconnect()
      motion.removeEventListener("change", requestRender)
      intersectionObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("resize", updateLayout)
      if (UNIFORMS.cursorEnabled) {
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointercancel", onPointerLeave)
        window.removeEventListener("scroll", updateLayout, true)
        window.removeEventListener("blur", onPointerLeave)
        document.documentElement.removeEventListener(
          "pointerleave",
          onPointerLeave,
        )
      }
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      const releaseTimer = window.setTimeout(() => {
        if (pendingContextReleases.get(canvas) !== releaseTimer) return
        pendingContextReleases.delete(canvas)
        gl.getExtension("WEBGL_lose_context")?.loseContext()
        canvas.width = 1
        canvas.height = 1
      }, 0)
      pendingContextReleases.set(canvas, releaseTimer)
    }
  }, [])

  return (
    <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: "block", width: "100%", height: "100%" }} />
  )
}
