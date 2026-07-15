import { describe, it, expect } from 'vitest';
import { isPendingDeletionError } from '../secrets';

describe('isPendingDeletionError', () => {
  it('matches the classic "scheduled for deletion" wording', () => {
    expect(isPendingDeletionError({ name: 'InvalidRequestException', message: 'Secret xyz is scheduled for deletion' })).toBe(true);
  });

  it('matches the "marked for deletion" wording variant', () => {
    expect(isPendingDeletionError({ name: 'InvalidRequestException', message: 'You can’t perform this operation on the secret because it was marked for deletion.' })).toBe(true);
  });

  it('matches "because it was deleted" wording', () => {
    expect(isPendingDeletionError({ name: 'InvalidRequestException', message: 'operation not permitted because it was deleted' })).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPendingDeletionError({ name: 'InvalidRequestException', message: 'SCHEDULED FOR DELETION' })).toBe(true);
  });

  it('rejects InvalidRequestException unrelated to deletion', () => {
    expect(isPendingDeletionError({ name: 'InvalidRequestException', message: 'invalid version stage' })).toBe(false);
  });

  it('rejects other error types even if the message mentions deletion', () => {
    expect(isPendingDeletionError({ name: 'ThrottlingException', message: 'scheduled for deletion' })).toBe(false);
  });

  it('handles missing name/message safely', () => {
    expect(isPendingDeletionError({})).toBe(false);
    expect(isPendingDeletionError({ name: 'InvalidRequestException' })).toBe(false);
  });
});
