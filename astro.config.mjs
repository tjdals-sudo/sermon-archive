import { defineConfig } from 'astro/config';
import { site } from './site.config.mjs';

export default defineConfig({
  site: site.url,
  base: site.base,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
