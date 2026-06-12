export interface ImageCategory {
	name: string;
	folderPath: string;
	metadataPath: string;
	isDefault?: boolean;
}

export interface MetadataEntry {
	fileName: string;
	description: string;
	keywords: string[];
	dateAdded: string;
	lastModified: string;
	customFields?: Record<string, string>;
}

export type MetadataStore = Record<string, MetadataEntry>;

export type ConflictStrategy = 'rename' | 'overwrite' | 'ask';

export interface ImageMetadataSettings {
	categories: ImageCategory[];
	imageExtensions: string[];
	forceCategorySelection: boolean;
	conflictStrategy: ConflictStrategy;
	cleanupEmptyFolders: boolean;
	customFields: string[];
}

export interface MetadataFormResult {
	fileName: string;
	description: string;
	keywords: string[];
	customFields: Record<string, string>;
}

export interface BatchIndexResult {
	files: Array<{
		file: import('obsidian').TFile;
		fileName: string;
	}>;
	category: ImageCategory;
	description: string;
	keywords: string[];
}

export interface CategorizedEntry {
	category: ImageCategory;
	path: string;
	entry: MetadataEntry;
}

export interface DatabaseIndexMetadata {
	lastUpdated: string;
	categories: Array<{
		name: string;
		folderPath: string;
		metadataPath: string;
		isDefault: boolean;
		imageCount: number;
	}>;
	keywords: string[];
}

export const DEFAULT_CATEGORY_NAME = '默认';
export const DATABASE_INDEX_PATH = '_images/image_metadata_index.json';
export const VIEW_TYPE_IMAGE_METADATA = 'image-metadata-manager-view';
