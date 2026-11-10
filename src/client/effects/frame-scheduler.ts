type Clock = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout' | 'performance'>
type FrameTask = (deltaSeconds: number) => void
interface FrameMonitor {
  sample(intervalMs: number, workMs: number): void
  resetSamples(): void
}

/** A single demand-driven clock for the window's JS renderers. */
export function createFrameScheduler(clock: Clock) {
  const tasks = new Set<FrameTask>()
  let frame: number | undefined
  let timer: number | undefined
  let previous: number | undefined
  let paused = false
  let fps = 30
  let monitor: FrameMonitor | undefined
  let cssAnimating = false

  function hasWork() { return tasks.size > 0 || (cssAnimating && monitor !== undefined) }

  function stop() {
    if (frame !== undefined) clock.cancelAnimationFrame(frame)
    if (timer !== undefined) clock.clearTimeout(timer)
    frame = timer = previous = undefined
    monitor?.resetSamples()
  }

  function schedule() {
    if (paused || !hasWork() || frame !== undefined || timer !== undefined) return
    const wait = previous === undefined ? 0 : previous + 1000 / fps - clock.performance.now() - 8
    if (wait > 1) {
      timer = clock.setTimeout(() => { timer = undefined; schedule() }, wait)
    } else {
      frame = clock.requestAnimationFrame(tick)
    }
  }

  function tick(timestamp: number) {
    frame = undefined
    if (paused || !hasWork()) return
    const interval = previous === undefined ? 0 : timestamp - previous
    if (previous === undefined || interval + 0.5 >= 1000 / fps) {
      const delta = Math.min(interval / 1000, 0.05)
      const sample = interval > 0 ? monitor : undefined
      const started = sample ? clock.performance.now() : 0
      previous = timestamp
      for (const task of tasks) task(delta)
      if (sample && hasWork() && !paused && previous === timestamp) {
        sample.sample(interval, clock.performance.now() - started)
      }
    }
    schedule()
  }

  return {
    observe(next: FrameMonitor | undefined) {
      monitor = next
      if (!hasWork()) stop()
      else schedule()
    },
    trackCss(next: boolean) {
      if (cssAnimating === next) return
      cssAnimating = next
      if (!hasWork()) stop()
      else schedule()
    },
    configure(nextFps: number, nextPaused: boolean) {
      if (fps === nextFps && paused === nextPaused) return
      fps = nextFps
      paused = nextPaused
      stop()
      schedule()
    },
    add(task: FrameTask) {
      tasks.add(task)
      schedule()
      return () => {
        tasks.delete(task)
        if (!hasWork()) stop()
      }
    },
  }
}
