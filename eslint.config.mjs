import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated, vendored or build output — never linted.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/api/src/types/**',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // Unused arguments are often deliberate in Express handlers; the
      // leading-underscore convention marks them.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Advisory here rather than blocking: the hits are all the deliberate
      // "read localStorage / fetch once after mount" pattern, which keeps the
      // server and client renders identical. Worth revisiting, not worth
      // failing a build over.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  {
    // Scripts and tests legitimately log and reach for looser types.
    files: [
      '**/tests/**/*.ts',
      '**/*.test.ts',
      'apps/api/prisma/**/*.ts',
      'apps/web/e2e/**/*.ts',
      '**/*.config.{ts,mts,mjs,js}',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
