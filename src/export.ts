import { CategorizedEntry } from './types';

export function entriesToMarkdown(entries: CategorizedEntry[]): string {
	const rows = ['| 分类 | 图片路径 | 名称 | 描述 | 关键词 |', '|------|----------|------|------|--------|'];
	for (const item of entries) {
		rows.push(`| ${escapeCell(item.category.name)} | ${escapeCell(item.path)} | ${escapeCell(item.entry.fileName)} | ${escapeCell(item.entry.description)} | ${escapeCell(item.entry.keywords.join(','))} |`);
	}
	return rows.join('\n');
}

export function entriesToJson(entries: CategorizedEntry[]): string {
	return JSON.stringify(entries.map((item) => ({
		category: item.category.name,
		path: item.path,
		...item.entry,
	})), null, '\t');
}

function escapeCell(value: string): string {
	return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
