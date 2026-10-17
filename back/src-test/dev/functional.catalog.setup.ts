import { test as setup } from 'patchright/test';
import { seedE2eCatalogue } from './support/catalog.js';

setup('E2E catalogue: the functional shop is seeded', async () => {
  await seedE2eCatalogue();
});
