# Kernel config migrate steps

Shipped by the product (Apply may replace this tree). Shop owners do not edit
here. `npm run config:migrate` applies pending steps to live `tuucho-config/`
and records them in `tuucho-config/migrate-stamp.json`.

Real steps must be named `YYYYMMDD_NN_slug.json` (digit first) so the runner
picks them up. `.example.json` is documentation only and is ignored.
