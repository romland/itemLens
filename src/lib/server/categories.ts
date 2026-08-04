import slugify from 'slugify';

/**
 * Fetch existing category names to pass to Gemini context
 */
export async function getExistingCategoryNames(): Promise<string[]> {
  const categories = await db.category.findMany({
    select: { name: true }
  });
  return categories.map((c) => c.name);
}

/**
 * Gets or creates a Category record strictly by name
 */
export async function getOrCreateCategory(rawName: string) {
  const cleanName = rawName.trim().toLowerCase();
  const slug = slugify(cleanName);

  return await db.category.upsert({
    where: { slug },
    update: {},
    create: {
      name: cleanName,
      slug
    }
  });
}