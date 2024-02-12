import Jimp from 'jimp';
import jsQR from 'jsqr';

export default class UrlDownloader
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
        const imageData = await UrlDownloader.getImageData(imagePath);
        const qrData = await UrlDownloader.decodeQR(imageData);
        console.log("QR DATA:", qrData);

        if(!qrData) {
            return null;
        }

        if(!UrlDownloader.isURL(qrData)) {
            console.log("There is a QR code, but it's not an URL. It says:", qrData);
            return null;
        }

        return await UrlDownloader.downloadURL(qrData);
    }

    private static async downloadURL(url : string) : Promise<string|null>
    {
          try {
            const response = await fetch("http://localhost:8001", {
              method: 'POST',
              body: `url=${url}`,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
              },
            });
            
            if (response.ok) {
              const result = await response.text();
              console.log("URL download result", result.length, "bytes");
              return result;
            } else {
              console.log('URL download HTTP error:', response.statusText);
              return null;
            }

          } catch (error) {
            console.log('URL download error:', error.message);
            return null;
          }
        
    }


    private static isURL(url : string)
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
        return await UrlDownloader.decodeQR(imageData) !== null;
    }
}