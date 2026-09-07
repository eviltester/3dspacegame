import { defineConfig } from 'vitest/config';

// A few adapter checks, kept separate so DOM/game setup cannot inflate unit coverage.
export default defineConfig({
  test: { include: ['tests/integration/**/*.test.ts'], environment: 'happy-dom' }
});
