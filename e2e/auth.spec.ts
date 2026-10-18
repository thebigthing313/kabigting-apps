import { accounts, expect, openAccountMenu, runName, signIn, test } from "./fixtures.ts"

test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
  await signIn(page, accounts().member.email, "not-the-password")
  await expect(page.getByText("That email and password do not match an Account.")).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in/)
})

test("a new Account must replace its temporary password before anything else", async ({
  page,
}, testInfo) => {
  const newcomer = accounts().newcomers[testInfo.project.name]
  if (!newcomer) throw new Error(`No newcomer seeded for ${testInfo.project.name}`)

  await signIn(page, newcomer.email, newcomer.temporaryPassword)
  await expect(page).toHaveURL(/\/change-password/)
  await expect(page.getByText("Choose your password")).toBeVisible()

  // The App routes stay closed until the password is changed.
  await page.goto("/finances")
  await expect(page).toHaveURL(/\/change-password/)

  await page.getByLabel("Temporary password").fill(newcomer.temporaryPassword)
  await page.getByLabel("New password", { exact: true }).fill(newcomer.temporaryPassword)
  await page.getByLabel("Confirm new password").fill(newcomer.temporaryPassword)
  await page.getByRole("button", { name: "Save password" }).click()
  await expect(page.getByText("Choose a password different from the current one.")).toBeVisible()

  await page.getByLabel("New password", { exact: true }).fill("a-password-of-my-own")
  await page.getByLabel("Confirm new password").fill("a-password-of-my-own")
  await page.getByRole("button", { name: "Save password" }).click()
  await expect(page.getByRole("heading", { name: "Hello, Newcomer" })).toBeVisible()
})

test("a Guest without the App cannot see or open it", async ({ page }) => {
  const { guest } = accounts()
  await signIn(page, guest.email, guest.password)
  await expect(page.getByText("No Apps yet", { exact: true })).toBeVisible()
  await page.goto("/finances")
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
  const response = await page.request.post("/api/finances/wallets/query", { data: {} })
  expect(response.status()).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
})

test("signing out leaves no signed-in data behind", async ({ page }, testInfo) => {
  const { member } = accounts()
  await signIn(page, member.email, member.password)
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()
  const text = `Sign-out wallet ${runName(testInfo)}`
  const created = await page.request.post("/api/finances/wallets", {
    data: { id: crypto.randomUUID(), name: text },
  })
  expect(created.status()).toBe(201)
  await page.goto("/finances/wallets")
  await expect(page.getByText(text).filter({ visible: true })).toBeVisible()

  await openAccountMenu(page, "Member")
  // Sign-out ends with a full page load, so nothing from the session stays in memory.
  const reloaded = page.waitForEvent("load")
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await reloaded
  await expect(page).toHaveURL(/\/sign-in/)

  // Nothing readable is left: not on screen, not in storage, not behind the back button.
  await expect(page.getByText(text)).toHaveCount(0)
  const stored = await page.evaluate(() =>
    [localStorage, sessionStorage]
      .flatMap((store) => Object.keys(store).map((key) => `${key}=${store.getItem(key)}`))
      .join("\n"),
  )
  expect(stored).not.toContain(member.email)
  await page.goBack()
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByText(text)).toHaveCount(0)
  expect((await page.request.post("/api/finances/wallets/query", { data: {} })).status()).toBe(401)
})
