import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  giftReceiverTokenFromPath,
  isGiftGiverPath,
  isAdminOpenedShopTab,
  readGiftLockSession,
  readGiftOriginBlock,
  shouldBindGiftUrlToken,
  subscribeGiftLock,
  type GiftLockSession,
  type GiftOriginBlock,
} from '../state/giftLockSession';
import { useAuthSession } from '../state/AuthContext';
import { adminPath, isStaffRole } from '../utils/adminRoute';

export function useGiftLock(): {
  lock: GiftLockSession | null;
  originBlock: GiftOriginBlock | null;
  shopLocked: boolean;
  originBlocked: boolean;
} {
  const location = useLocation();
  const { status, user, isImpersonating } = useAuthSession();
  const [lock, setLock] = useState<GiftLockSession | null>(() => readGiftLockSession());
  const [originBlock, setOriginBlock] = useState<GiftOriginBlock | null>(() => readGiftOriginBlock());

  useEffect(() => {
    return subscribeGiftLock(() => {
      setLock(readGiftLockSession());
      setOriginBlock(readGiftOriginBlock());
    });
  }, []);

  useEffect(() => {
    setLock(readGiftLockSession());
    setOriginBlock(readGiftOriginBlock());
  }, [location.pathname]);

  useEffect(() => {
    if (!originBlock) return;
    const wait = originBlock.expiresAtMs - Date.now();
    if (wait <= 0) {
      setOriginBlock(readGiftOriginBlock());
      return;
    }
    const timer = window.setTimeout(() => setOriginBlock(readGiftOriginBlock()), wait);
    return () => window.clearTimeout(timer);
  }, [originBlock]);

  const pathToken = giftReceiverTokenFromPath(location.pathname);
  const honorPath = pathToken != null && shouldBindGiftUrlToken(pathToken);
  const giverOrAdmin = isGiftGiverPath(location.pathname) || location.pathname.startsWith(adminPath());
  const staffBrowsing = status === 'authenticated' && isStaffRole(user?.role) && !isImpersonating;
  // Tabs opened from the gifts panel still act as that participant (shopLocked
  // when the receiver lock is live). They must not publish or be held by the
  // origin-wide block, so closing them does not lock the administrator out.
  const fromAdmin = isAdminOpenedShopTab();
  const shopLocked = !giverOrAdmin && (lock != null || honorPath);
  const originBlocked =
    !fromAdmin && !staffBrowsing && !giverOrAdmin && lock == null && !honorPath && originBlock != null;

  return { lock, originBlock, shopLocked, originBlocked };
}
