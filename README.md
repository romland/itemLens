# Sveltekit + PWA + CRUD
This is a sveltekit2-starter + PWA (@vite-pwa/sveltekit)


## sveltekit-starter

A simple CRUD project using SvelteKit, Prisma, sqlite, Tailwind CSS, and TypeScript with many-to-many relationship example.

Or you can use `degit`:

```bash
npx degit ronsen/sveltekit-starter sveltekit-starter
```

Run these following commands to try locally:

```bash
cd sveltekit-starter
npm install
npm run dev
```

```bash
cp .env.example .env
```

Migrate the database:

```bash
npx prisma migrate dev --name init
```

Database seeding:

```bash
npx prisma db seed
```

Create `/static/images` directory.
Create `/static/images/u` directory.

Sign in with a sample user:

```
Username: admin
Password: password
```


# Run services
Ubuntu WSL:
    For OCR:
    cd ~/doctr/api
    sudo make run

    For BG removal:
    sudo docker run -p 7000:7000 danielgatis/rembg s

On Jetson:
    For object identification:
    ...

