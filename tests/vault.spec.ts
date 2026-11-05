import { test, expect, type Page } from '@playwright/test';
const master = 'Correct horse battery 2026';
async function openSwitcher(page: Page) {
  await page.getByRole('button',{name:/切换分类/}).click();
  await expect(page.getByRole('button',{name:'管理分类',exact:true})).toBeVisible();
}
async function manageCategories(page: Page) {
  await openSwitcher(page);
  await page.getByRole('button',{name:'管理分类',exact:true}).click();
}
test('CRUD, category filtering, encrypted persistence, lock, backup and import', async ({page}) => {
  const dialogClosed = () => expect(page.locator('dialog')).toHaveCount(0);
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('heading',{name:/所有密码/})).toBeVisible();
  await manageCategories(page);
  await page.getByLabel('新分类名称').fill('工作');
  await page.getByRole('button',{name:'添加分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'编辑分类 工作'})).toBeVisible();
  await page.getByRole('button',{name:'编辑分类 工作'}).click();
  await page.getByLabel('编辑分类名称').fill('团队');
  await page.getByRole('button',{name:'保存分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'编辑分类 团队'})).toBeVisible();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await dialogClosed();
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('alice@example.com');
  await page.getByLabel('密码',{exact:true}).fill('secret-entry-password');
  await page.getByRole('combobox',{name:'分类',exact:true}).selectOption({label:'团队'});
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'编辑 alice@example.com',exact:true})).toBeVisible();
  await dialogClosed();
  expect(await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'))).not.toContain('secret-entry-password');
  expect(await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'))).not.toContain('alice@example.com');
  await page.getByLabel('搜索密码').fill('unmatched');
  await expect(page.getByText('没有匹配的密码')).toBeVisible();
  await page.getByLabel('搜索密码').fill('');
  await page.getByRole('button',{name:'编辑 alice@example.com',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('updated@example.com');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await dialogClosed();
  await openSwitcher(page);
  await page.getByRole('button',{name:'未分类 (0)',exact:true}).click();
  await expect(page.getByText('从第一个密码开始')).toBeVisible();
  await openSwitcher(page);
  await page.getByRole('button',{name:'所有密码 (1)',exact:true}).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'导出备份',exact:true}).click();
  const file = await download; const path = await file.path();
  expect(file.suggestedFilename()).toMatch(/^quiet-vault-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
  await page.getByRole('button',{name:'锁定',exact:true}).click();
  await page.getByLabel('主密码',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'解锁保险库'}).click();
  await expect(page.getByRole('alert')).toContainText('无法解锁');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByRole('button',{name:'解锁保险库'}).click();
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'欢迎回来'})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByRole('heading',{name:'打开加密备份'})).toBeVisible();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByRole('button',{name:'解锁保险库'}).click();
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await manageCategories(page);
  await page.getByRole('button',{name:'删除分类 团队'}).click();
  await expect(page.getByRole('button',{name:'删除分类 团队'})).toHaveCount(0);
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await dialogClosed();
  await openSwitcher(page);
  await page.getByRole('button',{name:/^未分类/}).click();
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'编辑 updated@example.com',exact:true}).click();
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await dialogClosed();
  await expect(page.getByText('从第一个密码开始')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('rejects broken imports and preserves existing ciphertext',async({page})=>{
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('heading',{name:/所有密码/})).toBeVisible();
  const original=await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'));
  await page.locator('input[type=file]').setInputFiles({name:'bad.qvault',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.getByRole('alert')).toContainText('不支持');
  expect(await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'))).toBe(original);
});
test('keeps the vault unlocked when the page is hidden', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('heading',{name:/所有密码/})).toBeVisible();
  await page.getByRole('button',{name:'锁定',exact:true}).click();
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByRole('button',{name:'解锁保险库'}).click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading',{name:/所有密码/})).toBeVisible();
});
test('accepts .json backups and does not restrict the picker on iOS', async ({page}, testInfo) => {
  await page.goto('/');
  const accept = await page.locator('input[type=file]').getAttribute('accept');
  if (testInfo.project.name === 'mobile') expect(accept).toBeNull();
  else expect(accept).toContain('.json');
});
test('requires a strong master password when creating a vault', async ({page}) => {
  await page.goto('/');
  const password = page.getByLabel('主密码',{exact:true});
  const confirm = page.getByLabel('再次输入主密码');
  const create = page.getByRole('button',{name:'创建保险库'});
  const weak: [string, string][] = [
    ['Short1A', '至少需要 12 个字符'],
    ['all-lowercase-123', '大写字母'],
    ['ALL-UPPERCASE-123', '小写字母'],
    ['NoDigitsHere!', '数字'],
  ];
  for (const [value, message] of weak) {
    await password.fill(value);
    await confirm.fill(value);
    await create.click();
    await expect(page.getByRole('alert')).toContainText(message);
  }
  await password.fill(master);
  await confirm.fill(master + 'X');
  await create.click();
  await expect(page.getByRole('alert')).toContainText('不一致');
  expect(await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'))).toBeNull();
  await confirm.fill(master);
  await create.click();
  await expect(page.getByRole('heading',{name:/所有密码/})).toBeVisible();
});
