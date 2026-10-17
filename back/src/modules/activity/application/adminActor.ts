import type { AuthenticatedUser } from '../../../types.js';
import type { RecordActivityInput } from './recordActivity.js';

/** Browser-admin actor fields for recordActivity. */
export function adminActorFields(user: AuthenticatedUser): Pick<
  RecordActivityInput,
  'origin' | 'actorUserId' | 'actorEmail' | 'actorLabel'
> {
  return {
    origin: 'admin',
    actorUserId: user.id,
    actorEmail: user.email,
    actorLabel: user.email,
  };
}
