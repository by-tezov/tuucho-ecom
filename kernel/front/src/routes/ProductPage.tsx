import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLang } from '../assets/i18n';
import { HOME_PATH } from '../config/paths';
import { localizedPath } from '../config/i18nRoutes';
import { Seo } from '../components/seo/Seo';
import { Chip } from '../components/ui/Chip';
import { PhotoCarousel } from '../components/gallery/PhotoCarousel';
import { PhotoLightbox } from '../components/gallery/PhotoLightbox';
import { SizeRequestModal } from '../components/gallery/SizeRequestModal';
import { FavoriteButton } from '../components/gallery/FavoriteButton';
import { LegalPageBackLink } from '../components/layout/LegalPageBackLink';
import { Skeleton } from '../components/ui/Skeleton';
import { ReassuranceStrip } from '../components/trust/ReassuranceStrip';
import { NotFoundPage } from './NotFoundPage';
import { fetchProductByUid } from '../api/gallery';
import { getReceiverProductByUid } from '../api/gift';
import { useAuthSession } from '../state/AuthContext';
import { audienceForCatalogue, seedProducts } from '../state/productCache';
import { useCartCommands, useCartData, useCartOverlay } from '../hooks/useCart';
import { useOptionalGiftReceiver } from '../hooks/useGiftReceiver';
import { useOutOfStockSizeFlags } from '../hooks/useFilterOptions';
import { defaultLengthKey, defaultShapeKey, lengthAfterShapeChange } from '../data/galleryShape';
import { SIZES, SIZE_SELECTION_PRIORITY } from '../data/sizes';
import { availableQuantityFor, availableSizesFor, preferredAvailableSize } from '../utils/availability';
import { formatPrice } from '../utils/formatPrice';
import { productPath, uidFromSlug } from '../utils/productUrl';
import {
  productJsonLd,
  productSeoDescription,
  productSeoHeading,
  productSeoTitle,
} from '../utils/productSeo';
import { productAlt, productDesc } from '../utils/productCopy';
import type { GalleryItem } from '../data/types';
import type { Size } from '../api/cart';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { CORE_FRONT_SLOTS, PluginSlot } from '../plugins/PluginHost';
import styles from './ProductPage.module.css';

/**
 * The indexable page for one set — the only per-design URL the site has.
 * Always rendered from a live fetch: the catalogue is database-backed and
 * changes constantly, so nothing about a set is ever baked in at build time.
 * A link-preview bot never reaches this component at all — public/.htaccess
 * redirects it to kernel/back's `/gallery/set/:uid/preview`, which renders
 * the Open Graph tags from the database per request.
 */
export function ProductPage() {
  const { slug = '' } = useParams();
  const uid = uidFromSlug(slug);
  const path = `/creations/${slug}`;
  const { t, lang } = useLang();
  const { status } = useAuthSession();
  const gift = useOptionalGiftReceiver();
  const { cartReady, getCartLine } = useCartData();
  const { addToCart } = useCartCommands();
  const { registerModalClose } = useCartOverlay();

  const [item, setItem] = useState<GalleryItem | undefined>(undefined);
  // Only a genuinely absent set is "not found" — a failed request keeps the
  // page in its loading state rather than telling a crawler the URL is dead.
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Reset first: this effect also re-runs on a param change without a
    // remount (react-router keeps this instance across /creations/:slug ->
    // /creations/:otherSlug), so a previous slug's "not found" must not
    // keep painting over a new, perfectly valid one while its fetch is
    // still in flight.
    setNotFound(false);
    if (!uid) {
      setNotFound(true);
      return;
    }
    // This fetch is the page's only source of content — nothing about the
    // set is baked in — so it runs on arrival and again whenever the visitor
    // switches language. A resolved-but-empty result is a genuinely absent
    // set and does mean 404; a failed request does not (see setNotFound
    // above), so a backend blip keeps the skeleton rather than claiming the
    // URL is dead.
    let cancelled = false;
    const load =
      gift.active && gift.token
        ? getReceiverProductByUid(gift.token, uid, lang)
        : fetchProductByUid(uid, lang);
    load
      .then((fetched) => {
        if (cancelled) return;
        if (fetched) {
          // Adding straight from this page then opens the cart drawer with
          // no request at all — see state/productCache.ts.
          const audience = audienceForCatalogue(status, gift.active);
          if (audience) seedProducts(lang, audience, { sets: [fetched] });
          setItem(fetched);
        } else setNotFound(true);
      })
      .catch(() => {
        /* keep whatever is already rendered */
      });
    return () => {
      cancelled = true;
    };
  }, [uid, lang, status, gift.active, gift.token]);

  if (notFound) return <NotFoundPage />;
  if (!item) return <ProductPageSkeleton />;
  return (
    <ProductDetail
      item={item}
      path={path}
      t={t}
      lang={lang}
      addToCart={addToCart}
      cartReady={cartReady}
      getCartLine={getCartLine}
      registerModalClose={registerModalClose}
    />
  );
}

