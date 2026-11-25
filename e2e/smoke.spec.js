import { test, expect } from '@playwright/test'

const ROLE = 'QA'
const EMAIL = 'qa.smoke@example.com'

// Remove leftovers from a previous failed run (users first, then role).
async function cleanup(request) {
  const users = await (await request.get('/api/users')).json()
  for (const u of users.filter((u) => u.email.toLowerCase() === EMAIL)) await request.delete(`/api/users/${u.id}`)
  const roles = await (await request.get('/api/roles')).json()
  for (const r of roles.filter((r) => r.name === ROLE)) await request.delete(`/api/roles/${r.id}`)
}

test.beforeEach(async ({ request }) => cleanup(request))
test.afterEach(async ({ request }) => cleanup(request))

test('role + user CRUD smoke', async ({ page }) => {
  await page.goto('/roles')
  await page.getByRole('button', { name: 'Add role' }).click()
  await page.getByLabel('Name *').fill(ROLE)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('cell', { name: ROLE, exact: true })).toBeVisible()

  await page.goto('/users')
  await page.getByRole('button', { name: 'Add user' }).click()
  await page.getByLabel('Full name *').fill('QA Tester')
  await page.getByLabel('Email *').fill(EMAIL)
  await page.getByLabel('Role *').selectOption({ label: ROLE })
  await page.getByRole('button', { name: 'Save' }).click()
  const row = page.getByRole('row', { name: /QA Tester/ })
  await expect(row).toBeVisible()
  await expect(row.getByRole('cell', { name: ROLE, exact: true })).toBeVisible()

  await page.goto('/roles')
  await page.getByRole('button', { name: `Delete ${ROLE}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('alert')).toContainText('Role is assigned to 1 user(s)')

  await page.goto('/users')
  await page.getByRole('button', { name: 'Delete QA Tester' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row', { name: /QA Tester/ })).toHaveCount(0)

  await page.goto('/roles')
  await page.getByRole('button', { name: `Delete ${ROLE}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('cell', { name: ROLE, exact: true })).toHaveCount(0)

  // SPA fallback on direct load
  await page.goto('/users')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
})
