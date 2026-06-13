import { ItemView, Menu, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { ClassificationDB } from './db';
import { CategorySuggestModal, ConfirmModal } from './modals';
import { CategorizedEntry, ImageCategory, ImageMetadataSettings, VIEW_TYPE_IMAGE_METADATA } from './types';

export interface ViewHost {
	settings: ImageMetadataSettings;
	db: ClassificationDB;
	editImageMetadata(file: TFile): Promise<void>;
	moveImageToCategory(file: TFile): Promise<void>;
	moveImagesToCategory(paths: string[], target: ImageCategory): Promise<void>;
	deleteImageAndMetadata(category: ImageCategory, path: string): Promise<void>;
	insertImageLink(path: string): Promise<void>;
	createCategory(): Promise<void>;
}

export class ImageMetadataView extends ItemView {
	private selectedCategory = 'all';
	private searchText = '';
	private keywordText = '';
	private draftSearchText = '';
	private draftKeywordText = '';
	private selectedPaths = new Set<string>();
	private isSearching = false;

	constructor(leaf: WorkspaceLeaf, private readonly host: ViewHost) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_IMAGE_METADATA;
	}

	getDisplayText(): string {
		return 'Image Organizer';
	}

	getIcon(): string {
		return 'image';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async refresh(): Promise<void> {
		await this.render();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('image-metadata-view');

		const entries = await this.host.db.allEntries(this.host.settings.categories);
		const filtered = this.filterEntries(entries);

		this.renderControls(contentEl, filtered, entries);
		contentEl.createEl('p', { text: `共 ${filtered.length} 条记录，已选 ${this.selectedPaths.size} 条` });
		const list = contentEl.createDiv({ cls: 'image-metadata-list' });
		for (const item of filtered) {
			this.renderCard(list, item);
		}
	}

	private renderControls(contentEl: HTMLElement, filtered: CategorizedEntry[], allEntries: CategorizedEntry[]): void {
		const controls = contentEl.createDiv({ cls: 'image-metadata-controls' });
		const categorySelect = controls.createEl('select');
		categorySelect.createEl('option', { text: '所有分类', value: 'all' });
		for (const category of this.host.settings.categories) {
			categorySelect.createEl('option', { text: category.name, value: category.name });
		}
		categorySelect.value = this.selectedCategory;
		categorySelect.onchange = () => {
			this.selectedCategory = categorySelect.value;
			void this.render();
		};

		const searchGroup = controls.createDiv({ cls: 'image-metadata-search-group' });
		const search = searchGroup.createEl('input', { type: 'search', placeholder: '搜索文件名或描述' });
		search.value = this.draftSearchText;
		search.oninput = () => {
			this.draftSearchText = search.value;
			this.updateSearchButtonState(searchButton);
		};

		const allKeywords = this.getAllKeywords(allEntries);
		const keywordListId = 'image-metadata-keyword-suggestions';
		const keywordSearch = searchGroup.createEl('input', { type: 'search', placeholder: '关键词筛选，输入前缀后按 Tab 选择' });
		keywordSearch.setAttr('list', keywordListId);
		keywordSearch.value = this.draftKeywordText;
		const datalist = searchGroup.createEl('datalist');
		datalist.id = keywordListId;
		for (const keyword of this.getKeywordSuggestions(allKeywords, this.draftKeywordText)) {
			datalist.createEl('option', { value: keyword });
		}
		keywordSearch.oninput = () => {
			this.draftKeywordText = keywordSearch.value;
			this.updateSearchButtonState(searchButton);
		};
		keywordSearch.onkeydown = (event) => {
			if (event.key !== 'Tab') {
				return;
			}
			const suggestion = this.getKeywordSuggestions(allKeywords, keywordSearch.value)[0];
			if (suggestion) {
				event.preventDefault();
				this.draftKeywordText = this.applyKeywordSuggestion(keywordSearch.value, suggestion);
				keywordSearch.value = this.draftKeywordText;
				this.updateSearchButtonState(searchButton);
			}
		};

		const searchButton = searchGroup.createEl('button', { cls: 'image-metadata-search-button' });
		searchButton.createSpan({ text: this.isSearching ? '搜索中…' : '🔍 搜索' });
		searchButton.onclick = () => {
			void this.applySearch(searchButton);
		};
		this.updateSearchButtonState(searchButton);

		controls.createEl('button', { text: '刷新' }).onclick = () => {
			void this.render();
		};
		controls.createEl('button', { text: '新建分类' }).onclick = () => {
			void this.host.createCategory().then(() => this.render());
		};

		const batchControls = contentEl.createDiv({ cls: 'image-metadata-batch-controls' });
		batchControls.createEl('button', { text: '全选当前结果' }).onclick = () => {
			for (const item of filtered) {
				this.selectedPaths.add(item.path);
			}
			void this.render();
		};
		batchControls.createEl('button', { text: '清空选择' }).onclick = () => {
			this.selectedPaths.clear();
			void this.render();
		};
		batchControls.createEl('button', { text: '批量移动' }).onclick = () => this.batchMove();
		batchControls.createEl('button', { text: '批量删除' }).onclick = () => this.batchDelete();
	}

	private renderCard(list: HTMLElement, item: CategorizedEntry): void {
		const card = list.createDiv({ cls: 'image-metadata-card' });
		if (this.selectedPaths.has(item.path)) {
			card.addClass('is-selected');
		}

		const checkbox = card.createEl('input', { type: 'checkbox', cls: 'image-metadata-checkbox' });
		checkbox.checked = this.selectedPaths.has(item.path);
		checkbox.onchange = () => {
			if (checkbox.checked) {
				this.selectedPaths.add(item.path);
			} else {
				this.selectedPaths.delete(item.path);
			}
			void this.render();
		};

		const file = this.app.vault.getAbstractFileByPath(item.path);
		if (file instanceof TFile) {
			const img = card.createEl('img', { cls: 'image-metadata-thumbnail' });
			img.src = this.app.vault.getResourcePath(file);
		}
		const body = card.createDiv({ cls: 'image-metadata-card-body' });
		body.createEl('strong', { text: item.entry.fileName || item.path });
		body.createEl('div', { text: `分类：${item.category.name}` });
		body.createEl('div', { text: item.path, cls: 'image-metadata-path' });
		body.createEl('p', { text: item.entry.description || '无描述' });
		const keywords = body.createDiv({ cls: 'image-metadata-keywords' });
		for (const keyword of item.entry.keywords) {
			const tag = keywords.createSpan({ text: `#${keyword}`, cls: 'image-metadata-keyword-tag' });
			tag.setAttr('data-color', String(this.keywordColorIndex(keyword)));
		}

		const actions = card.createDiv({ cls: 'image-metadata-actions' });
		const insertButton = actions.createEl('button', { cls: 'image-metadata-insert-button' });
		setIcon(insertButton, 'plus-square');
		insertButton.createSpan({ text: '插入' });
		insertButton.onmousedown = (event) => event.preventDefault();
		insertButton.onclick = () => this.insert(item.path, insertButton);
		actions.createEl('button', { text: '编辑' }).onclick = () => this.edit(item.path);
		actions.createEl('button', { text: '移动分类' }).onclick = () => this.move(item.path);
		actions.createEl('button', { text: '删除图片' }).onclick = () => this.deleteRecord(item.category, item.path);
		card.oncontextmenu = (event) => {
			event.preventDefault();
			const menu = new Menu();
			menu.addItem((menuItem) => menuItem.setTitle('编辑').onClick(() => this.edit(item.path)));
			menu.addItem((menuItem) => menuItem.setTitle('移动分类').onClick(() => this.move(item.path)));
			menu.addItem((menuItem) => menuItem.setTitle('删除图片和记录').onClick(() => this.deleteRecord(item.category, item.path)));
			menu.showAtMouseEvent(event);
		};
	}

	private updateSearchButtonState(button: HTMLButtonElement): void {
		button.disabled = this.isSearching;
		button.toggleClass('is-loading', this.isSearching);
	}

	private async applySearch(button: HTMLButtonElement): Promise<void> {
		if (this.isSearching) {
			return;
		}
		this.isSearching = true;
		button.empty();
		button.createSpan({ text: '搜索中…' });
		this.updateSearchButtonState(button);
		await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
		this.searchText = this.draftSearchText.trim().toLowerCase();
		this.keywordText = this.draftKeywordText.trim().toLowerCase();
		this.isSearching = false;
		await this.render();
	}

	private filterEntries(entries: CategorizedEntry[]): CategorizedEntry[] {
		const keywords = this.keywordText
			.split(/[，,\s]+/)
			.map((keyword) => keyword.trim())
			.filter(Boolean);
		return entries.filter((item) => {
			const categoryMatches = this.selectedCategory === 'all' || item.category.name === this.selectedCategory;
			const haystack = `${item.path} ${item.entry.fileName} ${item.entry.description}`.toLowerCase();
			const textMatches = !this.searchText || haystack.includes(this.searchText);
			const lowerKeywords = item.entry.keywords.map((keyword) => keyword.toLowerCase());
			const keywordMatches = keywords.length === 0 || keywords.every((keyword) => lowerKeywords.some((itemKeyword) => itemKeyword.includes(keyword)));
			return categoryMatches && textMatches && keywordMatches;
		});
	}

	private insert(path: string, button: HTMLButtonElement): void {
		button.addClass('is-inserting');
		void this.host.insertImageLink(path).then(() => {
			button.removeClass('is-inserting');
			button.addClass('is-inserted');
			window.setTimeout(() => button.removeClass('is-inserted'), 900);
		}).catch(() => {
			button.removeClass('is-inserting');
		});
	}

	private edit(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			void this.host.editImageMetadata(file);
			return;
		}
		new Notice('图片文件不存在。');
	}

	private move(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			void this.host.moveImageToCategory(file);
			return;
		}
		new Notice('图片文件不存在。');
	}

	private deleteRecord(category: ImageCategory, path: string): void {
		new ConfirmModal(this.app, '删除图片', `确认删除图片文件和元数据记录？\n${path}`, '确认删除', () => {
			void this.host.deleteImageAndMetadata(category, path).then(() => {
				this.selectedPaths.delete(path);
				return this.render();
			});
		}).open();
	}

	private batchMove(): void {
		const paths = [...this.selectedPaths];
		if (paths.length === 0) {
			new Notice('请先选择图片。');
			return;
		}
		new CategorySuggestModal(this.app, this.host.settings.categories, (target) => {
			void this.host.moveImagesToCategory(paths, target).then(() => {
				this.selectedPaths.clear();
				return this.render();
			});
		}, '选择批量移动目标分类').open();
	}

	private batchDelete(): void {
		const paths = [...this.selectedPaths];
		if (paths.length === 0) {
			new Notice('请先选择图片。');
			return;
		}
		new ConfirmModal(this.app, '批量删除图片', `确认删除 ${paths.length} 张图片及其元数据记录？`, '批量删除', async () => {
			const entries = await this.host.db.allEntries(this.host.settings.categories);
			for (const path of paths) {
				const entry = entries.find((item) => item.path === path);
				if (entry) {
					await this.host.deleteImageAndMetadata(entry.category, path);
				}
			}
			this.selectedPaths.clear();
			await this.render();
		}).open();
	}

	private getAllKeywords(entries: CategorizedEntry[]): string[] {
		return [...new Set(entries.flatMap((item) => item.entry.keywords))].sort((a, b) => a.localeCompare(b));
	}

	private getKeywordSuggestions(keywords: string[], value: string): string[] {
		const lastToken = value.split(/[，,\s]+/).pop()?.toLowerCase() ?? '';
		const selected = new Set(value.split(/[，,\s]+/).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean));
		return keywords
			.filter((keyword) => keyword.toLowerCase().startsWith(lastToken) && !selected.has(keyword.toLowerCase()))
			.slice(0, 20);
	}

	private applyKeywordSuggestion(value: string, suggestion: string): string {
		const parts = value.split(/([，,\s]+)/);
		for (let index = parts.length - 1; index >= 0; index -= 1) {
			if (parts[index]?.trim()) {
				parts[index] = suggestion;
				return parts.join('');
			}
		}
		return suggestion;
	}

	private keywordColorIndex(keyword: string): number {
		let hash = 0;
		for (const char of keyword) {
			hash = (hash + char.charCodeAt(0)) % 6;
		}
		return hash;
	}
}
