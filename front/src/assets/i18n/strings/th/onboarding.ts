import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'ปิดการแนะนำ',
  prevAria: 'สไลด์ก่อนหน้า',
  nextLabel: 'ถัดไป',
  doneLabel: 'เข้าใจแล้ว',
  stepAria: (current, total) => `ขั้นตอน ${current} จาก ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'คุณภาพงานทำมือ',
    body: 'ทุกเซ็ตถูกตะไบ ทาสี และตกแต่งด้วยมือ ทีละชิ้น ไม่มีการผลิตจำนวนมาก เป็นชิ้นงานที่ตั้งใจทำเพื่อคุณ',
  },
  deals: {
    title: 'สิทธิพิเศษ',
    headline: 'ส่วนลดและส่งฟรี',
    subheadline: 'สั่งหลายเซ็ตแล้วได้ส่วนลดตามจำนวน และส่งฟรีจะเปิดเองเมื่อยอดถึงเกณฑ์ที่กำหนด',
    volumeTitle: 'ส่วนลดตามจำนวน',
    volumeLead: 'ยิ่งสั่งเซ็ตมาก ยิ่งประหยัด',
    volumeTier: (qty, percent) => `${qty} เซ็ต −${percent}%`,
    volumeJoin: ' · ',
    volumeHint: 'แถบในตะกร้าจะสูงขึ้นทุกครั้งที่เพิ่มเซ็ต',
    freeShippingTitle: 'การจัดส่ง',
    freeShippingLead: (amount) => `ส่งฟรีเมื่อสินค้าครบ ${amount}`,
    freeShippingHint: 'เกณฑ์ขึ้นกับประเทศปลายทาง',
    genericBody: 'ส่วนลดตามจำนวนเซ็ตและการส่งฟรีเมื่อถึงยอดที่กำหนดรอคุณอยู่ในตะกร้า',
  },
  loyalty: {
    title: 'กระเป๋าเครดิต',
    headline: 'สะสมเครดิตจากคำสั่งซื้อ',
    body: 'เมื่อมีบัญชี คุณสะสมเครดิตสะสมจากคำสั่งซื้อ และสามารถใช้ในตะกร้าครั้งถัดไปได้',
  },
  custom: {
    title: 'สั่งทำพิเศษ',
    headline: 'ขนาดหรือดีไซน์ตามสั่ง',
    body: 'ต้องการขนาดหรือดีไซน์ที่ไม่มีในร้าน? เขียนมาที่หน้าติดต่อ แล้วเรามาดูกันว่าทำได้แค่ไหน',
  },
};
