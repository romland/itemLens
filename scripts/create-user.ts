// scripts/create-user.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as readline from 'readline';
import { Writable } from 'stream';

    bcrypt.setRandomFallback((len) => Array.from(crypto.randomBytes(len)));

const prisma = new PrismaClient();

// Utility function to create an interactive prompt
function askQuestion(query: string, isSecret: boolean = false): Promise<string> {
    return new Promise((resolve) => {
        let muted = false;
        
        // Create a custom writable stream that mutes output when typing passwords
        const mutableStdout = new Writable({
            write: function (chunk, encoding, callback) {
                if (!muted) {
                    process.stdout.write(chunk, encoding);
                }
                callback();
            }
        });

        const rl = readline.createInterface({
            input: process.stdin,
            output: mutableStdout,
            terminal: true
        });

        rl.question(query, (answer) => {
            rl.close();
            if (isSecret) console.log(); // Add a newline since the enter key was muted
            resolve(answer);
        });

        if (isSecret) {
            muted = true;
        }
    });
}

async function main() {
    console.log("=== Create New ItemLens User ===\n");

    const username = await askQuestion("Username: ");
    if (!username.trim()) {
        console.error("❌ Error: Username is required.");
        process.exit(1);
    }

    try {
        const existingUser = await prisma.user.findUnique({ 
            where: { username: username.trim() } 
        });

        if (existingUser) {
            console.error(`❌ Error: User with username '${username}' already exists.`);
            process.exit(1);
        }

        // Prompt for password with muted output
        const password = await askQuestion("Password: ", true);
        if (!password.trim()) {
            console.error("❌ Error: Password is required.");
            process.exit(1);
        }

        const name = await askQuestion("Full Name (optional): ");
        const email = await askQuestion("Email (optional): ");

        console.log("\n⏳ Creating user...");

        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
        const token = crypto.randomUUID();

        const user = await prisma.user.create({
            data: {
                username: username.trim(),
                password: hashedPassword,
                token,
                name: name.trim() || username.trim(),
                email: email.trim() || null,
            }
        });

        console.log(`✅ Successfully created user: ${user.username} (ID: ${user.id})`);
    } catch (error) {
        console.error("❌ Failed to create user:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();