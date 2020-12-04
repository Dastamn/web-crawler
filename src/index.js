const fetch = require("node-fetch");
const urlParser = require("url");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const SAVE_DIR = "./images";

const isBase64 = src => src.search(/^data:image\/(jpe?g|png);base64, ?/g) == 0;

const isValidFormat = src => src.search(/.(jpe?g|png)$/i) > 0;

const completeUrl = ({ protocol, host, path }) =>
  path.startsWith("http")
    ? path
    : `${protocol}//${host}${path.startsWith("/") ? "" : "/"}${path}`;

const retrieveLinks = (aTags, { protocol, host }) =>
  aTags
    .map((_, a) => a.attribs.href)
    .filter((_, link) => link && link.matches(/[#\/]/i))
    .map((_, link) => completeUrl({ protocol, host, path: link }))
    .filter((_, link) => link.startsWith(`${protocol}//${host}`))
    .get();

const retrieveImageUrls = (imgTags, { protocol, host }) =>
  imgTags
    .map((_, img) => img.attribs.src)
    .filter((_, src) => !isBase64(src) && isValidFormat(src))
    .map((_, src) => completeUrl({ protocol, host, path: src }))
    .get();

const downloadImageFromUrl = url => {
  fetch(url)
    .then(res => {
      const filename = path.basename(url);
      const dest = fs.createWriteStream(path.join(SAVE_DIR, filename));
      res.body.pipe(dest);
    })
    .catch(_ => console.error(`couldn't download image from ${url}`));
};

const crawl = async ({ url, seen = {} }) => {
  if (!url || seen[url]) return;
  seen[url] = true;
  const { host, protocol } = urlParser.parse(url);
  console.info(`crawling ${url}...`);
  const html = await fetch(url).then(res => res.text());
  const $ = cheerio.load(html);
  const $img = $("img");
  const $a = $("a");
  const imageUrls = retrieveImageUrls($img, { protocol, host });
  const links = retrieveLinks($a, { protocol, host });
  await Promise.all(
    imageUrls.map(imageUrl => downloadImageFromUrl(imageUrl))
  ).catch(err => console.log(err));
  await Promise.all(links.map(link => crawl({ url: link, seen })));
};

if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

crawl({
  url: "https://anilist.co",
});
