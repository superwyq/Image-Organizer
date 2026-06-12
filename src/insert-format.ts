import { TFile, Vault } from 'obsidian';

export type ImageAlignment = 'left' | 'center' | 'right';
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';

export interface ImageInsertOptions {
	alignment: ImageAlignment;
	width: string;
	height: string;
	keepAspectRatio: boolean;
	margin: string;
	padding: string;
	borderStyle: BorderStyle;
	borderWidth: string;
	borderColor: string;
	alt: string;
}

export const DEFAULT_IMAGE_INSERT_OPTIONS: ImageInsertOptions = {
	alignment: 'center',
	width: '',
	height: '',
	keepAspectRatio: true,
	margin: '8px 0',
	padding: '0',
	borderStyle: 'none',
	borderWidth: '1px',
	borderColor: '#cccccc',
	alt: '',
};

export function buildImageHtml(file: TFile, vault: Vault, options: ImageInsertOptions): string {
	return buildImageHtmlForSource(vault.getResourcePath(file), options.alt || file.basename, options);
}

export function buildImageHtmlForSource(src: string, alt: string, options: ImageInsertOptions): string {
	const imgStyles = buildImageStyles(options);
	const wrapperStyles = buildWrapperStyles(options.alignment);
	return `<div style="${wrapperStyles}"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${imgStyles}"></div>`;
}

export function buildImageStyles(options: ImageInsertOptions): string {
	const styles: string[] = ['max-width: 100%'];
	if (options.width.trim()) {
		styles.push(`width: ${sanitizeCssValue(options.width)}`);
	}
	if (options.height.trim() && !options.keepAspectRatio) {
		styles.push(`height: ${sanitizeCssValue(options.height)}`);
	}
	if (options.keepAspectRatio) {
		styles.push('height: auto');
	}
	if (options.margin.trim()) {
		styles.push(`margin: ${sanitizeCssValue(options.margin)}`);
	}
	if (options.padding.trim()) {
		styles.push(`padding: ${sanitizeCssValue(options.padding)}`);
	}
	if (options.borderStyle !== 'none') {
		styles.push(`border: ${sanitizeCssValue(options.borderWidth)} ${options.borderStyle} ${sanitizeCssValue(options.borderColor)}`);
	}
	return `${styles.join('; ')};`;
}

export function buildWrapperStyles(alignment: ImageAlignment): string {
	const textAlign = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center';
	return `text-align: ${textAlign};`;
}

export interface ParsedImageHtml {
	src: string;
	alt: string;
	options: ImageInsertOptions;
}

export function parseImageHtml(html: string): ParsedImageHtml | null {
	const imgMatch = html.match(/<img\b[^>]*>/i);
	if (!imgMatch) {
		return null;
	}
	const imgTag = imgMatch[0];
	const src = getAttribute(imgTag, 'src');
	if (!src) {
		return null;
	}
	const wrapperStyle = html.match(/<div\b[^>]*style="([^"]*)"[^>]*>/i)?.[1] ?? '';
	const imgStyle = getAttribute(imgTag, 'style') ?? '';
	const parsedStyles = parseStyleDeclaration(imgStyle);
	const options: ImageInsertOptions = { ...DEFAULT_IMAGE_INSERT_OPTIONS };
	options.alignment = parseAlignment(wrapperStyle);
	options.width = parsedStyles.get('width') ?? '';
	options.height = parsedStyles.get('height') === 'auto' ? '' : parsedStyles.get('height') ?? '';
	options.keepAspectRatio = parsedStyles.get('height') === 'auto' || !parsedStyles.has('height');
	options.margin = parsedStyles.get('margin') ?? DEFAULT_IMAGE_INSERT_OPTIONS.margin;
	options.padding = parsedStyles.get('padding') ?? DEFAULT_IMAGE_INSERT_OPTIONS.padding;
	options.alt = unescapeHtml(getAttribute(imgTag, 'alt') ?? '');
	const border = parsedStyles.get('border');
	if (border) {
		const parts = border.split(/\s+/);
		options.borderWidth = parts[0] ?? DEFAULT_IMAGE_INSERT_OPTIONS.borderWidth;
		options.borderStyle = (parts[1] as BorderStyle) ?? DEFAULT_IMAGE_INSERT_OPTIONS.borderStyle;
		options.borderColor = parts.slice(2).join(' ') || DEFAULT_IMAGE_INSERT_OPTIONS.borderColor;
	}
	return { src: unescapeHtml(src), alt: options.alt, options };
}

function parseStyleDeclaration(style: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const part of style.split(';')) {
		const [rawKey, ...rawValue] = part.split(':');
		const key = rawKey?.trim().toLowerCase();
		const value = rawValue.join(':').trim();
		if (key && value) {
			result.set(key, value);
		}
	}
	return result;
}

function parseAlignment(style: string): ImageAlignment {
	const textAlign = parseStyleDeclaration(style).get('text-align');
	if (textAlign === 'left' || textAlign === 'right' || textAlign === 'center') {
		return textAlign;
	}
	return DEFAULT_IMAGE_INSERT_OPTIONS.alignment;
}

function getAttribute(tag: string, name: string): string | null {
	return tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null;
}

function sanitizeCssValue(value: string): string {
	return value.replace(/[;{}<>]/g, '').trim();
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function unescapeHtml(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}
