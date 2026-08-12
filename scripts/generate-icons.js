import sharp from 'sharp';

const INPUT = 'static/itemlens-512-white.webp';

async function generate() {
    try {
        console.log(`Reading ${INPUT}...`);

        // Apple Touch Icons (180x180)
        await sharp(INPUT).resize(180, 180).toFile('static/apple-touch-icon.png');
        await sharp(INPUT).resize(180, 180).toFile('static/apple-touch-icon-precomposed.png');
        console.log('✅ Generated apple-touch-icon.png & apple-touch-icon-precomposed.png (180x180)');

        // Favicon PNG (32x32)
        await sharp(INPUT).resize(32, 32).toFile('static/favicon.png');
        console.log('✅ Generated favicon.png (32x32)');

        // Favicon ICO (32x32)
        // Note: Sharp outputs PNG format, but renaming to .ico is widely supported by modern browsers
        await sharp(INPUT).resize(32, 32).toFormat('png').toFile('static/favicon.ico');
        console.log('✅ Generated favicon.ico (32x32)');

    } catch (err) {
        console.error('❌ Error generating icons:', err);
    }
}

generate();