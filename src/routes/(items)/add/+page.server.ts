import type { PageServerLoad, Actions } from './$types';

import slugify from 'slugify';
import fs from 'fs';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';

import type { Item, Photo, Prisma } from '@prisma/client';
import { formKVPsToDBrows, getTagIds } from "$lib/server/services";
import { uploadsDiskFolder, uploadsRemoteSite, uploadsWebFolder } from '$lib/server/constants';
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
import { savePhotos, getSafeFilename, processItemPhotosBackground } from '$lib/server/photouploads';
import { autoFill } from '$lib/server/autofill';

export const actions = {
    default: async ({ locals, request }) => {
        const orgData = await request.formData();
        const data = Object.fromEntries(orgData);

        const containers = orgData.getAll("containers");
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        if (title.length == 0) {
            console.warn("Missing required field(s): title");
        }

        if(containers.length === 0) {
          console.warn("Missing required field(s): containers");
          return fail(400, {
              error: true,
              message: 'You must have at least one <strong>Container</strong>.'
          });
        }

        const photos: Photo[] = await savePhotos(data, uploadsDiskFolder, uploadsWebFolder, "file.", data.downloadImages as string);
    		const kvps: Prisma.KVPCreateWithoutItemInput[] = formKVPsToDBrows(data);
        const ids = await getTagIds(tagcsv);

/*
console.log("formData:", orgData);
console.log("photos:", photos);
console.log("NOT SAVING ANYTHING");
return fail(400, {
  error: true,
  message: '<strong>Debugging</strong>'
});
*/

    		const parsedAmount = parseInt(data.amount as string, 10);
        const item : Item = await db.item.create({
            data: {
                title: title.trim() || "Default product",
                reason: data.reason as string || "",
                // amount: parseInt(data.amount as string, 10) || null,
        				amount: isNaN(parsedAmount) ? null : parsedAmount,
                photos: {
                  create: photos
                },
                attributes: {
                  create: kvps
                },
                // valid (motherfucker)
                locations: {
                  create: containers.map((cont) => {
                    return {
                      container : {
                          connect: { name : String(cont) },
                      }
                    }
                  })
                },
                slug: slugify(title.trim().toLowerCase()) || "default-product",
                description: description.trim(),
                authorId: locals.user.id,
                tags: {
                    connect: [...ids]
                }
            },
            include: {
              photos : true,
            }
        });

        const pastedUrls = orgData.getAll("pasted_urls[]") as string[];
        if (pastedUrls.length > 0) {
            data.urls = (data.urls as string || "") + "\n" + pastedUrls.join("\n");
        }

        const preDocsRaw = orgData.getAll("preprocessed_docs[]");
        const preDocs = preDocsRaw.map(d => JSON.parse(d as string));
        const preprocessedSources = new Set(preDocs.map(d => d.source));

        if (data.urls) {
          data.urls = (data.urls as string)
            .split('\n')
            .filter(u => u.trim() && !preprocessedSources.has(u.trim()))
            .join('\n');
        }

        const pastedDocsRaw = orgData.getAll("pasted_documents[]");
        const pastedDocs = pastedDocsRaw.map(d => JSON.parse(d as string));
        for (const doc of pastedDocs) {
            const filename = getSafeFilename(`${item.id}-note`);
            fs.writeFileSync(`${uploadsDiskFolder}/${filename}.txt`, doc.content, { encoding: "utf8" });
            await db.document.create({
                data: {
                    itemId: item.id,
                    type: "note",
                    title: doc.title,
                    source: "Pasted Note",
                    path: `${uploadsWebFolder}/${filename}.txt`,
                    extracts: JSON.stringify([doc.content])
                }
            });
        }

        for (const doc of preDocs) {
          await db.document.create({
            data: {
              itemId: item.id,
              type: doc.type === 'text' ? 'note' : 'uncategorized',
              title: doc.title || "",
              source: doc.source,
              path: doc.path,
              extracts: doc.extracts,
              summary: doc.summary || null
            }
          });
        }

        // Kick off heavy ML, OCR, and Document processing in the background (fire-and-forget)
        downloadAndStoreDocuments(item, uploadsRemoteSite, data, uploadsDiskFolder, uploadsWebFolder, "qr.").catch(e => console.error(e));
    		processItemPhotosBackground(item).catch(e => console.error(e));

        redirect(302, `/${item.id}/${item.slug}`);
    }
} satisfies Actions;


export const load = (async ({ locals, params }) => {
  console.log("add/page.server.ts:", locals, params);
  // TODO: Security -- can be fetched without being logged in now
  // TODO: only get containers for current inventory type (not sure where to set this yet)
  const containers = await db.container.findMany({
      select : {
        name : true,
        parentId : true,
        photoPath : true,
        description : true,
        location : true,
        children : {
          select : {
            name : true,
            parentId : true,
            description : true,
          }
        },
      },
      where: {
          AND: [
              { parentId: null }
          ]
      },
      orderBy: {
        name : "asc"
      }
  });

  return {
    containers: containers
  };
}) satisfies PageServerLoad;
