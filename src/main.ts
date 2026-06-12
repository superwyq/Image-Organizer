import { Editor, EditorPosition, MarkdownFileInfo, MarkdownView, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder } from 'obsidian';
import { registerCommands } from './commands';
import { ClassificationDB } from './db';
import { ImageFileManager } from './file-manager';
import { BatchIndexModal, CategorySuggestModal, ImageInsertModal, MetadataModal } from './modals';
import { DEFAULT_CATEGORY, DEFAULT_SETTINGS, ImageMetadataSettingTab, normalizeSettings } from './settings';
import { DEFAULT_CATEGORY_NAME, ImageCategory, ImageMetadataSettings, MetadataEntry, MetadataFormResult, VIEW_TYPE_IMAGE_METADATA } from './types';
import { categoryForPath, isImagePath, normalizeVaultPath, pathInFolder } from './utils';
import { ImageMetadataView } from './view';

export default class ImageMetadataPlugin extends Plugin {
	settings!: ImageMetadataSettings;
	db!: ClassificationDB;
	private fileManager!: ImageFileManager;
	private movingPaths = new Set<string>();
	private lastEditorContext: { editor: Editor; filePath: string; cursor: EditorPosition } | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.db = new ClassificationDB(this.app.vault);
		this.fileManager = new ImageFileManager(this.app);

