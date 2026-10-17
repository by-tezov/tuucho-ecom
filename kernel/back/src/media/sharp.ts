/** Load sharp only when a photo path actually needs it.
 * A static `import 'sharp'` aborts SSH-started `opsServer.js` on CloudLinux
 * (native SIGABRT) and can take the public Passenger process with it.
 * Cron, log, and order CLIs never resize images.
 *
 * One libvips thread: the host's nproc limit otherwise returns
 * `glib: Error creating thread: Resource temporarily unavailable` during
 * library/accessory photo import. */
let sharpLoaded: typeof import('sharp').default | undefined;

export async function loadSharp(): Promise<typeof import('sharp').default> {
  if (sharpLoaded) return sharpLoaded;
  process.env.VIPS_CONCURRENCY ??= '1';
  const mod = await import('sharp');
  const sharp = mod.default;
  sharp.concurrency(1);
  sharp.cache(false);
  sharpLoaded = sharp;
  return sharp;
}
