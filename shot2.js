const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1512, height: 772 });
    await page.goto('http://localhost:8008', { waitUntil: 'networkidle2', timeout: 15000 });

    // Wait for the button
    await page.waitForSelector('#ai-chat-toggle');

    // Click the chat toggle to open the window
    await page.click('#ai-chat-toggle');

    // Wait for animation
    await new Promise(r => setTimeout(r, 1000));

    await page.screenshot({ path: 'screenshot_chatbot.png', fullPage: false });
    await browser.close();
    console.log("Done");
})();
