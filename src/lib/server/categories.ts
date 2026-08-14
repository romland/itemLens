import slugify from 'slugify';

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

  return await db.category.upsert({
    where: { inventoryId_slug: { inventoryId, slug } },
    update: {},
    create: {
      name: cleanName,
      slug,
      inventoryId
    }
  });
}