import assert from "node:assert";
import * as cheerio from "cheerio";
import {
  checkTitle,
  checkMetaDescription,
  checkHeadingStructure,
  checkAltText,
  checkViewport,
  checkAboveFoldCta,
  checkContactMethod,
  checkSocialLinks,
  checkHttps,
} from "./checks";

const load = (html: string) => cheerio.load(html);

assert.strictEqual(checkTitle(load("<title>A Good Enough Title Here</title>")).passed, true);
assert.strictEqual(checkTitle(load("<title>Hi</title>")).passed, false);
assert.strictEqual(checkTitle(load("<html><head></head></html>")).passed, false);

assert.strictEqual(
  checkMetaDescription(load(`<meta name="description" content="${"A".repeat(80)}">`)).passed,
  true,
);
assert.strictEqual(checkMetaDescription(load("<html></html>")).passed, false);

assert.strictEqual(checkHeadingStructure(load("<h1>Only one</h1>")).passed, true);
assert.strictEqual(checkHeadingStructure(load("<h1>One</h1><h1>Two</h1>")).passed, false);
assert.strictEqual(checkHeadingStructure(load("<p>No headings</p>")).passed, false);

assert.strictEqual(
  checkAltText(load('<img src="a.jpg" alt="a"><img src="b.jpg" alt="b">')).passed,
  true,
);
assert.strictEqual(
  checkAltText(load('<img src="a.jpg"><img src="b.jpg"><img src="c.jpg" alt="c">')).passed,
  false,
);
assert.strictEqual(checkAltText(load("<p>No images</p>")).passed, true);

assert.strictEqual(checkViewport(load('<meta name="viewport" content="width=device-width">')).passed, true);
assert.strictEqual(checkViewport(load("<html></html>")).passed, false);

assert.strictEqual(
  checkAboveFoldCta(load('<body><a href="/contact">Contact us</a><h2>About</h2></body>')).passed,
  true,
);
assert.strictEqual(
  checkAboveFoldCta(load('<body><h2>About</h2><a href="/contact">Contact us</a></body>')).passed,
  false,
);
assert.strictEqual(checkAboveFoldCta(load("<body><p>Nothing here</p></body>")).passed, false);

assert.strictEqual(checkContactMethod(load('<a href="tel:+911234567890">Call</a>')).passed, true);
assert.strictEqual(checkContactMethod(load('<a href="mailto:hi@example.com">Email</a>')).passed, true);
assert.strictEqual(checkContactMethod(load("<form></form>")).passed, true);
assert.strictEqual(checkContactMethod(load("<p>Nothing</p>")).passed, false);

assert.strictEqual(checkSocialLinks(load('<a href="https://facebook.com/us">FB</a>')).passed, true);
assert.strictEqual(checkSocialLinks(load("<p>No links</p>")).passed, false);
assert.strictEqual(checkSocialLinks(load('<a href="https://netflix.com">Netflix</a>')).passed, false);
assert.strictEqual(checkSocialLinks(load('<a href="https://www.dropbox.com/a">Dropbox</a>')).passed, false);
assert.strictEqual(checkSocialLinks(load('<a href="https://www.facebook.com/page">FB</a>')).passed, true);

assert.strictEqual(checkHttps("https://example.com").passed, true);
assert.strictEqual(checkHttps("http://example.com").passed, false);

console.log("lib/audits/checks.test.ts: all checks passed");
