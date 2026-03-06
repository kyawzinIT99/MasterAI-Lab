const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1512, height: 772 });
    await page.goto('http://localhost:8008', { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Scroll down to 90% of max scroll
    await page.evaluate(() => {
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        window.scrollTo(0, maxScroll * 0.90);
    });

    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: 'screenshot_training_tools.png', fullPage: false });
    await browser.close();
    console.log("Done");
})();
