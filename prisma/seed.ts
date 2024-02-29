import { Item, User, Inventory, Container, PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import slugify from 'slugify';
import bcrypt from 'bcrypt';
import crypto from "crypto";

const prisma = new PrismaClient();

async function addUser() {
    let user = await prisma.user.findUnique({
        where: {
            username: 'admin'
        }
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                username: 'admin',
                password: await bcrypt.hash('password', 10),
                token: crypto.randomUUID()
            }
        });
    }

    return user;
}


async function addInventories() {
    const names = ['Electronics', 'DIY', 'Clothes', 'Shoes'];
    const classes = [['o', 'r', '*'], ["*"], ["clothes"], ["shoes"]];

    const inventories: Inventory[] = [];

    for (let i = 0; i < names.length; i++) {
        const description = faker.lorem.paragraphs(3, '\n\n');

        const inventory = await prisma.inventory.create(
            {
                data: {
                    name: names[i],
                    description: description,
                    classes: JSON.stringify(classes[i]),
                }
            }
        );

        inventories.push(inventory);
    }

    return inventories;
}

/*
model Container {
  id          Int         @id @unique @default(autoincrement())
  parentId    Int?        @unique
  parent      Container?  @relation("ParentRelation", fields: [parentId], references: [id])
  children    Container[] @relation("ParentRelation")

  // Ponder: A or A.001 ??? How fine-grained? How important is it to have a hierarchy?
  name        String @unique    // A or A.001 (Note: sub-containers must be denoted with period)
  description String            // closet with door
  location    String?           // top of desk (JR)
  photoPath   String?

  items       ItemsInContainer[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
*/
async function addLocation(name: string, description: string, location: string, trayCount: number, imageWebPath: string, startTray: number = 1)
{
    const container = await prisma.container.create(
        {
            data: {
                name,
                description,
                location,
                photoPath: imageWebPath
            }
        }
    );

    for(let i = startTray; i < (trayCount+startTray); i++) {
        const trayId = i.toString().padStart(3, '0')
        await prisma.container.create(
            {
                data: {
                    parentId: container.name,
                    name: `${name} ${trayId}`,
                    description: "",
                }
            }
        )
    }
}


async function addItems(user: User)
{
    const tags = ['raspberry pi', 'jetson', 'esp32', 'pico', 'lg', 'samsung', 'nokia'];

    const items: Item[] = [];

    for (let i = 0; i < 20; i++) {
        const words = faker.lorem.words(5).split(' ');
        const title = words.map((word) => {
            return word[0].toUpperCase() + word.substring(1);
        }).join(" ");

        const slug = slugify(title.toLowerCase());
        const description = faker.lorem.paragraphs(3, '\n\n');

        const item = await prisma.item.create(
            {
                data: {
                    title,
                    slug,
                    description,
                    amount: 1,
                    inventoryId: 1,
                    authorId: user.id,
                    reason: "Curiosity",
                    photos: {
                        create: [
                            {
                                type : "item",
                                orgPath: "/images/_seed_org.jpg",
                                cropPath: "/images/_seed_crop.png",
                                thumbPath: "/images/_seed_thumb.jpg",
                                // TODO ocr: Refine? Separate table? How will we use it after pre-processing?
                                ocr: '{"resultcode":200,"message":"Success","data":[[]]}',
                                // TODO colors: Refine? Separate table? How will we use it after pre-processing?
                                colors: "[ 'black', 'gray', 'midnight blue', 'manatee' ]",
                            },
                            {
                                type : "receipt",
                                orgPath: "/images/_seed_receipt.jpg",
                                cropPath: null,
                                thumbPath: null,
                                // TODO ocr: Refine? Separate table? How will we use it after pre-processing?
                                ocr: '{"resultcode":200,"message":"Success","data":[[]]}',
                                // TODO colors: Refine? Separate table? How will we use it after pre-processing?
                                colors: "[ 'white' ]",
                            },
                        ]
                    },
                    documents: {
                        create: [
                            {
                                type: "product-page",
                                title: "Reely Carbon Fighter III 1_ 6 RC model car, petrol-powered buggy, rear-wheel drive, RtR 2.4 GHz_ Amazon.de_ Toys",
                                source: "https://www.amazon.de/-/en/Reely-Carbon-Fighter-III-petrol-powered/dp/B00CSS1RF4",
                                path: "/images/_seed_document.html",
                                extracts: "blah blah"
                            }
                        ]
                    },
                    tags: {
                        connectOrCreate: tags.map((name) => {
                            return {
                                where: { slug: name },
                                create: {
                                    name,
                                    slug: name
                                }
                            }
                        })
                    },
                    locations: {
                        create: {
                            container : {
                                connectOrCreate: {
                                    where: { name : "A 001" },
                                    create: {
                                        name: "A 001",
                                        description: "A 001 - A 060, blue metal cabinet with 60 trays",
                                        location: "Study",
                                        photoPath: "/images/_seed_container.jpg"
                                    }
                                },
                            }
                        }
                    },
                    attributes: {
                        create: [
                            {
                                key: "Weight",
                                value: "0.2kg"
                            },
                            {
                                key: "Color",
                                value: "blue",
                            },
                            {
                                key: "Power connector",
                                value: "USB-C"
                            }
                        ]
                    },
                    usage: {
                        create: [
                            {
                                title: "On RP CM3 in shed",
                                description: "Because it's not a bad camera"
                            }
                        ]
                    }
                }
            }
        );

        items.push(item);
    }

    return items;
}

async function main() {
    const user = await addUser();
    await addInventories();
    await addLocation("A", "Blue metal MARS container", "Study", 60, "/images/containers/A_crop.png", 1);
    await addLocation("B", "Plastic cabinet", "Study", 16, "/images/containers/B_crop.png", 1);
    await addLocation("C", "Paper storage container", "Study", 3, "/images/containers/C_crop.png", 1);
    await addLocation("D", "Paper storage container", "Study", 3, "/images/containers/D_crop.png", 1);
    await addLocation("E", "IKEA wooden cabinet", "Study", 6, "/images/containers/E_crop.png", 1);
    await addLocation("F", "Blue metal MARS container", "Study", 60, "/images/containers/F_crop.png", 61);

    await addLocation("Z", "Virtual", "Void", 3, "/images/containers/other_crop.png", 1);

    /* TODO: be able to set names of sub-containers here in the seeds
    await addLocation("Z 001", "Unsorted", "Void", 0, "/images/containers/other_crop.png", 1);
    await addLocation("Z 002", "Ordered", "Void", 0, "/images/containers/other_crop.png", 1);
    await addLocation("Z 003", "Wishlist", "Void", 0, "/images/containers/other_crop.png", 1);
    */

    await addItems(user);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    })