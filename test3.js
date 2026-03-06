const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Intercept network requests to see if CDNs are failing
  await page.setRequestInterception(true);
  page.on('request', req => {
    console.log('REQ:', req.url());
    req.continue();
  });
  page.on('requestfailed', req => {
    console.log('REQ FAILED:', req.url(), req.failure().errorText);
  });

  await page.goto('http://localhost:8008', { waitUntil: 'networkidle2' });
  await browser.close();
})();
