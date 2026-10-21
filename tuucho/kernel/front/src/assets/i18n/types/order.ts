export interface OrderStepStrings {
  n: string;
  title: string;
  desc: string;
}

export interface OrderStrings {
  eyebrow: string;
  title: string;
  sub: string;
  steps: OrderStepStrings[];
  shopTitle: string;
  /** Same heading, singular phrasing — used when only one platform is active. */
  shopTitleSingular: string;
  shopSub: string;
  socialTitle: string;
  socialSub: string;
}
