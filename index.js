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
};

const app = express();
const delay = (ms) => new Promise(res => setTimeout(res, ms));


// --- HELPER FUNCTIONS ---

/**
 * A failsafe method to ensure the page is fully loaded and interactive.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 */
const ensurePageLoaded = async (page) => {
    console.log('Waiting for page to fully load...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.waitForSelector('body', { visible: true }),
    ]);
    console.log('✅ Page loaded successfully.');
};

/**
 * Tries to find a selector, reloading the page and retrying on failure.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 * @param {string} selector The CSS selector to find.
 * @returns {Promise<boolean>} True if found, false otherwise.
 */
const waitForSelectorWithRetries = async (page, selector) => {
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            await page.waitForSelector(selector, { timeout: 10000 });
            return true; // Selector found
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


// --- CORE LOGIC ---

/**
 * Handles the login process for Discord.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 */
const login = async (page) => {
    console.log('Attempting to log in...');
    if (!await waitForSelectorWithRetries(page, SELECTORS.emailInput)) return;

    await page.type(SELECTORS.emailInput, CONFIG.EMAIL);
    await page.type(SELECTORS.passwordInput, CONFIG.PASSWORD);
    await delay(500);
    await page.keyboard.press('Enter')
    console.log('✅ Login form submitted.');
};

/**
 * Waits for the channel and sends the message.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 */
const sendMessage = async (page) => {
    console.log('Waiting for channel list to appear...');
    if (!await waitForSelectorWithRetries(page, SELECTORS.channelList)) return;

    console.log('✅ Channel found. Sending message...');
    await page.keyboard.press('/');
    await page.keyboard.type('da', { delay: 100 }); // Type with a small delay
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(1000);
    await page.keyboard.press('Enter');
    console.log('✅ Message sent!');
};

/**
 * Main scraping task that orchestrates the browser actions.
 */
const runDiscordTask = async () => {
    let browser = null;
    console.log('🚀 Starting Discord task...');
    try {
        browser = await puppeteer.launch({
            executablePath: '/opt/render/.cache/puppeteer/chrome/linux-1084059/chrome-linux/chrome', // Example path, might need adjustment
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(90000); // 90 seconds

        await page.goto(CONFIG.DISCORD_URL);
        await ensurePageLoaded(page);

        await login(page);
        await sendMessage(page);

    } catch (error) {
        console.error('❌ An error occurred during the task:', error);
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
};


// --- SERVER AND SCHEDULER ---

app.listen(CONFIG.PORT, () => {
    console.log(`Server running on port ${CONFIG.PORT}`);
    console.log(`Scheduling task with cron pattern: ${CONFIG.CRON_SCHEDULE}`);
    cron.schedule(CONFIG.CRON_SCHEDULE, runDiscordTask);
});