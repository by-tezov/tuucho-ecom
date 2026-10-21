/** The RGAA accessibility statement (`/accessibility`): conformance status,
 * non-accessible content, how the statement was prepared, and a feedback
 * contact. The public status is partial compliance. Update `updated`, the
 * status and the issue list together whenever that changes. */
export interface AccessibilityStatementStrings {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  statusTitle: string;
  statusBody: string[];
  issuesTitle: string;
  issuesIntro: string;
  issues: string[];
  preparationTitle: string;
  preparationBody: string[];
  contactTitle: string;
  contactBody: string;
  contactEmailLabel: string;
  /** Label in front of the contact-page link, same role as `contactEmailLabel`. */
  contactFormLabel: string;
  contactPageLink: string;
}
