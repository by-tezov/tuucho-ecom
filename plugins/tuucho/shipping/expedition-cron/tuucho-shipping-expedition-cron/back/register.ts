import type { PluginRegisterFn } from '@tuucho/plugin-sdk';

const register: PluginRegisterFn = async (api) => {
  api.addAction('cron.process-shipment-tracking', async (...args: unknown[]) => {
    const [{ processShipmentTrackingCron }, { pool }] = await Promise.all([
      import('@kernel/back/modules/orders/application/tracking/shippingTracking'),
      import('@kernel/back/db/pool'),
    ]);
    return processShipmentTrackingCron(pool, ...(args as []));
  });
};

export { register };
export default register;
