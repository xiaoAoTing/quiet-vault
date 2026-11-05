import { test, expect, type Page } from '@playwright/test';
const master = 'Correct horse battery 2026';
async function openSidebar(page: Page) {
  await expect(page.getByRole('navigation',{name:'分类',exact:true})).toBeVisible();
}
async function manageCategories(page: Page) {
  await page.getByRole('button',{name:'管理分类',exact:true}).click();
}
test('CRUD, category filtering, encrypted persistence, lock, backup and import', async ({page}) => {
  const dialogClosed = () => expect(page.locator('dialog')).toHaveCount(0);
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
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
  await page.getByRole('dialog').getByRole('button',{name:'团队',exact:true}).click();
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
  await openSidebar(page);
  await page.getByRole('button',{name:'未分类 (0)',exact:true}).click();
  await expect(page.getByText('没有未分类的密码')).toBeVisible();
  await openSidebar(page);
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
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'欢迎回来'})).toHaveCount(0);
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
  await openSidebar(page);
  await page.getByRole('button',{name:/^未分类/}).click();
  await expect(page.getByRole('button',{name:'编辑 updated@example.com',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'编辑 updated@example.com',exact:true}).click();
  await page.getByRole('button',{name:'删除',exact:true}).click();
  await dialogClosed();
  await expect(page.getByText('没有未分类的密码')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('categorizes entries inline, creates categories in place and sorts them in bulk', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  for (const account of ['a@example.com','b@example.com']) {
    await page.getByRole('button',{name:'新增密码',exact:true}).click();
    await page.getByLabel('账号',{exact:true}).fill(account);
    await page.getByLabel('密码',{exact:true}).fill('secret-entry-password');
    await page.getByRole('button',{name:'加密保存'}).click();
    await expect(page.getByRole('button',{name:`编辑 ${account}`,exact:true})).toBeVisible();
  }
  // 行内点标签即可归类，并支持顺手建分类
  await page.getByRole('button',{name:'修改分类：a@example.com，当前 未分类'}).click();
  await page.getByLabel('搜索或新建分类').fill('工作');
  await page.getByRole('button',{name:'新建分类「工作」'}).click();
  await expect(page.getByRole('button',{name:'修改分类：a@example.com，当前 工作'})).toBeVisible();
  // 编辑弹窗内直接新建分类
  await page.getByRole('button',{name:'编辑 b@example.com',exact:true}).click();
  await page.getByLabel('新建分类').fill('个人');
  await page.getByLabel('新建分类').press('Enter');
  await expect(page.getByRole('dialog').getByRole('button',{name:'个人',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'修改分类：b@example.com，当前 个人'})).toBeVisible();
  // 未分类视图批量归类
  await page.getByRole('button',{name:'修改分类：b@example.com，当前 个人'}).click();
  await page.getByRole('group',{name:'选择分类'}).getByRole('button',{name:'未分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'修改分类：b@example.com，当前 未分类'})).toBeVisible();
  await openSidebar(page);
  await page.getByRole('button',{name:/^未分类/}).click();
  await expect(page.getByText('1 条密码还没有分类')).toBeVisible();
  await page.getByRole('button',{name:'批量归类'}).click();
  await page.getByRole('button',{name:'全选',exact:true}).click();
  await page.getByRole('button',{name:'移至分类'}).click();
  await page.getByRole('group',{name:'选择分类'}).getByRole('button',{name:'工作'}).click();
  await expect(page.getByText('没有未分类的密码')).toBeVisible();
  await openSidebar(page);
  await page.getByRole('button',{name:/^所有密码/}).click();
  await expect(page.getByRole('button',{name:'修改分类：b@example.com，当前 工作'})).toBeVisible();
});
test('assigns searchable custom category icons, randomizes and persists them', async ({page}) => {
  const remoteIconRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('iconify.design')) remoteIconRequests.push(request.url()); });
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await manageCategories(page);
  await page.getByLabel('新分类名称').fill('工作');
  await page.getByLabel('搜索分类图标').fill('邮箱');
  await page.getByRole('button',{name:'使用图标 邮箱'}).click();
  await expect(page.locator('.icon-picker-meta span')).toHaveText('邮箱 · mail');
  const before = await page.locator('.icon-picker-meta span').textContent();
  await page.getByRole('button',{name:'随机',exact:true}).click();
  await expect(page.locator('.icon-picker-meta span')).not.toHaveText(before!);
  await page.getByRole('button',{name:'使用图标 邮箱'}).click();
  await page.getByRole('button',{name:'添加分类',exact:true}).click();
  await expect(page.getByRole('button',{name:'编辑分类 工作'})).toBeVisible();
  await expect(page.locator('.category-list > div').filter({hasText:'工作'}).locator('svg[data-icon="lucide:mail"]')).toHaveCount(1);
  await page.getByRole('button',{name:'编辑分类 工作'}).click();
  await expect(page.getByRole('button',{name:'使用图标 邮箱'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'取消编辑'}).click();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await openSidebar(page);
  await expect(page.getByRole('button',{name:/^工作/}).locator('svg[data-icon="lucide:mail"]')).toHaveCount(1);
  await page.getByRole('button',{name:/^工作/}).click();
  await page.reload();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await openSidebar(page);
  await expect(page.getByRole('button',{name:/^工作/}).locator('svg[data-icon="lucide:mail"]')).toHaveCount(1);
  expect(remoteIconRequests).toEqual([]);
});
test('rejects broken imports and preserves existing ciphertext',async({page})=>{
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  const original=await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'));
  await page.locator('input[type=file]').setInputFiles({name:'bad.qvault',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.getByRole('alert')).toContainText('不支持');
  expect(await page.evaluate(()=>localStorage.getItem('quiet-vault.v1'))).toBe(original);
});
test('stays unlocked across idle time and refresh, and locks only on demand', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward('10:00');
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'锁定',exact:true}).click();
  await expect(page.getByRole('heading',{name:'欢迎回来'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'欢迎回来'})).toBeVisible();
});
test('keeps the vault unlocked when the page is hidden', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'锁定',exact:true}).click();
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByRole('button',{name:'解锁保险库'}).click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
});
test('copies name, account and password from the entry list', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('名称',{exact:true}).fill('备用邮箱');
  await page.getByLabel('账号',{exact:true}).fill('alice@example.com');
  await page.getByLabel('密码',{exact:true}).fill('secret-entry-password');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'编辑 备用邮箱',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'复制 备用邮箱 的名称、账号和密码'}).click();
  await expect(page.getByRole('status')).toContainText('已复制');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('名称：备用邮箱\n账号：alice@example.com\n密码：secret-entry-password');
  // 空名称与空账号不产生多余标签行
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('密码',{exact:true}).fill('only-password');
  await page.getByRole('button',{name:'加密保存'}).click();
  await page.getByRole('button',{name:'复制 未命名条目 的名称、账号和密码'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('密码：only-password');
});
test('accepts .json backups and does not restrict the picker on iOS', async ({page}, testInfo) => {
  await page.goto('/');
  const accept = await page.locator('input[type=file]').getAttribute('accept');
  if (testInfo.project.name === 'mobile') expect(accept).toBeNull();
  else expect(accept).toContain('.json');
});
test('suggests existing names in the name field and supports keyboard and mouse selection', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('名称',{exact:true}).fill('AppleID');
  await page.getByLabel('账号',{exact:true}).fill('first@example.com');
  await page.getByLabel('密码',{exact:true}).fill('secret-entry-password');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'编辑 AppleID',exact:true})).toBeVisible();

  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  const name = page.getByLabel('名称',{exact:true});
  const list = page.getByRole('listbox',{name:'已有名称'});
  await name.fill('app');
  await expect(list).toBeVisible();
  await expect(list.getByRole('option')).toHaveText(['AppleID']);
  // 账号和分类不参与名称建议
  await name.fill('first@');
  await expect(list).toHaveCount(0);
  await name.fill('app');
  // 方向键高亮后回车选中，且不会触发表单提交
  await name.press('ArrowDown');
  await expect(list.getByRole('option',{name:'AppleID'})).toHaveAttribute('aria-selected','true');
  await name.press('Enter');
  await expect(name).toHaveValue('AppleID');
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  // 与输入完全相同的名称不再重复推荐
  await name.fill('');
  await name.fill('AppleID');
  await expect(list).toHaveCount(0);
  // Esc 只收起建议，不关闭弹窗
  await name.fill('App');
  await expect(list).toBeVisible();
  await name.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  // Tab 离开名称字段时同样收起建议
  await name.fill('app');
  await expect(list).toBeVisible();
  await name.press('Tab');
  await expect(list).toHaveCount(0);
  // 鼠标点选建议
  await name.fill('app');
  await list.getByRole('option',{name:'AppleID'}).click();
  await expect(name).toHaveValue('AppleID');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
});
test('stores an optional note per entry and keeps it across reload', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('名称',{exact:true}).fill('备用邮箱');
  await page.getByLabel('账号',{exact:true}).fill('alice@example.com');
  await page.getByLabel('密码',{exact:true}).fill('secret-entry-password');
  await page.getByLabel('备注（非必填）').fill('安全问题：第一只宠物');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'编辑 备用邮箱',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'编辑 备用邮箱',exact:true}).click();
  await expect(page.getByLabel('备注（非必填）')).toHaveValue('安全问题：第一只宠物');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.reload();
  await page.getByRole('button',{name:'编辑 备用邮箱',exact:true}).click();
  await expect(page.getByLabel('备注（非必填）')).toHaveValue('安全问题：第一只宠物');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  // 备注非必填：不填写也能保存
  await page.getByRole('button',{name:'新增密码',exact:true}).click();
  await page.getByLabel('密码',{exact:true}).fill('only-password');
  await page.getByRole('button',{name:'加密保存'}).click();
  await expect(page.getByRole('button',{name:'复制 未命名条目 的名称、账号和密码'})).toBeVisible();
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
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
});
test('moves the local-storage guidance onto a dedicated about page', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('主密码',{exact:true}).fill(master);
  await page.getByLabel('再次输入主密码').fill(master);
  await page.getByRole('button',{name:'创建保险库'}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  // 列表页不再展示备份提示和页脚
  await expect(page.getByText('本地保存，安心掌控')).toHaveCount(0);
  await expect(page.getByText('端到本地加密 · 无后台服务')).toHaveCount(0);
  await page.getByRole('button',{name:'简介',exact:true}).click();
  await expect(page.getByRole('heading',{name:'简介',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'本地保存，安心掌控'})).toBeVisible();
  await expect(page.getByText('端到本地加密 · 无后台服务')).toBeVisible();
  await expect(page.getByRole('heading',{name:'怎么用'})).toBeVisible();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('搜索密码')).toHaveCount(0);
  await openSidebar(page);
  await page.getByRole('button',{name:/^所有密码/}).click();
  await expect(page.getByRole('button',{name:'新增密码',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'简介',exact:true})).not.toHaveAttribute('aria-current','page');
});
