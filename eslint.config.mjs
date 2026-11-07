import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        ignores: [
            'main.js',
            'node_modules/**',
            'tests/**',
            'vitest.config.ts',
            'scripts/native-smoke-test.mjs',
        ],
    },
    ...obsidianmd.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: './tsconfig.json',
            },
            globals: {
                Buffer: 'readonly',
            },
        },
        rules: {
            'obsidianmd/ui/sentence-case': ['warn', {
                acronyms: ['OS', 'PDF', 'URL', 'H1-H6'],
                brands: ['DuckDuckGo', 'GitHub', 'Google', 'Icon Horse', 'Links with Icons', 'Lucide', 'Markdown'],
            }],
        },
    },
    {
        files: ['esbuild.config.mjs', 'scripts/**/*.mjs'],
        rules: {
            'no-console': 'off',
            'obsidianmd/no-nodejs-modules': 'off',
            'obsidianmd/rule-custom-message': 'off',
        },
    },
]);
