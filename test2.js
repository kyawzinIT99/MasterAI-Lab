const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:8008', { waitUntil: 'networkidle0' });
  
  const content = await page.content();
  console.log("HTML length:", content.length);
  
  const loaderDisplay = await page.$eval('#loader', el => window.getComputedStyle(el).display);
  console.log("Loader display:", loaderDisplay);
  
  await browser.close();
})();
