import { Client } from "@notionhq/client";
import fs from "fs/promises";

const notion = new Client({ auth: NOTION_API_KEY });

interface ResolverInfo {
  name: string;
  type: string;
  operation: string;
  status: string;
}

interface NotionPageProperty {
  type: string;
  [key: string]: any;
}

interface NotionPage {
  id: string;
  properties: {
    [key: string]: NotionPageProperty;
  };
}

async function loadResolverStatus(
  filePath: string
): Promise<Record<string, ResolverInfo>> {
  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

async function fetchNotionData(): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response: any = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      start_cursor: cursor,
    });

    pages.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);

  return pages;
}

async function updateNotionPage(
  pageId: string,
  status: string
): Promise<boolean> {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: { status: { name: status } },
      },
    });
    return true;
  } catch (error) {
    console.error(`Error updating page ${pageId}:`, error);
    return false;
  }
}

function matchResolverType(
  notionType: string,
  resolverType: string,
  resolverOperation: string
): boolean {
  const normalizedNotionType = notionType.toLowerCase().replace(/\s+/g, "");

  if (resolverType.toLowerCase() === "api") {
    return normalizedNotionType === resolverOperation.toLowerCase();
  } else {
    const normalizedResolverType =
      `${resolverType}${resolverOperation}`.toLowerCase();
    return normalizedNotionType === normalizedResolverType;
  }
}

function getPageProperty(
  page: NotionPage,
  propertyName: string
): string | undefined {
  const property = page.properties[propertyName];
  if (!property) return undefined;

  switch (property.type) {
    case "title":
      return property.title[0]?.plain_text;
    case "select":
      return property.select?.name;
    default:
      return undefined;
  }
}

export async function updateServices(statusFilePath: string) {
  try {
    const resolverStatus = await loadResolverStatus(statusFilePath);
    const notionData = await fetchNotionData();

    for (const page of notionData) {
      const resolverName = getPageProperty(page, "Name");
      const notionType = getPageProperty(page, "Type");
      const currentStatus = getPageProperty(page, "Status");

      if (!resolverName || !notionType) {
        console.log(`Skipping page ${page.id}: Missing Name or Type`);
        continue;
      }

      const resolver = resolverStatus[resolverName];

      if (
        resolver &&
        notionType &&
        matchResolverType(notionType, resolver.type, resolver.operation)
      ) {
        if (currentStatus !== resolver.status) {
          const updated = await updateNotionPage(page.id, resolver.status);
          if (updated) {
            console.log(`Updated ${resolverName} status to ${resolver.status}`);
          } else {
            console.log(`Failed to update ${resolverName}`);
          }
        } else {
          console.log(`${resolverName} status is already up to date`);
        }
      } else {
        console.log(
          `No matching resolver found for ${resolverName} (${notionType})`
        );
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}
