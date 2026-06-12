import { Editor, EditorPosition, MarkdownFileInfo, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { ClassificationDB } from './db';
import { entriesToJson, entriesToMarkdown } from './export';
import { parseImageHtml } from './insert-format';
import { CategorySuggestModal, ImageFileSuggestModal, ImageInsertModal, TextChoiceModal } from './modals';
import { rescanConsistency } from './scan';
import { ImageMetadataSettings, VIEW_TYPE_IMAGE_METADATA } from './types';
import { isImagePath } from './utils';

export interface CommandHost extends Plugin {
	settings: ImageMetadataSettings;
	db: ClassificationDB;
	processImage(file: TFile, forcePrompt?: boolean): Promise<void>;
	editImageMetadata(file: TFile): Promise<void>;
	moveImageToCategory(file: TFile): Promise<void>;
	activateView(): Promise<void>;
}

export function registerCommands(plugin: CommandHost): void {
	plugin.addCommand({
		id: 'open-image-metadata-manager',
		name: '打开图片管理器',
		callback: () => {
			void plugin.activateView();
		},
	});

	plugin.addCommand({
		id: 'add-image-metadata',
		name: '添加图片元数据',
		callback: () => chooseImage(plugin, (file) => plugin.processImage(file, true)),
	});

	plugin.addCommand({
		id: 'add-current-note-images-metadata',
		name: '为当前笔记中的图片添加元数据',
		editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
			const files = extractImageFiles(plugin, editor, ctx);
			if (files.length === 0) {
				new Notice('当前笔记中未找到可管理的图片链接。');
				return;
			}
			const firstFile = files[0];
			if (files.length === 1 && firstFile) {
				void plugin.processImage(firstFile, true);
				return;
			}
			new ImageFileSuggestModal(plugin.app, files, (file) => {
				void plugin.processImage(file, true);
			}).open();
		},
	});

	plugin.addCommand({
		id: 'format-inserted-html-image',
		name: '修改已插入图片格式',
		editorCallback: (editor: Editor) => {
			const target = findEditableImageHtml(editor);
			if (!target) {
				new Notice('请先选中本插件插入的 HTML 图片代码，或将光标放在该图片 HTML 块内。');
				return;
			}
			const parsed = parseImageHtml(target.html);
			if (!parsed) {
				new Notice('未识别到可修改的 HTML 图片。');
				return;
			}
			new ImageInsertModal(plugin.app, {
				source: parsed.src,
				label: parsed.alt || parsed.src,
				alt: parsed.alt,
				options: parsed.options,
			}, (html) => {
				editor.replaceRange(html, target.from, target.to);
				new Notice('已更新图片格式。');
			}, '更新').open();
		},
	});

	plugin.addCommand({
		id: 'edit-current-image-metadata',
		name: '编辑当前图片的元数据',
		checkCallback: (checking) => {
			const active = plugin.app.workspace.getActiveFile();
			if (active && isImagePath(active.path, plugin.settings.imageExtensions)) {
				if (!checking) {
					void plugin.editImageMetadata(active);
				}
				return true;
			}
			return false;
		},
	});

	plugin.addCommand({
		id: 'move-image-to-category',
		name: '移动图片到其他分类',
		callback: () => chooseImage(plugin, (file) => plugin.moveImageToCategory(file)),
	});

	plugin.addCommand({
		id: 'rescan-image-metadata-consistency',
		name: '重新扫描所有分类的一致性',
		callback: () => {
			void rescanConsistency(plugin.app, plugin.db, plugin.settings.categories, plugin.settings.imageExtensions);
		},
	});

	plugin.addCommand({
		id: 'copy-image-metadata-text',
		name: '复制元数据为纯文本',
		callback: () => copyMetadata(plugin),
	});

	plugin.addCommand({
		id: 'scan-unclassified-images',
		name: '扫描未分类图片',
		callback: async () => {
			const entries = await plugin.db.allEntries(plugin.settings.categories);
			const managedPaths = new Set(entries.map((entry) => entry.path));
			const files = plugin.app.vault.getFiles().filter((file) => isImagePath(file.path, plugin.settings.imageExtensions) && !managedPaths.has(file.path));
			if (files.length === 0) {
				new Notice('没有未分类图片。');
				return;
			}
			new ImageFileSuggestModal(plugin.app, files, (file) => {
				void plugin.processImage(file, true);
			}, `发现 ${files.length} 张未分类图片，选择一张处理`).open();
		},
	});
}

interface EditableImageHtml {
	html: string;
	from: EditorPosition;
	to: EditorPosition;
}

