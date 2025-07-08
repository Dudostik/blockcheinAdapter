class XVGLogger {
  // 1. Создание адреса
  static logAddressCreate() {
    console.log('[XVG][WARNING] Rate limit exceeded for node: https://xvg.nownodes.io');
    console.log('[XVG][ERROR] Request throttled:');
    console.log('  - Current requests: 42/10 (per second)');
    console.log('  - Retry after: 15 seconds');
    console.log('  - Suggested action: Implement request queue or backoff');
    console.log('[XVG][DEBUG] Stack trace:');
    console.log('  at NodeAdapter.request (src/libs/node-adapter.ts:127:15)');
    console.log('  at processTicksAndRejections (node:internal/process/task_queues:96:5)');
  }
}

// Демонстрация всех логов
console.log('=== 1. Address Creation ===');
XVGLogger.logAddressCreate();