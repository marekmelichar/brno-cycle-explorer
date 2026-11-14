import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // bundle the workspace packages (TypeScript sources); keep npm deps external
  noExternal: [/^@bce\//],
});
