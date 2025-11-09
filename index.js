import dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import cron from 'node-cron';
import express from 'express';

// --- CONFIGURATION ---
dotenv.config();
puppeteer.use(StealthPlugin());

const CONFIG = {
    PORT: process.env.PORT || 4567,
    DISCORD_URL: 'https://discord.com/channels/1419249274356502600/1419325841099329678',
    EMAIL: process.env.EMAIL,
    PASSWORD: process.env.PASSWORD,
    MAX_RETRIES: 3,
    CRON_SCHEDULE: '*/2 * * * *', // Every 2 minutes
};

const SELECTORS = {
    emailInput: 'input[name="email"]',
    passwordInput: 'input[name="password"]',
    channelList: 'ul[aria-label="Channels"]',
    // Add a selector that only exists AFTER login to check session status
    loggedInCheck: 'div[aria-label="User area"]', 
};

const app = express();
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// --- BROWSER INSTANCE (SHARED) ---
// We will initialize these once and reuse them.
let browser = null;
let page = null;


// --- HELPER FUNCTIONS (Your functions are good, no changes needed here) ---

const ensurePageLoaded = async (page) => {
    console.log('Waiting for page to fully load...');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('✅ Page loaded successfully.');
};

const waitForSelectorWithRetries = async (page, selector) => {
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            await page.waitForSelector(selector, { timeout: 10000 });
            return true;
        } catch (error) {
            console.log(`⚠️ Selector "${selector}" not found, retrying... (${attempt}/${CONFIG.MAX_RETRIES})`);
            if (attempt < CONFIG.MAX_RETRIES) {
                await page.reload({ waitUntil: 'domcontentloaded' });
            }
        }
    }
    console.log(`❌ Failed: Selector "${selector}" not found after all retries.`);
    return false;
};

// --- CORE LOGIC (Modified) ---

const login = async (page) => {
    console.log('Attempting to log in...');
    if (!await waitForSelectorWithRetries(page, SELECTORS.emailInput)) return;

    await page.type(SELECTORS.emailInput, CONFIG.EMAIL);
    await page.type(SELECTORS.passwordInput, CONFIG.PASSWORD);
    await delay(500);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle0' }); // Wait for page to load after login
    console.log('✅ Login form submitted.');
};

const sendMessage = async (page) => {
    console.log('Waiting for channel to be ready...');
    if (!await waitForSelectorWithRetries(page, SELECTORS.channelList)) return;

    console.log('✅ Channel found. Sending message...');
    await page.keyboard.press('/');
    await page.keyboard.type('da', { delay: 100 });
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(1000);
    await page.keyboard.press('Enter');
    console.log('✅ Message sent!');
};

/**
 * Main scraping task - NOW LIGHTWEIGHT
 * This function is now much lighter because it reuses the existing browser and page.
 */
const runDiscordTask = async () => {
    console.log('🚀 Starting Discord task...');
    try {
        // Go to the page to ensure it's active and not timed out
        await page.goto(CONFIG.DISCORD_URL, { waitUntil: 'networkidle0' });

        // Check if we need to log in again (e.g., session expired)
        const isLoggedIn = await page.$(SELECTORS.loggedInCheck);
        if (!isLoggedIn) {
            console.log("Session expired. Logging in again.");
            await login(page);
        } else {
            console.log("Already logged in.");
        }

        await sendMessage(page);

    } catch (error) {
        console.error('❌ An error occurred during the scheduled task:', error);
    }
    console.log('✅ Task finished.');
};


// --- SERVER AND INITIALIZER (Modified) ---

/**
 * Initializes the browser once and starts the server and scheduler.
 */
const startServer = async () => {
    try {
        console.log("Launching browser for the first time...");
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', "--single-process", "--no-zygote"],
        });
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(90000);

        // Perform initial login
        await page.goto(CONFIG.DISCORD_URL);
        await login(page);

        // Now that the browser is ready, start the server and the cron job
        app.listen(CONFIG.PORT, () => {
            console.log(`Server running on port ${CONFIG.PORT}`);
            console.log(`Scheduling task with cron pattern: ${CONFIG.CRON_SCHEDULE}`);
            cron.schedule(CONFIG.CRON_SCHEDULE, runDiscordTask);
        });

    } catch (error) {
        console.error("❌ Failed to initialize the browser:", error);
        if (browser) await browser.close();
        process.exit(1); // Exit if setup fails
    }
};

startServer();