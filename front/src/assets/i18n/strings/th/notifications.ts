import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'การแจ้งเตือน',
  emailsSectionTitle: 'อีเมล',
  emailsMasterLabel: 'รับอีเมล',
  emailsMasterDescription:
    'สวิตช์หลัก ปิด = ไม่มีอีเมลใดๆ เลย (ยกเว้นการรีเซ็ตรหัสผ่านและความปลอดภัยที่สำคัญ) เปิด = คุณเลือกได้เองทีละช่องทาง',
  primaryEmailLabel: 'ที่อยู่หลัก',
  verifiedBadge: 'ยืนยันแล้ว',
  unverifiedBadge: 'ยังไม่ยืนยัน',
  unverifiedBanner:
    'ยืนยันอีเมลของคุณเพื่อรับการแจ้งเตือนสนุกๆ (สินค้าใหม่ ตะกร้าสินค้า รายการโปรด…) คุณตั้งค่าความต้องการได้แล้วด้านล่างนี้',
  loading: 'กำลังโหลด…',
  loadError: 'ไม่สามารถโหลดการตั้งค่าของคุณได้ กรุณาลองใหม่อีกครั้งในอีกสักครู่',
  masterDisableConfirmTitle: 'ปิดอีเมลทั้งหมดหรือไม่?',
  masterDisableConfirmMessage:
    'จะไม่มีสรุปคำสั่งซื้อ ใบแจ้งหนี้ หรือการแจ้งเตือนอีกต่อไป คุณยังสามารถเข้าสู่ระบบและรีเซ็ตรหัสผ่านได้ตามปกติ',
  transactionalSectionTitle: 'คำสั่งซื้อและความปลอดภัย',
  marketingSectionTitle: 'แรงบันดาลใจและตะกร้าสินค้า',
  disableConfirmButton: 'ปิดใช้งาน',
  cancelButton: 'ยกเลิก',
  orderConfirmation: {
    title: 'ยืนยันคำสั่งซื้อ',
    description: 'ข้อความ “เรียบร้อยแล้ว ยืนยันแล้ว” ทันทีหลังชำระเงิน เหมือนไฮไฟฟ์เล็กๆ ในกล่องจดหมายของคุณ',
    disableConfirmTitle: 'ปิดการยืนยันคำสั่งซื้อหรือไม่?',
    disableConfirmMessage: 'คุณจะไม่ได้รับอีเมลสรุปหลังการซื้อ แต่ข้อมูลยังอยู่ในบัญชีของคุณ',
  },
  orderShipped: {
    title: 'จัดส่งคำสั่งซื้อแล้ว',
    description: 'การแจ้งเตือน “กำลังจัดส่ง” เมื่อชุดของคุณออกจากสตูดิโอ',
    disableConfirmTitle: 'ปิดอีเมลแจ้งการจัดส่งหรือไม่?',
    disableConfirmMessage: 'จะไม่มีอีเมลเมื่อคำสั่งซื้อถูกจัดส่ง แต่ข้อมูลติดตามยังอยู่ในบัญชีของคุณ',
  },
  invoice: {
    title: 'ใบแจ้งหนี้',
    description: 'ใบแจ้งหนี้แบบ PDF ในกล่องจดหมายของคุณ สะดวกสำหรับการเบิกค่าใช้จ่ายและการคืนเงิน',
    disableConfirmTitle: 'ปิดอีเมลใบแจ้งหนี้หรือไม่?',
    disableConfirmMessage: 'คุณยังสามารถดาวน์โหลดใบแจ้งหนี้จากคำสั่งซื้อของคุณได้',
  },
  security: {
    title: 'การแจ้งเตือนความปลอดภัย',
    description: 'สรุปความปลอดภัยแบบเลือกได้ ส่วนที่สำคัญ (การล็อกบัญชี การรีเซ็ตรหัสผ่าน) จะถูกส่งเสมอ',
    disableConfirmTitle: 'ปิดการแจ้งเตือนความปลอดภัยแบบเลือกได้หรือไม่?',
    disableConfirmMessage: 'อีเมลรีเซ็ตรหัสผ่าน ล็อกบัญชี และการลบบัญชี จะยังคงถูกส่งเสมอ',
  },
  chatReply: {
    title: 'การตอบกลับแชท',
    description: 'รับอีเมลเมื่อ Lumen ตอบกลับขณะที่คุณไม่ได้ดูการสนทนาอยู่',
    disableConfirmTitle: 'ปิดการแจ้งเตือนแชทหรือไม่?',
    disableConfirmMessage: 'คุณยังสามารถอ่านคำตอบได้ในหน้าการสนทนา',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'สินค้าใหม่',
    description: 'ผลงานใหม่ในแกลเลอรี เพื่อให้คุณไม่พลาดชุดที่ใช่',
    disableConfirmTitle: 'ปิดการแจ้งเตือนสินค้าใหม่หรือไม่?',
    disableConfirmMessage: 'คุณจะไม่ได้รับการแจ้งเตือนเมื่อมีชุดใหม่เข้ามา',
  },
  cartReminder: {
    title: 'ตะกร้าสินค้ารอคุณอยู่',
    description: 'การเตือนเบาๆ หากคุณทิ้งเล็บไว้ในตะกร้าสินค้า ไม่มีสแปมกวนใจ',
    disableConfirmTitle: 'ปิดการแจ้งเตือนตะกร้าสินค้าหรือไม่?',
    disableConfirmMessage: 'เราจะไม่แจ้งเตือนคุณเกี่ยวกับตะกร้าสินค้าที่ยังไม่เสร็จสิ้น',
  },
  favoriteSold: {
    title: 'รายการโปรดถูกขายแล้ว',
    description: 'ชุดที่คุณถูกใจเพิ่งหมดไป เพื่อให้คุณรู้ว่าไม่ใช่ความผิดพลาดของสต็อก',
    disableConfirmTitle: 'ปิดการแจ้งเตือนรายการโปรดถูกขายหรือไม่?',
    disableConfirmMessage: 'คุณจะไม่ได้รับแจ้งเมื่อรายการโปรดขายหมด',
  },
  favoriteRestock: {
    title: 'รายการโปรดกลับมาแล้ว',
    description: 'พลิกล็อก มันกลับมาแล้ว เราจะบอกคุณก่อนที่มันจะหายไปอีกครั้ง',
    disableConfirmTitle: 'ปิดการแจ้งเตือนสินค้ากลับมาหรือไม่?',
    disableConfirmMessage: 'จะไม่มีการแจ้งเตือนเมื่อรายการโปรดกลับมามีสต็อกอีกครั้ง',
  },
  promo: {
    title: 'โปรโมชั่นและโค้ดส่วนลด',
    description: 'ดีลจริงๆ (โค้ด สินค้าใหม่) นานๆ ครั้ง ไม่ใช่จดหมายข่าวรายสัปดาห์',
    disableConfirmTitle: 'ปิดการแจ้งเตือนโปรโมชั่นหรือไม่?',
    disableConfirmMessage: 'คุณจะไม่ได้รับโค้ดส่วนลดทางอีเมล',
  },
};
