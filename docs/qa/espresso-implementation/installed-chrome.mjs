// Local verification adapter: preserve the existing browser test and its
// assertions while using installed Chrome when Playwright has no bundled binary.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

if (!existsSync(chromium.executablePath())) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) => launch({ channel: 'chrome', ...options });
}
