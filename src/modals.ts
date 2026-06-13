import { App, FuzzySuggestModal, Modal, Setting, TFile, TFolder } from 'obsidian';
import { buildImageHtmlForSource, DEFAULT_IMAGE_INSERT_OPTIONS, ImageInsertOptions, getPersistentImageSource } from './insert-format';
import { BatchIndexResult, ImageCategory, MetadataEntry, MetadataFormResult } from './types';
import { basenameWithoutExtension, metadataPathInFolder, parseKeywords } from './utils';

export class CategorySuggestModal extends FuzzySuggestModal<ImageCategory> {
	constructor(
		app: App,
		private readonly categories: ImageCategory[],
		private readonly onChoose: (category: ImageCategory) => void,
		placeholder = '选择图片分类',
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): ImageCategory[] {
		return this.categories;
	}

	getItemText(item: ImageCategory): string {
		return `${item.name} — ${item.folderPath}`;
	}

	onChooseItem(item: ImageCategory): void {
		this.onChoose(item);
	}
}

export class ImageFileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly onChoose: (file: TFile) => void,
		placeholder = '选择图片文件',
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly onChoose: (folder: TFolder) => void,
		placeholder = '选择图片分类文件夹',
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFolder[] {
		return this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
	}

	getItemText(item: TFolder): string {
		return item.path || '/';
	}

	onChooseItem(item: TFolder): void {
		this.onChoose(item);
	}
}

export class TextChoiceModal<T extends string> extends FuzzySuggestModal<T> {
	constructor(
		app: App,
		private readonly choices: T[],
		private readonly labels: Record<T, string>,
		private readonly onChoose: (choice: T) => void,
		placeholder = '选择操作',
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): T[] {
		return this.choices;
	}

	getItemText(item: T): string {
		return this.labels[item];
	}

	onChooseItem(item: T): void {
		this.onChoose(item);
	}
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly confirmText: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', { text: this.message });
		new Setting(contentEl)
			.addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
			.addButton((button) => button.setButtonText(this.confirmText).setWarning().onClick(() => {
				this.onConfirm();
				this.close();
			}));
	}
}

export class CategoryEditModal extends Modal {
	private name: string;
	private folderPath: string;
	private metadataPath: string;
	private metadataCustomized: boolean;

	constructor(
		app: App,
		private readonly title: string,
		private readonly onSubmit: (category: ImageCategory) => void,
		private readonly existing?: ImageCategory,
	) {
		super(app);
		this.name = existing?.name ?? '';
		this.folderPath = existing?.folderPath ?? '';
		this.metadataPath = existing?.metadataPath ?? (this.folderPath ? metadataPathInFolder(this.folderPath) : '');
		this.metadataCustomized = Boolean(existing?.metadataPath && existing.metadataPath !== metadataPathInFolder(existing.folderPath));
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-metadata-category-modal');
		contentEl.createEl('h2', { text: this.title });

		new Setting(contentEl)
			.setName('分类名称')
			.addText((text) => text
				.setDisabled(this.existing?.isDefault === true)
				.setValue(this.name)
				.onChange((value) => {
					this.name = value;
				}));

		new Setting(contentEl)
			.setName('图片文件夹')
			.setDesc(this.folderPath || this.defaultFolderPath(this.name) || '将根据分类名称自动创建')
			.addButton((button) => button.setButtonText('选择文件夹').onClick(() => {
				new FolderSuggestModal(this.app, (folder) => {
					this.folderPath = folder.path;
					if (!this.metadataCustomized) {
						this.metadataPath = metadataPathInFolder(this.folderPath);
					}
					this.render();
				}).open();
			}));

		new Setting(contentEl)
			.setName('元数据 JSON 路径')
			.setDesc('默认与图片文件夹在同一目录，也可手动自定义。')
			.addText((text) => text.setValue(this.metadataPath).onChange((value) => {
				this.metadataPath = value;
				this.metadataCustomized = true;
			}));

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('保存').setCta().onClick(() => {
				const folderPath = this.folderPath.trim() || this.defaultFolderPath(this.name);
				this.onSubmit({
					...this.existing,
					name: this.name.trim(),
					folderPath,
					metadataPath: this.metadataPath.trim() || metadataPathInFolder(folderPath),
				});
				this.close();
			}));
	}

	private defaultFolderPath(name: string): string {
		const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-');
		return safeName ? `_images/${safeName}` : '';
	}
}

