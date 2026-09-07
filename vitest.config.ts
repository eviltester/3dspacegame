import { defineConfig } from 'vitest/config';

// Unit tests exercise production rules/controllers without an application instance.
// Adapter wiring has its own config and is not included in unit coverage.
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
        // This global baseline counts ALL source, including uncovered browser
        // coordination. Do not inflate it with integration runs or exclusions.
        // Directly testable rules have their own, much stricter coverage gates.
        statements: 60, branches: 64, functions: 60, lines: 65,
        'src/session/*.ts': { lines: 100, branches: 100, functions: 100 },
        'src/rendering/hud-model.ts': { lines: 100, branches: 90, functions: 100 },
        'src/menus/object-scan.ts': { lines: 100, branches: 100, functions: 100 },
        'src/menus/menu-shell.ts': { lines: 100, branches: 95, functions: 100 },
        'src/flight-motion.ts': { lines: 100, branches: 100, functions: 100 },
        'src/combat/aim.ts': { lines: 100, branches: 100, functions: 100 },
        'src/combat/weapon-fire.ts': { lines: 100, branches: 100, functions: 100 },
        'src/{life-rewards,rendering/player-protection}.ts': { lines: 100, branches: 80, functions: 100 },
        'src/{arcade,bonus,canyon,encounters}.ts': { lines: 90, branches: 85, functions: 60 },
        'src/{modes,invaders,smuggler,scores}.ts': { lines: 95, branches: 85, functions: 95 },
        'src/combat/*.ts': { lines: 85, branches: 75, functions: 80 },
        'src/world/*.ts': { lines: 90, branches: 75, functions: 90 }
      }
    }
  }
});
