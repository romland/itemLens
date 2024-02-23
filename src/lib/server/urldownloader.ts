import Jimp from 'jimp';
import jsQR from 'jsqr';
import { downloadQRURLs, getSafeFilename } from './photouploads';
import fs from 'fs';

export async function downloadAndStoreDocuments(item: Item, remoteSite: string, data: any, diskFolder: string, webFolder: string, formPrefix: string)
{
    //
    // Download all URLs contained in _uploaded_ pictures containing QR codes (TODO: SECURITY?)
    // (this is largely obsolete after I started using client-side QR code scanner)
    //
    await downloadQRURLs(data, diskFolder, webFolder, formPrefix, remoteSite, item);

    //
    // Download all URLs in the URLs field (TODO: SECURITY?)
    //
    const lines = (data.urls as string).split("\n");
    for(let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if(!QRUrlDownloader.isURL(line)) {
        console.log(`not an URL: ${line}`);
        continue;
      }

      const str: string|null = await QRUrlDownloader.downloadURL(line);
      if(!str) {
        console.log(`Did not get any result when downloading: ${line}`);
        return;
      }

      const pageData = JSON.parse(str);
      const docFilename = getSafeFilename(`${item.id}-doc`);

      fs.writeFileSync(`${diskFolder}/${docFilename}.html`, pageData.html, { encoding: "utf8" });

      console.log("Creating document from explicit URL", docFilename);
      try {
        await db.document.create({
          data: {
            itemId: item.id,
            type: "uncategorized",
            title: pageData.title,
            source: pageData.url,
            path: `${webFolder}/${docFilename}.html`,
            extracts: JSON.stringify(pageData.extracts)
          }
        });
      } catch (ex) {
        console.error("Error creating document in DB:", ex);
      }

      console.log("Downloaded explicitly stated URL:", line);
    }
}


export default class QRUrlDownloader
{
    static async decodeQR(imageData) : Promise<string|null>
    {
        try {
            // Use jsQR to decode the QR code
            const decodedQR = jsQR(imageData.data, imageData.width, imageData.height);

            if (!decodedQR) {
                // throw new Error('QR code not found in the image.');
                return null;
            }

            console.log("QR code decoded:", decodedQR.data)

            return decodedQR.data;
        } catch (error) {
            console.error('Error decoding QR code:', error);
            return null;
        }
    }

    static async fetchQRCodeDocument(imagePath : string) : Promise<string|null>
    {
        const imageData = await QRUrlDownloader.getImageData(imagePath);
        const qrData = await QRUrlDownloader.decodeQR(imageData);
        console.log("QR DATA:", qrData);

        if(!qrData) {
            return null;
        }

        if(!QRUrlDownloader.isURL(qrData)) {
            console.log("There is a QR code, but it's not an URL. It says:", qrData);
            return null;
        }

        return await QRUrlDownloader.downloadURL(qrData);
    }

    static async downloadURL(url : string) : Promise<string|null>
    {
          try {
            const response = await fetch("http://localhost:8001", {
              method: 'POST',
              body: `url=${encodeURIComponent(url)}`,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
              },
            });
            
            if (response.ok) {
              const result = await response.text();
              console.log("URL download result", result.length, "bytes");
              return result;
            } else {
              console.log('URL download HTTP error:', response.statusText, url);
              return null;
            }

          } catch (error) {
            console.log('URL download error:', error.message, url);
            return null;
          }
    }


    static isURL(url : string)
    {
        const urlRegExp = /^(?:(?:https?|ftp):\/\/)?(?:\S+(?::\S*)?@)?(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:\/[^\s]*)?$/i;
        return urlRegExp.test(url);
    }

    private static async getImageData(imagePath : string) : Promise<any>
    {
        try {
            // Load the image with Jimp
            const image = await Jimp.read(imagePath);

            // Get the image data
            const imageData = {
                data: new Uint8ClampedArray(image.bitmap.data),
                width: image.bitmap.width,
                height: image.bitmap.height,
            };
            return imageData;
        } catch (error) {
            console.error('Error loading image for QR check:', error);
            return null;
        }
    }

    private static async hasQRcode(imageData) : Promise<boolean>
    {
        return await QRUrlDownloader.decodeQR(imageData) !== null;
    }
}