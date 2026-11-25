// Bind mounts on Windows/macOS do not deliver file events to the container,
// so the dev container sets VITE_USE_POLLING=true.
export function watchOptions(env = process.env) {
  return env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined
}
