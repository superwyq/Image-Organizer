import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

const relaxedRules = {
	'no-alert': 'off',
	'@typescript-eslint/no-misused-promises': 'off',
	'obsidianmd/hardcoded-config-path': 'off',
	'obsidianmd/no-unsupported-api': 'off',
	'obsidianmd/detach-leaves': 'off',
	'obsidianmd/settings-tab/no-manual-html-headings': 'off',
	'obsidianmd/ui/sentence-case': 'off',
	'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
	'obsidianmd/prefer-file-manager-trash-file': 'off',
};

export default tseslint.config(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
		rules: relaxedRules,
	},
	...obsidianmd.configs.recommended,
	{
		rules: relaxedRules,
	},
);
