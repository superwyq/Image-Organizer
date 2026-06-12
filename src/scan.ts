import { App, Notice, TFile } from 'obsidian';
import { ClassificationDB } from './db';
import { ImageCategory, MetadataStore } from './types';
import { isImagePath, pathInFolder } from './utils';

export interface ScanResult {
	missingMetadata: string[];
	missingFiles: string[];
}

export async function rescanConsistency(
	app: App,
	db: ClassificationDB,
	categories: ImageCategory[],
	extensions: string[],
): Promise<ScanResult> {
	const result: ScanResult = { missingMetadata: [], missingFiles: [] };
	for (const category of categories) {
		const store = await db.load(category);
		const changedStore: MetadataStore = { ...store };
		const files = app.vault.getFiles().filter((file) => pathInFolder(file.path, category.folderPath) && isImagePath(file.path, extensions));

		for (const file of files) {
			if (!changedStore[file.path]) {
				result.missingMetadata.push(file.path);
			}
		}

		for (const path of Object.keys(changedStore)) {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				result.missingFiles.push(path);
				delete changedStore[path];
			}
		}

		if (Object.keys(changedStore).length !== Object.keys(store).length) {
			await db.save(category, changedStore);
		}
	}

	new Notice(`一致性扫描完成：缺少元数据 ${result.missingMetadata.length} 个，已清理失效记录 ${result.missingFiles.length} 个。`);
	return result;
}
