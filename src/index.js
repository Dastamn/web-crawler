const fetch = require("node-fetch");
const urlParser = require("url");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const cliProgress = require("cli-progress");
const yargs = require("yargs");

const SAVE_DIR = "./images";

const IMG_VAILD_FORMAT = /.(jpe?g|png)$/i;
const IMG_URL = /(http(s?):)([\/.\w\s-])*\.(?:jpe?g|png)/g;

const isValidFormat = src => src.search(IMG_VAILD_FORMAT) > 0;

const completeUrl = ({ protocol, host, path }) =>
  path.startsWith("http")
    ? path
    : `${protocol}//${host}${path.startsWith("/") ? "" : "/"}${path}`;

const retrieveImageUrls = (imgTags, { protocol, host }) =>
  imgTags
    .map((_, img) => img.attribs.src)
    .filter((_, src) => isValidFormat(src))
    .map((_, src) => completeUrl({ protocol, host, path: src }))
    .get();

const retrieveBackgroundUrls = tags =>
  tags
    .map((_, tag) => tag.attribs.style)
    .map((_, style) => style.match(IMG_URL))
    .get();

const downloadImageFromUrl = url =>
  fetch(url).then(res => {
    const filename = path.basename(url);
    const dest = fs.createWriteStream(path.join(SAVE_DIR, filename));
    res.body.pipe(dest);
  });

const dumpArrayToFile = (arr = [], filename = "error.log") => {
  f = fs.createWriteStream(`./${filename}`);
  arr.forEach(e => f.write(`${e}\n`));
  f.close();
};

const crawl = async ({ url, tags = [] }) => {
  const { host, protocol } = urlParser.parse(url);
  console.info(`crawling: ${url}`);
  const html = await fetch(url).then(res => res.text());
  const $ = cheerio.load(html);
  const $img = $("img");
  const $tags = tags.map(tag => $(tag));
  const imageUrls = [
    ...retrieveImageUrls($img, { protocol, host }),
    ...$tags.map($t => retrieveBackgroundUrls($t)).flat(1),
  ];
  const progress = new cliProgress.SingleBar(
    {
      format: "{bar} | {percentage}% | {value}/{total} images",
    },
    cliProgress.Presets.shades_classic
  );
  progress.start(imageUrls.length, 0);
  const failures = [];
  await Promise.all(
    imageUrls.map(imageUrl =>
      downloadImageFromUrl(imageUrl)
        .then(() => progress.increment())
        .catch(_ => failures.push(url))
    )
  )
    .then(
      () =>
        failures.length &&
        console.error(
          `Couldn't download ${failures.length} images.\nCheckout the error logging file.`
        ) &&
        dumpArrayToFile(failures)
    )
    .finally(() => progress.stop());
};

if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

const { url, tags = "" } = yargs.argv;

(url &&
  crawl({
    url,
    tags: tags.split(/, +/i),
  })) ||
  console.error("Please enter a valid url.");
