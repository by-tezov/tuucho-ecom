import { Link, useLocation } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { AccordionItem } from '@kernel/front/components/ui/AccordionItem';
import styles from './ContactFaq.module.css';
import { shouldReplaceMobileBackPage } from '@kernel/front/utils/mobileBackNavigation';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { FAQ_ITEMS } from './faqItems';

export function ContactFaq() {
  const { t, lang } = useLang();
  const location = useLocation();
  const contactPath = localizedPath('/contact', lang);
  const sizesPath = localizedPath('/sizes', lang);

  return (
    <section id="contact" aria-labelledby="contact-h" className={styles.section}>
      <div>
        <p className={styles.eyebrow}>{t.contact.eyebrow}</p>
        <h2 id="contact-h" className={styles.title}>
          {t.contact.title}
        </h2>
        <p className={styles.sub}>{t.contact.sub}</p>
        <Link
          to={contactPath}
          replace={shouldReplaceMobileBackPage(location.pathname, contactPath)}
          className={styles.contactLink}
        >
          {t.contact.pageCta} <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div>
        <h3 className={styles.faqTitle}>{t.faq.title}</h3>
        {(t.faq.items.length ? t.faq.items : FAQ_ITEMS).map((item, i) => (
          <AccordionItem
            key={item.q}
            question={item.q}
            answer={
              i === 1 ? (
                <>
                  {item.a}{' '}
                  <Link
                    to={sizesPath}
                    replace={shouldReplaceMobileBackPage(location.pathname, sizesPath)}
                    className={styles.faqLink}
                  >
                    {t.guide.title} <span aria-hidden="true">→</span>
                  </Link>
                </>
              ) : (
                item.a
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
