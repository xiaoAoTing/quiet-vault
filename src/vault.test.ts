import { describe, it, expect } from 'vitest';
import { createVault, openVault, decryptVault, seal, parseEnvelope, validateVault, masterPasswordProblem, MAX_FILE_SIZE } from './vault';
describe('encrypted vault', () => {
  it('round trips data, randomizes salt/IV, never serializes plaintext or password', async () => {
    const password = 'A long test passphrase 2026';
    const a = await createVault(password);
    const b = await createVault(password);
    expect(a.envelope.salt).not.toBe(b.envelope.salt);
    const vault = { categories:[{id:'work',name:'工作',icon:'lucide:briefcase'}],entries:[{id:'1',name:'私密名称',username:'alice',password:'secret-password',categoryId:'work',updatedAt:'2026-01-01'}] };
    const first = await seal(vault, a.key, a.envelope.salt);
    const second = await seal(vault, a.key, a.envelope.salt);
    expect(first.iv).not.toBe(second.iv);
    for (const secret of ['alice','secret-password','私密名称',password]) expect(JSON.stringify(first)).not.toContain(secret);
    expect((await openVault(parseEnvelope(JSON.stringify(first)), password)).vault).toEqual(vault);
    expect(a.key.extractable).toBe(false);
    expect(await decryptVault(first, a.key)).toEqual(vault);
    await expect(decryptVault(first, b.key)).rejects.toThrow('无法解锁');
  });
  it('rejects wrong passwords and ciphertext tampering', async () => {
    const {envelope} = await createVault('Test password long enough 1');
    await expect(openVault(envelope,'wrong')).rejects.toThrow('无法解锁');
    const altered = {...envelope,ciphertext:(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1)};
    await expect(openVault(altered,'Test password long enough 1')).rejects.toThrow('无法解锁');
  });
  it('rejects invalid or expensive parameters before invoking KDF', async () => {
    const {envelope} = await createVault('Test password long enough 1');
    expect(()=>parseEnvelope(JSON.stringify({...envelope, kdf:{...envelope.kdf,memorySize:2**30}}))).toThrow('参数');
    expect(()=>parseEnvelope(JSON.stringify({...envelope,iv:'AAAA'}))).toThrow();
    expect(()=>parseEnvelope('x'.repeat(MAX_FILE_SIZE+1))).toThrow('5 MB');
    expect(()=>parseEnvelope('{')).toThrow();
    expect(()=>parseEnvelope(JSON.stringify({...envelope,version:2}))).toThrow();
  });
  it('rejects malformed payloads and dangling category references', () => {
    expect(()=>validateVault({categories:[],entries:[{id:'1'}]})).toThrow();
    expect(()=>validateVault({categories:[{id:'a',name:'A'},{id:'a',name:'B'}],entries:[]})).toThrow();
    expect(()=>validateVault({categories:[],entries:[{id:'1',name:'',username:'',password:'p',categoryId:'missing',updatedAt:''}]})).toThrow();
  });
  it('accepts optional category icons and rejects unsafe names', () => {
    expect(()=>validateVault({categories:[{id:'a',name:'A'}],entries:[]})).not.toThrow();
    expect(()=>validateVault({categories:[{id:'a',name:'A',icon:'lucide:briefcase'}],entries:[]})).not.toThrow();
    for (const icon of ['briefcase','lucide:','lucide:brief case','<script>','lucide:briefcase'.repeat(10),null]) {
      expect(()=>validateVault({categories:[{id:'a',name:'A',icon}],entries:[]})).toThrow();
    }
  });
  it('accepts legacy entries that still carry removed title/url fields', () => {
    const legacy = {categories:[],entries:[{id:'1',name:'New name',title:'Old name',username:'u',password:'p',url:'https://old.example',categoryId:'',updatedAt:''}]};
    expect(()=>validateVault(legacy)).not.toThrow();
  });
  it('migrates legacy notes into the platform name', async () => {
    const password = 'A long test passphrase 2026';
    const { key, envelope } = await createVault(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify({categories:[],entries:[{id:'1',username:'alice',password:'p',notes:'旧备注',categoryId:'',updatedAt:''}]}));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('quiet-vault:1'),tagLength:128}, key, plain));
    const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
    const legacy = {...envelope, iv: b64(iv), ciphertext: b64(ciphertext)};
    const vault = await decryptVault(parseEnvelope(JSON.stringify(legacy)), key);
    expect(vault.entries[0]).toMatchObject({ name: '旧备注', username: 'alice' });
    expect('notes' in vault.entries[0]).toBe(false);
  });
});
describe('master password policy', () => {
  it('requires 12+ characters with upper, lower and digit', async () => {
    expect(masterPasswordProblem('Short1A')).toContain('12');
    expect(masterPasswordProblem('all-lowercase-123')).toContain('大写');
    expect(masterPasswordProblem('ALL-UPPERCASE-123')).toContain('小写');
    expect(masterPasswordProblem('No digits here!')).toContain('数字');
    expect(masterPasswordProblem('GoodPassw0rd')).toBeNull();
    await expect(createVault('all-lowercase-123')).rejects.toThrow('大写');
  });
});
