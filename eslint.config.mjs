import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import parserTs from '@typescript-eslint/parser';
import stylisticJs from '@stylistic/eslint-plugin-js';

export default tseslint.config({
	languageOptions: {
		parser: parserTs,
		parserOptions: {
			project: ["./tsconfig.json"],
		}
	},
	plugins: {
		"@stylistic/js": stylisticJs
	},
	extends: [
		eslint.configs.recommended,
		...tseslint.configs.recommended,
	],
	rules: {
		"no-constant-condition": "warn",
		"prefer-const": "off",
		"@typescript-eslint/no-unused-vars": "off",
		"@typescript-eslint/no-floating-promises": "error",
		"@stylistic/js/semi": "error",
		"@typescript-eslint/no-explicit-any": "warn",
	}
});