export class BatchIndexModal extends Modal {
	private selected = new Set<string>();
	private categoryName: string;
	private description = '';
	private keywords = '';
	private namePrefix = '';

	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly categories: ImageCategory[],
		private readonly onSubmit: (result: BatchIndexResult) => void,
	) {
		super(app);
		this.files.forEach((file) => this.selected.add(file.path));
		this.categoryName = categories[0]?.name ?? '';
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-metadata-batch-index-modal');
		contentEl.createEl('h2', { text: '建立图片索引' });
		contentEl.createEl('p', { text: `扫描到 ${this.files.length} 张未索引图片，已选择 ${this.selected.size} 张。` });

		new Setting(contentEl)
			.setName('目标分类')
			.addDropdown((dropdown) => {
				for (const category of this.categories) {
					dropdown.addOption(category.name, category.name);
				}
				dropdown.setValue(this.categoryName).onChange((value) => {
					this.categoryName = value;
				});
			});

		new Setting(contentEl)
			.setName('批量描述')
			.setDesc('会写入到所有选中图片。')
			.addTextArea((text) => text.setValue(this.description).onChange((value) => {
				this.description = value;
			}));

		new Setting(contentEl)
			.setName('批量关键词')
			.setDesc('用逗号或换行分隔，会写入到所有选中图片。')
			.addTextArea((text) => text.setValue(this.keywords).onChange((value) => {
				this.keywords = value;
			}));

		new Setting(contentEl)
			.setName('批量名称前缀')
			.setDesc('可选。填写后图片名称会变为：前缀 1、前缀 2……；留空则使用原文件名。')
			.addText((text) => text.setValue(this.namePrefix).onChange((value) => {
				this.namePrefix = value;
			}));

		const actions = contentEl.createDiv({ cls: 'image-metadata-batch-index-actions' });
		actions.createEl('button', { text: '全选' }).onclick = () => {
			this.files.forEach((file) => this.selected.add(file.path));
			this.render();
		};
		actions.createEl('button', { text: '清空' }).onclick = () => {
			this.selected.clear();
			this.render();
		};

		const list = contentEl.createDiv({ cls: 'image-metadata-batch-index-list' });
		for (const file of this.files) {
			const row = list.createDiv({ cls: 'image-metadata-batch-index-row' });
			const checkbox = row.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selected.has(file.path);
			checkbox.onchange = () => {
				if (checkbox.checked) {
					this.selected.add(file.path);
				} else {
					this.selected.delete(file.path);
				}
			};
			row.createSpan({ text: file.path });
		}

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
			.addButton((button) => button.setButtonText('建立索引').setCta().onClick(() => this.submit()));
	}

	private submit(): void {
		const category = this.categories.find((item) => item.name === this.categoryName) ?? this.categories[0];
		if (!category) {
			return;
		}
		const selectedFiles = this.files.filter((file) => this.selected.has(file.path));
		this.onSubmit({
			category,
			description: this.description.trim(),
			keywords: parseKeywords(this.keywords),
			files: selectedFiles.map((file, index) => ({
				file,
				fileName: this.namePrefix.trim() ? `${this.namePrefix.trim()} ${index + 1}` : basenameWithoutExtension(file.path),
			})),
		});
		this.close();
	}
}

export class ImageInsertModal extends Modal {
	private options: ImageInsertOptions;
	private previewEl!: HTMLElement;
	private codeEl!: HTMLElement;
	private readonly source: string;
	private readonly previewSource: string;
	private readonly sourceLabel: string;

	constructor(
		app: App,
		config: { source: string; label: string; alt: string; options?: ImageInsertOptions; previewSource?: string },
		private readonly onSubmit: (html: string) => void,
		private readonly submitText = '插入',
	) {
		super(app);
		this.source = config.source;
		this.previewSource = config.previewSource ?? config.source;
		this.sourceLabel = config.label;
		this.options = { ...DEFAULT_IMAGE_INSERT_OPTIONS, ...config.options, alt: config.options?.alt ?? config.alt };
	}

