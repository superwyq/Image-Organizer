import { Notice, Vault } from 'obsidian';
import { CategorizedEntry, DATABASE_INDEX_PATH, DatabaseIndexMetadata, ImageCategory, MetadataEntry, MetadataStore } from './types';
import { ensureParentFolder, normalizeVaultPath } from './utils';

export class ClassificationDB {
	constructor(private readonly vault: Vault) {}

	async load(category: ImageCategory): Promise<MetadataStore> {
		const path = normalizeVaultPath(category.metadataPath);
		if (!(await this.vault.adapter.exists(path))) {
			return {};
		}

		try {
			const raw = await this.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as MetadataStore;
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (error) {
			console.error(error);
			new Notice(`无法读取元数据文件：${path}`);
			return {};
		}
	}

	async save(category: ImageCategory, store: MetadataStore): Promise<void> {
		const path = normalizeVaultPath(category.metadataPath);
		await ensureParentFolder(this.vault, path);
		if (await this.vault.adapter.exists(path)) {
			const raw = await this.vault.adapter.read(path);
			await this.vault.adapter.write(`${path}.bak`, raw);
		}
		await this.vault.adapter.write(path, `${JSON.stringify(store, null, '\t')}\n`);
	}

	async get(category: ImageCategory, path: string): Promise<MetadataEntry | null> {
		const store = await this.load(category);
		return store[normalizeVaultPath(path)] ?? null;
	}

	async upsert(category: ImageCategory, path: string, entry: MetadataEntry): Promise<void> {
		const store = await this.load(category);
		store[normalizeVaultPath(path)] = entry;
		await this.save(category, store);
	}

	async remove(category: ImageCategory, path: string): Promise<MetadataEntry | null> {
		const store = await this.load(category);
		const normalized = normalizeVaultPath(path);
		const entry = store[normalized] ?? null;
		if (entry) {
			delete store[normalized];
			await this.save(category, store);
		}
		return entry;
	}

	async renameKey(category: ImageCategory, oldPath: string, newPath: string): Promise<void> {
		const store = await this.load(category);
		const oldNormalized = normalizeVaultPath(oldPath);
		const entry = store[oldNormalized];
		if (!entry) {
			return;
		}
		delete store[oldNormalized];
		store[normalizeVaultPath(newPath)] = {
			...entry,
			lastModified: new Date().toISOString(),
		};
		await this.save(category, store);
	}

	async moveEntry(source: ImageCategory, target: ImageCategory, oldPath: string, newPath: string): Promise<MetadataEntry | null> {
		const entry = await this.remove(source, oldPath);
		if (!entry) {
			return null;
		}
		const moved = {
			...entry,
			lastModified: new Date().toISOString(),
		};
		await this.upsert(target, newPath, moved);
		return moved;
	}

	async findByPath(categories: ImageCategory[], path: string): Promise<{ category: ImageCategory; entry: MetadataEntry } | null> {
		const normalized = normalizeVaultPath(path);
		for (const category of categories) {
			const store = await this.load(category);
			const entry = store[normalized];
			if (entry) {
				return { category, entry };
			}
		}
		return null;
	}

	async allEntries(categories: ImageCategory[]): Promise<CategorizedEntry[]> {
		const result: CategorizedEntry[] = [];
		for (const category of categories) {
			const store = await this.load(category);
			for (const [path, entry] of Object.entries(store)) {
				result.push({ category, path, entry });
			}
		}
		return result;
	}

	async saveDatabaseIndex(categories: ImageCategory[]): Promise<void> {
		const entries = await this.allEntries(categories);
		const keywords = [...new Set(entries.flatMap((item) => item.entry.keywords))].sort((a, b) => a.localeCompare(b));
		const metadata: DatabaseIndexMetadata = {
			lastUpdated: new Date().toISOString(),
			categories: categories.map((category) => ({
				name: category.name,
				folderPath: category.folderPath,
				metadataPath: category.metadataPath,
				isDefault: category.isDefault === true,
				imageCount: entries.filter((item) => item.category.name === category.name).length,
			})),
			keywords,
		};
		await ensureParentFolder(this.vault, DATABASE_INDEX_PATH);
		await this.vault.adapter.write(DATABASE_INDEX_PATH, `${JSON.stringify(metadata, null, '\t')}\n`);
	}
}
