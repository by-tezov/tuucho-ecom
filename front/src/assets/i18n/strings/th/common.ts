import type { Strings } from '../../types';

/** Top-level labels belonging to no single screen. */
export const common: {
  [
    K in
      | 'skip'
      | 'skipFooter'
      | 'backLink'
      | 'brandAria'
      | 'navAria'
      | 'menuOpenAria'
      | 'menuCloseAria'
      | 'newWindowAria'
      | 'continueAction'
      | 'requiredFieldsNote'
  ]: Strings[K];
} = {
  skip: 'ข้ามไปยังเนื้อหาหลัก',
  skipFooter: 'ข้ามไปยังส่วนท้ายของหน้า',
  backLink: 'กลับ',
  brandAria: 'Lumen: กลับหน้าแรก',
  navAria: 'เมนูนำทางหลัก',
  menuOpenAria: 'เปิดเมนู',
  menuCloseAria: 'ปิดเมนู',
  newWindowAria: 'หน้าต่างใหม่',
  continueAction: 'ดำเนินการต่อ',
  requiredFieldsNote: 'ช่องที่มีเครื่องหมายดอกจัน (*) จำเป็นต้องกรอก',
};
