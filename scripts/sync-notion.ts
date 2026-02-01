/**
 * Notion to Local Sync Script
 * 
 * This script fetches posts from Notion and saves them as local Markdown files.
 * Run with: npx tsx scripts/sync-notion.ts
 */

import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs';
import * as path from 'path';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

// Configuration
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'posts');

// Validate environment
if (!NOTION_TOKEN) {
    console.log('⚠️  NOTION_TOKEN not set, skipping Notion sync');
    process.exit(0);
}

if (!DATABASE_ID) {
    console.log('⚠️  NOTION_DATABASE_ID not set, skipping Notion sync');
    process.exit(0);
}

// Initialize clients
const notion = new Client({ auth: NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

interface NotionPost {
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
 * Extract text from rich text property
 */
function getRichText(property: any): string {
    if (!property?.rich_text) return '';
    return property.rich_text.map((t: any) => t.plain_text).join('');
}

/**
 * Extract title from title property
 */
function getTitle(property: any): string {
    if (!property?.title) return '';
    return property.title.map((t: any) => t.plain_text).join('');
}

/**
 * Extract select value
 */
function getSelect(property: any): string {
    return property?.select?.name || '';
}

/**
 * Extract date
 */
function getDate(property: any): string {
    return property?.date?.start || new Date().toISOString().split('T')[0];
}

/**
 * Extract checkbox value
 */
function getCheckbox(property: any): boolean {
    return property?.checkbox || false;
}

/**
 * Generate URL-safe slug from title
 */
function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

/**
 * Parse Notion page to our format
 */
function parseNotionPage(page: PageObjectResponse): NotionPost | null {
    try {
        const properties = page.properties as any;

        // Try different property name formats (English and Korean)
        const title = getTitle(properties.Title) ||
            getTitle(properties.Name) ||
            getTitle(properties['제목']) ||
            '';

        if (!title) {
            console.warn(`⚠️  Skipping page ${page.id}: no title found`);
            return null;
        }

        const slug = getRichText(properties.Slug) ||
            getRichText(properties['슬러그']) ||
            generateSlug(title);

        const description = getRichText(properties.Description) ||
            getRichText(properties['설명']) ||
            '';

        const date = getDate(properties.Date) ||
            getDate(properties['날짜']) ||
            new Date().toISOString().split('T')[0];

        const category = (getSelect(properties.Category) ||
            getSelect(properties['카테고리']) ||
            'blog').toLowerCase();

        const language = (getSelect(properties.Language) ||
            getSelect(properties['언어']) ||
            'ko').toLowerCase();

        const published = getCheckbox(properties.Published) ||
            getCheckbox(properties['발행']) ||
            false;

        return {
            id: page.id,
            title,
            slug,
            description,
            date,
            category,
            language,
            published,
        };
    } catch (error) {
        console.error(`❌ Error parsing page ${page.id}:`, error);
        return null;
    }
}

/**
 * Fetch all published posts from database
 */
async function fetchPosts(): Promise<NotionPost[]> {
    console.log('📡 Fetching posts from Notion...');

    try {
        const response = await notion.databases.query({
            database_id: DATABASE_ID!,
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
                console.log(`  ✓ Found: "${parsed.title}" (${parsed.language}/${parsed.category})`);
            }
        }

        console.log(`📚 Found ${posts.length} published posts`);
        return posts;
    } catch (error) {
        console.error('❌ Error fetching posts:', error);
        return [];
    }
}

/**
 * Get page content as Markdown
 */
async function getPageContent(pageId: string): Promise<string> {
    try {
        const mdBlocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdBlocks);
        return mdString.parent;
    } catch (error) {
        console.error(`❌ Error fetching content for ${pageId}:`, error);
        return '';
    }
}

/**
 * Generate frontmatter
 */
function generateFrontmatter(post: NotionPost): string {
    const escapedTitle = post.title.replace(/'/g, "''");
    const escapedDesc = post.description.replace(/'/g, "''");

    return `---
title: '${escapedTitle}'
description: '${escapedDesc}'
date: '${post.date}'
---`;
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Save post to file
 */
async function savePost(post: NotionPost): Promise<void> {
    const content = await getPageContent(post.id);
    const frontmatter = generateFrontmatter(post);
    const fullContent = `${frontmatter}\n\n${content}`;

    // Determine output path
    const outputDir = path.join(CONTENT_DIR, post.language, post.category);
    ensureDir(outputDir);

    const filename = `${post.slug}.md`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, fullContent, 'utf-8');
    console.log(`  💾 Saved: ${post.language}/${post.category}/${filename}`);
}

/**
 * Main sync function
 */
async function sync(): Promise<void> {
    console.log('\n🔄 Starting Notion sync...\n');

    const posts = await fetchPosts();

    if (posts.length === 0) {
        console.log('\n✅ No posts to sync');
        return;
    }

    console.log('\n📝 Syncing posts to local files...\n');

    for (const post of posts) {
        await savePost(post);
    }

    console.log('\n✅ Sync complete!\n');
}

// Run sync
sync().catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
});
