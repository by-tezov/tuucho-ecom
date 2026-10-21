import QRCode from 'qrcode';

export interface GiftQrColors {
  dark: string;
  light: string;
}

export async function giftQrPng(url: string, colors?: GiftQrColors): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: 'png',
    margin: 1,
    width: 320,
    ...(colors ? { color: { dark: colors.dark, light: colors.light } } : {}),
  });
}

export async function giftQrDataUri(url: string, colors?: GiftQrColors): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 320,
    ...(colors ? { color: { dark: colors.dark, light: colors.light } } : {}),
  });
}
