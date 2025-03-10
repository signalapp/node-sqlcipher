// @ts-check
import prettier from 'eslint-config-prettier';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'docs/**', 'deps/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      prettier,
    },
    rules: {
      'no-restricted-syntax': 'off',
      'no-continue': 'off',
      'class-methods-use-this': 'off',
      'no-bitwise': 'error',
      'no-plusplus': 'error',
      yoda: 'off',
    },
  },
);
