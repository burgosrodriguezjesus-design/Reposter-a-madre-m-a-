import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * Indicador de carga de esta instancia (retardo del bucle de eventos de Node).
 * Se usa para endurecer los límites de peticiones y descartar tráfico no esencial
 * cuando la instancia está saturada, en lugar de caerse.
 */
const globalForLoad = globalThis as unknown as { eld?: ReturnType<typeof monitorEventLoopDelay>; eldReset?: number };

function histogram() {
  if (!globalForLoad.eld) {
    globalForLoad.eld = monitorEventLoopDelay({ resolution: 20 });
    globalForLoad.eld.enable();
    globalForLoad.eldReset = Date.now();
  }
  // Ventana de unos 10 s
  if (Date.now() - (globalForLoad.eldReset ?? 0) > 10_000) {
    globalForLoad.eld.reset();
    globalForLoad.eldReset = Date.now();
  }
  return globalForLoad.eld;
}

/** p99 del retardo del bucle de eventos en milisegundos. */
export function eventLoopDelayMs(): number {
  const h = histogram();
  return h.count > 0 ? h.percentile(99) / 1e6 : 0;
}

/** Factor (0-1] que multiplica los límites de peticiones según la carga. */
export function loadFactor(): number {
  const d = eventLoopDelayMs();
  if (d > 500) return 0.25;
  if (d > 200) return 0.5;
  return 1;
}

/** Saturación severa: se responde 503 a lo no esencial para proteger pedidos y pagos. */
export function shouldShedLoad(): boolean {
  return eventLoopDelayMs() > Number(process.env.LOAD_SHED_DELAY_MS ?? 1000);
}