		this.registerView(VIEW_TYPE_IMAGE_METADATA, (leaf) => new ImageMetadataView(leaf, this));
		this.addRibbonIcon('image', '图片元数据管理器', () => {
			void this.activateView();
		});
		registerCommands(this);
		this.addSettingTab(new ImageMetadataSettingTab(this.app, this));
		this.registerVaultEvents();
		this.registerFileMenu();
		this.registerEditorTracking();
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_IMAGE_METADATA);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ImageMetadataSettings>) });
	}

	async saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		await this.saveData(this.settings);
		await this.updateDatabaseIndex();
		await this.refreshViews();
	}

	async activateView(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_IMAGE_METADATA);
		let leaf = leaves[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
			if (!leaf) {
				return;
			}
			await leaf.setViewState({ type: VIEW_TYPE_IMAGE_METADATA, active: true });
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	async processImage(file: TFile, forcePrompt = false): Promise<void> {
		if (!isImagePath(file.path, this.settings.imageExtensions)) {
			return;
		}
		const existing = await this.db.findByPath(this.settings.categories, file.path);
		if (existing && !window.confirm('该图片已有元数据，是否更新现有记录？')) {
			return;
		}

		const chooseCategory = (category: ImageCategory): void => {
			void this.openMetadataModal(file, category, existing?.entry);
		};

		if (forcePrompt || this.settings.forceCategorySelection) {
			new CategorySuggestModal(this.app, this.settings.categories, chooseCategory).open();
			return;
		}

		const defaultCategory = this.getDefaultCategory();
		await this.saveMetadataAndMove(file, defaultCategory, {
			fileName: file.basename,
			description: '',
			keywords: [],
			customFields: {},
		}, existing?.entry);
	}

	async editImageMetadata(file: TFile): Promise<void> {
		const found = await this.db.findByPath(this.settings.categories, file.path);
		const category = found?.category ?? categoryForPath(file.path, this.settings.categories) ?? this.getDefaultCategory();
		await this.openMetadataModal(file, category, found?.entry);
	}

	async moveImageToCategory(file: TFile): Promise<void> {
		const source = await this.db.findByPath(this.settings.categories, file.path);
		new CategorySuggestModal(this.app, this.settings.categories, async (target) => {
			if (source?.category.name === target.name && pathInFolder(file.path, target.folderPath)) {
				new Notice('图片已经在该分类中。');
				return;
			}
			await this.moveImageFileToCategory(file, target, source?.entry?.fileName);
			new Notice('图片已移动到目标分类。');
		}, '选择目标分类').open();
	}

	async moveImagesToCategory(paths: string[], target: ImageCategory): Promise<void> {
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				const source = await this.db.findByPath(this.settings.categories, file.path);
				await this.moveImageFileToCategory(file, target, source?.entry?.fileName);
			}
		}
		new Notice(`已移动 ${paths.length} 张图片。`);
	}

	async deleteImageAndMetadata(category: ImageCategory, path: string): Promise<void> {
		await this.db.remove(category, path);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file) {
			await this.app.vault.delete(file);
		}
		this.movingPaths.delete(path);
		await this.updateDatabaseIndex();
		await this.refreshViews();
	}

	async insertImageLink(path: string): Promise<void> {
		const context = this.getInsertContext();
		if (!context) {
			new Notice('未找到可插入图片的 Markdown 编辑区域。请先在目标笔记中点击插入位置。');
			throw new Error('No cached Markdown editor');
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice('图片文件不存在，无法插入。');
			throw new Error('Image file not found');
		}
		ImageInsertModal.forFile(this.app, file, (html) => {
			this.insertHtmlAtContext(context, html);
		}).open();
	}

	private getInsertContext(): { editor: Editor; filePath: string; cursor: EditorPosition } | null {
		const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeMarkdownView) {
			return {
				editor: activeMarkdownView.editor,
				filePath: activeMarkdownView.file?.path ?? '',
				cursor: activeMarkdownView.editor.getCursor(),
			};
		}
		return this.lastEditorContext;
	}

	private insertHtmlAtContext(context: { editor: Editor; filePath: string; cursor: EditorPosition }, html: string): void {
		if (!html.trim()) {
			new Notice('插入内容为空。');
			return;
		}
		context.editor.replaceRange(html, context.cursor);
		context.editor.setCursor({ line: context.cursor.line, ch: context.cursor.ch + html.length });
		this.lastEditorContext = {
			editor: context.editor,
			filePath: context.filePath,
			cursor: { line: context.cursor.line, ch: context.cursor.ch + html.length },
		};
		new Notice('图片 HTML 已插入到最近的 Markdown 光标位置。');
	}

	async addCategory(category: ImageCategory): Promise<void> {
		this.settings.categories.push({
			...category,
			folderPath: normalizeVaultPath(category.folderPath),
			metadataPath: normalizeVaultPath(category.metadataPath),
		});
		await this.saveSettings();
	}

	async updateCategory(oldName: string, updated: ImageCategory): Promise<void> {
		const current = this.settings.categories.find((category) => category.name === oldName);
		if (!current) {
			return;
		}
		const next = {
			...updated,
			name: current.isDefault ? DEFAULT_CATEGORY_NAME : updated.name,
			folderPath: normalizeVaultPath(updated.folderPath),
			metadataPath: normalizeVaultPath(updated.metadataPath),
			isDefault: current.isDefault,
		};
		const store = await this.db.load(current);
		const migratedStore: Record<string, MetadataEntry> = {};
		for (const [path, entry] of Object.entries(store)) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile && current.folderPath !== next.folderPath) {
				const moved = await this.moveFile(file, next);
				if (moved) {
					migratedStore[moved.path] = { ...entry, lastModified: new Date().toISOString() };
				}
			} else {
				migratedStore[path] = entry;
			}
		}
		await this.db.save(next, migratedStore);
		if (current.metadataPath !== next.metadataPath) {
			await this.db.save(current, {});
		}
		this.settings.categories = this.settings.categories.map((category) => category.name === oldName ? next : category);
		await this.saveSettings();
	}

	async deleteCategory(name: string, mode: 'default' | 'metadata' | 'files'): Promise<void> {
		const category = this.settings.categories.find((item) => item.name === name);
		if (!category || category.isDefault) {
			new Notice('默认分类不可删除。');
			return;
		}
		const store = await this.db.load(category);
		if (mode === 'default') {
			const defaultCategory = this.getDefaultCategory();
			for (const [path, entry] of Object.entries(store)) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const moved = await this.moveFile(file, defaultCategory);
					if (moved) {
						await this.db.upsert(defaultCategory, moved.path, { ...entry, lastModified: new Date().toISOString() });
					}
				}
			}
		} else if (mode === 'files') {
			if (!window.confirm('确认删除该分类下所有图片？此操作不可撤销。')) {
				return;
			}
			for (const path of Object.keys(store)) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					await this.app.vault.delete(file);
				}
			}
		}
		await this.db.save(category, {});
		this.settings.categories = this.settings.categories.filter((item) => item.name !== name);
		await this.saveSettings();
	}

	private registerEditorTracking(): void {
		this.registerEvent(this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
			const filePath = info.file?.path ?? '';
			this.lastEditorContext = {
				editor,
				filePath,
				cursor: editor.getCursor(),
			};
		}));

		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.captureActiveEditorContext();
		}));
		this.registerDomEvent(activeDocument, 'mouseup', () => this.captureActiveEditorContext());
		this.registerDomEvent(activeDocument, 'keyup', () => this.captureActiveEditorContext());
	}

	private captureActiveEditorContext(): void {
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			return;
		}
		this.lastEditorContext = {
			editor: markdownView.editor,
			filePath: markdownView.file?.path ?? '',
			cursor: markdownView.editor.getCursor(),
		};
	}

	private registerFileMenu(): void {
		this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
			if (!(file instanceof TFolder)) {
				return;
			}
			menu.addItem((item) => {
				item
					.setTitle('建立图片索引')
					.setIcon('image-plus')
					.onClick(() => {
						void this.openBatchIndexModal(file);
					});
			});
		}));
	}

	private registerVaultEvents(): void {
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && isImagePath(file.path, this.settings.imageExtensions) && !this.movingPaths.has(file.path)) {
				void this.processImage(file);
			}
		}));

		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && isImagePath(file.path, this.settings.imageExtensions)) {
				void this.handleRename(file, oldPath);
			}
		}));

		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && isImagePath(file.path, this.settings.imageExtensions)) {
				void this.handleDelete(file);
			}
		}));
	}

	private async openBatchIndexModal(folder: TFolder): Promise<void> {
		const managed = new Set((await this.db.allEntries(this.settings.categories)).map((entry) => entry.path));
		const folderPrefix = folder.path ? `${folder.path}/` : '';
		const files = this.app.vault.getFiles().filter((file) => file.path.startsWith(folderPrefix) && isImagePath(file.path, this.settings.imageExtensions) && !managed.has(file.path));
		if (files.length === 0) {
			new Notice('当前文件夹下没有未索引图片。');
			return;
		}
		new BatchIndexModal(this.app, files, this.settings.categories, (result) => {
			void this.batchIndexImages(result);
		}).open();
	}

	private async batchIndexImages(result: import('./types').BatchIndexResult): Promise<void> {
		for (const item of result.files) {
			await this.saveMetadataAndMove(item.file, result.category, {
				fileName: item.fileName,
				description: result.description,
				keywords: result.keywords,
				customFields: {},
			});
		}
		new Notice(`已为 ${result.files.length} 张图片建立索引。`);
	}

	private async openMetadataModal(file: TFile, category: ImageCategory, existing?: MetadataEntry): Promise<void> {
		new MetadataModal(this.app, file, category.name, this.settings.customFields, (result) => {
			void this.saveMetadataAndMove(file, category, result, existing);
		}, existing).open();
	}

	private async saveMetadataAndMove(file: TFile, category: ImageCategory, result: MetadataFormResult, existing?: MetadataEntry): Promise<void> {
		const originalPath = file.path;
		const moved = await this.moveFile(file, category, result.fileName);
		if (!moved) {
			return;
		}
		const source = await this.db.findByPath(this.settings.categories, originalPath);
		if (source && source.category.name !== category.name) {
			await this.db.remove(source.category, originalPath);
		} else if (originalPath !== moved.path) {
			const oldCategory = categoryForPath(originalPath, this.settings.categories) ?? category;
			await this.db.remove(oldCategory, originalPath);
		}
		await this.db.upsert(category, moved.path, this.createEntry(result, existing));
		if (this.settings.cleanupEmptyFolders && originalPath !== moved.path) {
			await this.fileManager.cleanupEmptyFolder(originalPath);
		}
		await this.updateDatabaseIndex();
		await this.refreshViews();
		new Notice('图片元数据已保存。');
	}

	private createEntry(result: MetadataFormResult, existing?: MetadataEntry): MetadataEntry {
		const now = new Date().toISOString();
		return {
			fileName: result.fileName,
			description: result.description,
			keywords: result.keywords,
			dateAdded: existing?.dateAdded ?? now,
			lastModified: now,
			customFields: result.customFields,
		};
	}

	private async moveImageFileToCategory(file: TFile, target: ImageCategory, targetBaseName?: string): Promise<TFile | null> {
		const originalPath = file.path;
		const source = await this.db.findByPath(this.settings.categories, originalPath);
		const moved = await this.moveFile(file, target, targetBaseName);
		if (!moved) {
			return null;
		}
		const entry = source?.entry ?? this.createEntry({ fileName: moved.basename, description: '', keywords: [], customFields: {} }, undefined);
		if (source) {
			await this.db.remove(source.category, originalPath);
		}
		await this.db.upsert(target, moved.path, { ...entry, fileName: targetBaseName ?? entry.fileName, lastModified: new Date().toISOString() });
		await this.updateDatabaseIndex();
		await this.refreshViews();
		return moved;
	}

	private async moveFile(file: TFile, category: ImageCategory, targetBaseName?: string): Promise<TFile | null> {
		this.movingPaths.add(file.path);
		try {
			const moved = await this.fileManager.moveToCategory(file, category, this.settings.conflictStrategy, targetBaseName);
			if (moved) {
				this.movingPaths.add(moved.path);
			}
			return moved;
		} finally {
			window.setTimeout(() => this.movingPaths.clear(), 1000);
		}
	}

	private async handleRename(file: TFile, oldPath: string): Promise<void> {
		if (this.movingPaths.has(oldPath) || this.movingPaths.has(file.path)) {
			return;
		}
		const source = await this.db.findByPath(this.settings.categories, oldPath);
		if (!source) {
			return;
		}
		const targetCategory = categoryForPath(file.path, this.settings.categories) ?? source.category;
		if (targetCategory.name === source.category.name) {
			await this.db.renameKey(source.category, oldPath, file.path);
		} else {
			await this.db.moveEntry(source.category, targetCategory, oldPath, file.path);
		}
		await this.updateDatabaseIndex();
		await this.refreshViews();
	}

	private async handleDelete(file: TAbstractFile): Promise<void> {
		const path = file.path;
		const found = await this.db.findByPath(this.settings.categories, path);
		if (found) {
			await this.db.remove(found.category, path);
			await this.updateDatabaseIndex();
			await this.refreshViews();
		}
	}

	private async updateDatabaseIndex(): Promise<void> {
		await this.db.saveDatabaseIndex(this.settings.categories);
	}

	private getDefaultCategory(): ImageCategory {
		return this.settings.categories.find((item) => item.isDefault) ?? this.settings.categories[0] ?? DEFAULT_CATEGORY;
	}

	private async refreshViews(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_IMAGE_METADATA)) {
			if (leaf.view instanceof ImageMetadataView) {
				await leaf.view.refresh();
			}
		}
	}
}
