import type { HttpMount, PaymentGateway, ShippingMethod } from './contracts.js';

const gateways = new Map<string, PaymentGateway>();
const shipping = new Map<string, ShippingMethod>();
const httpMounts: HttpMount[] = [];

export function registerPaymentGateway(gateway: PaymentGateway): void {
  gateways.set(gateway.id, gateway);
}

export function unregisterPaymentGateway(id: string): void {
  gateways.delete(id);
}

export function listPaymentGateways(): PaymentGateway[] {
  return [...gateways.values()];
}

export function getPaymentGateway(id: string): PaymentGateway | undefined {
  return gateways.get(id);
}

export function getPaymentGatewayForMethod(method: string): PaymentGateway | undefined {
  return [...gateways.values()].find((gateway) => gateway.methods.includes(method));
}

export function isPaymentGatewayRegistered(id: string): boolean {
  return gateways.has(id);
}

export function registerShippingMethod(method: ShippingMethod): void {
  shipping.set(method.id, method);
}

export function listShippingMethods(): ShippingMethod[] {
  return [...shipping.values()];
}

export function getShippingMethod(id: string): ShippingMethod | undefined {
  return shipping.get(id);
}

export function registeredCourierCodes(): string[] {
  return [...shipping.values()].flatMap((method) => method.courierCodes);
}

export function registerHttpMount(mount: HttpMount): void {
  httpMounts.push(mount);
}

export function listHttpMounts(): HttpMount[] {
  return [...httpMounts];
}

export function resetShells(): void {
  gateways.clear();
  shipping.clear();
  httpMounts.length = 0;
}
