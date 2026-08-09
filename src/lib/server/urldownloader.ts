import sharp from 'sharp';
import jsQR from 'jsqr';
import { db } from '$lib/server/database';
import type { Item } from '@prisma/client';
import { downloadQRURLs, getSafeFilename } from './photouploads';
import fs from 'fs';
import { summarizeWebpageExtract } from './llm';
import { PDFParse } from 'pdf-parse';

export async function downloadAndStoreDocuments(target: { itemId?: number, timelineNoteId?: number }, remoteSite: string, data: any, diskFolder: string, webFolder: string, formPrefix: string)
{
    //
    // Download all URLs contained in _uploaded_ pictures containing QR codes (TODO: SECURITY?)
    // (this is largely obsolete after I started using client-side QR code scanner)
    //
    await downloadQRURLs(data, diskFolder, webFolder, formPrefix, remoteSite, target.itemId ? { id: target.itemId } : { id: target.timelineNoteId });

    //
    // Download all URLs in the URLs field (TODO: SECURITY?)
    //
    const lines = (data.urls as string).split("\n");

    for(let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if(!QRUrlDownloader.isURL(line)) {
        if(line !== "") {
          console.log(`not an URL: ${line}`);
        }
        continue;
      }

      let document;
      try {
        document = await db.document.findFirst({
            where: {
                source: line,
                itemId: target.itemId || null,
                timelineNoteId: target.timelineNoteId || null
            }
        });

        if (!document) {
            document = await db.document.create({
              data: {
                itemId: target.itemId || null,
                timelineNoteId: target.timelineNoteId || null,
                type: "uncategorized",
                title: "",
                source: line,
                path: "",
                extracts: "[]"
              }
            });
        }        
      } catch (ex) {
        console.error("Error creating document in DB:", ex);
      }

      // Divert to PDF handler if needed
      if (await isPdfUrl(line)) {
        try {
          await handlePdfDownload(line, target, document?.id, diskFolder, webFolder);
        } catch (e) {
          console.error(`Error downloading PDF ${line}:`, e);
        }
        continue; // Skip SingleFile logic
      }

      const str: string|null = await QRUrlDownloader.downloadURL(line);
      if(!str) {
        console.log(`Did not get any result when downloading: ${line}`);
        // return;
        continue;
      }

      const pageData = JSON.parse(str);
      const idStr = target.itemId ? `item-${target.itemId}` : `note-${target.timelineNoteId}`;
      const docFilename = getSafeFilename(`${idStr}-doc`);

      fs.writeFileSync(`${diskFolder}/${docFilename}.html`, pageData.html, { encoding: "utf8" });

      console.log("Creating document from explicit URL", docFilename);
      try {
        await db.document.update({
          where: {
            id : document?.id
          },
          data: {
            itemId: target.itemId || null,
            timelineNoteId: target.timelineNoteId || null,
            type: "uncategorized",
            title: pageData.title,
            source: pageData.url,
            path: `${webFolder}/${docFilename}.html`,
            extracts: JSON.stringify(pageData.extracts)
          }
        });
      } catch (ex) {
        console.error(`Error updating document in DB (${line}):`, ex);
        continue;
      }

      // if(pageData.extracts.length > 0 && pageData.extracts[0].length > 50) {
      const extractText = pageData.extracts?.[0] || "";
      console.log(`[LLM CHECK] Extracts found: ${pageData.extracts?.length || 0} | First extract length: ${extractText.length} chars`);

      if (extractText.length > 50) {
        try {
          const summary = await summarizeWebpageExtract(extractText);
          await db.document.update({
            where: {
              id : document?.id
            },
            data: {
              summary: summary
            }
          });
          console.log("Have summary of webpage:", summary);
        } catch (ex) {
          console.error(`Error updating document in DB (${line}):`, ex);
          continue;
        }
      } else {
        console.warn(`[LLM SKIPPED] Text extract too short (${extractText.length} chars) for URL: ${line}`);
      }

      // DEEP SCRAPE LOGIC (Consolidated)
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
      const keywords = /datasheet|manual|schematic|user guide|instructions|specs|pinout|wiring|\.pdf$/i;
      let match;
      let deepLinksFound = 0;
      
      while ((match = linkRegex.exec(pageData.html)) !== null && deepLinksFound < 3) {
          const href = match[1];
          const text = match[2].replace(/<[^>]+>/g, '').trim(); 
          
          if (keywords.test(href) || keywords.test(text)) {
              try {
                  const absUrl = new URL(href, line).href;
                  await db.document.create({
                      data: { title: `Found: ${text || href.split('/').pop()}`, source: absUrl, path: '', extracts: '[]', itemId: target.itemId || null, timelineNoteId: target.timelineNoteId || null }
                  });
                  deepLinksFound++;
              } catch (e) { /* ignore invalid urls */ }
          }
      }      
      console.log("Downloaded explicitly stated URL:", line);
    }
}

async function isPdfUrl(url: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.toLowerCase().endsWith('.pdf')) return true;
  } catch (e) {
    console.warn(`Invalid URL format: ${url}`);
  }

  try {
    const headRes = await fetch(url, { method: 'HEAD' });
    const contentType = headRes.headers.get('content-type') || '';
    return contentType.toLowerCase().includes('application/pdf');
  } catch (e) {
    console.warn(`HEAD request failed for ${url}, relying on URL parsing.`);
    return false;
  }
}

async function handlePdfDownload(url: string, target: { itemId?: number, timelineNoteId?: number }, documentId: any, diskFolder: string, webFolder: string) {
  console.log(`Detected PDF, downloading directly: ${url}`);
  const pdfRes = await fetch(url);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const idStr = target.itemId ? `item-${target.itemId}` : `note-${target.timelineNoteId}`;
  const docFilename = getSafeFilename(`${idStr}-doc`);
  
  fs.writeFileSync(`${diskFolder}/${docFilename}.pdf`, pdfBuffer);
  
  let extractedText = "";
  let pdfTitle = "PDF Document";
  
  let parser;
  try {
    // 1. Initialize with the buffer
    parser = new PDFParse({ data: pdfBuffer });
    
    // 2. Extract text (returns a TextResult object)
    const textResult = await parser.getText();
    extractedText = textResult.text;
    
    // 3. Extract metadata (returns an InfoResult object)
    const infoResult = await parser.getInfo();
    if (infoResult.info?.Title) {
        pdfTitle = infoResult.info.Title;
    }
    
  } catch (e: any) {
    console.error("Failed to parse PDF:", e);
  } finally {
    // 4. Always destroy to free memory, as stated in the docs
    if (parser) {
        await parser.destroy();
    }
  }

  const cappedText = extractedText.substring(0, 10000); // Cap for LLM safety

  await db.document.update({
    where: { id: Number(documentId) },
    data: {
      title: pdfTitle,
      path: `${webFolder}/${docFilename}.pdf`,
      extracts: JSON.stringify([cappedText])
    }
  });

  if (cappedText.trim().length > 50) {
    const summary = await summarizeWebpageExtract(cappedText);
    await db.document.update({
      where: { id: Number(documentId) },
      data: { summary: summary }
    });
    console.log("Have summary of PDF:", summary);
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
            const err = error as Error;
            console.log('URL download error:', err.message, url);
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
            // Load the image and extract raw RGBA pixels via Sharp
            const { data, info } = await sharp(imagePath)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            return {
                data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
                width: info.width,
                height: info.height,
            };
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