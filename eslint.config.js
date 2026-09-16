import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Deliberately tiny lint setup: it exists to catch *mistakes*, not style.
 *
 * The two rules that earn their keep here:
 *  - `no-undef` (from the recommended set) catches a missing import - a bare
 *    `THREE.` in a file that never imported three - which otherwise only shows
 *    up as a blank canvas in the browser.
 *  - `react-hooks/rules-of-hooks` catches hooks called conditionally or from
 *    the wrong place, which would break the render loop.
 */
export default [
  {
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Image: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        Uint8Array: 'readonly',
        Float32Array: 'readonly',
        Uint32Array: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // PascalCase names are JSX components: ESLint's `no-unused-vars` cannot
      // see JSX usage without the react plugin, so they would all be false
      // positives. Lowercase leftovers (a real unused import) are still caught.
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^[A-Z]' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
