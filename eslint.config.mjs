// Configuración única de ESLint para todo el monorepo (flat config).
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MONEY_MESSAGE =
  'Prohibido para dinero: la coma flotante pierde precisión. Usa montos como string/Decimal y el Financial Engine (@cf/domain).';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'packages/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts', '*.config.mts', '*.config.mjs', 'eslint.config.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      // Precisión financiera (§10 de las instrucciones): nada de float para montos.
      'no-restricted-globals': ['error', { name: 'parseFloat', message: MONEY_MESSAGE }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: MONEY_MESSAGE },
      ],
    },
  },
  {
    // Fuente única de cálculos (§9, §58): fuera del Financial Engine nadie hace
    // aritmética decimal propia; se usa Money y las funciones de @cf/domain.
    files: ['**/*.{ts,tsx,mts,mjs}'],
    ignores: ['packages/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'decimal.js',
              message:
                'Los cálculos de dinero viven en @cf/domain (Money, convert, computeCashFlow…).',
            },
          ],
          patterns: [
            {
              group: ['@cf/domain/*'],
              message: 'Importa solo desde @cf/domain (su API pública).',
            },
          ],
        },
      ],
    },
  },
  {
    // Archivos JS de configuración y scripts sin tipos.
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Las CLIs escriben en consola por diseño.
    files: [
      'packages/db/src/cli.ts',
      'apps/api/src/scripts/**/*.ts',
      'apps/worker/src/scripts/**/*.ts',
      'e2e/reset-db.mjs',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // Pruebas: se permite acceder a métodos sin enlazar en aserciones.
    files: ['**/*.test.ts', '**/*.int.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
);
