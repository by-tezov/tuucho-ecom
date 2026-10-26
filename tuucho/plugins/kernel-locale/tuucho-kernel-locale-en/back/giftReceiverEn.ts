import type { GiftReceiverOrderMail } from '@kernel/back/modules/messaging/application/giftReceiverOrderMail';

export const enGiftReceiver: GiftReceiverOrderMail = {
    confirmation: {
      subject: (orderNumber) => `Your gift ${orderNumber} is confirmed : Shop`,
      title: 'Your gift is confirmed',
      intro: 'Here is what is in your gift.',
      itemsHeading: 'Your gift',
    },
    shipped: {
      subject: (orderNumber) => `Your gift ${orderNumber} is on its way : Shop`,
      title: 'Your gift is on its way',
      intro: 'Good news: your gift has just been sent.',
      itemsHeading: 'In your gift',
    },
    updated: {
      subject: (orderNumber) => `Your gift ${orderNumber} has been updated : Shop`,
      title: 'Your gift delivery address was updated',
      intro: 'The delivery address for your gift was changed. Here is the updated summary.',
      notice: 'This summary replaces the address in the previous email.',
    },
    cancelled: {
      subject: (orderNumber) => `Your gift ${orderNumber} was cancelled : Shop`,
      title: 'Your gift was cancelled',
      intro: 'The gift meant for you was cancelled.',
      body: 'Nothing will be sent.',
    },
    received: {
      subject: (orderNumber) => `Your gift ${orderNumber} has arrived : Shop`,
      title: 'Your gift has arrived',
      intro: 'Delivery of your gift is marked as received.',
    },
  };
