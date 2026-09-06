import { defineConfig } from 'vitest/config';

// Fast rules/controller tests run without a browser or WebGL context. Browser
// integration is Playwright's responsibility, so its specs are excluded here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/**/*.d.ts', 'src/testing/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        // Rendering and DOM orchestration are exercised mainly in the browser.
        // Apply stricter unit floors to state, combat and world logic separately.
        statements: 50, branches: 50, functions: 45, lines: 55,
        'src/{arcade,bonus,canyon,encounters}.ts': { lines: 90, branches: 85, functions: 60 },
        'src/{modes,invaders,smuggler,scores}.ts': { lines: 95, branches: 85, functions: 95 },
        'src/combat/*.ts': { lines: 85, branches: 75, functions: 80 },
        'src/world/*.ts': { lines: 90, branches: 75, functions: 90 }
      }
    }
  }
});
