import { App, Notice, TFile } from 'obsidian';
import { ConflictStrategy, ImageCategory } from './types';
import { basenameWithoutExtension, dirname, ensureFolder, getAvailablePath, normalizeVaultPath } from './utils';

export class ImageFileManager {
	constructor(private readonly app: App) {}

	async moveToCategory(file: TFile, category: ImageCategory, strategy: ConflictStrategy, targetBaseName?: string): Promise<TFile | null> {
		const folderPath = normalizeVaultPath(category.folderPath);
		await ensureFolder(this.app.vault, folderPath);
		let targetPath = normalizeVaultPath(`${folderPath}/${this.buildFileName(file, targetBaseName)}`);

		if (targetPath === file.path) {
			return file;
		}

		if (await this.app.vault.adapter.exists(targetPath)) {
			if (strategy === 'rename') {
				targetPath = await getAvailablePath(this.app.vault, targetPath);
			} else if (strategy === 'ask') {
				const shouldOverwrite = window.confirm(`目标文件已存在：${targetPath}\n是否覆盖？选择“取消”将自动添加数字后缀。`);
				if (!shouldOverwrite) {
					targetPath = await getAvailablePath(this.app.vault, targetPath);
				}
			}
		}

		try {
			await this.app.vault.rename(file, targetPath);
			const moved = this.app.vault.getAbstractFileByPath(targetPath);
			return moved instanceof TFile ? moved : null;
		} catch (error) {
			console.error(error);
			new Notice(`移动图片失败：${file.path}`);
			return null;
		}
	}

	async cleanupEmptyFolder(originalPath: string): Promise<void> {
		const folderPath = dirname(originalPath);
		if (!folderPath || folderPath === '.obsidian') {
			return;
		}
		const folder = this.app.vault.getFolderByPath(folderPath);
		if (!folder || folder.children.length > 0) {
			return;
		}
		try {
			await this.app.vault.delete(folder);
		} catch (error) {
			console.error(error);
		}
	}

	private buildFileName(file: TFile, targetBaseName?: string): string {
		const safeBaseName = (targetBaseName?.trim() || basenameWithoutExtension(file.path)).replace(/[\\/:*?"<>|]/g, '-');
		return `${safeBaseName}.${file.extension}`;
	}
}
