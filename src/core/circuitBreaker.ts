import type { ProviderName, ProviderHealth, ProviderStatus, CircuitBreakerConfig } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("circuit-breaker");

/**
 * In-memory circuit breaker that tracks provider health
 * and applies cooldown when providers fail repeatedly.
 */
export class CircuitBreaker {
  private health: Map<ProviderName, ProviderHealth> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Check if a provider is currently available for routing.
   */
  isAvailable(provider: ProviderName): boolean {
    const state = this.getHealth(provider);

    if (state.cooldown_until !== null) {
      if (Date.now() < state.cooldown_until) {
        return false;
      }
      // Cooldown expired, reset state
      this.resetProvider(provider);
    }

    return state.status !== "cooldown";
  }

  /**
   * Record a successful request to a provider.
   */
  recordSuccess(provider: ProviderName): void {
    const state = this.getHealth(provider);
    state.success_count++;
    state.fail_count = 0;
    state.last_success = Date.now();
    state.status = "healthy";
    state.last_error = undefined;
    this.health.set(provider, state);

    log.debug({ provider, status: "healthy" }, "Provider success recorded");
  }

  /**
   * Record a failed request to a provider.
   */
  recordFailure(provider: ProviderName, error: string): void {
    const state = this.getHealth(provider);
    state.fail_count++;
    state.last_error = error;

    if (state.fail_count >= this.config.failure_threshold) {
      state.status = "cooldown";
      state.cooldown_until = Date.now() + this.config.cooldown_seconds * 1000;
      log.warn(
        { provider, cooldown_seconds: this.config.cooldown_seconds, fail_count: state.fail_count },
        "Provider entered cooldown"
      );
    } else {
      state.status = "degraded";
      log.debug({ provider, fail_count: state.fail_count }, "Provider failure recorded");
    }

    this.health.set(provider, state);
  }

  /**
   * Get the current health state of a provider.
   */
  getHealth(provider: ProviderName): ProviderHealth {
    if (!this.health.has(provider)) {
      this.health.set(provider, {
        provider,
        status: "healthy",
        fail_count: 0,
        success_count: 0,
        cooldown_until: null,
      });
    }
    return this.health.get(provider)!;
  }

  /**
   * Get health status for all tracked providers.
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get the current status label for a provider.
   */
  getStatus(provider: ProviderName): ProviderStatus {
    const state = this.getHealth(provider);

    if (state.cooldown_until !== null && Date.now() < state.cooldown_until) {
      return "cooldown";
    }

    return state.status;
  }

  /**
   * Reset a provider back to healthy state.
   */
  private resetProvider(provider: ProviderName): void {
    const state = this.getHealth(provider);
    state.status = "healthy";
    state.fail_count = 0;
    state.cooldown_until = null;
    this.health.set(provider, state);
    log.info({ provider }, "Provider cooldown expired, reset to healthy");
  }
}
