export interface GuideStepStrings {
  n: string;
  title: string;
  desc: string;
}

export interface GuideStrings {
  eyebrow: string;
  title: string;
  leadTitle: string;
  leadSub: string;
  customTitle: string;
  customSub: string;
  howTitle: string;
  howSub: string;
  steps: GuideStepStrings[];
  chartTitle: string;
  chartSub: string;
  chartNum: string;
  chartMm: string;
  fingers: [string, string, string, string, string];
  ctaOrder: string;
  tipSetsNote: string;
}