	static forFile(app: App, file: TFile, onSubmit: (html: string) => void): ImageInsertModal {
		return new ImageInsertModal(app, {
			source: getPersistentImageSource(file),
			previewSource: app.vault.getResourcePath(file),
			label: file.path,
			alt: file.basename,
		}, onSubmit);
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-metadata-insert-modal');
		contentEl.createEl('h2', { text: `${this.submitText}图片格式` });
		contentEl.createEl('p', { text: `图片：${this.sourceLabel}` });

		new Setting(contentEl)
			.setName('对齐方式')
			.addDropdown((dropdown) => dropdown
				.addOption('left', '左对齐')
				.addOption('center', '居中对齐')
				.addOption('right', '右对齐')
				.setValue(this.options.alignment)
				.onChange((value) => {
					this.options.alignment = value as ImageInsertOptions['alignment'];
					this.updatePreview();
				}));

		new Setting(contentEl)
			.setName('宽度')
			.setDesc('例如 320px、60%、12rem；留空为原始宽度。')
			.addText((text) => text.setValue(this.options.width).onChange((value) => {
				this.options.width = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('高度')
			.setDesc('关闭按比例缩放时生效。')
			.addText((text) => text.setValue(this.options.height).onChange((value) => {
				this.options.height = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('按比例缩放')
			.addToggle((toggle) => toggle.setValue(this.options.keepAspectRatio).onChange((value) => {
				this.options.keepAspectRatio = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('外边距')
			.setDesc('CSS margin，例如 8px 0。')
			.addText((text) => text.setValue(this.options.margin).onChange((value) => {
				this.options.margin = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('内边距')
			.setDesc('CSS padding，例如 4px。')
			.addText((text) => text.setValue(this.options.padding).onChange((value) => {
				this.options.padding = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('边框样式')
			.addDropdown((dropdown) => dropdown
				.addOption('none', '无边框')
				.addOption('solid', '实线')
				.addOption('dashed', '虚线')
				.addOption('dotted', '点线')
				.setValue(this.options.borderStyle)
				.onChange((value) => {
					this.options.borderStyle = value as ImageInsertOptions['borderStyle'];
					this.updatePreview();
				}));

		new Setting(contentEl)
			.setName('边框宽度')
			.addText((text) => text.setValue(this.options.borderWidth).onChange((value) => {
				this.options.borderWidth = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('边框颜色')
			.addText((text) => text.setValue(this.options.borderColor).onChange((value) => {
				this.options.borderColor = value;
				this.updatePreview();
			}));

		new Setting(contentEl)
			.setName('替代文本')
			.addText((text) => text.setValue(this.options.alt).onChange((value) => {
				this.options.alt = value;
				this.updatePreview();
			}));

		contentEl.createEl('h3', { text: '即时预览' });
		this.previewEl = contentEl.createDiv({ cls: 'image-metadata-insert-preview' });
		contentEl.createEl('h3', { text: 'HTML 输出' });
		this.codeEl = contentEl.createEl('code', { cls: 'image-metadata-insert-code' });
		this.updatePreview();

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
			.addButton((button) => button.setButtonText(this.submitText).setCta().onClick(() => {
				this.onSubmit(this.buildHtml());
				this.close();
			}));
	}

	private buildHtml(): string {
		return buildImageHtmlForSource(this.source, this.options.alt, this.options);
	}

	private updatePreview(): void {
		const html = this.buildHtml();
		this.previewEl.empty();
		const wrapper = this.previewEl.createDiv();
		wrapper.setAttr('style', `text-align: ${this.options.alignment};`);
		const img = wrapper.createEl('img');
		img.src = this.previewSource;
		img.alt = this.options.alt || this.sourceLabel;
		img.setAttr('style', html.match(/<img[^>]*style="([^"]*)"/)?.[1] ?? 'max-width: 100%; height: auto;');
		this.codeEl.setText(html);
	}
}

export class MetadataModal extends Modal {
	private fileName = '';
	private description = '';
	private keywords = '';
	private customValues: Record<string, string> = {};

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly categoryName: string,
		private readonly customFields: string[],
		private readonly onSubmit: (result: MetadataFormResult) => void,
		existing?: MetadataEntry,
	) {
		super(app);
		this.fileName = existing?.fileName ?? basenameWithoutExtension(file.path);
		this.description = existing?.description ?? '';
		this.keywords = existing?.keywords.join(', ') ?? '';
		this.customValues = { ...(existing?.customFields ?? {}) };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-metadata-modal');
		contentEl.createEl('h2', { text: '图片元数据' });
		contentEl.createEl('p', { text: `分类：${this.categoryName}` });
		contentEl.createEl('p', { text: `文件：${this.file.path}` });

		new Setting(contentEl)
			.setName('图片名称')
			.setDesc('保存后会同步更新图片文件名，扩展名保持不变。')
			.addText((text) => text.setValue(this.fileName).onChange((value) => {
				this.fileName = value;
			}));

		new Setting(contentEl)
			.setName('简要描述')
			.addTextArea((text) => text.setValue(this.description).onChange((value) => {
				this.description = value;
			}));

		new Setting(contentEl)
			.setName('关键词')
			.setDesc('用逗号或换行分隔')
			.addTextArea((text) => text.setValue(this.keywords).onChange((value) => {
				this.keywords = value;
			}));

		for (const field of this.customFields) {
			new Setting(contentEl)
				.setName(field)
				.addText((text) => text.setValue(this.customValues[field] ?? '').onChange((value) => {
					this.customValues[field] = value;
				}));
		}

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('取消').onClick(() => this.close()))
			.addButton((button) => button
				.setButtonText('保存')
				.setCta()
				.onClick(() => this.submit()));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		this.onSubmit({
			fileName: this.fileName.trim() || basenameWithoutExtension(this.file.path),
			description: this.description.trim(),
			keywords: parseKeywords(this.keywords),
			customFields: this.customValues,
		});
		this.close();
	}
}
