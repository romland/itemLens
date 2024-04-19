# itemLens
Inventory management (for at home). There are many like it, but this one is mine.

The primary use is:
`Do I have that and where the heck is it?` and `Why did I buy it?`

I am no fan of data-entry, so, adding new products/items should be as automated as 
possible (using any device). Most of the effort went into this bit.

### How to use
To add a product, grab your phone and take a picture of the product and scan the
QR-code on the container to place it in. (Note: this is the goal. Need better reverse
image search next.)

That's it.

If feeling particularly ambitious on a day, you can also:
- take a picture of an invoice/receipt (itemLens will use image classification/OCR/LLM to get the juicy bits)
- add additional photos (using camera or just paste in links)
- scan QR-codes containing URLs to relevant documents
- paste in a list of attributes (weight/color/size/etc)
- add tags, amount, description, etc (but then you are obviously _very_ ambitious as it might require typing)

### Features
- Paste-parser for key-value-pairs
- QR-code reading (server and client)
- Optical Character Reading (OCR)
- Image classification (Blip)
- LLM Summaries (Groq)
- Invoice/receipt data extraction
- Download-and-store documents (link-rot no more)
- Image processing (background removal, thumbnail, etc)
- Color extraction
- Multiple inventories (i.e. one for shoes, another for clothes, and yet another for electronics)

### How I use it
- Which label printer
- Pictures of containers
- Firefox QR-code generator for current link

# Third parties
I really hate it when I have to register for some 3rd party services to try out some software,
therefore, that is all voluntary. Set the flag `NO_THIRD_PARTY_SERVICES` to `true` in `.env` 
and you can use it all -- but adding new products will be more work.

### About third party services and incurred costs
Goal is: No fixed cost / month -- only pay for use


# Development

## Stack
SvelteKit 2, PWA, Prisma, SQLite, Tailwind CSS, TypeScript


## Installing

### Get it:
```bash
npx degit romland/itemLens itemLens
```

### Create some directories
```bash
mkdir `static/images`
mkdir `static/images/u`
```

### Fill in your details in .env
```bash
cp .env.example .env
```

### Run for development:
```bash
cd sveltekit-starter
npm install
npm run dev
```

### Database migration:
```bash
npx prisma migrate dev --name init
```

### Database seeding:
```bash
npx prisma db seed
```

### Use default user:
```
Username: admin
Password: password
```

### Build for production
```bash
npm run build
```

### External services
Start the docker containers in Ubuntu VM if they are not running with:
containers-start.sh

Ubuntu WSL:
    For OCR:
    cd ~/doctr/api
    sudo make run

    For BG removal:
    sudo docker run -p 7000:7000 danielgatis/rembg s

On Jetson:
    For object identification:
    ...

# TODO / notes
- consider: Is it faster to check with a model running on Jetson: is there a QR code in the picture?
- Investigate how fast inference can run on a beefy RasPi (use OpenCL!)
- TODO fields when adding items:
    inventory   Inventory? @relation(fields: [inventoryId], references: [id])
    inventoryId Int?
    usage      InUse[] 
- Need some thinking about logic to take _valuable_ data from photos and apply it to items for searching


# TODO README:
Screenshot(s), logo, video(s)
