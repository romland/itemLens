import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import slugify from 'slugify';
import { db } from '$lib/server/database';
import { getTagIds } from "$lib/server/services";
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
import type { Item, Photo, KVP } from '@prisma/client';
import { savePhotos, processInvoicePhotos, processOtherPhotos, processProductPhotos } from '$lib/server/photouploads';


export const actions = {
    default: async ({ locals, request }) => {
        const orgData = await request.formData();
        const containers = orgData.getAll("containers");
        const data = Object.fromEntries(orgData);
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        console.log("formData:", orgData);

        if (title.length == 0) {
            console.warn("Missing required field(s): title");
            return fail(400, {
                error: true,
                message: '<strong>Title</strong> can not be blank.'
            });
        }

        if(containers.length === 0) {
          console.warn("Missing required field(s): containers");
          return fail(400, {
              error: true,
              message: 'You must have at least one <strong>Container</strong>.'
          });
        }

        const remoteSite = "https://dev.providi.nl";
        const diskFolder = "static/images/u";
        const webFolder = "/images/u";

        const photos: Photo[] = await savePhotos(data, diskFolder, webFolder, "file.", data.downloadImages as string);
        const kvps: KVP[] = formKVPsToDBrows(data);

/*
console.log(photos);
console.log("NOT SAVING ANYTHING");
return fail(400, {
  error: true,
  message: '<strong>Debugging</strong>'
});
*/

        const ids = await getTagIds(tagcsv);
        const item : Item = await db.item.create({
            data: {
                title: title.trim(),
                reason: data.reason as string || "",
                amount: parseInt(data.amount as string, 10) || null,
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
                          connect: { name : cont },
                      }
                    }
                  })
                },
                slug: slugify(title.trim().toLowerCase()),
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

        downloadAndStoreDocuments(item, remoteSite, data, diskFolder, webFolder, "qr.");

        processProductPhotos(item, remoteSite);
        processInvoicePhotos(item, remoteSite);
        processOtherPhotos(item, remoteSite);

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
