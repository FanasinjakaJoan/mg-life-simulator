// Start `npm run dev`, then `npm run test:ui`.
// Install a browser once: `npx playwright install chromium`.
// Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE for an existing sandbox Chromium.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: [
    '--no-sandbox',
    '--no-zygote',
    '--single-process',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  await page.goto(process.env.ATLAS_URL || 'http://localhost:5173')
  await page.locator('.detail-image img').waitFor()
  assert.equal(await page.locator('.region-item').count(), 7)
  assert.equal(await page.locator('.map-marker').count(), 7)
  await page.getByRole('button', { name: 'Ajouter au carnet', exact: true }).click()
  await page.getByRole('button', { name: /Carnet de voyage/ }).click()
  assert.equal(await page.locator('.journal-grid h3').textContent(), 'Hautes terres centrales')
  await page.reload()
  await page.getByRole('button', { name: /Carnet de voyage/ }).click()
  assert.equal(await page.locator('.journal-grid h3').count(), 1, 'saved regions survive reload')
  await page.getByRole('button', { name: 'Explorer', exact: true }).click()
  await page.getByRole('button', { name: 'Découvrir Savane & Tsingy', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('.detail-content h2').textContent(), 'Savane & Tsingy')
  await page.getByRole('tab', { name: 'Terrain & climat' }).click()
  assert.match(await page.locator('.terrain-details').textContent(), /#E6D5B8/)
  await page.getByRole('button', { name: 'Zoom avant', exact: true }).click()
  await page.getByRole('button', { name: 'Recentrer la carte', exact: true }).click()
  await page.getByRole('button', { name: /Calques/ }).click()
  await page.getByRole('button', { name: 'Biomes', exact: true }).click()
  await page.getByLabel('Villes & sommets').uncheck()
  assert.equal(await page.locator('.map-labels').count(), 0)
  await page.getByRole('button', { name: /Calques/ }).click()
  await page.getByRole('button', { name: /Préparer une traversée/ }).click()
  await page.getByRole('button', { name: 'Afficher ma traversée' }).click()
  assert.equal(await page.locator('.route-line').count(), 1)
  await page.getByLabel('Rechercher une région').fill('épineux')
  assert.equal(await page.locator('.region-item').count(), 1)
  await page.getByLabel('Effacer la recherche').click()
  assert.equal(await page.locator('.region-item').count(), 7)
  await page.getByRole('button', { name: 'Le projet' }).click()
  assert.equal(await page.getByRole('dialog').count(), 1)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
  await page.getByRole('button', { name: 'Découvrir Hautes terres centrales', exact: true }).click()
  await page.getByRole('button', { name: 'Explorer cette région' }).click()
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.waitForFunction(() => !document.querySelector('.game-loading'), null, {
    timeout: 90000,
  })
  await page.getByRole('button', { name: /Retour à l’atlas/ }).click({ timeout: 30000 })
  assert.equal(await page.locator('h1').textContent(), 'Madagascar.')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    'mobile horizontal overflow',
  )
  await page.getByRole('button', { name: 'Découvrir Désert épineux', exact: true }).click()
  assert.equal(await page.locator('.detail-content h2').textContent(), 'Désert épineux')
  assert.deepEqual(errors, [])
  console.log(
    '✓ Atlas navigation, keyboard markers, saved journal, search, layers, route, dialogs, 3D entry/return and mobile layout passed.',
  )
} finally {
  await browser.close()
}
