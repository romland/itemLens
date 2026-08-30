// scripts/retroactive-semantic-tokens.ts
import { PrismaClient } from '@prisma/client';
import { tokenizeAndStem } from '../src/lib/server/nlp';

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting retroactive semantic token generation...");
    
    const items = await prisma.item.findMany({
        include: { attributes: true }
    });
    
    console.log(`Found ${items.length} items to process.`);
    
    let updated = 0;
    // We exclude visual discriminators just like we do during item creation
    const excludeKeys = new Set(['prominent_text_or_graphic', 'distinctive_blemishes_or_wear', 'color_mix', 'brand']);

    for (const item of items) {
        const descriptorValues = item.attributes
            .filter(a => !excludeKeys.has(a.key))
            .map(a => a.value);
        
        const tokens = tokenizeAndStem([
            item.title || "",
            item.description || "",
            ...descriptorValues
        ]);
        
        await prisma.item.update({
            where: { id: item.id },
            data: { semanticTokens: JSON.stringify(tokens) }
        });
        
        updated++;
        if (updated % 50 === 0) {
            console.log(`✅ Processed ${updated}/${items.length} items...`);
        }
    }
    
    console.log(`🎉 Done! Successfully generated semantic tokens for ${updated} items.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });