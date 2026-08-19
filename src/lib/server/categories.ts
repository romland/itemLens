import slugify from 'slugify';
import { db } from '$lib/server/database';
import { bootstrapCategorySchema } from './ontology';

/**
 * Fetch existing category names to pass to Gemini context
 */
export async function getExistingCategoryNames(inventoryId: number): Promise<string[]> {
  const categories = await db.category.findMany({
    where: { inventoryId },
    select: { name: true }
  });
  return categories.map((c) => c.name);
}

/**
 * Gets or creates a Category record strictly by name
 */
export async function getOrCreateCategory(rawName: string, inventoryId: number) {
  const cleanName = rawName.trim().toLowerCase();
  const slug = slugify(cleanName);

  let category = await db.category.findUnique({
    where: { inventoryId_slug: { inventoryId, slug } }
  });

  if (!category) {
    category = await db.category.create({
      data: { name: cleanName, slug, inventoryId }
    });
    
    const inv = await db.inventory.findUnique({ where: { id: inventoryId } });
    if ((inv as any)?.allowAutoTaxonomy) {
      bootstrapCategorySchema(category.id, cleanName, inventoryId).catch(e => console.error("Schema gen failed:", e));
    }
  }

  return category;
}