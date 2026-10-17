import { test as teardown } from 'patchright/test';
import { deleteE2eCatalogue } from './support/catalog.js';

teardown('delete E2E catalogue', async () => {
  await deleteE2eCatalogue();
});
