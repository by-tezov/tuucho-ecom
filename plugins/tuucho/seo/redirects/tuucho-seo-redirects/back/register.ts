import type { PluginRegisterFn } from '@tuucho/plugin-sdk';

/** Live apply is kernel-gated on this plugin being effectively enabled.
 * Other plugins push extra rules through seo.redirects.rules. */
const register: PluginRegisterFn = async () => undefined;

export { register };
export default register;
