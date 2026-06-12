import { normalizePath, TAbstractFile, TFile, Vault } from 'obsidian';
import { ImageCategory } from './types';

export function normalizeVaultPath(path: string): string {
	return normalizePath(path.trim().replace(/^\/+/, ''));
}

export function getExtension(path: string): string {
	const name = path.split('/').pop() ?? path;
	const index = name.lastIndexOf('.');
	return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function isImagePath(path: string, extensions: string[]): boolean {
	return extensions.map((ext) => ext.toLowerCase().replace(/^\./, '')).includes(getExtension(path));
}

export function basename(path: string): string {
	return path.split('/').pop() ?? path;
}

export function basenameWithoutExtension(path: string): string {
	const name = basename(path);
	const index = name.lastIndexOf('.');
	return index > 0 ? name.slice(0, index) : name;
}

export function dirname(path: string): string {
	const normalized = normalizeVaultPath(path);
	const index = normalized.lastIndexOf('/');
	return index >= 0 ? normalized.slice(0, index) : '';
}

export function stripTrailingSlash(path: string): string {
	return normalizeVaultPath(path).replace(/\/$/, '');
}

export function pathInFolder(path: string, folderPath: string): boolean {
	const folder = stripTrailingSlash(folderPath);
	const normalized = normalizeVaultPath(path);
	return normalized === folder || normalized.startsWith(`${folder}/`);
}

export function categoryForPath(path: string, categories: ImageCategory[]): ImageCategory | null {
	const matches = categories
		.filter((category) => pathInFolder(path, category.folderPath))
		.sort((a, b) => b.folderPath.length - a.folderPath.length);
	return matches[0] ?? null;
}

export async function ensureFolder(vault: Vault, folderPath: string): Promise<void> {
	const normalized = stripTrailingSlash(folderPath);
	if (!normalized) {
		return;
	}

	const parts = normalized.split('/');
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!(await vault.adapter.exists(current))) {
			await vault.adapter.mkdir(current);
		}
	}
}

export async function ensureParentFolder(vault: Vault, filePath: string): Promise<void> {
	await ensureFolder(vault, dirname(filePath));
}

export async function getAvailablePath(vault: Vault, desiredPath: string): Promise<string> {
	const normalized = normalizeVaultPath(desiredPath);
	if (!(await vault.adapter.exists(normalized))) {
		return normalized;
	}

	const dir = dirname(normalized);
	const name = basename(normalized);
	const dotIndex = name.lastIndexOf('.');
	const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
	const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
	let index = 1;
	while (true) {
		const candidate = normalizeVaultPath(`${dir}/${stem}_${index}${ext}`);
		if (!(await vault.adapter.exists(candidate))) {
			return candidate;
		}
		index += 1;
	}
}

export function parseKeywords(value: string): string[] {
	return value
		.split(/[，,\n]/)
		.map((item) => item.trim())
		.filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
}

export function metadataPathInFolder(folderPath: string): string {
	return normalizeVaultPath(`${stripTrailingSlash(folderPath)}/image_metadata.json`);
}

export function abstractFileToTFile(file: TAbstractFile | null): TFile | null {
	return file instanceof TFile ? file : null;
}
