import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import ImageMetadataPlugin from './main';
import { CategoryEditModal, ConfirmModal, TextChoiceModal } from './modals';
import { DEFAULT_CATEGORY_NAME, ImageCategory, ImageMetadataSettings } from './types';
import { metadataPathInFolder, normalizeVaultPath } from './utils';

export const DEFAULT_CATEGORY: ImageCategory = {
	name: DEFAULT_CATEGORY_NAME,
	folderPath: '_images/default',
	metadataPath: '_images/default/image_metadata.json',
	isDefault: true,
};

export const DEFAULT_SETTINGS: ImageMetadataSettings = {
	categories: [DEFAULT_CATEGORY],
	imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'],
	forceCategorySelection: true,
	conflictStrategy: 'rename',
	cleanupEmptyFolders: true,
	customFields: [],
};

export function metadataPathForCategory(name: string): string {
	return metadataPathInFolder(`_images/${name}`);
}

export function normalizeSettings(settings: Partial<ImageMetadataSettings>): ImageMetadataSettings {
	const merged: ImageMetadataSettings = {
		...DEFAULT_SETTINGS,
		...settings,
		categories: settings.categories?.length ? settings.categories : DEFAULT_SETTINGS.categories,
		imageExtensions: settings.imageExtensions?.length ? settings.imageExtensions : DEFAULT_SETTINGS.imageExtensions,
		customFields: settings.customFields ?? [],
	};
	const categories = merged.categories.map((category) => ({
		...category,
		name: category.name.trim(),
		folderPath: normalizeVaultPath(category.folderPath),
		metadataPath: normalizeVaultPath(category.metadataPath)
			.replace(/^\.obsidian\/image_metadata_default\.json$/, DEFAULT_CATEGORY.metadataPath)
			.replace(/^_image_metadata\/image_metadata_default\.json$/, DEFAULT_CATEGORY.metadataPath),
	}));
	const defaultIndex = categories.findIndex((category) => category.isDefault || category.name === DEFAULT_CATEGORY_NAME);
	if (defaultIndex >= 0) {
		const current = categories[defaultIndex] ?? DEFAULT_CATEGORY;
		categories[defaultIndex] = {
			...current,
			name: DEFAULT_CATEGORY_NAME,
			metadataPath: ['.obsidian/image_metadata_default.json', '_image_metadata/image_metadata_default.json'].includes(current.metadataPath) ? DEFAULT_CATEGORY.metadataPath : current.metadataPath,
			isDefault: true,
		};
	} else {
		categories.unshift(DEFAULT_CATEGORY);
	}
	return { ...merged, categories };
}

export class ImageMetadataSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ImageMetadataPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Image Organizer' });

		new Setting(containerEl)
			.setName('监视的图片扩展名')
			.setDesc('用逗号分隔，例如 png,jpg,webp')
			.addText((text) => text
				.setValue(this.plugin.settings.imageExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.imageExtensions = value.split(',').map((item) => item.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('添加图片时强制选择分类')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.forceCategorySelection)
				.onChange(async (value) => {
					this.plugin.settings.forceCategorySelection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('移动图片时的重名策略')
			.addDropdown((dropdown) => dropdown
				.addOption('rename', '自动添加数字后缀')
				.addOption('overwrite', '覆盖')
				.addOption('ask', '询问用户')
				.setValue(this.plugin.settings.conflictStrategy)
				.onChange(async (value) => {
					this.plugin.settings.conflictStrategy = value as ImageMetadataSettings['conflictStrategy'];
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('删除移动后留下的空目录')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.cleanupEmptyFolders)
				.onChange(async (value) => {
					this.plugin.settings.cleanupEmptyFolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('自定义元数据字段')
			.setDesc('用逗号分隔，例如 来源,拍摄日期')
			.addText((text) => text
				.setValue(this.plugin.settings.customFields.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.customFields = value.split(',').map((item) => item.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: '子分类' });
		for (const category of this.plugin.settings.categories) {
			this.renderCategory(containerEl, category);
		}

		new Setting(containerEl)
			.setName('新增分类')
			.setDesc('选择图片文件夹后，元数据 JSON 默认保存在同一文件夹内，也可自定义路径。')
			.addButton((button) => button.setButtonText('添加分类').setCta().onClick(() => {
				new CategoryEditModal(this.app, '新增分类', async (category) => {
					if (!category.name) {
						new Notice('分类名称不能为空。');
						return;
					}
					if (this.plugin.settings.categories.some((item) => item.name === category.name)) {
						new Notice('分类名称已存在。');
						return;
					}
					await this.plugin.addCategory({
						...category,
						folderPath: category.folderPath || `_images/${category.name}`,
						metadataPath: category.metadataPath || metadataPathForCategory(category.name),
					});
					this.display();
				}, {
					name: '',
					folderPath: '_images',
					metadataPath: metadataPathInFolder('_images'),
				}).open();
			}));
	}

	private renderCategory(containerEl: HTMLElement, category: ImageCategory): void {
		const setting = new Setting(containerEl)
			.setName(category.isDefault ? `${category.name}（默认）` : category.name)
			.setDesc(`文件夹：${category.folderPath}；元数据：${category.metadataPath}`)
			.addButton((button) => button.setButtonText('编辑').onClick(() => {
				new CategoryEditModal(this.app, '编辑分类', async (updated) => {
					if (!updated.name) {
						new Notice('分类名称不能为空。');
						return;
					}
					await this.plugin.updateCategory(category.name, updated);
					this.display();
				}, category).open();
			}));

		if (!category.isDefault) {
			setting.addButton((button) => button.setButtonText('删除').setWarning().onClick(() => {
				new TextChoiceModal(this.app, ['default', 'metadata', 'files'], {
					default: '移动到默认分类',
					metadata: '仅删除元数据',
					files: '删除图片和元数据',
				}, (mode) => {
					new ConfirmModal(this.app, '删除分类', `确认删除分类“${category.name}”？`, '确认删除', () => {
						void this.plugin.deleteCategory(category.name, mode).then(() => this.display());
					}).open();
				}, '选择删除处理方式').open();
			}));
		}
	}
}
