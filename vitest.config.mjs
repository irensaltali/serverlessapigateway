import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/index.js',
        'src/auth.js',
        'src/common.js',
        'src/cors.js',
        'src/mapping.js',
        'src/path-ops.js',
        'src/powered-by.js',
        'src/requests.js',
        'src/responses.js',
        'src/integrations/auth0.js',
        'src/integrations/supabase-auth.js',
        'src/utils/config.js'
      ],
      exclude: [
        'test/e2e/**'
      ],
      thresholds: {
        lines: 70,
        functions: 90,
        statements: 70,
        branches: 70
      }
    }
  }
});
