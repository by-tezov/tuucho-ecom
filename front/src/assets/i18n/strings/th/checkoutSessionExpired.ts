import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'เซสชันชำระเงินหมดอายุ',
  message: (minutes) =>
    `เพื่อความปลอดภัย ที่อยู่และข้อมูลการชำระเงินที่ไม่ได้บันทึกไว้ถูกล้างหลังจากไม่มีการใช้งานเป็นเวลา ${minutes} นาที`,
  continue: 'ดำเนินการต่อ',

  warningTitle: 'เซสชันการชำระเงินของคุณใกล้หมดเวลาแล้ว',

  warningMessage:
    'หากไม่มีการใช้งานภายใน {n} นาทีข้างหน้า ข้อมูลที่กรอกไว้สำหรับคำสั่งซื้อของคุณจะถูกลบเพื่อความปลอดภัย',
};
