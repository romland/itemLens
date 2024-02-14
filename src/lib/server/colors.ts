import { getPalette } from "$lib/server/colorthief";
import namer from 'color-namer';

// Extract top colors of image
export function getTopColorsNamed(imagePath : string)
{
    console.log("Extracting colors from", imagePath);

    // args: path, num colors, quality (step pixels to skip between sampling)
    getPalette(imagePath, 5, 1).then(palette => { 
        const colorNames = [];
        console.log("colorThief palette:", palette);
        for(let i = 0; i < palette.length; i++) {
            const hexCol = rgbToHex(palette[i][0], palette[i][1], palette[i][2]).toUpperCase();

            // console.log("hex:", hexCol);
            console.log(`<div style='height:100; width:100; background-color: ${hexCol}'></div>`);
            
            // color-namer
            const colorName = namer(hexCol, { distance : "deltae", pick: ['basic', "pantone"] });
            if(colorName.basic[0].distance < 25)
            {
                colorNames.push(colorName.basic[0].name.toLowerCase());
            }
            if(colorName.pantone[0].distance < 25)
            {
                colorNames.push(colorName.pantone[0].name.toLowerCase());
            }
        }
        
        const ret = [...new Set(colorNames)];
        console.log("Color names:", ret);
        return ret;
    })
    .catch(err => {
        console.log(err);
        return [];
    });
}

function rgbToHex(r : number, g : number, b : number)
{
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }).join('');
}
