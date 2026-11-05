import { describe, expect, it } from 'vitest';
import { createVault, openVault, parseEnvelope, seal } from './vault';

// Local exercises use synthetic secrets only; no network or real browser vault.
describe('security boundary exercises', () => {
  it('a stolen backup permits offline guesses even for a 12-character password', async () => {
    const master = 'Password1234';
    const original = await createVault(master);
    const vault = { categories: [], entries: [{ id: 'demo', name: '', username: 'demo', password: 'synthetic-secret', categoryId: '', updatedAt: '' }] };
    const stolen = JSON.stringify(await seal(vault, original.key, original.envelope.salt));
    let recovered = '';
    for (const guess of ['wrong-password', master]) {
      try { recovered = (await openVault(parseEnvelope(stolen), guess)).vault.entries[0].password; break; }
      catch { /* No server or UI rate limit participates in offline guessing. */ }
    }
    expect(recovered).toBe('synthetic-secret');
  });

  it('an authentic older envelope still decrypts after a newer save', async () => {
    const master = 'Synthetic long master phrase 1';
    const original = await createVault(master);
    const newer = await seal({ categories: [{ id: 'new', name: 'New category' }], entries: [] }, original.key, original.envelope.salt);
    expect((await openVault(newer, master)).vault.categories).toHaveLength(1);
    expect((await openVault(original.envelope, master)).vault.categories).toHaveLength(0);
  });
});