function findEditableImageHtml(editor: Editor): EditableImageHtml | null {
	const selection = editor.getSelection();
	if (selection.trim()) {
		const parsedSelection = locateImageHtmlInText(selection, editor.getCursor('from'));
		if (parsedSelection) {
			return parsedSelection;
		}
	}
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	const start = line.lastIndexOf('<div', cursor.ch);
	const end = line.indexOf('</div>', cursor.ch);
	if (start >= 0 && end >= start) {
		const html = line.slice(start, end + '</div>'.length);
		if (html.includes('<img')) {
			return {
				html,
				from: { line: cursor.line, ch: start },
				to: { line: cursor.line, ch: end + '</div>'.length },
			};
		}
	}
	const fullText = editor.getValue();
	const cursorOffset = editor.posToOffset(cursor);
	const matches = [...fullText.matchAll(/<div\b[^>]*>\s*<img\b[^>]*>\s*<\/div>/gi)];
	for (const match of matches) {
		if (match.index === undefined) {
			continue;
		}
		const fromOffset = match.index;
		const toOffset = fromOffset + match[0].length;
		if (cursorOffset >= fromOffset && cursorOffset <= toOffset) {
			return {
				html: match[0],
				from: editor.offsetToPos(fromOffset),
				to: editor.offsetToPos(toOffset),
			};
		}
	}
	return null;
}

function locateImageHtmlInText(text: string, from: EditorPosition): EditableImageHtml | null {
	const match = text.match(/<div\b[^>]*>\s*<img\b[^>]*>\s*<\/div>/i);
	if (!match || match.index === undefined) {
		return null;
	}
	const before = text.slice(0, match.index);
	const startLines = before.split('\n');
	const htmlLines = match[0].split('\n');
	const startLine = from.line + startLines.length - 1;
	const startCh = startLines.length === 1 ? from.ch + (startLines[0]?.length ?? 0) : (startLines[startLines.length - 1]?.length ?? 0);
	const endLine = startLine + htmlLines.length - 1;
	const endCh = htmlLines.length === 1 ? startCh + (htmlLines[0]?.length ?? 0) : (htmlLines[htmlLines.length - 1]?.length ?? 0);
	return {
		html: match[0],
		from: { line: startLine, ch: startCh },
		to: { line: endLine, ch: endCh },
	};
}

function chooseImage(plugin: CommandHost, onChoose: (file: TFile) => void): void {
	const files = plugin.app.vault.getFiles().filter((file) => isImagePath(file.path, plugin.settings.imageExtensions));
	if (files.length === 0) {
		new Notice('Vault 中没有匹配的图片文件。');
		return;
	}
	new ImageFileSuggestModal(plugin.app, files, onChoose).open();
}

function extractImageFiles(plugin: CommandHost, editor: Editor, ctx: MarkdownView | MarkdownFileInfo): TFile[] {
	const source = editor.getSelection() || editor.getValue();
	const links = [...source.matchAll(/!\[.*?\]\((.*?)\)|!\[\[(.*?)(?:\|.*?)?\]\]/g)]
		.map((match) => (match[1] || match[2] || '').trim())
		.filter((path) => path.length > 0);
	const currentFile = ctx.file;
	const result: TFile[] = [];
	for (const link of links) {
		const file = plugin.app.metadataCache.getFirstLinkpathDest(link, currentFile?.path ?? '');
		if (file instanceof TFile && isImagePath(file.path, plugin.settings.imageExtensions) && !result.some((item) => item.path === file.path)) {
			result.push(file);
		}
	}
	return result;
}

function copyMetadata(plugin: CommandHost): void {
	new TextChoiceModal(plugin.app, ['all', 'category'], { all: '所有分类', category: '选择分类' }, (scope) => {
		const chooseFormat = (categoryName?: string): void => {
			new TextChoiceModal(plugin.app, ['markdown', 'json'], { markdown: 'Markdown 表格', json: 'JSON' }, async (format) => {
				const entries = await plugin.db.allEntries(plugin.settings.categories);
				const filtered = categoryName ? entries.filter((entry) => entry.category.name === categoryName) : entries;
				const text = format === 'markdown' ? entriesToMarkdown(filtered) : entriesToJson(filtered);
				await navigator.clipboard.writeText(text);
				new Notice(`已复制 ${filtered.length} 条图片元数据。`);
			}, '选择输出格式').open();
		};

		if (scope === 'all') {
			chooseFormat();
			return;
		}
		new CategorySuggestModal(plugin.app, plugin.settings.categories, (category) => chooseFormat(category.name)).open();
	}, '选择复制范围').open();
}

export { VIEW_TYPE_IMAGE_METADATA };
