import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
        alias: { obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)) },
    },
});