function ProductPageSkeleton() {
  return (
    <section className={styles.section} aria-busy="true">
      <LegalPageBackLink />
      <div className={styles.layout}>
        <Skeleton aspectRatio="1 / 1" className={styles.photoPlaceholder} />
        <div className={styles.info}>
          <Skeleton aspectRatio="8 / 1" />
          <Skeleton aspectRatio="12 / 1" />
        </div>
      </div>
    </section>
  );
}

function ProductDetail({
  item,
  path,
  t,
  lang,
  addToCart,
  cartReady,
  getCartLine,
  registerModalClose,
}: {
  item: GalleryItem;
  path: string;
  t: ReturnType<typeof useLang>['t'];
  lang: ReturnType<typeof useLang>['lang'];
  addToCart: ReturnType<typeof useCartCommands>['addToCart'];
  cartReady: ReturnType<typeof useCartData>['cartReady'];
  getCartLine: ReturnType<typeof useCartData>['getCartLine'];
  registerModalClose: ReturnType<typeof useCartOverlay>['registerModalClose'];
}) {
  const galleryPath = localizedPath('/gallery', lang);
  const sizesPath = localizedPath('/sizes', lang);
  const { productAxes } = useStorefrontBootstrap();
  const axis = (key: 'shape' | 'length' | 'size') =>
    productAxes.find((entry) => entry.key === key) ?? {
      key,
      enabled: true,
      hideInUi: false,
      autoHideSingle: true,
      label: {},
    };
  const shapeKeys = Object.keys(item.shape);
  const [activeShape, setActiveShape] = useState(() => defaultShapeKey(item));
  const [activeLength, setActiveLength] = useState(() => defaultLengthKey(item, defaultShapeKey(item)));
  const lengthKeys = Object.keys(item.lengthsByShape[activeShape] ?? {});
  const showShape = axis('shape').enabled && !axis('shape').hideInUi && !(axis('shape').autoHideSingle && shapeKeys.length <= 1);
  const showLength =
    axis('length').enabled &&
    !axis('length').hideInUi &&
    !(axis('length').autoHideSingle && lengthKeys.length <= 1);
  const shapeLabel = t.product.shapeLabel;
  const lengthLabel = t.product.lengthLabel;
  const sizeLabel = t.gallery.sizeLabel;
  const photos = item.photosByShapeLength[activeShape]?.[activeLength] ?? [];
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [sizeRequestOpen, setSizeRequestOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const gift = useOptionalGiftReceiver();
  const { allowSizeRequest } = useOutOfStockSizeFlags();

  const cartLine = getCartLine(item.id);
  const cartSize = cartLine?.size === '' ? undefined : cartLine?.size;
  const availableSizes = availableSizesFor(item.available, activeShape, activeLength, SIZES);
  const showSize =
    axis('size').enabled &&
    !axis('size').hideInUi &&
    !(axis('size').autoHideSingle && availableSizes.length <= 1);
  const [selectedSize, setSelectedSize] = useState<Size>(
    () =>
      preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
        cartSize,
      ]) ?? 'M',
  );

  useEffect(() => {
    setSelectedSize(
      (current) =>
        preferredAvailableSize(item.available, activeShape, activeLength, SIZE_SELECTION_PRIORITY, [
          current,
        ]) ?? current,
    );
  }, [activeLength, activeShape, item.available]);

  useEffect(() => {
    if (!lightboxOpen) return;
    registerModalClose(closeLightbox);
    return () => registerModalClose(null);
  }, [lightboxOpen, registerModalClose]);

  const selectShape = (key: string) => {
    if (key === activeShape) return;
    const nextLength = lengthAfterShapeChange(item, key, activeLength);
    const nextPhotos = item.photosByShapeLength[key]?.[nextLength] ?? [];
    setActiveShape(key);
    setActiveLength(nextLength);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  };

  const selectLength = (key: string) => {
    if (key === activeLength) return;
    const nextPhotos = item.photosByShapeLength[activeShape]?.[key] ?? [];
    setActiveLength(key);
    setIndex((current) => Math.max(0, Math.min(current, nextPhotos.length - 1)));
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const inStock = availableSizes.length > 0;
  // The copy names the shape through a `$shape` placeholder, because a set
  // can be sold in several: resolving it here is what makes the sentence and
  // the alt text follow the shape picker instead of describing the default.
  const alt = productAlt(item, activeShape, activeLength) ?? `${t.gallery.altPrefix}${item.title}`;
  const desc = productDesc(item, activeShape, activeLength);

  return (
    <section className={styles.section} data-testid="product-page" data-product-uid={item.productUid}>
      <Seo
        title={item.title}
        fullTitle={productSeoTitle(item, t, lang, activeShape)}
        description={productSeoDescription(item, t, lang, activeShape, activeLength)}
        path={path}
        canonicalPath={productPath(item)}
        jsonLd={productJsonLd(item, t, lang, activeShape, activeLength)}
      />

      <LegalPageBackLink />

      <nav className={styles.breadcrumb} aria-label={t.product.breadcrumbAria}>
        <Link to={HOME_PATH}>{t.nav.home}</Link>
        <span aria-hidden="true">›</span>
        <Link to={galleryPath}>{t.nav.gallery}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{item.title}</span>
      </nav>

      <div className={styles.layout}>
        <div className={styles.photoColumn}>
          <div className={styles.photoWrap}>
            <PhotoCarousel
              images={photos}
              alt={alt}
              index={index}
              onIndexChange={setIndex}
              {...(styles.photoCarouselFrame ? { frameClassName: styles.photoCarouselFrame } : {})}
              onOpenLightbox={(i) => {
                triggerRef.current = document.activeElement as HTMLElement;
                setIndex(i);
                setLightboxOpen(true);
              }}
            />
            <FavoriteButton
              itemId={item.id}
              shapeKey={activeShape}
              lengthKey={activeLength}
              variant="floating"
              className={styles.favoriteButton}
            />
          </div>
        </div>

        <div className={styles.info}>
          {showShape && shapeKeys.length > 0 && (
            <div className={styles.variantBlock}>
              <div className={styles.variantDivider} role="separator" aria-label={shapeLabel}>
                <span>{shapeLabel}</span>
              </div>
              <div className={styles.shapeRow} role="group" aria-label={shapeLabel}>
                {shapeKeys.map((key) => (
                  <Chip
                    key={key}
                    active={key === activeShape}
                    data-testid="product-shape"
                    data-shape-key={key}
                    onClick={() => selectShape(key)}
                  >
                    {item.shape[key]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {showLength && lengthKeys.length > 0 && (
            <div className={styles.variantBlock}>
              <div className={styles.variantDivider} role="separator" aria-label={lengthLabel}>
                <span>{lengthLabel}</span>
              </div>
              <div className={styles.shapeRow} role="group" aria-label={lengthLabel}>
                {lengthKeys.map((key) => (
                  <Chip
                    key={key}
                    active={key === activeLength}
                    data-testid="product-length"
                    data-length-key={key}
                    onClick={() => selectLength(key)}
                  >
                    {item.lengthsByShape[activeShape]?.[key]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {(showShape || showLength) && <hr className={styles.variantEndSeparator} />}

          <div className={styles.headingRow}>
            <div className={styles.headingText}>
              <h1 className={styles.title}>{item.title}</h1>
              <h2 className={styles.subtitle}>{productSeoHeading(item, t, lang, activeShape)}</h2>
              <div className={styles.metaRow}>
                <span className={styles.reference}>
                  {t.product.referenceLabel} {item.productUid}
                </span>
              </div>
            </div>
            {item.price !== undefined && <span className={styles.price}>{formatPrice(item.price)}</span>}
          </div>

          <p className={styles.desc}>{desc}</p>

          {/* Sold-out sizes aren't offered at all (same rule as the gallery
              card and the product modal). With none left the whole field
              goes: the out-of-stock badge below already says so. */}
          {inStock && showSize && (
            <div className={styles.sizeSection}>
              <span className={styles.sizeSectionLabel} id="product-size-label">
                {sizeLabel}
              </span>
              <div className={styles.sizeSelector} role="group" aria-labelledby="product-size-label">
                {availableSizes.map((size) => (
                  <Chip
                    key={size}
                    active={size === selectedSize}
                    data-testid="product-size"
                    data-size={size}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </Chip>
                ))}
              </div>
              <Link className={styles.sizeGuideLink} to={sizesPath}>
                {t.gallery.sizeGuideLink} →
              </Link>
            </div>
          )}

          {!inStock && (
            <Link className={styles.sizeGuideLink} to={sizesPath}>
              {t.gallery.sizeGuideLink} →
            </Link>
          )}

          <div className={styles.purchase}>
            <span className={inStock ? styles.inStock : styles.outOfStock}>
              {inStock ? t.product.inStock : t.product.outOfStock}
            </span>
          </div>

          {/* Sold out: no add button at all (same rule as the cards and the
              product modal), replaced by the offer to have this shape made
              — this page is where a search most often lands, so it must not
              dead-end on "Épuisé". */}
          {inStock && (!gift.active || gift.canMutate) ? (
            <button
              type="button"
              className={styles.addButton}
              data-testid="product-add-to-cart"
              disabled={!cartReady}
              onClick={() =>
                addToCart(
                  item.id,
                  activeShape,
                  activeLength,
                  selectedSize,
                  { title: item.title, photo: photos[0]?.small ?? null, price: item.price },
                  1,
                  availableQuantityFor(item.available, activeShape, activeLength, selectedSize),
                )
              }
            >
              {t.gallery.addToCartCta}
            </button>
          ) : (
            allowSizeRequest &&
            !gift.active && (
              <button
                type="button"
                className={styles.addButton}
                data-testid="product-size-request"
                onClick={() => setSizeRequestOpen(true)}
              >
                {t.gallery.sizeRequestCta}
              </button>
            )
          )}
          <PluginSlot name={CORE_FRONT_SLOTS.productActions} />

          <ReassuranceStrip t={t} />

          <dl className={styles.details}>
            <div>
              <dt>{t.product.occasionLabel}</dt>
              <dd>{item.occasion}</dd>
            </div>
            {item.colorMain.length > 0 && (
              <div>
                <dt>{t.product.colorsMainLabel}</dt>
                <dd>{item.colorMain.join(', ')}</dd>
              </div>
            )}
            {item.colorSecondary.length > 0 && (
              <div>
                <dt>{t.product.colorsSecondaryLabel}</dt>
                <dd>{item.colorSecondary.join(', ')}</dd>
              </div>
            )}
          </dl>

          <Link className={styles.poseGuideLink} to={sizesPath}>
            {t.gallery.sizeGuideLink}
          </Link>
        </div>
      </div>

      <LegalPageBackLink placement="bottom" />

      {lightboxOpen && (
        <PhotoLightbox
          item={item}
          activeShape={activeShape}
          activeLength={activeLength}
          onSelectShape={selectShape}
          onSelectLength={selectLength}
          index={index}
          onIndexChange={setIndex}
          alt={alt}
          onClose={closeLightbox}
          // The page already shows the reference in its heading metadata.
          hideReference
        />
      )}
      {sizeRequestOpen && !gift.active && allowSizeRequest && (
        <SizeRequestModal
          productId={item.id}
          shapeKey={activeShape}
          lengthKey={activeLength}
          photo={photos[0]?.small}
          title={item.title}
          shapeLabel={item.shape[activeShape] ?? activeShape}
          lengthLabel={item.lengthsByShape[activeShape]?.[activeLength] ?? activeLength}
          onClose={() => setSizeRequestOpen(false)}
        />
      )}
    </section>
  );
}
