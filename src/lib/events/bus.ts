import { EventEmitter } from "events"
import type { CrmEventMap, CrmEventName } from "./types"

class CrmEventBus {
  private emitter = new EventEmitter()

  emit<E extends CrmEventName>(event: E, payload: CrmEventMap[E]): void {
    this.emitter.emit(event, payload)
  }

  on<E extends CrmEventName>(event: E, handler: (payload: CrmEventMap[E]) => void): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void)
  }

  off<E extends CrmEventName>(event: E, handler: (payload: CrmEventMap[E]) => void): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void)
  }

  removeAllListeners(event?: CrmEventName): void {
    this.emitter.removeAllListeners(event)
  }
}

// Singleton - survives hot reload in development
const globalForBus = globalThis as typeof globalThis & { crmBus?: CrmEventBus }
export const crmBus = globalForBus.crmBus ?? new CrmEventBus()
if (process.env.NODE_ENV !== "production") globalForBus.crmBus = crmBus
