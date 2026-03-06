const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('index.html', 'utf8');
const $ = cheerio.load(html, { decodeEntities: false });

$('.scroll-section').removeClass('align-right').addClass('align-left');

const sections = $('.scroll-section').toArray();
const animatedSections = sections.filter(el => $(el).attr('data-enter'));

const count = animatedSections.length;
const startPct = 3;
const step = 90 / Math.max(1, count - 1);

animatedSections.forEach((el, idx) => {
  const enter = Math.round(startPct + (idx * step));
  const leave = Math.round(enter + Math.max(2, step * 0.7));
  $(el).attr('data-enter', enter);
  $(el).attr('data-leave', leave);
});

if (animatedSections.length > 0) {
  const last = $(animatedSections[animatedSections.length - 1]);
  last.attr('style', '');
  last.find('.section-inner').attr('style', '');
}

fs.writeFileSync('index.html', $.html());
console.log("Re-aligned and respaced all sections successfully!");
