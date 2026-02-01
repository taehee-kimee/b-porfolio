import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

// Initialize Notion client
const notion = new Client({
    auth: process.env.NOTION_TOKEN,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

// Database ID from environment
const databaseId = process.env.NOTION_DATABASE_ID || '';

export interface NotionPost {
    id: string;
    title: string;
    slug: string;
    description: string;
    date: string;
    category: string;
    language: string;
    published: boolean;
}

/**
 * Extract text from Notion rich text property
 */
function getRichText(property: any): string {
    if (!property?.rich_text) return '';
    return property.rich_text.map((t: any) => t.plain_text).join('');
}

/**
 * Extract title from Notion title property
 */
function getTitle(property: any): string {
    if (!property?.title) return '';
    return property.title.map((t: any) => t.plain_text).join('');
}

/**
 * Extract select value from Notion select property
 */
function getSelect(property: any): string {
    return property?.select?.name || '';
}

/**
 * Extract date from Notion date property
 */
function getDate(property: any): string {
    return property?.date?.start || new Date().toISOString().split('T')[0];
}

/**
 * Extract checkbox value from Notion checkbox property
 */
function getCheckbox(property: any): boolean {
    return property?.checkbox || false;
}

/**
 * Parse a Notion page into our NotionPost format
 */
export function parseNotionPage(page: PageObjectResponse): NotionPost | null {
    try {
        const properties = page.properties as any;

        const title = getTitle(properties.Title || properties.Name || properties['제목']);
        const slug = getRichText(properties.Slug || properties['슬러그']) ||
            title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
        const description = getRichText(properties.Description || properties['설명']);
        const date = getDate(properties.Date || properties['날짜']);
        const category = getSelect(properties.Category || properties['카테고리']) || 'blog';
        const language = getSelect(properties.Language || properties['언어']) || 'ko';
        const published = getCheckbox(properties.Published || properties['발행']);

        if (!title) {
            console.warn(`Skipping page ${page.id}: no title found`);
            return null;
        }

        return {
            id: page.id,
            title,
            slug,
            description,
            date,
            category: category.toLowerCase(),
            language: language.toLowerCase(),
            published,
        };
    } catch (error) {
        console.error(`Error parsing page ${page.id}:`, error);
        return null;
    }
}

/**
 * Fetch all published posts from Notion database
 */
export async function fetchNotionPosts(): Promise<NotionPost[]> {
    if (!databaseId) {
        console.warn('NOTION_DATABASE_ID not set, skipping Notion sync');
        return [];
    }

    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                or: [
                    {
                        property: 'Published',
                        checkbox: {
                            equals: true,
                        },
                    },
                    {
                        property: '발행',
                        checkbox: {
                            equals: true,
                        },
                    },
                ],
            },
            sorts: [
                {
                    property: 'Date',
                    direction: 'descending',
                },
            ],
        });

        const posts: NotionPost[] = [];

        for (const page of response.results) {
            if ((page as any).object !== 'page') continue;
            const parsed = parseNotionPage(page as PageObjectResponse);
            if (parsed && parsed.published) {
                posts.push(parsed);
            }
        }

        return posts;
    } catch (error) {
        console.error('Error fetching Notion posts:', error);
        return [];
    }
}

/**
 * Fetch page content and convert to Markdown
 */
export async function getPageMarkdown(pageId: string): Promise<string> {
    try {
        const mdBlocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdBlocks);
        return mdString.parent;
    } catch (error) {
        console.error(`Error fetching page content for ${pageId}:`, error);
        return '';
    }
}

/**
 * Generate frontmatter for a post
 */
export function generateFrontmatter(post: NotionPost): string {
    return `---
title: '${post.title.replace(/'/g, "''")}'
description: '${post.description.replace(/'/g, "''")}'
date: '${post.date}'
---`;
}
