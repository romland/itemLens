import sharp from 'sharp';
import quantize from '@lokesh.dhakar/quantize/dist/index.mjs';

function createPixelArray(imgData, pixelCount, quality) {
    const pixels = imgData;
    const pixelArray = [];

    let skippedPixels = 0;
    for (let i = 0, offset, r, g, b, a; i < pixelCount; i = i + quality) {
        offset = i * 4;
        r = pixels[offset + 0];
        g = pixels[offset + 1];
        b = pixels[offset + 2];
        a = pixels[offset + 3];

        // Ignore if pixel is mostly opaque and not white
        if (typeof a === 'undefined' || a >= 125) {
            if (!(r > 250 && g > 250 && b > 250)) {
                pixelArray.push([r, g, b]);
            }
        } else {
            skippedPixels++;
        }
    }
    return pixelArray;
}

function validateOptions(options) {
    let { colorCount, quality } = options;

    if (typeof colorCount === 'undefined' || !Number.isInteger(colorCount)) {
        colorCount = 10;
    } else if (colorCount === 1) {
        throw new Error('colorCount should be between 2 and 20. To get one color, call getColor() instead of getPalette()');
    } else {
        colorCount = Math.max(colorCount, 2);
        colorCount = Math.min(colorCount, 20);
    }

    if (typeof quality === 'undefined' || !Number.isInteger(quality) || quality < 1) {
        quality = 10;
    }

    return {
        colorCount,
        quality
    };
}

async function loadImg(img) {
    let input = img;

    // Fetch remote HTTP/HTTPS image URLs natively if passed as string
    if (typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://'))) {
        const response = await fetch(img);
        if (!response.ok) {
            throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        input = Buffer.from(arrayBuffer);
    }

    // Extract raw RGBA buffer and dimensions via sharp
    const { data, info } = await sharp(input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return {
        data,
        shape: [info.width, info.height, info.channels]
    };
}

export async function getColor(img, quality) {
    const palette = await getPalette(img, 5, quality);
    return palette ? palette[0] : null;
}

export async function getPalette(img, colorCount = 10, quality = 10) {
    const options = validateOptions({
        colorCount,
        quality
    });

    const imgData = await loadImg(img);
    const pixelCount = imgData.shape[0] * imgData.shape[1];
    const pixelArray = createPixelArray(imgData.data, pixelCount, options.quality);

    const cmap = quantize(pixelArray, options.colorCount);
    return cmap ? cmap.palette() : null;
}